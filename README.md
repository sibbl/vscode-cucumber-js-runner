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
