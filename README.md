# control-api-companion-module

## User Documentation

See [HELP.md](./companion/HELP.md)

## Getting started

Executing a `yarn` command should perform all necessary steps to develop the module, if it does not then follow the steps below.

The module can be built once with `yarn build`. This should be enough to get the module to be loadable by companion.

While developing the module, by using `yarn dev` the compiler will be run in watch mode to recompile the files on change.

### Local testing

In the Companion app, set the `Developer modules path` to a folder which contains this repo as a sub-folder. After building it via yarn you can start using the module.

## Contributing

We welcome issues and pull requests! Small improvements (docs, typing refinements) are appreciated just as much as new features.

## License

Copyright (c) 2025 DHD audio GmbH. Licensed under the MIT License. See [LICENSE](./LICENSE) for full terms.
