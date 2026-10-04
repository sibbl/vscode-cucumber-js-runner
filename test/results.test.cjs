const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseResults } = require('../out/cucumber/parseResults');
const output = (stdout, extra = {}) => ({ stdout: [stdout], stderr: [], exitCode: 0, ...extra });

test('old and new timing formats are milliseconds', () => {
  assert.equal(parseResults(output('1 scenario (1 passed)\n1m0.125s (executing steps: 1m0.000s)')).duration, 60125);
  assert.equal(parseResults(output('1 scenario (1 passed)\n0m 0.88s (0m 0.71s executing your code)')).duration, 880);
});
test('every possible chunk boundary preserves the result, including ANSI escapes', () => {
  const text = '\x1b[32m1 scenario (1 passed)\x1b[0m\r\n0m 0.88s (0m 0.71s executing your code)\r\n';
  for (let i = 0; i < text.length; i++) {
    assert.deepEqual(parseResults(output('', { stdout: [text.slice(0, i), text.slice(i)] })), { status: 'passed', duration: 880 });
  }
});
test('failures and unsuccessful scenario states have explicit messages', () => {
  for (const state of ['failed', 'undefined', 'pending', 'ambiguous']) {
    const result = parseResults(output(`1 scenario (1 ${state})`, { exitCode: 1 }));
    assert.equal(result.status, 'failed');
    assert.match(result.message, new RegExp(state));
  }
  assert.equal(parseResults(output('Failures:\n1) actual error\n1 scenario (1 failed)')).status, 'failed');
});
test('skipped and zero-scenario runs do not become passed', () => {
  assert.equal(parseResults(output('1 scenario (1 skipped)')).status, 'skipped');
  assert.equal(parseResults(output('2 scenarios (1 passed, 1 skipped)')).status, 'skipped');
  assert.match(parseResults(output('0 scenarios\r\n0 steps\r\n')).message, /No matching scenario/);
});
test('process errors and nonzero exits cannot be masked by a passing summary', () => {
  assert.equal(parseResults(output('1 scenario (1 passed)', { exitCode: 1 })).status, 'errored');
  assert.equal(parseResults(output('1 scenario (1 passed)', { signal: 'SIGTERM' })).status, 'errored');
  assert.equal(parseResults(output('', { stderr: ['Cannot load config'], exitCode: 1 })).message, 'Cannot load config');
});
test('legacy colon summaries and final retry summary', () => {
  assert.equal(parseResults(output('1 scenario: 1 passed, 0 failed, 0 skipped')).status, 'passed');
  assert.equal(parseResults(output('1 scenario (1 failed)\n1 scenario (1 passed)')).status, 'passed');
});
