import {
	combineRgb,
	type CompanionButtonPresetDefinition,
	type CompanionPresetDefinitions,
	type DropdownChoice,
	InstanceStatus,
	type SomeCompanionActionInputField,
	type CompanionActionDefinitions,
	CompanionVariableDefinition,
} from '@companion-module/base'
import * as z from 'zod'
import type { ModuleInstance } from '../main.js'
import { ChannelRecord } from '../control-api/channel.js'
import type { ResponseSubscriptionUpdate } from '@dhdaudio/control-api'

// https://developer.dhd.audio/docs/api/control-api/rpc/#getsnapshotlist
const types = [
	[1, 'Channel'],
	[2, 'Mixer'],
	[3, 'Processing'],
] as const

type SnapshotLabelIndex = Record<string, Record<number, Record<string, string>>>

function buildSnapshotLabelIndex(refs: MixerSnapshotRefs): SnapshotLabelIndex {
	const idx: SnapshotLabelIndex = {}
	for (const [mixer, typeMap] of Object.entries(refs)) {
		idx[mixer] = idx[mixer] ?? {}
		for (const [typeStr, list] of Object.entries(typeMap)) {
			const typeNum = parseInt(typeStr, 10)
			idx[mixer][typeNum] = idx[mixer][typeNum] ?? {}
			for (const { id, name } of list) {
				idx[mixer][typeNum][id] = name
			}
		}
	}
	return idx
}

export async function init(
	self: ModuleInstance,
	ch: ChannelRecord,
): Promise<{
	variables: ReadonlyArray<CompanionVariableDefinition>
	actions: CompanionActionDefinitions
	presets: CompanionPresetDefinitions
}> {
	const mixers = await self.websocket.getAsync('audio/mixers').then(async (res) => mixersParser.parseAsync(res.payload))

	// load snapshots for each mixer and every type
	const snapshots = await Promise.all(
		Object.entries(mixers).flatMap(async ([mixer]) =>
			Promise.all(
				types.map(async ([type]) =>
					self.websocket
						.rpcAsync('getsnapshotlist', {
							type,
							mixer: parseInt(mixer),
						})
						.then(async (res) => snapshotListParser.parseAsync(res.payload.result))
						.then((snapshots) => [mixer, type, snapshots] as const),
				),
			),
		),
	)

	// group snapshots by mixer and type
	const mixerSnapshotRefs = snapshots[0].reduce<MixerSnapshotRefs>((acc, [mixer, type, snapshot]) => {
		if (snapshot.length === 0) {
			return acc
		}

		if (!acc[mixer]) {
			acc[mixer] = {}
		}

		acc[mixer][type] = snapshot

		return acc
	}, {})

	const labelIndex = buildSnapshotLabelIndex(mixerSnapshotRefs)
	const options = mkOptions(mixers, mixerSnapshotRefs, ch)

	const variables = genVariables(ch)
	const actions = genActions(self, options, labelIndex)
	const presets = genPresets(mixerSnapshotRefs)

	return { variables, actions, presets }
}

const mixersParser = z.record(
	z.string(),
	z.object({
		_name: z.string(),
	}),
)
type Mixers = z.infer<typeof mixersParser>

const snapshotListParser = z.array(
	z.object({
		name: z.string(),
		id: z.string(),
	}),
)
type SnapshotList = z.infer<typeof snapshotListParser>
type MixerSnapshotRefs = Record<string, Record<number, SnapshotList>>

const mkOptions = (
	mixers: Mixers,
	refs: MixerSnapshotRefs,
	ch: ChannelRecord,
): Array<SomeCompanionActionInputField> => [
	{
		id: 'mixer',
		type: 'dropdown' as const,
		label: 'Mixer',
		default: '0',
		choices: Object.entries(mixers).map(([id, { _name }]) => ({ id, label: _name })),
	},
	{
		id: 'faderId',
		type: 'dropdown',
		label: 'Fader',
		default: 0,
		choices: Object.entries(ch).map(([id, values]) => ({ id, label: `${id} (${values.label})` })),
		isVisibleExpression: '$(options:type) == 1',
	},
	{
		id: 'type',
		type: 'dropdown' as const,
		label: 'Type',
		default: '1',
		// provide only types with snapshots as choice
		choices: Object.entries(refs).flatMap(([, typeSnapshots]) => {
			// collect existing types from each mixer
			const x = Object.keys(typeSnapshots).reduce<Record<string, DropdownChoice>>(
				(acc, [type]) => ({
					...acc,
					[type]: { id: type, label: `${types[parseInt(type) - 1][1]} Snapshot` },
				}),
				{},
			)

			return Object.values(x)
		}),
	},
	...Object.entries(refs).flatMap(([mixer, types]) =>
		Object.entries(types).map(([[type], snapshots]) => ({
			id: `${mixer}-${type}`,
			type: 'dropdown' as const,
			label: 'Snapshot',
			default: snapshots[0].id,
			choices: snapshots.map(({ name, id }) => ({ id, label: name })),
			// expression doc can be found https://user.bitfocus.io/docs/companion
			isVisibleExpression: `$(options:mixer) == ${mixer} && $(options:type) == ${type}`,
		})),
	),
]

function genVariables(ch: ChannelRecord): ReadonlyArray<CompanionVariableDefinition> {
	return Object.entries(ch).map(
		([id, values]) =>
			({
				name: `Ch Snapshot Loaded ${values.label}`,
				variableId: `ch_snap_loaded_${id}`,
			}) satisfies CompanionVariableDefinition,
	)
}

function genActions(
	self: ModuleInstance,
	options: Array<SomeCompanionActionInputField>,
	labelIndex: SnapshotLabelIndex,
): CompanionActionDefinitions {
	return {
		snapshot: {
			name: 'Snapshot',
			options,
			callback: async ({ options }) => {
				const { type, mixer, faderId } = options
				if (!type || !mixer) {
					self.log('error', 'option is missing')
					self.updateStatus(InstanceStatus.BadConfig, 'options is missing')
					return
				}

				const id = options[`${mixer}-${type}`]
				if (!id) {
					self.log('error', 'option is missing')
					self.updateStatus(InstanceStatus.BadConfig, 'options is missing')
					return
				}

				const loadSnapshotParams: any = {
					type: parseInt(type.toString()),
					mixer: parseInt(mixer.toString()),
					id: id.toString(),
				}

				if (type == 1) {
					if (!faderId) {
						self.log('error', 'faderId is missing')
						self.updateStatus(InstanceStatus.BadConfig, 'options is missing')
						return
					}

					loadSnapshotParams.fader = parseInt(faderId.toString())
				}

				await self.websocket.rpcAsync('loadsnapshot', loadSnapshotParams, (err) => {
					self.log('error', err.error.message)
					self.updateStatus(InstanceStatus.UnknownError, err.error.message)
				})

				if (loadSnapshotParams.type === 1) {
					const mixerKey = mixer.toString()
					const typeKey = loadSnapshotParams.type
					const idKey = id.toString()
					const label = labelIndex[mixerKey]?.[typeKey]?.[idKey] ?? idKey

					self.setVariableValues({
						[`ch_snap_loaded_${faderId}`]: label,
					})
				}
			},
			subscribe: ({ options }) => {
				const { mixer, faderId } = options

				if (!mixer || !faderId) {
					return
				}

				self.websocket.subscribe(`/audio/mixers/${mixer}/faders/${faderId}/_lastloadedsnap`)

				self.websocket.get(
					`/audio/mixers/${mixer}/faders/${faderId}/_lastloadedsnap`,
					(response) => {
						const value = z.string().parse(response.payload)
						self.setVariableValues({ [`ch_snap_loaded_${faderId}`]: value })
						self.checkFeedbacks()
					},
					(response) => {
						self.updateStatus(InstanceStatus.UnknownError, response.error.message)
					},
				)
			},
		},
	}
}

function genPresets(refs: MixerSnapshotRefs): CompanionPresetDefinitions {
	return Object.entries(refs).reduce(
		(acc, [mixer, typeSnapshotsRef]) => ({
			...acc,
			...Object.entries(typeSnapshotsRef).reduce(
				(acc, [type, snapshots]) => ({
					...acc,
					...snapshots.reduce((acc, { name, id }) => {
						const options: any = {
							mixer,
							type,
							[`${mixer}-${type}`]: id,
						}

						if (parseInt(type) == 1) {
							options.faderId = 0
						}

						return {
							...acc,
							[`${mixer}-${type}-${id}`]: {
								type: 'button',
								category: `Mixer ${mixer}: ${types[parseInt(type) - 1][1]} Snapshots`,
								name: `${name} Snapshot`,
								style: {
									text: `${name} Snapshot`,
									size: '14',
									color: combineRgb(255, 255, 255),
									bgcolor: 0,
								},
								steps: [
									{
										down: [
											{
												actionId: 'snapshot',
												options,
											},
										],
										up: [],
									},
								],
								feedbacks: [],
							} satisfies CompanionButtonPresetDefinition,
						}
					}, {}),
				}),
				{},
			),
		}),
		{},
	)
}

const updateParser = z.object({
	audio: z.object({
		mixers: z.object({
			0: z.object({
				faders: z.record(
					z.string(),
					z.object({
						_lastloadedsnap: z.string(),
					}),
				),
			}),
		}),
	}),
})

export function onSubscriptionUpdate(self: ModuleInstance, { payload }: ResponseSubscriptionUpdate): void {
	const parsed = updateParser.safeParse(payload)

	if (parsed.success) {
		Object.entries(parsed.data.audio.mixers[0].faders).forEach(([faderId, { _lastloadedsnap }]) => {
			self.setVariableValues({ [`ch_snap_loaded_${faderId}`]: _lastloadedsnap })
		})

		self.checkFeedbacks()
	}
}
