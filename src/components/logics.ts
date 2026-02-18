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
import type { ResponseSubscriptionUpdate } from '@dhdaudio/control-api'

const logicsParser = z.record(
	z.string(),
	z.object({
		value: z.boolean(),
		_name: z.string(),
		_path: z.string(),
	}),
)

type Logics = z.infer<typeof logicsParser>

export async function init(self: ModuleInstance): Promise<{
	variables: ReadonlyArray<CompanionVariableDefinition>
	feedback: CompanionFeedbackDefinitions
	actions: CompanionActionDefinitions
	presets: CompanionPresetDefinitions
}> {
	const logics = await self.websocket
		.getAsync('/control/logics')
		.then(async (res) => logicsParser.parseAsync(res.payload))

	const variables = genVariables(logics)
	const feedback = genFeedbacks(self, logics)
	const actions = genActions(self, logics)
	const presets = genPresets(logics)

	return { variables, feedback, actions, presets }
}

function genVariables(logics: Logics): ReadonlyArray<CompanionVariableDefinition> {
	return Object.entries(logics).map(
		([key, values]) =>
			({
				name: `${values._name}`,
				variableId: `logic_${key}`,
			}) satisfies CompanionVariableDefinition,
	)
}

// is coupled to control api subscriptions
function genFeedbacks(self: ModuleInstance, logics: Logics): CompanionFeedbackDefinitions {
	return {
		logic: {
			name: 'Logic',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(186, 255, 222),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					id: 'logicId',
					type: 'dropdown',
					label: 'Logic',
					default: Object.keys(logics)[0],
					choices: Object.entries(logics).map(([id, values]) => ({ id, label: `${id} (${values._name})` })),
				},
			],
			callback: ({ options }) => self.getVariableValue(`logic_${options.logicId}`) === true,
			subscribe: ({ options }) => {
				self.websocket.subscribe(`/control/logics/${options.logicId}/value`)

				self.websocket.get(
					`/control/logics/${options.logicId}/value`,
					(response) => {
						const value = z.boolean().parse(response.payload)
						self.setVariableValues({ [`logic_${options.logicId}`]: value })
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

function genActions(self: ModuleInstance, logics: Logics): CompanionActionDefinitions {
	return {
		logic: {
			name: 'Logic',
			options: [
				{
					id: 'logicId',
					type: 'dropdown',
					label: 'Logic',
					default: Object.keys(logics)[0],
					choices: Object.entries(logics).map(([id, values]) => ({ id, label: `${id} (${values._name})` })),
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
				const value = self.getVariableValue(`logic_${options.logicId}`)
				const nextValue = options.switchmode === 0 ? !value : options.switchmode === 1 ? true : false

				self.websocket.set(
					`/control/logics/${options.logicId}/value`,
					nextValue,
					(response) => {
						const nextValue = z.boolean().parse(response.payload)
						self.setVariableValues({ [`logic_${options.logicId}`]: nextValue })
						self.checkFeedbacks()
					},
					(response) => {
						self.updateStatus(InstanceStatus.UnknownError, response.error.message)
					},
				)
			},
			subscribe: ({ options }) => {
				self.websocket.subscribe(`/control/logics/${options.logicId}/value`)

				self.websocket.get(
					`/control/logics/${options.logicId}/value`,
					(response) => {
						const value = z.boolean().parse(response.payload)
						self.setVariableValues({ [`logic_${options.logicId}`]: value })
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

function genPresets(logics: Logics): CompanionPresetDefinitions {
	return Object.entries(logics).reduce(
		(acc, [key, value]) => ({
			...acc,
			[`logic-${key}`]: {
				type: 'button',
				category: `Logics`,
				name: `${value._name}`,
				style: {
					text: `${value._name}`,
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: 0,
				},
				steps: [
					{
						down: [
							{
								actionId: 'logic',
								options: {
									logicId: key,
									switchmode: 0,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'logic',
						options: {
							logicId: key,
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
	control: z.object({
		logics: z.record(
			z.string(),
			z.object({
				value: z.boolean(),
			}),
		),
	}),
})

export function onSubscriptionUpdate(self: ModuleInstance, { payload }: ResponseSubscriptionUpdate): void {
	const parsed = updateParser.safeParse(payload)

	if (parsed.success) {
		Object.entries(parsed.data.control.logics).forEach(([logicId, { value }]) => {
			self.setVariableValues({ [`logic_${logicId}`]: value })
		})

		self.checkFeedbacks()
	}
}
