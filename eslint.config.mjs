import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = generateEslintConfig({
	enableTypescript: true,
})

const customConfig = [
	...baseConfig,
	{
		rules: {
			'@typescript-eslint/ban-ts-comment': [
				'error',
				{
					'ts-expect-error': false,
					'ts-ignore': true,
					'ts-nocheck': true,
					'ts-check': false,
				},
			],
		},
	},
]

export default customConfig
