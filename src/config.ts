import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	host: string
	useHttps: boolean
	token: string
	genericActionsNum: string
}

export function genConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Control API Host (IP or Domain)',
			width: 10,
			required: true,
		},
		{
			type: 'checkbox',
			id: 'useHttps',
			label: 'HTTPS',
			default: false,
			width: 2,
		},
		{
			type: 'textinput',
			id: 'token',
			label: 'API Token',
			width: 12,
			regex: Regex.SOMETHING,
		},
		{
			type: 'textinput',
			id: 'genericActionsNum',
			label: 'Number of Generic Variables',
			required: true,
			default: '10',
			width: 12,
			regex: Regex.NUMBER,
		},
	]
}
