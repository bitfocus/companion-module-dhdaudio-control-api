# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added live AGain and pot value companion variables, feedback subscriptions, and subscription-update handlers so current rotary values stay synchronized in real time.
- Updated AGain and pot rotary presets to include the current value in button text via internal variable tokens.
- Added a `Debug logging` settings checkbox that sets Control API log level to `debug` when enabled and `error` when disabled.

### Fixed

- Selector initialization now gracefully handles devices that do not expose `/audio/selectors` (Control API error `1203 invalid path`) by disabling selector features instead of failing module setup.
- Selector endpoint request errors now resolve/reject correctly, and unexpected init failures now set an explicit module error status instead of leaving the module stuck in `Connecting`.
- Selector fetch parsing now accepts partial `/audio/selectors` payloads and defaults missing `selectors`/`sourcelists` to empty maps, so selector setup no longer fails when devices omit those fields.

## [1.1.0] - 2026-02-19

### Added

- Added dedicated rotary actions and presets for fader gain trim (`/audio/mixers/{mixerID}/faders/{faderID}/params/gain/again/`) and pot values (`/audio/pots/{potID}/value`).

### Changed

- Pot support now only includes entries that provide `value`, `_min`, and `_max`, and pot rotary adjustments are clamped to each pot's configured minimum/maximum range.
- Fader AGain rotary actions/presets now only appear for faders advertising `_hasagain`, and AGain adjustments now use the API-provided `again_step` increment via the `again/inc` path instead of writing absolute values.

### Fixed

- Generic actions now keep variable-to-path mappings per subscription, update all related feedback states on subscription events, and support key-press toggling for boolean paths (from [#3](https://github.com/bitfocus/companion-module-dhdaudio-control-api/pull/3)).
- Module initialization now returns immediately so Companion settings stay editable while a single background connect/setup attempt runs per init/config change, stale attempts cannot override status/definitions, and missing hosts surface the BadConfig "Host not set" status instead of blocking the UI.

## [1.0.3] - 2026-02-11

### Fixed

- Companion buttons now correctly reflect logic state changes on feedbacks (fix for [#10](https://github.com/bitfocus/companion-module-dhdaudio-control-api/issues/10)).
- Prevented an error when no fader channel is configured by skipping channel and fader definition setup until channel data is available (fix for [#9](https://github.com/bitfocus/companion-module-dhdaudio-control-api/issues/9)).
- Relaxed API token validation to accept the alphanumeric-and-dash format used by DHD Control API tokens.
- Added feedback subscriptions and initial state fetches for channel on/off, PFL, and selector routing so button states stay accurate immediately and during runtime updates.

### Changed

- Updated module tooling and dependencies, including `@companion-module/base` and `@companion-module/tools`.

## [1.0.2] - 2025-10-16

### Changed

- Bumped the package and Companion manifest to 1.0.2.
- Updated `yarn.lock` so the workspace entry matches the renamed `dhdaudio-control-api` package.

## [1.0.1] - 2025-10-16

### Added

- Expanded the in-module help text with configuration guidance, supported actions, feedbacks, variables, presets, and Companion version support details.
- Added a Companion Module Checks GitHub Actions workflow for automated module validation.

### Changed

- Updated manifest and package metadata (name, description, repository/bugs links, maintainer contact) and released version 1.0.1.

## [1.0.0] - 2025-09-12

### Added

- Initial release of the DHD audio Control API module for Bitfocus Companion.
- Connection support for DHD Series 52 IP Core and AES67 devices via Control API.
- Actions for channel on/off, fader level, channel PFL, selector control, snapshots, logics, and generic tree-path actions.
- Feedbacks and variables for channel state, PFL state, selector state, and logic state.
- Dynamically generated presets for faster setup in Companion.
