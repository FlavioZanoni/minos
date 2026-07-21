import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, evaluateAll } from '../dist/evaluate.js';

function merged(rules) {
  return {
    rules: rules.map((r) => ({ ...r, source: 'global', configDir: '/tmp' })),
    disabled: [],
    tooling: {},
    judge: {},
    globalPath: '/tmp/rules.jsonc',
    projectPath: '/tmp/.minos/rules.jsonc',
  };
}

test('contains trigger matches case-insensitively', async () => {
  const m = merged([
    {
      id: 'no-foo',
      appliesTo: {},
      trigger: { type: 'contains', patterns: ['FOO'] },
      action: 'block',
      message: 'no foo allowed',
    },
  ]);
  const decision = await evaluate(
    { event: 'command', tool: 'Bash', command: 'echo foo bar' },
    m,
  );
  assert.equal(decision.decision, 'block');
  assert.equal(decision.ruleId, 'no-foo');
  assert.equal(decision.reason, 'no foo allowed');
});

test('contains trigger does not fire when absent', async () => {
  const m = merged([
    {
      id: 'no-foo',
      appliesTo: {},
      trigger: { type: 'contains', patterns: ['foo'] },
      action: 'block',
    },
  ]);
  const decision = await evaluate({ event: 'command', tool: 'Bash', command: 'echo bar' }, m);
  assert.equal(decision.decision, 'allow');
});

test('regex trigger matches', async () => {
  const m = merged([
    {
      id: 'rm-rf',
      appliesTo: {},
      trigger: { type: 'regex', patterns: ['rm\\s+-rf'] },
      action: 'block',
      message: 'no rm -rf',
    },
  ]);
  const decision = await evaluate({ event: 'command', tool: 'Bash', command: 'rm -rf /' }, m);
  assert.equal(decision.decision, 'block');
  assert.equal(decision.ruleId, 'rm-rf');
});

test('pathGlob filters content events: **/*.md matches nested abs path', async () => {
  const m = merged([
    {
      id: 'md-rule',
      appliesTo: { pathGlob: ['**/*.md'] },
      trigger: { type: 'contains', patterns: ['todo'] },
      action: 'warn',
      message: 'has todo',
    },
  ]);
  const decision = await evaluate(
    { event: 'content', tool: 'Write', path: '/abs/path/readme.md', content: 'a TODO here' },
    m,
  );
  assert.equal(decision.decision, 'warn');
  assert.equal(decision.ruleId, 'md-rule');
});

test('pathGlob does not match non-matching extension', async () => {
  const m = merged([
    {
      id: 'md-rule',
      appliesTo: { pathGlob: ['**/*.md'] },
      trigger: { type: 'contains', patterns: ['todo'] },
      action: 'warn',
    },
  ]);
  const decision = await evaluate(
    { event: 'content', tool: 'Write', path: '/abs/path/script.py', content: 'a TODO here' },
    m,
  );
  assert.equal(decision.decision, 'allow');
});

test('commandMatch filters command events', async () => {
  const m = merged([
    {
      id: 'git-push',
      appliesTo: { commandMatch: ['git push'] },
      trigger: { type: 'contains', patterns: ['force'] },
      action: 'block',
    },
  ]);
  const fires = await evaluate(
    { event: 'command', tool: 'Bash', command: 'git push --force origin main' },
    m,
  );
  assert.equal(fires.decision, 'block');

  const noMatch = await evaluate(
    { event: 'command', tool: 'Bash', command: 'echo force' },
    m,
  );
  assert.equal(noMatch.decision, 'allow');
});

test('block beats warn', async () => {
  const m = merged([
    {
      id: 'warn-rule',
      appliesTo: {},
      trigger: { type: 'contains', patterns: ['foo'] },
      action: 'warn',
    },
    {
      id: 'block-rule',
      appliesTo: {},
      trigger: { type: 'contains', patterns: ['foo'] },
      action: 'block',
    },
  ]);
  const decision = await evaluate({ event: 'command', tool: 'Bash', command: 'foo' }, m);
  assert.equal(decision.decision, 'block');
  assert.equal(decision.ruleId, 'block-rule');
});

test('allow when nothing fires', async () => {
  const m = merged([
    {
      id: 'no-fire',
      appliesTo: {},
      trigger: { type: 'contains', patterns: ['zzz'] },
      action: 'block',
    },
  ]);
  const decision = await evaluate({ event: 'command', tool: 'Bash', command: 'hello' }, m);
  assert.deepEqual(decision, { decision: 'allow' });
});

test('evaluateAll returns all firing rules', async () => {
  const m = merged([
    {
      id: 'a',
      appliesTo: {},
      trigger: { type: 'contains', patterns: ['foo'] },
      action: 'warn',
    },
    {
      id: 'b',
      appliesTo: {},
      trigger: { type: 'contains', patterns: ['foo'] },
      action: 'block',
    },
    {
      id: 'c',
      appliesTo: {},
      trigger: { type: 'contains', patterns: ['zzz'] },
      action: 'block',
    },
  ]);
  const decisions = await evaluateAll({ event: 'command', tool: 'Bash', command: 'foo' }, m);
  assert.equal(decisions.length, 2);
  assert.deepEqual(
    decisions.map((d) => d.ruleId),
    ['a', 'b'],
  );
});
