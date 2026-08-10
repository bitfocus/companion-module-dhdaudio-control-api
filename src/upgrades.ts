import type { CompanionMigrationAction, CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ModuleConfig } from './config.js'

/**
 * 1.3.0 added the `faderId` option to the `snapshot` action. It is used as the
 * `fader` RPC parameter when a Channel snapshot is loaded, and is `undefined`
 * on every action that was created before 1.3.0.
 *
 * Fall back to fader `0`: the action definition defaults to the first fader of
 * the mixer, and before 1.3.0 the mixer ID was sent as `fader`, so for the
 * common single-mixer setup (mixer `0`) this keeps the previous behaviour.
 */
const DEFAULT_FADER_ID = '0'

const addSnapshotFaderId: CompanionStaticUpgradeScript<ModuleConfig> = (_context, props) => {
	const updatedActions: CompanionMigrationAction[] = []

	for (const action of props.actions) {
		if (action.actionId !== 'snapshot') {
			continue
		}

		if (action.options.faderId !== undefined && action.options.faderId !== null) {
			continue
		}

		action.options.faderId = DEFAULT_FADER_ID
		updatedActions.push(action)
	}

	return {
		updatedConfig: null,
		updatedActions,
		updatedFeedbacks: [],
	}
}

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = [
	/*
	 * Place your upgrade scripts here
	 * Remember that once it has been added it cannot be removed!
	 */
	addSnapshotFaderId,
]
