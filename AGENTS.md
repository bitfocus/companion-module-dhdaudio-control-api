# AGENTS.md

Bitfocus Companion module for DHD audio mixing consoles via Control API.

## Quick Reference

- **Package manager:** Yarn 4 (`yarn install`)
- **Build:** `yarn build` (clean) or `yarn dev` (watch)
- **Lint:** `yarn lint` (check) or `yarn lint:raw --fix .` (fix)
- **No test runner.** If adding tests, use Vitest.

## Pre-commit Hooks

Husky + lint-staged runs Prettier and ESLint on commit automatically.

## Project Structure

```
src/
├── main.ts              # Entry point, ModuleInstance class
├── config.ts            # Module configuration
├── components/          # Actions, feedbacks, variables, presets
└── control-api/         # Typed wrappers for DHD Control API
```

## Detailed Guides

- [TypeScript conventions](.agents/typescript.md)
- [Component patterns](.agents/component-patterns.md)
- [Common tasks](.agents/common-tasks.md)
