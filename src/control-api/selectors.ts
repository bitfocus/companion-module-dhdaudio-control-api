import * as z from 'zod'
import type { ModuleInstance } from '../main.js'

const Source = z.object({
	_label: z.string(),
	_sourcel: z.string(),
	_sourcer: z.string(),
})

type Source = z.infer<typeof Source>

const Sourcelist = z.object({
	_name: z.string(),
	entries: z.record(z.string(), Source),
})

const SourcelistId = z.string()
export type SourcelistId = z.infer<typeof SourcelistId>

const Sourcelists = z.record(SourcelistId, Sourcelist)
export type Sourcelists = z.infer<typeof Sourcelists>

const Selector = z.object({
	_name: z.string(),
	_sourcelist: z.string(),
	left: z.string(),
	right: z.string(),
})

const SelectorId = z.string()
export type SelectorId = z.infer<typeof SelectorId>

const Selectors = z.record(SelectorId, Selector)
const Payload = z.object({
	selectors: Selectors,
	sourcelists: Sourcelists,
})

type Sourcelist = z.infer<typeof Sourcelist>
export type Selectors = z.infer<typeof Selectors>

const ResponseSuccess = z.object({
	msgID: z.any(),
	method: z.literal('get'),
	path: z.string(),

	success: z.literal(true),
	payload: Payload,
})

const ResponseError = z.object({
	msgID: z.any(),
	method: z.literal('get'),
	path: z.string(),

	success: z.literal(false),
	error: z.object({
		code: z.number(),
		message: z.string(),
	}),
})

const Response = z.union([ResponseSuccess, ResponseError])

export async function fetchSelectors(self: ModuleInstance): Promise<[Selectors, Sourcelists]> {
	return new Promise((resolve, reject) => {
		self.websocket.get('/audio/selectors', (response) => {
			// TODO: can `success` false here too? if so the control-api-ts typing need a correction
			const parsed = z.parse(Response, response)
			if (parsed.success) {
				const { payload } = parsed

				// If no sourcelist is assigned, the entry will be "0".
				const selectors = Object.fromEntries(
					Object.entries(payload.selectors).filter(([_, { _sourcelist }]) => _sourcelist !== '0'),
				)

				return resolve([selectors, payload.sourcelists] as const)
			}

			console.error(parsed.error)
			reject(new Error(parsed.error.message))
		})
	})
}
