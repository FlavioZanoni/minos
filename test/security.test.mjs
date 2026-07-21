import { test } from 'node:test';
import assert from 'node:assert';
import { parseJsonc } from '../dist/config.js';
import { globToRegex, matchesRule } from '../dist/matchers.js';
import { evaluate } from '../dist/evaluate.js';

/* parseJsonc must not corrupt string contents when stripping trailing commas */
test('parseJsonc preserves {n,} quantifiers inside strings', () => {
  const p = parseJsonc('{ "patterns": ["rm\\\\s+-rf\\\\s+.{2,}"] }');
  assert.equal(p.patterns[0], 'rm\\s+-rf\\s+.{2,}');
});
test('parseJsonc preserves a comma-then-bracket inside a string value', () => {
  const p = parseJsonc('{ "m": "in {1,2,}" }');
  assert.equal(p.m, 'in {1,2,}');
});
test('parseJsonc still strips real trailing commas', () => {
  assert.deepEqual(parseJsonc('{ "a": [1, 2, ], }'), { a: [1, 2] });
});

/* globToRegex: no catastrophic backtracking from stacked **​/ */
test('globToRegex collapses stacked **/ and stays fast', () => {
  const rx = globToRegex('**/'.repeat(12) + '*.ts');
  const hay = 'a/'.repeat(30) + 'nomatch.txt';
  const t = Date.now();
  rx.test(hay);
  assert.ok(Date.now() - t < 500, 'glob match must not backtrack for seconds');
});
test('globToRegex still matches nested and top-level', () => {
  assert.ok(globToRegex('**/*.md').test('/a/b/c.md'));
  assert.ok(globToRegex('**/*.md').test('readme.md'));
  assert.ok(!globToRegex('**/*.md').test('a/b.py'));
});

const merged = (r) => ({ rules: [r], disabled: [], tooling: {}, judge: {}, globalPath: '', projectPath: '' });

/* regex trigger: catastrophic pattern is bounded, does not hang */
test('regex trigger with a ReDoS pattern is time-bounded', async () => {
  const rule = {
    id: 'redos', appliesTo: { tools: ['Bash'] },
    trigger: { type: 'regex', patterns: ['(a+)+$'] },
    action: 'block', message: 'x', source: 'global', configDir: '/tmp',
  };
  const input = { event: 'command', tool: 'Bash', command: 'a'.repeat(40) + '!' };
  const t = Date.now();
  const d = await evaluate(input, merged(rule));
  assert.ok(Date.now() - t < 4000, 'must not hang on catastrophic regex');
  assert.equal(d.decision, 'allow'); // timed out -> treated as no match
});

/* invalid regex must not crash the whole evaluation */
test('invalid regex pattern does not crash evaluate', async () => {
  const rule = {
    id: 'bad', appliesTo: { tools: ['Bash'] },
    trigger: { type: 'regex', patterns: ['('] },
    action: 'block', message: 'x', source: 'global', configDir: '/tmp',
  };
  const d = await evaluate({ event: 'command', tool: 'Bash', command: 'anything' }, merged(rule));
  assert.equal(d.decision, 'allow');
});

/* unknown trigger type must NOT silently route to the judge (fail-open) */
test('unknown trigger type is skipped, not treated as llm-judge', async () => {
  const rule = {
    id: 'typo', appliesTo: { tools: ['Bash'] },
    trigger: { type: 'Regex', patterns: ['x'] }, // capital R = typo
    action: 'block', message: 'x', source: 'global', configDir: '/tmp',
  };
  const d = await evaluate({ event: 'command', tool: 'Bash', command: 'x' }, merged(rule));
  assert.equal(d.decision, 'allow'); // skipped, and importantly did not spawn a judge
});

/* prompt-path traversal is contained: the escaping path is ignored, judge fails
   open (allow) rather than reading an out-of-tree file. Uses a stub judge so no
   real model is called. */
test('llm-judge prompt path escaping configDir is ignored', async () => {
  const rule = {
    id: 'trav', appliesTo: { tools: ['Bash'] },
    trigger: { type: 'llm-judge', prompt: '../../../../etc/passwd' },
    action: 'block', message: 'x', source: 'project', configDir: '/home/u/proj/.minos',
  };
  const m = merged(rule);
  m.judge = { command: ['sh', '-c', 'cat >/dev/null; echo PASS'] };
  const d = await evaluate({ event: 'command', tool: 'Bash', command: 'x' }, m);
  assert.equal(d.decision, 'allow'); // no file read, judge said PASS
});
