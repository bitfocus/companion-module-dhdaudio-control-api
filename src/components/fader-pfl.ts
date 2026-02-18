import * as z from 'zod'
import {
	combineRgb,
	type CompanionButtonPresetDefinition,
	InstanceStatus,
	type CompanionActionDefinitions,
	type CompanionPresetDefinitions,
	type CompanionVariableDefinition,
	type CompanionFeedbackDefinitions,
} from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import type { ChannelRecord } from '../control-api/channel.js'
import type { ResponseSubscriptionUpdate } from '@dhdaudio/control-api'

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
				variableId: `fader_pfl_${key}`,
			}) satisfies CompanionVariableDefinition,
	)
}

// is coupled to control api subscriptions
function genFeedbacks(self: ModuleInstance, ch: ChannelRecord): CompanionFeedbackDefinitions {
	return {
		fader_pfl: {
			name: 'Fader Pfl',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(186, 255, 222),
				color: combineRgb(0, 0, 0),
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
			callback: ({ options }) => !!self.getVariableValue(`fader_pfl_${options.faderId}`) === true,

			subscribe: ({ options }) => {
				self.websocket.subscribe(`/audio/mixers/0/faders/${options.faderId}/pfl1`)

				self.websocket.get(
					`/audio/mixers/0/faders/${options.faderId}/pfl1`,
					(response) => {
						const value = z.boolean().parse(response.payload)
						self.setVariableValues({ [`fader_pfl_${options.faderId}`]: value })
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

function genActions(self: ModuleInstance, ch: ChannelRecord): CompanionActionDefinitions {
	return {
		fader_pfl: {
			name: 'Fader Pfl',
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
				const value = self.getVariableValue(`fader_pfl_${options.faderId}`)
				const nextValue = options.switchmode === 0 ? !value : options.switchmode === 1 ? true : false

				self.websocket.set(
					`/audio/mixers/0/faders/${options.faderId}/pfl1`,
					nextValue,
					(response) => {
						const nextValue = z.boolean().parse(response.payload)
						self.setVariableValues({ [`fader_pfl_${options.faderId}`]: nextValue })
						self.checkFeedbacks()
					},
					(response) => {
						self.updateStatus(InstanceStatus.UnknownError, response.error.message)
					},
				)
			},
			subscribe: ({ options }) => {
				self.websocket.subscribe(`/audio/mixers/0/faders/${options.faderId}/pfl1`)

				self.websocket.get(
					`/audio/mixers/0/faders/${options.faderId}/pfl1`,
					(response) => {
						const value = z.boolean().parse(response.payload)
						self.setVariableValues({ [`fader_pfl_${options.faderId}`]: value })
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
		(acc, [key, value]) => ({
			...acc,
			[`fader-pfl-${key}`]: {
				type: 'button',
				category: `Fader: ${value.label}`,
				name: `${key} Pfl`,
				style: {
					text: `${value.label} Pfl`,
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: 0,
				},
				steps: [
					{
						down: [
							{
								actionId: 'fader_pfl',
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
						feedbackId: 'fader_pfl',
						options: {
							faderId: key,
						},
						style: {
							bgcolor: combineRgb(186, 255, 222),
							color: combineRgb(0, 0, 0),
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
						pfl1: z.boolean(),
					}),
				),
			}),
		}),
	}),
})

export function onSubscriptionUpdate(self: ModuleInstance, { payload }: ResponseSubscriptionUpdate): void {
	const parsed = updateParser.safeParse(payload)

	if (parsed.success) {
		Object.entries(parsed.data.audio.mixers[0].faders).forEach(([faderId, { pfl1 }]) => {
			self.setVariableValues({ [`fader_pfl_${faderId}`]: pfl1 })
		})

		self.checkFeedbacks()
	}
}
