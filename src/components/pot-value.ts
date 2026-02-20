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
import type { PotRecord } from '../control-api/pots.js'
import type { ModuleInstance } from '../main.js'
import type { ResponseSubscriptionUpdate } from '@dhdaudio/control-api'

export function init(
	self: ModuleInstance,
	pots: PotRecord,
): {
	variables: ReadonlyArray<CompanionVariableDefinition>
	feedback: CompanionFeedbackDefinitions
	actions: CompanionActionDefinitions
	presets: CompanionPresetDefinitions
} {
	const variables = genVariables(pots)
	const feedback = genFeedbacks(self, pots)
	const actions = genActions(self, pots)
	const presets = genPresets(pots)

	return { variables, feedback, actions, presets }
}

function genVariables(pots: PotRecord): ReadonlyArray<CompanionVariableDefinition> {
	return Object.entries(pots).map(
		([key, value]) =>
			({
				name: `${value._name ?? key}`,
				variableId: `pot_value_${key}`,
			}) satisfies CompanionVariableDefinition,
	)
}

function genFeedbacks(self: ModuleInstance, pots: PotRecord): CompanionFeedbackDefinitions {
	return {
		pot_value: {
			name: 'Pot Value',
			type: 'boolean',
			defaultStyle: {},
			options: [
				{
					id: 'potId',
					type: 'dropdown',
					label: 'Pot',
					default: Object.keys(pots)[0] ?? '0',
					choices: Object.entries(pots).map(([id, value]) => ({ id, label: `${id} (${value._name ?? id})` })),
				},
			],
			callback: () => true,
			subscribe: ({ options }) => {
				const path = `/audio/pots/${options.potId}/value`
				self.websocket.subscribe(path)
				self.websocket.get(
					path,
					(response) => {
						const parsed = parseNumericPayload(response.payload)
						if (parsed !== null) {
							self.setVariableValues({ [`pot_value_${options.potId}`]: parsed })
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

function genActions(self: ModuleInstance, pots: PotRecord): CompanionActionDefinitions {
	return {
		pot_value_adjust: {
			name: 'Pot Value (Rotary)',
			description: 'Adjust /audio/pots/{potID}/value',
			options: [
				{
					id: 'potId',
					type: 'dropdown',
					label: 'Pot',
					default: Object.keys(pots)[0] ?? '0',
					choices: Object.entries(pots).map(([id, value]) => ({ id, label: `${id} (${value._name ?? id})` })),
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
					max: 1024,
					step: 0.01,
					required: true,
				},
			],
			callback: async ({ options }) => {
				const potId = `${options.potId}`
				const pot = pots[potId]
				if (!pot) {
					self.updateStatus(InstanceStatus.BadConfig, `Unknown pot: ${potId}`)
					return
				}

				const direction = options.direction === 'down' ? -1 : 1
				const stepValue = z.coerce.number().safeParse(options.step)
				if (!stepValue.success) {
					self.updateStatus(InstanceStatus.BadConfig, 'Invalid step value')
					return
				}

				const path = `/audio/pots/${potId}/value`
				const currentValue = await getNumericValue(self, path)
				if (currentValue === null) {
					return
				}

				const minValue = Math.min(pot._min, pot._max)
				const maxValue = Math.max(pot._min, pot._max)
				const adjustedValue = currentValue + direction * stepValue.data
				const nextValue = Math.min(maxValue, Math.max(minValue, adjustedValue))

				self.websocket.set(
					path,
					nextValue,
					(response) => {
						const parsed = parseNumericPayload(response.payload)
						if (parsed !== null) {
							self.setVariableValues({ [`pot_value_${potId}`]: parsed })
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

function genPresets(pots: PotRecord): CompanionPresetDefinitions {
	return Object.entries(pots).reduce(
		(acc, [key, value]) => ({
			...acc,
			[`pot-value-${key}`]: {
				type: 'button',
				category: 'Pots',
				name: `${key} Rotary`,
				style: {
					text: `${value._name ?? key}\n$(internal:pot_value_${key})`,
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
								actionId: 'pot_value_adjust',
								options: {
									potId: key,
									direction: 'down',
									step: 1,
								},
							},
						],
						rotate_right: [
							{
								actionId: 'pot_value_adjust',
								options: {
									potId: key,
									direction: 'up',
									step: 1,
								},
							},
						],
					},
				],
				feedbacks: [
					{
						feedbackId: 'pot_value',
						options: {
							potId: key,
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
		pots: z.record(
			z.string(),
			z.object({
				value: numericValueParser,
			}),
		),
	}),
})

export function onSubscriptionUpdate(self: ModuleInstance, { payload }: ResponseSubscriptionUpdate): void {
	const parsed = updateParser.safeParse(payload)

	if (parsed.success) {
		Object.entries(parsed.data.audio.pots).forEach(([potId, { value }]) => {
			const normalized = typeof value === 'number' ? value : value.value
			self.setVariableValues({ [`pot_value_${potId}`]: normalized })
		})

		self.checkFeedbacks()
	}
}
