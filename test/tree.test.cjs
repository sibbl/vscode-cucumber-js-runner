const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
class Position { constructor(line, character) { Object.assign(this, { line, character }); } }
class Range { constructor(start, end) { Object.assign(this, { start, end }); } }
class Items extends Map { add(item) { this.set(item.id, item); } replace(items) { this.clear(); items.forEach(item => this.add(item)); } }
const originalLoad = Module._load;
Module._load = function(id, ...args) { return id === 'vscode' ? { Position, Range } : originalLoad.call(this, id, ...args); };
const TestFile = require('../out/testTree/TestFile').default;
const { testItemDataMap } = require('../out/other');
Module._load = originalLoad;

test('identical example labels remain separate rows; headers reset between Examples blocks', () => {
  const controller = { createTestItem: (id, label, uri) => ({ id, label, uri, children: new Items() }) };
  const uri = { fsPath: '/project/features/examples.feature', toString: () => 'file:///project/features/examples.feature' };
  const item = controller.createTestItem('file', 'file', uri);
  new TestFile().updateFromContents(controller, item, [
    'Feature: examples',
    '  Scenario Outline: Same title',
    '    Given value <a>',
    '    Examples: first',
    '      | a |',
    '      | 1 |',
    '      | 1 |',
    '    Examples: second',
    '      | b |',
    '      | 2 |',
    '  Scenario: Duplicate',
    '    Given value 1',
    '  Scenario: Duplicate',
    '    Given value 1',
  ].join('\n'));
  const feature = [...item.children.values()][0];
  assert.equal(feature.children.size, 3);
  const outline = [...feature.children.values()][0];
  const examples = [...outline.children.values()];
  assert.equal(examples.length, 3);
  assert.equal(examples[0].label, examples[1].label);
  assert.notEqual(examples[0].id, examples[1].id);
  assert.equal(examples[2].label, 'Same title (b: 2)');
  assert.deepEqual(examples.map(example => testItemDataMap.get(example).exampleLineNumber), [6, 7, 10]);
  assert.deepEqual([...feature.children.values()].slice(1).map(scenario => testItemDataMap.get(scenario).exampleLineNumber), [11, 13]);
});
