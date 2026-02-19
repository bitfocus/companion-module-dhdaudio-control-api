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

function getFadersWithAgain(ch: ChannelRecord): Array<[string, ChannelRecord[string]]> {
	return Object.entries(ch).filter(([, values]) => values._hasagain === true)
}

function genActions(self: ModuleInstance, ch: ChannelRecord): CompanionActionDefinitions {
	const fadersWithAgain = getFadersWithAgain(ch)

	return {
		fader_again_adjust: {
			name: 'Fader AGain (Rotary)',
			description: 'Adjust /audio/mixers/{mixerID}/faders/{faderID}/params/gain/again/',
			options: [
				{
					id: 'faderId',
					type: 'dropdown',
					label: 'Fader',
					default: fadersWithAgain[0]?.[0] ?? '',
					choices: fadersWithAgain.map(([id, values]) => ({ id, label: `${id} (${values.label})` })),
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
			],
			callback: async ({ options }) => {
				const faderId = `${options.faderId}`
				const direction = options.direction === 'down' ? -1 : 1

				const path = `/audio/mixers/0/faders/${faderId}/params/gain/again/`
				const stepSize = await getNumericValue(self, `${path}_step/`)
				if (stepSize === null) {
					return
				}

				const incValue = direction * stepSize

				self.websocket.set(
					`${path}inc`,
					incValue,
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
	return getFadersWithAgain(ch).reduce(
		(acc, [key, values]) => ({
			...acc,
			[`fader-again-${key}`]: {
				type: 'button',
				category: `Fader: ${values.label}`,
				name: `${key} AGain Rotary`,
				style: {
					text: `${values.label}\n AGain`,
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
								actionId: 'fader_again_adjust',
								options: {
									faderId: key,
									direction: 'down',
								},
							},
						],
						rotate_right: [
							{
								actionId: 'fader_again_adjust',
								options: {
									faderId: key,
									direction: 'up',
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
