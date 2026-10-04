const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
let config, children, starts, stops, startDebugging, root;
const events = new EventEmitter();
const subscribe = name => callback => { events.on(name, callback); return { dispose: () => events.off(name, callback) }; };
const vscode = {
  workspace: { workspaceFolders: [{ uri: { fsPath: '/project' } }], getConfiguration: () => ({ get: key => config[key] }) },
  debug: {
    onDidStartDebugSession: subscribe('start'), onDidTerminateDebugSession: subscribe('end'),
    startDebugging: async (_folder, configuration) => { starts.push(configuration); return startDebugging(configuration); },
    stopDebugging: async session => { stops.push(session); events.emit('end', session); },
  },
};
const originalLoad = Module._load;
Module._load = function(id, ...rest) {
  if (id === 'vscode') return vscode;
  if (id === 'child_process') return { spawn: (command, args, options) => {
    const child = new EventEmitter();
    Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), command, args, options, kills: [] });
    child.kill = signal => { child.kills.push(signal || 'SIGTERM'); return true; };
    children.push(child);
    return child;
  } };
  return originalLoad.call(this, id, ...rest);
};
const { CucumberRunner } = require('../out/cucumber/CucumberRunner');
Module._load = originalLoad;
const tick = () => new Promise(resolve => setImmediate(resolve));
const run = () => ({ appendOutput() {} });
const testCase = { name: 'Example (x: 1)', featureFilePath: '/project/features/a file.feature', exampleLineNumber: 9 };
function ready(child, port = 34567) { child.stderr.write(`Debugger listening on ws://127.0.0.1:${port}/uuid\n`); }

beforeEach(() => {
  config = { cwd: '/project', features: ['features/**/*.feature'], env_variables: {}, cli_options: [], cucumber_path: 'cucumber.js', debug_env_variables: {}, debug_timeout: null };
  children = []; starts = []; stops = [];
  startDebugging = async configuration => { events.emit('start', { configuration }); return true; };
});
afterEach(() => {
  for (const child of children) child.emit('close', 0, null);
  if (root) { fs.rmSync(root, { recursive: true, force: true }); root = undefined; }
  assert.equal(events.listenerCount('start'), 0);
  assert.equal(events.listenerCount('end'), 0);
});
test('attach waits for the full inspector URL, preserves env and auto-continues', async () => {
  config.env_variables.NODE_OPTIONS = '--trace-warnings';
  const promise = CucumberRunner.runTest(run(), testCase, true);
  const child = children[0];
  assert.equal(child.options.env.NODE_OPTIONS, '--trace-warnings');
  assert.equal(child.args[0], '--inspect-brk=127.0.0.1:0');
  assert.ok(child.args.includes('features/a file.feature:9'));
  assert.ok(!child.args.includes('--name'));
  assert.equal(starts.length, 0);
  child.stderr.write('Debugger listening on ws://127.0.0.1:34');
  assert.equal(starts.length, 0);
  child.stderr.write('567/uuid\n');
  await tick();
  assert.equal(starts[0].port, 34567);
  assert.equal(starts[0].continueOnAttach, true);
  child.stdout.write(Buffer.from([0xc3])); child.stdout.write(Buffer.from([0xa4]));
  child.emit('close', 0, null);
  assert.equal((await promise).stdout.join(''), 'ä');
});
test('false attachment and rejected attachment stop the paused process', async () => {
  for (const impl of [async () => false, async () => { throw Error('adapter error'); }]) {
    startDebugging = impl;
    const promise = CucumberRunner.runTest(run(), testCase, true);
    const child = children.at(-1);
    ready(child); await tick();
    assert.deepEqual(child.kills, ['SIGTERM']);
    child.emit('close', null, 'SIGTERM');
    assert.match((await promise).error, /Could not attach/);
  }
});
test('cancellation before readiness does not attach; unrelated owners cannot cancel', async () => {
  const owner = run();
  const promise = CucumberRunner.runTest(owner, testCase, true);
  const child = children[0];
  CucumberRunner.killCucumberProcess(undefined, run());
  assert.equal(child.kills.length, 0);
  CucumberRunner.killCucumberProcess(undefined, owner);
  ready(child); await tick();
  assert.equal(starts.length, 0);
  child.emit('close', null, 'SIGTERM'); await promise;
});
test('a late debug session is stopped after cancellation without touching other sessions', async () => {
  let complete;
  startDebugging = configuration => new Promise(resolve => { complete = () => { events.emit('start', { configuration }); resolve(true); }; });
  const owner = run();
  const promise = CucumberRunner.runTest(owner, testCase, true);
  const child = children[0]; ready(child);
  CucumberRunner.killCucumberProcess(undefined, owner);
  child.emit('close', null, 'SIGTERM'); await promise;
  events.emit('start', { configuration: { cucumberRunId: 'unrelated' } });
  complete(); await tick();
  assert.ok(stops.length > 0);
  assert.ok(stops.every(session => session.configuration.cucumberRunId === starts[0].cucumberRunId));
});
test('normal inspector disconnection does not kill a successful test', async () => {
  const promise = CucumberRunner.runTest(run(), testCase, true);
  const child = children[0]; ready(child); await tick();
  child.stderr.write('Waiting for the debugger to disconnect...\n');
  await tick();
  assert.deepEqual(child.kills, []);
  child.emit('close', 0, null);
  assert.equal((await promise).exitCode, 0);
});
test('spawn errors settle and remove listeners', async () => {
  const promise = CucumberRunner.runTest(run(), testCase, true);
  children[0].emit('error', Error('ENOENT'));
  assert.match((await promise).error, /ENOENT/);
});
test('normal runs do not inject inspector flags, timeout files or serial execution', async () => {
  config.debug_timeout = -1;
  config.debug_env_variables = { PWDEBUG: '1' };
  const promise = CucumberRunner.runTest(run(), testCase);
  const child = children[0];
  assert.equal(child.args[0], 'cucumber.js');
  assert.equal(child.options.env.PWDEBUG, undefined);
  assert.ok(!child.args.includes('--require'));
  assert.ok(!child.args.includes('--parallel'));
  child.emit('close', 0, null); await promise;
});
test('timeout files resolve hoisted Cucumber and are owned by each process', async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-test-'));
  const pkg = path.join(root, 'node_modules/@cucumber/cucumber');
  fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@cucumber/cucumber', main: 'index.js' }));
  fs.writeFileSync(path.join(pkg, 'index.js'), ''); fs.writeFileSync(path.join(pkg, 'bin/cucumber.js'), '');
  config.cwd = path.join(root, 'nested');
  config.cucumber_path = '../node_modules/@cucumber/cucumber/bin/cucumber.js'; config.debug_timeout = -1;
  const first = CucumberRunner.runTest(run(), testCase, true);
  const firstChild = children[0]; const firstFile = firstChild.args.at(-1);
  const second = CucumberRunner.runTest(run(), testCase, true);
  const secondChild = children[1]; const secondFile = secondChild.args.at(-1);
  assert.notEqual(firstFile, secondFile);
  firstChild.emit('close', null, 'SIGTERM'); await first;
  assert.equal(fs.existsSync(firstFile), false);
  assert.equal(fs.existsSync(secondFile), true);
  assert.ok(fs.readFileSync(secondFile, 'utf8').includes(path.join(pkg, 'index.js')));
  secondChild.emit('close', 0, null); await second;
  assert.equal(fs.existsSync(secondFile), false);
});
