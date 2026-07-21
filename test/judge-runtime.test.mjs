import { test } from 'node:test';
import assert from 'node:assert';
import { runJudge } from '../dist/judge.js';

const payload = { command: 'test' };

test('runJudge parses PASS', async () => {
  const r = await runJudge({ text: 'q' }, { command: ['sh', '-c', 'cat >/dev/null; echo PASS'] }, payload);
  assert.equal(r.pass, true);
});

test('runJudge parses FAIL with reason', async () => {
  const r = await runJudge({ text: 'q' }, { command: ['sh', '-c', 'cat >/dev/null; echo "FAIL: nope"'] }, payload);
  assert.equal(r.pass, false);
  assert.equal(r.reason, 'nope');
});

test('runJudge strips ANSI before parsing', async () => {
  const r = await runJudge(
    { text: 'q' },
    { command: ['sh', '-c', "cat >/dev/null; printf '\\033[32mPASS\\033[0m\\n'"] },
    payload,
  );
  assert.equal(r.pass, true);
});

test('runJudge fails open on spawn error', async () => {
  const r = await runJudge({ text: 'q' }, { command: ['this-binary-does-not-exist-xyz'] }, payload);
  assert.equal(r.pass, true);
});

test('runJudge fails open on timeout', async () => {
  const r = await runJudge({ text: 'q' }, { command: ['sh', '-c', 'sleep 5'], timeoutMs: 200 }, payload);
  assert.equal(r.pass, true);
});

/* the crash case: a judge that closes stdin then lingers must NOT crash the
   process with an uncaught EPIPE; runJudge must resolve (fail-open). */
test('runJudge survives a child that closes stdin (EPIPE)', async () => {
  const big = 'x'.repeat(300000);
  const r = await runJudge({ text: big }, { command: ['sh', '-c', 'exec 0<&-; echo PASS'], timeoutMs: 5000 }, payload);
  assert.equal(r.pass, true); // resolved, not crashed
});
