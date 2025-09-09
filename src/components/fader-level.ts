import {
	combineRgb,
	type CompanionButtonPresetDefinition,
	InstanceStatus,
	type CompanionActionDefinitions,
	type CompanionPresetDefinitions,
} from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import type { ChannelRecord } from '../control-api/channel.js'

export function init(
	self: ModuleInstance,
	ch: ChannelRecord,
): {
	actions: CompanionActionDefinitions
	presets: CompanionPresetDefinitions
} {
	const actions = genActions(self, ch)
	const presets = genPresets(ch)

	return { actions, presets }
}

function genActions(self: ModuleInstance, ch: ChannelRecord): CompanionActionDefinitions {
	return {
		fader_level: {
			name: 'Fader Level',
			options: [
				{
					id: 'faderId',
					type: 'dropdown',
					label: 'Fader',
					default: 0,
					choices: Object.entries(ch).map(([id, values]) => ({ id, label: `${id} (${values.label})` })),
				},
				{
					id: 'faderLevel',
					type: 'number',
					label: 'Level',
					default: 0,
					min: -160,
					max: 10,
					step: 1,
					required: true,
				},
			],
			callback: async ({ options }) => {
				const nextValue = options.faderLevel
				if (nextValue === undefined) {
					return
				}

				self.websocket.set(
					`/audio/mixers/0/faders/${options.faderId}/fader`,
					nextValue,
					() => void 1,
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
			[`fader-level-${key}`]: {
				type: 'button',
				category: `Fader: ${values.label}`,
				name: `${key} Level`,
				style: {
					text: `${values.label} Level`,
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: 0,
				},
				steps: [
					{
						down: [
							{
								actionId: 'fader_level',
								options: {
									faderId: key,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			} satisfies CompanionButtonPresetDefinition,
		}),
		{},
	)
}
