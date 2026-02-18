# Common Tasks

## Adding a New Component

1. Create `src/components/new-component.ts`
2. Export `init()` and optionally `onSubscriptionUpdate()`
3. Import and wire up in `src/main.ts`

## Adding Control API Helpers

1. Create typed schemas in `src/control-api/`
2. Use Zod for response parsing
3. Return typed Promises from fetch functions

## Debugging

- Use `self.log('debug', message)` for debug output
- Check Companion logs for module output
- Use `yarn dev` for watch mode
