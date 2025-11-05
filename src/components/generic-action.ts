import { ModuleInstance } from '../main.js'
import * as z from 'zod'
import { type CompanionVariableDefinition, CompanionActionDefinitions, InstanceStatus } from '@companion-module/base'
import type { ResponseSubscriptionUpdate } from '@dhdaudio/control-api'
import { prop } from 'remeda'

export function init(self: ModuleInstance): {
	variables: ReadonlyArray<CompanionVariableDefinition>
	actions: CompanionActionDefinitions
} {
	const actionQuantity = parseInt(self.config.genericActionsNum)
	const variables = genVariables(actionQuantity)
	const actions = genActions(self, actionQuantity)

	return { variables, actions }
}

// to parse the subscription updates coming from the websocket
// we need to know the paths of the subscriptions and corresponding generic variables
// -- hacky solution
const genericVariableNames: any = {}

function genVariables(quantity: number): ReadonlyArray<CompanionVariableDefinition> {
	return Array.from(
		{ length: quantity },
		(_, i) =>
			({
				name: `Generic Action ${i + 1}`,
				variableId: `generic-action-${i + 1}`,
			}) satisfies CompanionVariableDefinition,
	)
}

const mixedSchema = z.union([
	z.coerce.number(),
	z.enum(['true', 'false']).transform((val) => val === 'true'),
	z.string(),
])

function genActions(self: ModuleInstance, quantity: number): CompanionActionDefinitions {
	return {
		generic_action: {
			name: 'Generic Action',
			options: [
				{
					id: 'path',
					type: 'textinput',
					label: 'API-Path',
					tooltip: 'e.g. /audio/mixers/0/faders/0/pfl1',
					default: '',
				},
				{
					id: 'readonly',
					type: 'checkbox',
					label: 'Readonly',
					default: false,
				},
				{
					id: 'toggle',
					type: 'checkbox',
					label: 'Toggle',
					tooltip: 'Can be used to toggle the boolean values, e.g. /audio/mixers/0/faders/0/pfl1',
					default: false,
				},
				{
					id: 'value',
					type: 'textinput',
					label: 'Value',
					default: '',
					isVisibleExpression: `$(options:readonly) == false && $(options:toggle) == false`,
				},
				{
					id: 'variable',
					type: 'dropdown',
					label: 'Generic Variable',
					tooltip: 'e.g. Can be referenced as $(<namespace>:generic-action-1)',
					default: 'none',
					choices: [
						{
							id: 'none',
							label: 'none',
						},
						...Array.from({ length: quantity }, (_, i) => ({
							id: i + 1,
							label: `Generic Action Variable ${i + 1}`,
						})),
					],
				},
			],
			callback: async ({ options }) => {
				const { path, readonly, toggle, variable } = options
				let { value } = options

				if (readonly) {
					return
				}

				if (toggle) {
					if (!variable) {
						self.log('error', 'generic variable is missing')
						self.updateStatus(InstanceStatus.BadConfig, 'generic variable must be defined for a toggle option')
						return
					}

					value = self.getVariableValue(`generic-action-${variable}`)
				}

				if (!path || !variable || (!value && !toggle)) {
					self.log('error', 'option is missing')
					self.updateStatus(InstanceStatus.BadConfig, 'options is missing')
					return
				}

				const parsed = toggle ? !value : await mixedSchema.parseAsync(value)

				self.websocket.set(
					path.toString(),
					parsed,
					(response) => {
						if (variable === 'none') {
							return
						}

						self.setVariableValues({ [`generic-action-${variable}`]: response.payload as any })
						self.checkFeedbacks()
					},
					(response) => {
						self.updateStatus(InstanceStatus.UnknownError, response.error.message)
					},
				)
			},
			subscribe: async ({ options }) => {
				const { path, variable } = options
				if (!path || !variable) {
					self.log('error', 'option is missing')
					self.updateStatus(InstanceStatus.BadConfig, 'options is missing')
					return
				}

				const subscriptionPath = path.toString()
				self.websocket.subscribe(path.toString())

				self.websocket.get(
					path.toString(),
					(response) => {
						if (variable === 'none') {
							genericVariableNames[subscriptionPath] = ''
							return
						}
						genericVariableNames[subscriptionPath] = `generic-action-${variable}`
						self.setVariableValues({ [`generic-action-${variable}`]: response.payload as any })
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

export function onSubscriptionUpdate(self: ModuleInstance, { payload }: ResponseSubscriptionUpdate): void {
	for (const [subscriptionPath, genericVariableName] of Object.entries(genericVariableNames)) {
		// no variable selected
		if (genericVariableName === '') {
			continue
		}

		// transform subscription path into path array
		const path = subscriptionPath
			.split('/')
			.filter(Boolean) // Remove empty strings from leading slash
			.map((segment) => {
				const num = Number(segment)
				return !isNaN(num) && segment !== '' ? num : segment
			})

		// remeda needs to know the path upfront which is not possible
		// with the subscription path
		// @ts-expect-error
		const value = prop(payload, ...path)
		if (value === undefined) {
			continue
		}

		self.setVariableValues({ [`${genericVariableName}`]: value })
	}

	self.checkFeedbacks()
}
