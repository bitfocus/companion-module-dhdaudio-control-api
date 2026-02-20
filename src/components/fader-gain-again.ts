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
	return getFadersWithAgain(ch).flatMap(([key, values]) => [
		{
			variableId: `fader_again_min_${key}`,
			name: `Fader ${values.label} AGain Min`,
		},
		{
			variableId: `fader_again_max_${key}`,
			name: `Fader ${values.label} AGain Max`,
		},
		{
			variableId: `fader_again_value_${key}`,
			name: `Fader ${values.label} AGain Value`,
		},
		{
			variableId: `fader_again_step_${key}`,
			name: `Fader ${values.label} AGain Step`,
		},
	])
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
				const path = `/audio/mixers/0/faders/${options.faderId}/params/gain/again`

				self.websocket.subscribe(`${path}/value`)
				self.websocket.get(
					path,
					(response) => {
						const current = z
							.object({
								value: z.number(),
								_max: z.number(),
								_min: z.number(),
								_step: z.number(),
							})
							.safeParse(response.payload)

						if (!current.success) {
							return
						}

						const faderId = `${options.faderId}`

						const { _max, _min, _step, value } = current.data
						self.setVariableValues({
							[`fader_again_min_${faderId}`]: _min,
							[`fader_again_max_${faderId}`]: _max,
							[`fader_again_step_${faderId}`]: _step,
							[`fader_again_value_${faderId}`]: value,
						})

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
				const isDown = options.direction === 'down'

				const current = z
					.object({
						value: z.number(),
						max: z.number(),
						min: z.number(),
						step: z.number(),
					})
					.safeParse({
						value: self.getVariableValue(`fader_again_value_${faderId}`),
						step: self.getVariableValue(`fader_again_step_${faderId}`),
						min: self.getVariableValue(`fader_again_min_${faderId}`),
						max: self.getVariableValue(`fader_again_max_${faderId}`),
					})

				if (!current.success) {
					return
				}

				const { max, min, step, value } = current.data
				if ((isDown && value <= min) || (!isDown && value >= max)) {
					return
				}

				const incrementValue = (isDown ? -1 : 1) * step

				self.websocket.set(
					`/audio/mixers/0/faders/${faderId}/params/gain/again/inc`,
					incrementValue,
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

const updateParser = z.object({
	audio: z.object({
		mixers: z.record(
			z.string(),
			z.object({
				faders: z.record(
					z.string(),
					z.object({
						params: z.object({
							gain: z.object({
								again: z.object({
									value: z.number(),
								}),
							}),
						}),
					}),
				),
			}),
		),
	}),
})

export function onSubscriptionUpdate(self: ModuleInstance, { payload }: ResponseSubscriptionUpdate): void {
	const parsed = updateParser.safeParse(payload)
	if (!parsed.success) {
		return
	}

	Object.values(parsed.data.audio.mixers).forEach(({ faders }) =>
		Object.entries(faders).forEach(([faderId, { params }]) => {
			const nextValue = params.gain.again.value

			self.setVariableValues({ [`fader_again_value_${faderId}`]: nextValue })
		}),
	)

	self.checkFeedbacks()
}
