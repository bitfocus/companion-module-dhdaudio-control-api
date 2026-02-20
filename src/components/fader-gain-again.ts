import {
	combineRgb,
	InstanceStatus,
	type CompanionActionDefinitions,
	type CompanionButtonPresetDefinition,
	type CompanionFeedbackDefinitions,
	type CompanionPresetDefinitions,
	type CompanionVariableDefinition,
} from '@companion-module/base'
import * as z from 'zod'
import type { ChannelRecord } from '../control-api/channel.js'
import type { ModuleInstance } from '../main.js'
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

function getFadersWithAgain(ch: ChannelRecord): Array<[string, ChannelRecord[string]]> {
	return Object.entries(ch).filter(([, values]) => values._hasagain === true)
}

function genVariables(ch: ChannelRecord): ReadonlyArray<CompanionVariableDefinition> {
	return getFadersWithAgain(ch).map(
		([key, values]) =>
			({
				name: `${values.label}`,
				variableId: `fader_again_value_${key}`,
			}) satisfies CompanionVariableDefinition,
	)
}

function genFeedbacks(self: ModuleInstance, ch: ChannelRecord): CompanionFeedbackDefinitions {
	const faders = getFadersWithAgain(ch)
	return {
		fader_again_value: {
			name: 'Fader AGain Value',
			type: 'boolean',
			defaultStyle: {},
			options: [
				{
					id: 'faderId',
					type: 'dropdown',
					label: 'Fader',
					default: faders[0]?.[0] ?? '',
					choices: faders.map(([id, values]) => ({ id, label: `${id} (${values.label})` })),
				},
			],
			callback: () => true,
			subscribe: ({ options }) => {
				const path = `/audio/mixers/0/faders/${options.faderId}/params/gain/again/value`
				self.websocket.subscribe(path)
				self.websocket.get(
					path,
					(response) => {
						const parsed = parseNumericPayload(response.payload)
						if (parsed !== null) {
							self.setVariableValues({ [`fader_again_value_${options.faderId}`]: parsed })
							self.checkFeedbacks()
						}
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
					(response) => {
						const parsed = parseNumericPayload(response.payload)
						if (parsed !== null) {
							self.setVariableValues({ [`fader_again_value_${faderId}`]: parsed })
							self.checkFeedbacks()
						}
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
	return getFadersWithAgain(ch).reduce(
		(acc, [key, values]) => ({
			...acc,
			[`fader-again-${key}`]: {
				type: 'button',
				category: `Fader: ${values.label}`,
				name: `${key} AGain Rotary`,
				style: {
					text: `${values.label}\nAGain $(internal:fader_again_value_${key})`,
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
				feedbacks: [
					{
						feedbackId: 'fader_again_value',
						options: {
							faderId: key,
						},
					},
				],
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

function parseNumericPayload(payload: unknown): number | null {
	const parsed = numericValueParser.safeParse(payload)
	if (!parsed.success) {
		return null
	}

	if (typeof parsed.data === 'number') {
		return parsed.data
	}

	return parsed.data.value
}

async function getNumericValue(self: ModuleInstance, path: string): Promise<number | null> {
	return new Promise((resolve) => {
		self.websocket.get(
			path,
			(response) => {
				const parsed = parseNumericPayload(response.payload)
				if (parsed === null) {
					self.updateStatus(InstanceStatus.UnknownError, `Unexpected payload at ${path}`)
					resolve(null)
					return
				}

				resolve(parsed)
			},
			(response) => {
				self.updateStatus(InstanceStatus.UnknownError, response.error.message)
				resolve(null)
			},
		)
	})
}

const updateParser = z.object({
	audio: z.object({
		mixers: z.record(
			z.string(),
			z.object({
				faders: z.record(z.string(), z.object({ params: z.unknown() })),
			}),
		),
	}),
})

const faderParamsParser = z
	.object({
		gain: z
			.object({
				again: z
					.object({
						value: numericValueParser,
					})
					.optional(),
			})
			.optional(),
	})
	.optional()

export function onSubscriptionUpdate(self: ModuleInstance, { payload }: ResponseSubscriptionUpdate): void {
	const parsed = updateParser.safeParse(payload)

	if (parsed.success) {
		Object.values(parsed.data.audio.mixers).forEach((mixer) => {
			Object.entries(mixer.faders).forEach(([faderId, { params }]) => {
				const paramsResult = faderParamsParser.safeParse(params)
				if (!paramsResult.success) {
					return
				}

				const nextValue = paramsResult.data?.gain?.again?.value
				if (nextValue === undefined) {
					return
				}

				const normalized = typeof nextValue === 'number' ? nextValue : nextValue.value
				self.setVariableValues({ [`fader_again_value_${faderId}`]: normalized })
			})
		})

		self.checkFeedbacks()
	}
}
