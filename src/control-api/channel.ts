import * as z from 'zod'
import type { ModuleInstance } from '../main.js'

const Channel = z.object({
	label: z.string(),
	fader: z.float32(),
	on: z.boolean(),
	pfl1: z.boolean(),
	pfl2: z.boolean(),
	_hasagain: z.boolean().optional().default(false),
})

const ChannelId = z.string()
const ChannelRecord = z.record(ChannelId, Channel)
export type ChannelRecord = z.infer<typeof ChannelRecord>

const ChannelWithParams = Channel.extend({
	params: z
		.object({
			gain: z
				.object({
					_hasagain: z.boolean().optional().default(false),
				})
				.optional(),
		})
		.optional(),
})

const ResponseSuccess = z.object({
	msgID: z.any(),
	method: z.literal('get'),
	path: z.string(),

	success: z.literal(true),
	payload: z.object({ faders: z.record(ChannelId, ChannelWithParams) }),
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

			if (result.data.success === false) {
				return reject(new Error(result.data.error.message))
			}

			const normalized = Object.fromEntries(
				Object.entries(result.data.payload.faders).map(([id, values]) => {
					const { params, ...base } = values
					return [
						id,
						{
							...base,
							_hasagain: params?.gain?._hasagain ?? base._hasagain,
						},
					]
				}),
			)

			const channels = z.safeParse(ChannelRecord, normalized)
			if (!channels.success) {
				return reject(new Error(channels.error.message))
			}

			return resolve(channels.data)
		})
	})
}
