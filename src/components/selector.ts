import type { ResponseSubscriptionUpdate } from '@dhdaudio/control-api'
import {
	combineRgb,
	CompanionButtonPresetDefinition,
	CompanionFeedbackDefinitions,
	CompanionOptionValues,
	CompanionPresetDefinitions,
	CompanionVariableDefinition,
	InstanceStatus,
	SomeCompanionActionInputField,
	SomeCompanionFeedbackInputField,
	type CompanionActionDefinitions,
} from '@companion-module/base'
import type { ModuleInstance } from '../main.js'
import { fetchSelectors, SelectorId, SourcelistId, Sourcelists, type Selectors } from '../control-api/selectors.js'
import * as z from 'zod'

type FindSourceFromOptionsFn = (options: CompanionOptionValues) =>
	| {
			_label: string
			_sourcel: string
			_sourcer: string
	  }
	| false

type SourcelistSelectorRefs = Map<SourcelistId, Set<SelectorId>>

const mkFindSourceFromOptions =
	(
		self: ModuleInstance,
		sourcelists: Sourcelists,
		sourcelistSelectorRefs: SourcelistSelectorRefs,
	): FindSourceFromOptionsFn =>
	(options) => {
		const { selectorId, ...sourcelistIdChoices } = options
		if (!selectorId) {
			self.log('error', 'missing selector')
			self.updateStatus(InstanceStatus.BadConfig, 'missing selector')
			return false
		}

		// which sourcelist is referenced by the current selector
		const sourcelistIdChoice = Object.entries(sourcelistIdChoices).find(([sourcelistId]) => {
			const needle = sourcelistSelectorRefs.get(sourcelistId)
			if (!needle) {
				return false
			}

			return needle.has(selectorId.toString())
		})
		if (!sourcelistIdChoice) {
			self.log('error', 'invalid selector')
			self.updateStatus(InstanceStatus.BadConfig, 'invalid selector')
			return false
		}

		const [sourcelistId, choiceId] = sourcelistIdChoice
		if (!choiceId) {
			self.updateStatus(InstanceStatus.UnknownError, 'unknown error')
			return false
		}

		// reset previous error states (if any)
		self.updateStatus(InstanceStatus.Ok)

		return sourcelists[sourcelistId].entries[choiceId.toString()]
	}

// To show only the relevant sourcelist dropdown for a selector, we need to lookup which sourcelist is used by which selector.
const genSourcelistSelectorRefs = (selectors: Selectors) =>
	Object.entries(selectors).reduce<SourcelistSelectorRefs>((agg, [selectorId, { _sourcelist: sourcelistId }]) => {
		if (!agg.has(sourcelistId)) {
			agg.set(sourcelistId, new Set())
		}

		agg.get(sourcelistId)!.add(selectorId)

		return agg
	}, new Map())

const mkOptions = (selectors: Selectors, sourcelists: Sourcelists, refs: SourcelistSelectorRefs) => [
	{
		id: 'selectorId',
		type: 'dropdown' as const,
		label: 'Selector',
		default: Object.keys(selectors)[0],
		choices: Object.entries(selectors).map(([key, value]) => ({ id: key, label: value._name })),
	},
	...Object.entries(sourcelists).map(([sourcelistId, { _name, entries }]) => ({
		id: sourcelistId,
		type: 'dropdown' as const,
		label: _name,
		default: Object.keys(entries)[0],
		choices: Object.entries(entries).map(([key, value]) => ({ id: key, label: value._label })),
		// expression doc can be found https://user.bitfocus.io/docs/companion
		isVisibleExpression: `arrayIncludes( ${JSON.stringify(Array.from(refs.get(sourcelistId) || []))}, $(options:selectorId) )`,
	})),
]

export async function init(self: ModuleInstance): Promise<{
	actions: CompanionActionDefinitions
	presets: CompanionPresetDefinitions
	variables: ReadonlyArray<CompanionVariableDefinition>
	feedback: CompanionFeedbackDefinitions
}> {
	const [selectors, sourcelists] = await fetchSelectors(self)

	const sourcelistSelectorRefs = genSourcelistSelectorRefs(selectors)
	const findSourceFromOptions = mkFindSourceFromOptions(self, sourcelists, sourcelistSelectorRefs)
	const options = mkOptions(selectors, sourcelists, sourcelistSelectorRefs)

	const actions = genActions(self, findSourceFromOptions, options)
	const presets = genPresets(selectors)
	const variables = genVariables(selectors)
	const feedback = genFeedbacks(self, findSourceFromOptions, options)

	return { actions, presets, variables, feedback }
}

function genActions(
	self: ModuleInstance,
	find: FindSourceFromOptionsFn,
	options: Array<SomeCompanionActionInputField>,
): CompanionActionDefinitions {
	return {
		routing: {
			name: 'Routing',
			options,
			callback: async ({ options }) => {
				const { selectorId } = options
				const source = find(options)
				if (!source) {
					return
				}

				self.websocket.set(
					`/audio/selectors/selectors/${selectorId}`,
					{
						left: source._sourcel,
						right: source._sourcer,
					},
					() => void 1,
					(err) => {
						self.log('error', err.error.message)
						self.updateStatus(InstanceStatus.UnknownError, err.error.message)
					},
				)
			},
			subscribe: ({ options }) => {
				const source = find(options)
				if (!source) {
					return
				}

				self.websocket.subscribe(`/audio/selectors/selectors/${options.selectorId}`)

				self.websocket.get(
					`/audio/selectors/selectors/${options.selectorId}`,
					(response) => {
						const value = selector.parse(response.payload)

						self.setVariableValues({
							[`routing_${options.selectorId}`]: JSON.stringify({ left: value.left, right: value.right }),
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

function genPresets(selectors: Selectors): CompanionPresetDefinitions {
	// TODO: define first item in sourcelist as action option
	return Object.entries(selectors).reduce(
		(acc, [key, values]) => ({
			...acc,
			[`selector-${key}`]: {
				type: 'button',
				category: `Selector: ${values._name}`,
				name: `${key} Routing`,
				style: {
					text: `${values._name}`,
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: 0,
				},
				steps: [
					{
						down: [
							{
								actionId: 'routing',
								options: {
									selectorId: key,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'routing_value',
						options: {
							selectorId: key,
						},
						style: {
							bgcolor: combineRgb(46, 139, 87),
							color: combineRgb(0, 0, 0),
						},
					},
				],
			} satisfies CompanionButtonPresetDefinition,
		}),
		{},
	)
}

function genVariables(selectors: Selectors): ReadonlyArray<CompanionVariableDefinition> {
	return Object.entries(selectors).map(
		([key, values]) =>
			({
				name: `${values._name}`,
				variableId: `routing_${key}`,
			}) satisfies CompanionVariableDefinition,
	)
}

// is coupled to control api subscriptions
function genFeedbacks(
	self: ModuleInstance,
	find: FindSourceFromOptionsFn,
	options: Array<SomeCompanionFeedbackInputField>,
): CompanionFeedbackDefinitions {
	return {
		routing_value: {
			name: 'Routing Value',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(102, 0, 0),
			},
			options,
			callback: async ({ options }) => {
				const source = find(options)
				if (!source) {
					return false
				}

				return (
					self.getVariableValue(`routing_${options.selectorId}`) ===
					JSON.stringify({ left: source._sourcel, right: source._sourcer })
				)
			},

			subscribe: ({ options }) => {
				const source = find(options)
				if (!source) {
					return
				}

				self.websocket.subscribe(`/audio/selectors/selectors/${options.selectorId}`)

				self.websocket.get(
					`/audio/selectors/selectors/${options.selectorId}`,
					(response) => {
						const value = selector.parse(response.payload)

						self.setVariableValues({
							[`routing_${options.selectorId}`]: JSON.stringify({ left: value.left, right: value.right }),
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

const selector = z.object({
	left: z.string(),
	right: z.string(),
})

const updateParser = z.object({
	audio: z.object({
		selectors: z.object({
			selectors: z.record(z.string(), selector),
		}),
	}),
})

export function onSubscriptionUpdate(self: ModuleInstance, { payload }: ResponseSubscriptionUpdate): void {
	const parsed = updateParser.safeParse(payload)

	if (parsed.success) {
		const [[selectorId, values]] = Object.entries(parsed.data.audio.selectors.selectors)
		self.setVariableValues({ [`routing_${selectorId}`]: JSON.stringify({ left: values.left, right: values.right }) })

		self.checkFeedbacks()
	}
}
