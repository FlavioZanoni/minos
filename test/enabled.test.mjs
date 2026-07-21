import { test } from 'node:test';
import assert from 'node:assert';
import { evaluate } from '../dist/evaluate.js';

const rule = (extra) => ({
  id: 'r1', appliesTo: { tools: ['Bash'] },
  trigger: { type: 'contains', patterns: ['boom'] },
  action: 'block', message: 'no', source: 'global', configDir: '/tmp', ...extra,
});
const merged = (r) => ({ rules: [r], disabled: [], tooling: {}, judge: {}, globalPath: '', projectPath: '' });
const input = { event: 'command', tool: 'Bash', command: 'boom' };

test('enabled:false rule is skipped', async () => {
  assert.equal((await evaluate(input, merged(rule({ enabled: false })))).decision, 'allow');
});

test('enabled omitted means active', async () => {
  assert.equal((await evaluate(input, merged(rule({})))).decision, 'block');
});
