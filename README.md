# Cucumber JS Test Runner

This extension adds support for Cucumber JS tests running using VS Code testing tools.

> [!NOTE]
> This repository is a fork of the excellent [vscode-cucumber-js-runner](https://github.com/mandziak-nv/vscode-cucumber-js-runner) extension by [@mandziak-nv](https://github.com/mandziak-nv) with the following additions:
>
> - Added support for `Examples:` tables in Scenario Outlines when displaying test names in the testing panel.
> - Support for defining specific environment variables when debugging tests.
> - Support for defining the working directory for the `cucumber-js` command.

## Tests

It looks for tests in `.feature` files:

```feature
Feature: Greeting

  Scenario: Say hello
    When the greeter says hello
    Then I should have heard "hello"
```

## Debugging

The extension supports debugging tests through the VS Code testing panel. When you click the debug button for a test, it will run with environment variables defined in `cucumber_runner.debug_env_variables`. This allows you for example to use Playwright Inspector for debugging ( `PWDEBUG=1` ) to step through your test execution or inspect your browser state.

Simply click the debug icon (instead of the run icon) next to any test in the VS Code testing panel.

## Extension Settings

The `cucumber_runner.features` setting defines where the extension should look for `.feature` files.

Example:

```json
{
  "cucumber_runner.features": [
    "features/**/*.feature"
  ]
}
```

The `cucumber_runner.env_variables` setting defines environment variables that will be passed to the `cucumber-js` command.

Example:

```json
{
  "cucumber_runner.env_variables": {
    "BROWSER": "chromium",
    "DEVICE": "desktop"
  }
}
```

The `cucumber_runner.debug_env_variables` setting defines environment variables that will be passed to the `cucumber-js` command when debugging tests.

Example:

```json
{
  "cucumber_runner.debug_env_variables": {
    "PWDEBUG": "1"
  }
}
```

The `cucumber_runner.cli_options` setting defines options that will be passed to the `cucumber-js` command.

Example:

```json
{
  "cucumber_runner.cli_options": [
    "--profile",
    "parallel",
    "--tags",
    "@auto"
  ]
}
```

The `cucumber_runner.cucumber_path` setting defines the path to the `cucumber-js` command.

Example:

```json
{
  "cucumber_runner.cucumber_path": "./node_modules/.bin/cucumber-js"
}
```

The `cucumber_runner.cwd` setting defines the working directory for the `cucumber-js` command.

Example:

```json
{
  "cucumber_runner.cwd": "${workspaceFolder}/tests"
}
```

### Node debugger

Debug Tests pauses Node before Cucumber starts and attaches VS Code before
continuing, so breakpoints in early support code can be hit. The default inspector
uses an available loopback port. Existing `NODE_OPTIONS` (for example, TypeScript
loaders) are preserved. To select a port:

```json
{
  "cucumber_runner.debug_env_variables": {
    "NODE_OPTIONS": "--inspect-brk=9230"
  }
}
```

An existing `--inspect` option is upgraded to `--inspect-brk` during debugging.
Attachment uses the address and port reported by Node, including port `0`.
Debug runs execute serially (`--parallel 0`) so the selected process owns the
breakpoints. Normal runs retain the configured parallelism. Cancelling a test or
stopping its debugger terminates that run and removes its temporary files.

### Debug timeout

`cucumber_runner.debug_timeout` changes the default step/hook timeout for debug
runs only. Set it to a positive integer in milliseconds, `-1` to disable the
default timeout, or `null` (the default) to leave project settings unchanged.
Explicit timeouts on individual steps/hooks still apply. A later call to
`setDefaultTimeout()` in imported support code can also override this value.

When using this setting, **configure support-code paths explicitly** in your
Cucumber configuration or `cucumber_runner.cli_options`. The temporary timeout
helper uses Cucumber's `--require`, which replaces automatic support-code
discovery when no explicit paths were provided. For a CommonJS project:

```json
{
  "cucumber_runner.debug_timeout": -1,
  "cucumber_runner.cli_options": ["--require", "features/**/*.js"]
}
```

For an ESM project, use the appropriate `--import` paths instead. Keep existing
TypeScript loaders and support paths. The helper resolves the Cucumber package
from the configured CLI, including hoisted installations. It changes no project
files and is removed when its process exits. Disabling the default timeout does
not disable browser or assertion-library timeouts; use Cancel to end a stuck run.

## Development checks

```sh
npm ci
npm test
```

The tests cover output chunk boundaries and duration units, scenario states,
example-row identities, debugger attachment failures and cancellation, and
per-process timeout cleanup. To run the real CLI smoke tests against a separately
installed Cucumber version:

```sh
CUCUMBER_PACKAGE=/absolute/path/to/node_modules/@cucumber/cucumber \
  node --test test/cucumber.integration.cjs
```

CLI smoke tests passed with Cucumber 7.3.2, 10.9.0, and 13.2.1 on Node 24.19.0.
These results cover the fixtures above, not every project configuration or all
versions between them.

The automated checks do not replace an Extension Development Host check: verify
an early JavaScript/TypeScript breakpoint, pause longer than five seconds with
`debug_timeout: -1`, and check Cancel and Stop Debugging. Windows and Remote/WSL
attachment also need manual validation before release. Compatibility claims
should name the tested Cucumber and Node versions rather than all future releases.
