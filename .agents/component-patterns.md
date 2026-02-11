# Component Patterns

Each component in `src/components/` exports:

## Required: `init()`

Returns actions, feedbacks, variables, and/or presets:

```typescript
export function init(self: ModuleInstance): {
	variables: ReadonlyArray<CompanionVariableDefinition>
	actions: CompanionActionDefinitions
} {
	// ...
	return { variables, actions }
}
```

## Optional: `onSubscriptionUpdate()`

Handles websocket updates from DHD Control API:

```typescript
export function onSubscriptionUpdate(self: ModuleInstance, { payload }: ResponseSubscriptionUpdate): void {
	// Handle updates
}
```

Wire new components in `src/main.ts`.
