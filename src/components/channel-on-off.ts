import * as z from 'zod'
import type { ModuleInstance } from '../main.js'
import {
	combineRgb,
	InstanceStatus,
	type CompanionActionDefinitions,
	type CompanionFeedbackDefinitions,
	type CompanionVariableDefinition,
	type CompanionPresetDefinitions,
	type CompanionButtonPresetDefinition,
} from '@companion-module/base'
import type { ResponseSubscriptionUpdate } from '@dhdaudio/control-api'
import type { ChannelRecord } from '../control-api/channel.js'

export function init(
	self: ModuleInstance,
	ch: ChannelRecord,
): {
	variables: ReadonlyArray<CompanionVariableDefinition>
	feedback: CompanionFeedbackDefinitions
	actions: CompanionActionDefinitions
	presets: CompanionPresetDefinitions
} {
	const variables = genVariables(ch)
	const feedback = genFeedbacks(self, ch)
	const actions = genActions(self, ch)
	const presets = genPresets(ch)

	return { variables, feedback, actions, presets }
}

function genVariables(ch: ChannelRecord): ReadonlyArray<CompanionVariableDefinition> {
	return Object.entries(ch).map(
		([key, values]) =>
			({
				name: `${values.label}`,
				variableId: `channel_fader_${key}`,
			}) satisfies CompanionVariableDefinition,
	)
}

// is coupled to control api subscriptions
function genFeedbacks(self: ModuleInstance, ch: ChannelRecord): CompanionFeedbackDefinitions {
	return {
		channel_fader_value: {
			name: 'Channel On/Off',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(102, 0, 0),
			},
			options: [
				{
					id: 'faderId',
					type: 'dropdown',
					label: 'Fader',
					default: 0,
					choices: Object.entries(ch).map(([id, values]) => ({ id, label: `${id} (${values.label})` })),
				},
			],
			callback: ({ options }) => !!self.getVariableValue(`channel_fader_${options.faderId}`) === true,
		},
	}
}

function genActions(self: ModuleInstance, ch: ChannelRecord): CompanionActionDefinitions {
	return {
		channel_on_off: {
			name: 'Channel On/Off',
			options: [
				{
					id: 'faderId',
					type: 'dropdown',
					label: 'Fader',
					default: 0,
					choices: Object.entries(ch).map(([id, values]) => ({ id, label: `${id} (${values.label})` })),
				},
				{
					id: 'switchmode',
					type: 'dropdown',
					label: 'Mode',
					default: 0,
					choices: [
						{ id: 0, label: 'Toggle' },
						{ id: 1, label: 'On' },
						{ id: 2, label: 'Off' },
					],
				},
			],
			callback: async ({ options }) => {
				const value = self.getVariableValue(`channel_fader_${options.faderId}`)
				const nextValue = options.switchmode === 0 ? !value : options.switchmode === 1 ? true : false

				self.websocket.set(
					`/audio/mixers/0/faders/${options.faderId}/on`,
					nextValue,
					(response) => {
						const nextValue = z.boolean().parse(response.payload)
						self.setVariableValues({ [`channel_fader_${options.faderId}`]: nextValue })
						self.checkFeedbacks()
					},
					(response) => {
						self.updateStatus(InstanceStatus.UnknownError, response.error.message)
					},
				)
			},
			subscribe: ({ options }) => {
				self.websocket.subscribe(`/audio/mixers/0/faders/${options.faderId}/on`)
				self.websocket.get(
					`/audio/mixers/0/faders/${options.faderId}/on`,
					(response) => {
						const nextValue = z.boolean().parse(response.payload)
						self.setVariableValues({ [`channel_fader_${options.faderId}`]: nextValue })
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

function genPresets(ch: ChannelRecord): CompanionPresetDefinitions {
	return Object.entries(ch).reduce(
		(acc, [key, values]) => ({
			...acc,
			[`channel-${key}`]: {
				type: 'button',
				category: `Fader: ${values.label}`,
				name: `${key} On/Off`,
				style: {
					text: `${values.label} On/Off`,
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: 0,
				},
				steps: [
					{
						down: [
							{
								actionId: 'channel_on_off',
								options: {
									faderId: key,
									switchmode: 0,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'channel_fader_value',
						options: {
							faderId: key,
						},
						style: {
							bgcolor: combineRgb(102, 0, 0),
						},
					},
				],
			} satisfies CompanionButtonPresetDefinition,
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
						on: z.boolean(),
					}),
				),
			}),
		}),
	}),
})

export function onSubscriptionUpdate(self: ModuleInstance, { payload }: ResponseSubscriptionUpdate): void {
	const parsed = updateParser.safeParse(payload)

	if (parsed.success) {
		Object.entries(parsed.data.audio.mixers[0].faders).forEach(([faderId, { on }]) => {
			self.setVariableValues({ [`channel_fader_${faderId}`]: on })
		})

		self.checkFeedbacks()
	}
}
