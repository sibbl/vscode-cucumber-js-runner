/** Keep user loaders/memory flags, but pause before any support code executes. */
export function prepareDebugOptions(nodeOptions = ''): { nodeOptions: string; nodeArguments: string[] } {
    const inspect = /(^|\s)("?)--inspect(?:-brk|-wait)?(?==|"?(?:\s|$))/g;
    let hasInspector = false;
    const options = nodeOptions.replace(inspect, (_match, prefix: string, quote: string) => {
        hasInspector = true;
        return `${prefix}${quote}--inspect-brk`;
    });
    // Put our default on the command line so child Node processes don't inherit it.
    // Node assigns a free port; attachment uses the endpoint reported on stderr.
    const hasPort = /(^|\s)"?--inspect-port(?:=|\s)/.test(options);
    return { nodeOptions: options, nodeArguments: hasInspector ? [] : [hasPort ? '--inspect-brk' : '--inspect-brk=127.0.0.1:0'] };
}

export function inspectorEndpoint(stderr: string): { address: string; port: number } | undefined {
    // Wait for the newline: stderr may split inside the URL or port number.
    const match = stderr.match(/^Debugger listening on (ws:\/\/[^\r\n]+)\r?\n/m);
    if (!match) { return undefined; }
    const url = new URL(match[1]);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    return { address: host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host, port: Number(url.port) };
}
