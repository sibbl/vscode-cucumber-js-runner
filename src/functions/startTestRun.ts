import * as vscode from 'vscode';
import { CucumberRunner } from '../cucumber/CucumberRunner';
import { CucumberOutput, parseResults } from '../cucumber/parseResults';
import TestCase from '../testTree/TestCase';
import TestFile from '../testTree/TestFile';
import { testItemDataMap } from '../other';

export const startTestRun = async (controller: vscode.TestController, request: vscode.TestRunRequest, token: vscode.CancellationToken, debug: boolean = false) => {
    const testRun = controller.createTestRun(request);

    const cancellation = token.onCancellationRequested(() => {
        CucumberRunner.killCucumberProcess(undefined, testRun);
        testRun.appendOutput('Run instance cancelled.\r\n\n');
    });

    try {
        const initialTests = request.include ?? gatherTestItems(controller.items);
        const testQueue = await discoverTests(initialTests);
        await runTestQueue(testQueue);
    } finally {
        cancellation.dispose();
        testRun.end();
    }

    async function discoverTests(testItems: Iterable<vscode.TestItem>): Promise<{ testItem: vscode.TestItem; testCase: TestCase; }[]> {
        const testQueue: { testItem: vscode.TestItem; testCase: TestCase }[] = [];
        for (const testItem of testItems) {
            if (request.exclude?.includes(testItem)) {
                continue;
            }

            const testItemData = testItemDataMap.get(testItem);
            if (testItemData instanceof TestCase) {
                testRun.enqueued(testItem);
                testQueue.push({ testItem: testItem, testCase: testItemData });
            } else {
                if (testItemData instanceof TestFile && !testItemData.didResolve) {
                    await testItemData.updateFromDisk(controller, testItem);
                }
                testQueue.push(...(await discoverTests(gatherTestItems(testItem.children))));
            }
        }
        return testQueue;
    }

    async function runTestQueue(testQueue: { testItem: vscode.TestItem; testCase: TestCase }[]): Promise<void> {
        for (const { testItem, testCase } of testQueue) {
            if (!token.isCancellationRequested) {
                testRun.started(testItem);
                try {
                    const testResults = await runTest(testCase);
                    if (token.isCancellationRequested) { testRun.skipped(testItem); }
                    else { processTestResults(testItem, testResults); }
                } catch (error) {
                    testRun.errored(testItem, new vscode.TestMessage(String(error)));
                }
            } else {
                testRun.skipped(testItem);
            }
        }
    }

    async function runTest(testCase: TestCase): Promise<CucumberOutput> {
        testRun.appendOutput(`Running test: ${testCase.name}\r\n`);
        const cucumberOutput = await CucumberRunner.runTest(testRun, testCase, debug);
        if (!token.isCancellationRequested) {
            testRun.appendOutput('Finished running test!\r\n\n');
        }
        return cucumberOutput;
    }

    function processTestResults(testItem: vscode.TestItem, output: CucumberOutput): void {
        const result = parseResults(output);
        if (result.status === 'passed') { testRun.passed(testItem, result.duration); }
        else if (result.status === 'skipped') { testRun.skipped(testItem); }
        else {
            const message = new vscode.TestMessage(result.message ?? 'Check Cucumber output for details');
            if (testItem.uri && testItem.range) {
                message.location = new vscode.Location(testItem.uri, testItem.range.end);
            }
            if (result.status === 'failed') { testRun.failed(testItem, message, result.duration); }
            else { testRun.errored(testItem, message, result.duration); }
        }
    }

    function gatherTestItems(testItemCollection: vscode.TestItemCollection): vscode.TestItem[] {
        const testItems: vscode.TestItem[] = [];
        testItemCollection.forEach(item => testItems.push(item));
        return testItems;
    }
};
