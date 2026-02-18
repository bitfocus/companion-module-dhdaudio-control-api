import {
	InstanceBase,
	runEntrypoint,
	InstanceStatus,
	type SomeCompanionConfigField,
	type CompanionVariableDefinition,
	type CompanionFeedbackDefinitions,
	type CompanionActionDefinitions,
	type CompanionPresetDefinitions,
} from '@companion-module/base'
import { genConfigFields, type ModuleConfig } from './config.js'
import { UpgradeScripts } from './upgrades.js'
import { ControlApi, ResponseSubscriptionUpdate, WebsocketApiWithSubscription } from '@dhdaudio/control-api'
import * as z from 'zod'
import { fetchChannel } from './control-api/channel.js'
import { fetchPots } from './control-api/pots.js'
import * as channelOnOff from './components/channel-on-off.js'
import * as faderLevel from './components/fader-level.js'
import * as faderGainAgain from './components/fader-gain-again.js'
import * as faderPfl from './components/fader-pfl.js'
import * as potValue from './components/pot-value.js'
import * as selector from './components/selector.js'
import * as snapshot from './components/snapshot.js'
import * as logics from './components/logics.js'
import * as genericAction from './components/generic-action.js'

const CONNECTION_TIMEOUT_MS = 5000

class StaleAttemptError extends Error {
	constructor() {
		super('Stale init attempt')
		this.name = 'StaleAttemptError'
	}
}

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig

	websocket!: WebsocketApiWithSubscription

	private latestInitAttempt = 0

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'Host not set')
			return
		}

		this.updateStatus(InstanceStatus.Connecting)

		const attemptId = ++this.latestInitAttempt

		void (async () => {
			try {
				let websocket: WebsocketApiWithSubscription

				try {
					let control = new ControlApi({ host: config.host!, useHttps: config.useHttps })
					if (config.token) {
						control = control.withAuth({ token: config.token }, console.log, console.error)
					}
					control = control.withSubscription(this.onSubscriptionUpdate.bind(this)).withLogLevel('error')

					const connectResult = await this.withTimeout(
						control.connectAsync(),
						CONNECTION_TIMEOUT_MS,
						`Connection timeout after ${CONNECTION_TIMEOUT_MS / 1000}s`,
					)
					websocket = connectResult as WebsocketApiWithSubscription
				} catch (err) {
					this.assertCurrentAttempt(attemptId)

					if (err instanceof Error) {
						this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
						return
					}

					const parserResult = z
						.object({
							error: z.object({
								code: z.number(),
								message: z.string(),
							}),
						})
						.safeParse(err)

					if (parserResult.success) {
						this.updateStatus(InstanceStatus.ConnectionFailure, parserResult.data.error.message)
						return
					}

					const parserResult2 = z
						.object({
							type: z.string(),
						})
						.safeParse(err)

					if (parserResult2.success) {
						this.updateStatus(InstanceStatus.ConnectionFailure, parserResult2.data.type)
						return
					}

					this.updateStatus(InstanceStatus.ConnectionFailure, 'unknow error')
					return
				}

				this.assertCurrentAttempt(attemptId)
				this.websocket = websocket

				const varDefinitions: Array<CompanionVariableDefinition> = []
				let feedbackDefinitions: CompanionFeedbackDefinitions = {}
				let actionDefinitions: CompanionActionDefinitions = {}
				let presetDefinitions: CompanionPresetDefinitions = {}

				const channels = await fetchChannel(this).catch(() => null)
				this.assertCurrentAttempt(attemptId)
				const pots = await fetchPots(this).catch(() => null)
				this.assertCurrentAttempt(attemptId)

				if (channels) {
					const channelOnOffConfig = channelOnOff.init(this, channels)
					varDefinitions.push(...channelOnOffConfig.variables)
					feedbackDefinitions = { ...feedbackDefinitions, ...channelOnOffConfig.feedback }
					actionDefinitions = { ...actionDefinitions, ...channelOnOffConfig.actions }
					presetDefinitions = { ...presetDefinitions, ...channelOnOffConfig.presets }

					const faderLevelConfig = faderLevel.init(this, channels)
					actionDefinitions = { ...actionDefinitions, ...faderLevelConfig.actions }
					presetDefinitions = { ...presetDefinitions, ...faderLevelConfig.presets }

					const faderGainAgainConfig = faderGainAgain.init(this, channels)
					actionDefinitions = { ...actionDefinitions, ...faderGainAgainConfig.actions }
					presetDefinitions = { ...presetDefinitions, ...faderGainAgainConfig.presets }

					const faderPflConfig = faderPfl.init(this, channels)
					varDefinitions.push(...faderPflConfig.variables)
					feedbackDefinitions = { ...feedbackDefinitions, ...faderPflConfig.feedback }
					actionDefinitions = { ...actionDefinitions, ...faderPflConfig.actions }
					presetDefinitions = { ...presetDefinitions, ...faderPflConfig.presets }
				}

				if (pots && Object.keys(pots).length > 0) {
					const potValueConfig = potValue.init(this, pots)
					actionDefinitions = { ...actionDefinitions, ...potValueConfig.actions }
					presetDefinitions = { ...presetDefinitions, ...potValueConfig.presets }
				}

				const selectorConfig = await selector.init(this)
				this.assertCurrentAttempt(attemptId)
				const snapshotConfig = await snapshot.init(this)
				this.assertCurrentAttempt(attemptId)
				const logicsConfig = await logics.init(this)
				this.assertCurrentAttempt(attemptId)
				const genericActionConfig = genericAction.init(this)
				this.assertCurrentAttempt(attemptId)

				this.setVariableDefinitions([
					...varDefinitions,
					...selectorConfig.variables,
					...logicsConfig.variables,
					...genericActionConfig.variables,
				])

				this.setFeedbackDefinitions({
					...feedbackDefinitions,
					...selectorConfig.feedback,
					...logicsConfig.feedback,
				})
				this.setActionDefinitions({
					...actionDefinitions,
					...selectorConfig.actions,
					...snapshotConfig.actions,
					...logicsConfig.actions,
					...genericActionConfig.actions,
				})

				this.setPresetDefinitions({
					...presetDefinitions,
					...selectorConfig.presets,
					...snapshotConfig.presets,
					...logicsConfig.presets,
				})

				this.assertCurrentAttempt(attemptId)
				this.updateStatus(InstanceStatus.Ok)
			} catch (err) {
				if (err instanceof StaleAttemptError) {
					return
				}
				const detail = err instanceof Error ? err.message : String(err)
				this.log('error', `Unexpected init error: ${detail}`)
			}
		})()
	}

	onSubscriptionUpdate(update: ResponseSubscriptionUpdate): void {
		this.log('debug', JSON.stringify(update))
		channelOnOff.onSubscriptionUpdate(this, update)
		selector.onSubscriptionUpdate(this, update)
		faderPfl.onSubscriptionUpdate(this, update)
		logics.onSubscriptionUpdate(this, update)
		genericAction.onSubscriptionUpdate(this, update)
	}

	async destroy(): Promise<void> {
		this.latestInitAttempt++
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		await this.init(config)
	}

	private isAttemptStale(attemptId: number): boolean {
		return attemptId !== this.latestInitAttempt
	}

	private assertCurrentAttempt(attemptId: number): void {
		if (this.isAttemptStale(attemptId)) {
			throw new StaleAttemptError()
		}
	}

	private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
		let timeoutHandle: ReturnType<typeof setTimeout> | undefined

		const timeoutPromise = new Promise<T>((_, reject) => {
			timeoutHandle = setTimeout(() => {
				reject(new Error(timeoutMessage))
			}, timeoutMs)
		})

		try {
			return await Promise.race([promise, timeoutPromise])
		} finally {
			if (timeoutHandle) {
				clearTimeout(timeoutHandle)
			}
		}
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return genConfigFields()
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
