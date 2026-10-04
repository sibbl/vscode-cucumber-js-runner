import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { getExtensionConfiguration } from '../configuration/getExtensionConfiguration';
import TestCase from '../testTree/TestCase';
import { CucumberOutput } from './parseResults';
import { inspectorEndpoint, prepareDebugOptions } from './debugOptions';
import { createDebugTimeout } from './debugTimeout';
import { scenarioTarget } from './scenarioTarget';

export class CucumberRunner {
    private static activeRun: { owner: vscode.TestRun; stop: (signal?: NodeJS.Signals | number) => boolean } | undefined;

    public static async runTest(testRun: vscode.TestRun, testCase: TestCase, debug = false): Promise<CucumberOutput> {
        this.killCucumberProcess();
        const { featurePaths, env, cliOptions, cucumberPath, cwd, debugEnv, debugTimeout } = getExtensionConfiguration();
        let timeoutFile: ReturnType<typeof createDebugTimeout> | undefined;
        const output: CucumberOutput = { stdout: [], stderr: [], exitCode: null };
        const processEnv = { ...process.env, ...env, ...(debug ? debugEnv : {}) };
        const args: string[] = [];
        if (debug) {
            const options = prepareDebugOptions(processEnv.NODE_OPTIONS);
            processEnv.NODE_OPTIONS = options.nodeOptions;
            args.push(...options.nodeArguments);
        }
        args.push(cucumberPath);
        if (testCase.featureFilePath && testCase.exampleLineNumber !== undefined) {
            args.push(scenarioTarget(cwd, testCase.featureFilePath, testCase.exampleLineNumber));
        } else {
            const name = testCase.name.replace(/([.+*?^$()[\]{}|\\])/g, '\\$1').replace(/<[^>]*>/g, '.*');
            args.push(...featurePaths, '--name', `^${name}$`);
        }
        args.push(...cliOptions);
        // One debugger owns one Cucumber process. Worker processes would inherit
        // user inspector flags and run support code outside this debug session.
        if (debug) { args.push('--parallel', '0'); }
        let child: ChildProcessWithoutNullStreams;
        try {
            if (debug && debugTimeout !== null) {
                timeoutFile = createDebugTimeout(cwd, cucumberPath, debugTimeout);
                args.push('--require', timeoutFile.file);
            }
            this.log(testRun, `Executing command: node ${args.map(arg => JSON.stringify(arg)).join(' ')}\n\n`);
            child = spawn('node', args, { cwd, env: processEnv });
        } catch (error) {
            timeoutFile?.dispose();
            return { ...output, error: `Could not start Cucumber: ${String(error)}` };
        }

        return new Promise(resolve => {
            let closed = false;
            let stopping = false;
            let attaching = false;
            let attachPending = false;
            let exiting = false;
            let session: vscode.DebugSession | undefined;
            let attachTimer: ReturnType<typeof setTimeout> | undefined;
            let killTimer: ReturnType<typeof setTimeout> | undefined;
            let startListener: vscode.Disposable | undefined;
            let terminateListener: vscode.Disposable | undefined;
            const runId = randomUUID();
            const stopSession = (target: vscode.DebugSession) => {
                void Promise.resolve(vscode.debug.stopDebugging(target)).catch(error => {
                    this.log(testRun, `Could not stop Cucumber debugger: ${String(error)}\n`);
                });
            };
            const stop = (signal?: NodeJS.Signals | number): boolean => {
                if (closed || stopping) { return true; }
                stopping = true;
                clearTimeout(attachTimer);
                if (session) { stopSession(session); }
                const killed = child.kill(signal);
                // Cancellation must also work while the process is paused or
                // user code has installed a SIGTERM handler.
                killTimer = setTimeout(() => { if (!closed) { child.kill('SIGKILL'); } }, 2000);
                killTimer.unref();
                return killed;
            };
            const activeRun = { owner: testRun, stop };
            this.activeRun = activeRun;
            const finish = () => {
                if (closed) { return; }
                closed = true;
                clearTimeout(attachTimer);
                clearTimeout(killTimer);
                if (session) { stopSession(session); }
                terminateListener?.dispose();
                // An attachment already in flight may still create a session.
                // Keep its listener until startDebugging settles, and stop only it.
                if (!attachPending) { startListener?.dispose(); }
                try { timeoutFile?.dispose(); } catch (error) {
                    this.log(testRun, `Could not remove debug timeout file: ${String(error)}\n`);
                }
                if (this.activeRun === activeRun) { this.activeRun = undefined; }
                resolve(output);
            };
            const attachFailed = (error: unknown) => {
                if (closed || stopping) { return; }
                output.error = `Could not attach Cucumber debugger: ${String(error)}`;
                this.log(testRun, `${output.error}\n`);
                stop();
            };
            if (debug) {
                startListener = vscode.debug.onDidStartDebugSession(candidate => {
                    if (candidate.configuration.cucumberRunId !== runId) { return; }
                    session = candidate;
                    if (closed || stopping) { stopSession(candidate); }
                });
                terminateListener = vscode.debug.onDidTerminateDebugSession(candidate => {
                    if (candidate.configuration.cucumberRunId === runId && !closed && !exiting) { stop(); }
                });
                attachTimer = setTimeout(() => attachFailed('Inspector startup/attachment timed out after 10 seconds'), 10000);
            }
            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');
            child.stdout.on('data', (chunk: string) => {
                this.log(testRun, chunk);
                output.stdout.push(chunk);
            });
            child.stderr.on('data', (chunk: string) => {
                this.log(testRun, chunk);
                output.stderr.push(chunk);
                if (!debug || closed || stopping) { return; }
                const stderr = output.stderr.join('');
                // Node waits for the inspector client to disconnect before exit.
                if (/^Waiting for the debugger to disconnect\.\.\./m.test(stderr) && session) {
                    exiting = true;
                    stopSession(session);
                }
                if (attaching) { return; }
                const endpoint = inspectorEndpoint(stderr);
                if (!endpoint) { return; }
                attaching = true;
                attachPending = true;
                void (async () => {
                    try {
                        const attached = await vscode.debug.startDebugging(vscode.workspace.workspaceFolders?.[0], {
                            type: 'node', request: 'attach', name: 'Attach to Cucumber',
                            ...endpoint, continueOnAttach: true,
                            skipFiles: ['<node_internals>/**', '**/node_modules/**'],
                            sourceMaps: true, cucumberRunId: runId,
                        });
                        if (!attached) { attachFailed('VS Code declined to start the debug session'); }
                        else { clearTimeout(attachTimer); }
                    } catch (error) { attachFailed(error); }
                    finally {
                        attachPending = false;
                        if (closed) { startListener?.dispose(); }
                        if ((closed || stopping) && session) { stopSession(session); }
                    }
                })();
            });
            child.on('error', error => {
                output.error = `Could not run Cucumber: ${error.message}`;
                finish();
            });
            child.on('close', (code, signal) => {
                output.exitCode = code;
                output.signal = signal;
                finish();
            });
        });
    }

    public static killCucumberProcess(signal?: NodeJS.Signals | number, owner?: vscode.TestRun): boolean {
        if (this.activeRun && (!owner || this.activeRun.owner === owner)) {
            return this.activeRun.stop(signal);
        }
        return true;
    }

    public static log(testRun: vscode.TestRun, message: string): void {
        testRun.appendOutput(message.replace(/\r?\n/g, '\r\n'));
    }
}
