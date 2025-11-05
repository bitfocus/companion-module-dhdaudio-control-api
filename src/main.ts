import { InstanceBase, runEntrypoint, InstanceStatus, SomeCompanionConfigField } from '@companion-module/base'
import { genConfigFields, type ModuleConfig } from './config.js'
import { UpgradeScripts } from './upgrades.js'
import { ControlApi, ResponseSubscriptionUpdate, WebsocketApiWithSubscription } from '@dhdaudio/control-api'
import * as z from 'zod'
import { fetchChannel } from './control-api/channel.js'
import * as channelOnOff from './components/channel-on-off.js'
import * as faderLevel from './components/fader-level.js'
import * as faderPfl from './components/fader-pfl.js'
import * as selector from './components/selector.js'
import * as snapshot from './components/snapshot.js'
import * as logics from './components/logics.js'
import * as genericAction from './components/generic-action.js'

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig

	websocket!: WebsocketApiWithSubscription

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		if (!this.config.host) {
			this.updateStatus(InstanceStatus.ConnectionFailure, 'Host not set')
			return
		}

		this.updateStatus(InstanceStatus.Connecting)

		try {
			if (this.config.token) {
				this.websocket = await new ControlApi({ host: this.config.host, useHttps: this.config.useHttps })
					.withAuth({ token: this.config.token }, console.log, console.error)
					.withSubscription(this.onSubscriptionUpdate.bind(this))
					.withLogLevel('error')
					.connectAsync()
			} else {
				this.websocket = await new ControlApi({ host: this.config.host, useHttps: this.config.useHttps })
					.withSubscription(this.onSubscriptionUpdate.bind(this))
					.withLogLevel('error')
					.connectAsync()
			}
		} catch (err) {
			if (err instanceof Error) {
				this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
				return
			}

			// parse as `ResponseAuthError` from control-api package
			const parserResult = z
				.object({
					error: z.object({
						code: z.number(),
						message: z.string(),
					}),
				})
				.safeParse(err)

			if (parserResult.success) {
				const message = parserResult.data.error.message
				this.updateStatus(InstanceStatus.ConnectionFailure, message)
				return
			}

			// parse as websocket Event error
			const parserResult2 = z
				.object({
					type: z.string(),
				})
				.safeParse(err)

			if (parserResult2.success) {
				const message = parserResult2.data.type
				this.updateStatus(InstanceStatus.ConnectionFailure, message)
				return
			}

			this.updateStatus(InstanceStatus.ConnectionFailure, 'unknow error')
			return
		}

		const ch = await fetchChannel(this)

		const channelOnOffConfig = channelOnOff.init(this, ch)
		const faderLevelConfig = faderLevel.init(this, ch)
		const faderPflConfig = faderPfl.init(this, ch)
		const selectorConfig = await selector.init(this)
		const snapshotConfig = await snapshot.init(this, ch)
		const logicsConfig = await logics.init(this)
		const genericActionConfig = genericAction.init(this)

		this.setVariableDefinitions([
			...channelOnOffConfig.variables,
			...faderPflConfig.variables,
			...selectorConfig.variables,
			...logicsConfig.variables,
			...genericActionConfig.variables,
		])

		this.setFeedbackDefinitions({
			...channelOnOffConfig.feedback,
			...faderPflConfig.feedback,
			...selectorConfig.feedback,
			...logicsConfig.feedback,
		})
		this.setActionDefinitions({
			...channelOnOffConfig.actions,
			...faderLevelConfig.actions,
			...faderPflConfig.actions,
			...selectorConfig.actions,
			...snapshotConfig.actions,
			...logicsConfig.actions,
			...genericActionConfig.actions,
		})

		this.setPresetDefinitions({
			...channelOnOffConfig.presets,
			...faderLevelConfig.presets,
			...faderPflConfig.presets,
			...selectorConfig.presets,
			...snapshotConfig.presets,
			...logicsConfig.presets,
		})

		this.updateStatus(InstanceStatus.Ok)
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
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		await this.init(config)
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return genConfigFields()
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
