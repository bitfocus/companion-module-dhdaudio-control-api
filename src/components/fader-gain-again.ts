import {
	combineRgb,
	type CompanionButtonPresetDefinition,
	InstanceStatus,
	type CompanionActionDefinitions,
	type CompanionPresetDefinitions,
} from '@companion-module/base'
import * as z from 'zod'
import type { ChannelRecord } from '../control-api/channel.js'
import type { ModuleInstance } from '../main.js'

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
		fader_gain_again_adjust: {
			name: 'Fader Gain Again (Rotary)',
			description: 'Adjust /audio/mixers/{mixerID}/faders/{faderID}/params/gain/again/',
			options: [
				{
					id: 'faderId',
					type: 'dropdown',
					label: 'Fader',
					default: 0,
					choices: Object.entries(ch).map(([id, values]) => ({ id, label: `${id} (${values.label})` })),
				},
				{
					id: 'direction',
					type: 'dropdown',
					label: 'Direction',
					default: 'up',
					choices: [
						{ id: 'up', label: 'Increase' },
						{ id: 'down', label: 'Decrease' },
					],
				},
				{
					id: 'step',
					type: 'number',
					label: 'Step',
					default: 1,
					min: 0.01,
					max: 20,
					step: 0.01,
					required: true,
				},
			],
			callback: async ({ options }) => {
				const faderId = `${options.faderId}`
				const direction = options.direction === 'down' ? -1 : 1
				const stepValue = z.coerce.number().safeParse(options.step)
				if (!stepValue.success) {
					self.updateStatus(InstanceStatus.BadConfig, 'Invalid step value')
					return
				}

				const path = `/audio/mixers/0/faders/${faderId}/params/gain/again/`
				const currentValue = await getNumericValue(self, path)
				if (currentValue === null) {
					return
				}

				const nextValue = currentValue + direction * stepValue.data

				self.websocket.set(
					path,
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
			[`fader-gain-again-${key}`]: {
				type: 'button',
				category: `Fader: ${values.label}`,
				name: `${key} Gain Rotary`,
				style: {
					text: `${values.label}\nGain`,
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: 0,
				},
				options: {
					rotaryActions: true,
				},
				steps: [
					{
						down: [],
						up: [],
						rotate_left: [
							{
								actionId: 'fader_gain_again_adjust',
								options: {
									faderId: key,
									direction: 'down',
									step: 1,
								},
							},
						],
						rotate_right: [
							{
								actionId: 'fader_gain_again_adjust',
								options: {
									faderId: key,
									direction: 'up',
									step: 1,
								},
							},
						],
					},
				],
				feedbacks: [],
			} satisfies CompanionButtonPresetDefinition,
		}),
		{},
	)
}

const numericValueParser = z.union([
	z.number(),
	z.object({
		value: z.number(),
	}),
])

async function getNumericValue(self: ModuleInstance, path: string): Promise<number | null> {
	return new Promise((resolve) => {
		self.websocket.get(
			path,
			(response) => {
				const parsed = numericValueParser.safeParse(response.payload)
				if (!parsed.success) {
					self.updateStatus(InstanceStatus.UnknownError, `Unexpected payload at ${path}`)
					resolve(null)
					return
				}

				if (typeof parsed.data === 'number') {
					resolve(parsed.data)
					return
				}

				resolve(parsed.data.value)
			},
			(response) => {
				self.updateStatus(InstanceStatus.UnknownError, response.error.message)
				resolve(null)
			},
		)
	})
}
