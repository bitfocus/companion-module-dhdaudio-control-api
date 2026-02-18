# TypeScript Conventions

## Imports

Always include `.js` extension in relative imports (ESM requirement):

```typescript
import { genConfigFields, type ModuleConfig } from './config.js'
```

Use `type` import modifier for type-only imports.

## Naming

- **Action IDs:** snake_case (`generic_action`, `channel_on`) — different from other identifiers

## Zod Patterns

```typescript
// Schema + type inference
const Channel = z.object({
	label: z.string(),
	fader: z.float32(),
	on: z.boolean(),
})
export type ChannelRecord = z.infer<typeof Channel>

// Safe parsing
const result = schema.safeParse(unknownValue)
if (result.success) {
	// use result.data
}
```

## Error Handling

Use Companion's status API for connection errors:

```typescript
try {
	await someAsyncOperation()
} catch (err) {
	if (err instanceof Error) {
		self.updateStatus(InstanceStatus.ConnectionFailure, err.message)
		return
	}
	const result = ErrorSchema.safeParse(err)
	if (result.success) {
		self.updateStatus(InstanceStatus.ConnectionFailure, result.data.error.message)
		return
	}
	self.updateStatus(InstanceStatus.ConnectionFailure, 'unknown error')
}
```
