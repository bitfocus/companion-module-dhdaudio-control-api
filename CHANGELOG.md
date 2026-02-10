# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Prevented an error when no fader channel is configured by skipping channel and fader definition setup until channel data is available (fix for [#9](https://github.com/bitfocus/companion-module-dhdaudio-control-api/issues/9)).
- Relaxed API token validation to accept the alphanumeric-and-dash format used by DHD Control API tokens.

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
