// Run against an independently installed Cucumber, without adding it to the extension.
// CUCUMBER_PACKAGE=/path/to/node_modules/@cucumber/cucumber node --test test/cucumber.integration.cjs
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createDebugTimeout } = require('../out/cucumber/debugTimeout');
const { parseResults } = require('../out/cucumber/parseResults');
const { scenarioTarget } = require('../out/cucumber/scenarioTarget');
const pkg = process.env.CUCUMBER_PACKAGE;
if (!pkg) throw Error('Set CUCUMBER_PACKAGE to the installed @cucumber/cucumber directory');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cucumber-integration-'));
fs.mkdirSync(path.join(root, 'node_modules/@cucumber'), { recursive: true });
fs.symlinkSync(pkg, path.join(root, 'node_modules/@cucumber/cucumber'), 'junction');
const feature = path.join(root, 'examples.feature');
const steps = path.join(root, 'steps.cjs');
const cli = path.join(pkg, 'bin/cucumber-js');
fs.writeFileSync(feature, 'Feature: examples\n  Scenario Outline: Same name\n    Given a value <value>\n    Examples: first\n      | value |\n      | 1 |\n      | 2 |\n    Examples: second\n      | value |\n      | 3 |\n');
fs.writeFileSync(steps, `const { Given } = require(${JSON.stringify(pkg)});\nGiven('a value {int}', async function(value) { console.log('ROW=' + value); await new Promise(r => setTimeout(r, 20)); });\n`);
after(() => fs.rmSync(root, { recursive: true, force: true }));
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 15000, env: { ...process.env, CUCUMBER_PUBLISH_QUIET: 'true', FORCE_COLOR: '0' } });
  assert.equal(result.error, undefined);
  return { raw: result, parsed: parseResults({ stdout: [result.stdout], stderr: [result.stderr], exitCode: result.status, signal: result.signal }) };
}
test('real Cucumber selects exactly one row from either Examples block', () => {
  for (const [line, value] of [[6, 1], [7, 2], [10, 3]]) {
    const { raw, parsed } = run([scenarioTarget(root, feature, line), '--require', steps]);
    assert.equal(parsed.status, 'passed', raw.stderr + raw.stdout);
    assert.deepEqual([...raw.stdout.matchAll(/ROW=(\d+)/g)].map(match => Number(match[1])), [value]);
  }
});
test('timeout helper applies only when included, accepts -1, and cleans up', () => {
  const helper = createDebugTimeout(root, cli, 1);
  try {
    assert.equal(run([scenarioTarget(root, feature, 6), '--require', steps, '--require', helper.file]).parsed.status, 'failed');
    assert.equal(run([scenarioTarget(root, feature, 6), '--require', steps]).parsed.status, 'passed');
  } finally { helper.dispose(); }
  const disabled = createDebugTimeout(root, cli, -1);
  try {
    const { raw, parsed } = run([scenarioTarget(root, feature, 6), '--require', steps, '--require', disabled.file]);
    assert.equal(parsed.status, 'passed', raw.stderr + raw.stdout);
  } finally { disabled.dispose(); }
  assert.equal(fs.existsSync(helper.file), false);
  assert.equal(fs.existsSync(disabled.file), false);
});
test('invalid timeout values are rejected before writing a file', () => {
  for (const value of [0, -2, 0.5, NaN, Infinity]) assert.throws(() => createDebugTimeout(root, cli, value), /positive integer/);
});

test('an explicit step timeout is not disabled by the default timeout helper', () => {
  const custom = path.join(root, 'explicit.cjs');
  fs.writeFileSync(custom, `const { Given } = require(${JSON.stringify(pkg)}); Given('a value {int}', { timeout: 1 }, async function () { await new Promise(r => setTimeout(r, 20)); });`);
  const helper = createDebugTimeout(root, cli, -1);
  try {
    assert.equal(run([scenarioTarget(root, feature, 6), '--require', custom, '--require', helper.file]).parsed.status, 'failed');
  } finally { helper.dispose(); }
});
