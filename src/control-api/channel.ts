import * as z from 'zod'
import type { ModuleInstance } from '../main.js'

const Channel = z.object({
	label: z.string(),
	fader: z.float32(),
	on: z.boolean(),
	pfl1: z.boolean(),
	pfl2: z.boolean(),
})

const ChannelId = z.string()
const ChannelRecord = z.record(ChannelId, Channel)
export type ChannelRecord = z.infer<typeof ChannelRecord>

const ResponseSuccess = z.object({
	msgID: z.any(),
	method: z.literal('get'),
	path: z.string(),

	success: z.literal(true),
	payload: z.object({ faders: ChannelRecord }),
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

export async function fetchChannel(self: ModuleInstance): Promise<ChannelRecord> {
	return new Promise((resolve, reject) => {
		self.websocket.get('/audio/mixers/0', (response) => {
			const result = z.safeParse(Response, response)
			if (!result.success) {
				return reject(new Error(result.error.message))
			}

			if (!result.data.success) {
				return reject(new Error(result.data.error.message))
			}

			return resolve(result.data.payload.faders)
		})
	})
}
