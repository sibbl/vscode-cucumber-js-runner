export interface CucumberOutput {
    stdout: string[];
    stderr: string[];
    exitCode: number | null;
    signal?: NodeJS.Signals | null;
    error?: string;
}

export interface CucumberResult {
    status: 'passed' | 'failed' | 'skipped' | 'errored';
    message?: string;
    duration?: number;
}

export function parseResults(output: CucumberOutput): CucumberResult {
    // Stream chunks are not lines; inserting separators corrupts split tokens.
    const text = output.stdout.join('')
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '');
    const timing = text.match(/^\s*(\d+)m\s*(\d+(?:\.\d+)?)s\s*\(/m);
    const duration = timing ? (Number(timing[1]) * 60 + Number(timing[2])) * 1000 : undefined;
    const error = (message: string): CucumberResult => ({ status: 'errored', message, duration });
    if (output.error) { return error(output.error); }
    if (output.signal) { return error(`Cucumber terminated by ${output.signal}`); }
    const failure = text.match(/^Failures:\s*\r?\n([\s\S]*)/m);
    if (failure) { return { status: 'failed', message: failure[1].trim(), duration }; }

    const summaries = [...text.matchAll(/^\s*(\d+) scenarios?(?:\s*\(([^)]+)\)|:\s*([^\r\n]+))?\s*$/gm)];
    const summary = summaries[summaries.length - 1];
    if (!summary) {
        return error(output.stderr.join('').trim() || `No Cucumber scenario summary found (exit code ${output.exitCode}). Check the configured formatter and test output.`);
    }
    const total = Number(summary[1]);
    if (total === 0) { return error('No matching scenario found — check line number, tags or scenario name filter'); }
    const counts = summary[2] ?? summary[3] ?? '';
    const count = (status: string) => Number(counts.match(new RegExp(`(\\d+) ${status}\\b`))?.[1] ?? 0);
    const failed = count('failed') + count('ambiguous') + count('undefined') + count('pending');
    if (failed > 0) {
        return { status: 'failed', message: `${total} scenarios: ${counts}`, duration };
    }
    if (output.exitCode !== 0) {
        return error(output.stderr.join('').trim() || `Cucumber exited with code ${output.exitCode} despite its scenario summary. Check the test output.`);
    }
    if (count('passed') === total) { return { status: 'passed', duration }; }
    if (count('passed') + count('skipped') === total) { return { status: 'skipped', duration }; }
    return error(`Unrecognized Cucumber scenario summary: ${summary[0].trim()}`);
}
