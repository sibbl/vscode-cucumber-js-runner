const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepareDebugOptions, inspectorEndpoint } = require('../out/cucumber/debugOptions');

test('defaults use an OS-assigned local port without overwriting Node options', () => {
  const options = '--require "path with spaces/register.cjs" --max-old-space-size=4096';
  assert.deepEqual(prepareDebugOptions(options), { nodeOptions: options, nodeArguments: ['--inspect-brk=127.0.0.1:0'] });
});
test('custom inspector flags keep addresses and ports while pausing at startup', () => {
  for (const suffix of ['', '=9230', '=127.0.0.1:9230', '=[::1]:9230', '=0']) {
    for (const flag of ['--inspect', '--inspect-brk', '--inspect-wait']) {
      assert.deepEqual(prepareDebugOptions(`--trace-warnings ${flag}${suffix}`), {
        nodeOptions: `--trace-warnings --inspect-brk${suffix}`, nodeArguments: [],
      });
    }
  }
  assert.equal(prepareDebugOptions('"--inspect=9230"').nodeOptions, '"--inspect-brk=9230"');
  assert.deepEqual(prepareDebugOptions('--inspect-port=9231').nodeArguments, ['--inspect-brk']);
});
test('attachment uses the actual reported endpoint including custom and dynamic ports', () => {
  for (const port of [9230, 39721]) {
    assert.deepEqual(inspectorEndpoint(`Debugger listening on ws://127.0.0.1:${port}/abc\nFor help\n`), { address: '127.0.0.1', port });
  }
  assert.deepEqual(inspectorEndpoint('Debugger listening on ws://[::1]:9231/abc\r\n'), { address: '::1', port: 9231 });
  assert.equal(inspectorEndpoint('other log output'), undefined);
});
