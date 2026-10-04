import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';

export function createDebugTimeout(cwd: string, cucumberPath: string, timeout: number): { file: string; dispose: () => void } {
    if (!Number.isInteger(timeout) || (timeout !== -1 && timeout <= 0)) {
        throw new Error('cucumber_runner.debug_timeout must be null, -1, or a positive integer in milliseconds');
    }
    // Resolve from the actual CLI (including symlinks/hoisted installations), not
    // an assumed cwd/node_modules directory. Never load user code in the extension.
    const cli = fs.realpathSync(path.resolve(cwd, cucumberPath));
    const cucumber = createRequire(cli).resolve('@cucumber/cucumber');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cucumber-debug-timeout-'));
    const file = path.join(directory, 'timeout.cjs');
    const dispose = () => fs.rmSync(directory, { recursive: true, force: true });
    try {
        fs.writeFileSync(file, `const { setDefaultTimeout } = require(${JSON.stringify(cucumber)});\nsetDefaultTimeout(${timeout});\n`, { mode: 0o600 });
    } catch (error) {
        dispose();
        throw error;
    }
    return { file, dispose };
}
