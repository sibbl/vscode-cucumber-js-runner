import * as path from 'path';

export function scenarioTarget(cwd: string, file: string, line: number): string {
    // Cucumber 7 keys its line filter by relative feature URI. An absolute path
    // loads the file but can silently run every example instead of the chosen row.
    const relative = path.relative(cwd, file);
    const target = relative.startsWith('-') ? `.${path.sep}${relative}` : relative;
    return `${target}:${line}`;
}
