import * as z from 'zod'
import type { ModuleInstance } from '../main.js'

const PotId = z.string()

const PotCandidate = z.object({
	_name: z.string().optional(),
	value: z.number(),
	_min: z.number(),
	_max: z.number(),
})

const PotRecord = z.record(PotId, PotCandidate)
export type PotRecord = z.infer<typeof PotRecord>

const PotCandidateRecord = z.record(PotId, z.unknown())

const ResponseSuccess = z.object({
	msgID: z.any(),
	method: z.literal('get'),
	path: z.string(),

	success: z.literal(true),
	payload: z.unknown(),
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

export async function fetchPots(self: ModuleInstance): Promise<PotRecord> {
	return new Promise((resolve, reject) => {
		self.websocket.get('/audio/pots', (response) => {
			const result = Response.safeParse(response)
			if (!result.success) {
				return reject(new Error(result.error.message))
			}

			const parsedResponse = result.data

			if (parsedResponse.success === false) {
				return reject(new Error(parsedResponse.error.message))
			}

			const directPayload = PotCandidateRecord.safeParse(parsedResponse.payload)
			if (directPayload.success) {
				return resolve(filterSupportedPots(directPayload.data))
			}

			const nestedPayload = z
				.object({
					pots: PotCandidateRecord,
				})
				.safeParse(parsedResponse.payload)

			if (nestedPayload.success) {
				return resolve(filterSupportedPots(nestedPayload.data.pots))
			}

			return reject(new Error('Invalid response payload for /audio/pots'))
		})
	})
}

function filterSupportedPots(pots: Record<string, unknown>): PotRecord {
	return Object.entries(pots).reduce<PotRecord>((acc, [id, value]) => {
		const parsed = PotCandidate.safeParse(value)
		if (!parsed.success) {
			return acc
		}

		acc[id] = parsed.data
		return acc
	}, {})
}
