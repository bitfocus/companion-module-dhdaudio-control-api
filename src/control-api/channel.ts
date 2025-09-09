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
	payload: ChannelRecord,
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
		self.websocket.get('/audio/mixers/0/faders', (response) => {
			// TODO: can `success` false here too? if so the control-api-ts typing need a correction
			const parsed = z.parse(Response, response)
			if (parsed.success) {
				const { payload } = parsed

				return resolve(payload)
			}

			console.error(parsed.error)
			reject(new Error(parsed.error.message))
		})
	})
}
