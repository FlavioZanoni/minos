import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MinosPlugin } from '../dist/opencode.js';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'rg-oc-'));
  // isolate from the real user config: global lookup must not leak in
  process.env.XDG_CONFIG_HOME = join(dir, 'xdg');
  mkdirSync(join(dir, '.minos'));
  writeFileSync(join(dir, '.minos', 'rules.jsonc'), JSON.stringify({
    rules: [
      { id: 'no-coauthor', appliesTo: { tools: ['Bash'], commandMatch: ['git commit'] },
        trigger: { type: 'contains', patterns: ['Co-Authored-By: Claude'] },
        action: 'block', message: 'Strip the trailer.' },
      { id: 'no-chat-context', appliesTo: { tools: ['Edit', 'Write'], pathGlob: ['**/*.md'] },
        trigger: { type: 'contains', patterns: ['as discussed'] },
        action: 'block', message: 'No chat context in docs.' },
      { id: 'todo-warn', appliesTo: { tools: ['Edit', 'Write'], pathGlob: ['**/*.md'] },
        trigger: { type: 'contains', patterns: ['TODO'] },
        action: 'warn', message: 'Leftover TODO.' },
    ],
  }));
  return dir;
}

test('opencode adapter', async (t) => {
  const dir = fixture();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const hooks = await MinosPlugin({ directory: dir });
  const before = hooks['tool.execute.before'];
  const after = hooks['tool.execute.after'];

  await t.test('bash block throws in before', async () => {
    await assert.rejects(
      () => before({ tool: 'bash', callID: 'c1' }, { args: { command: 'git commit -m "x\n\nCo-Authored-By: Claude <n@a>"' } }),
      /minos:no-coauthor/,
    );
  });

  await t.test('clean bash passes', async () => {
    await before({ tool: 'bash', callID: 'c2' }, { args: { command: 'git status' } });
  });

  await t.test('write block throws in after via captured args', async () => {
    const bad = join(dir, 'notes.md');
    writeFileSync(bad, 'As discussed, this does X.');
    await before({ tool: 'write', callID: 'c3' }, { args: { filePath: bad, content: 'x' } });
    await assert.rejects(
      () => after({ tool: 'write', callID: 'c3' }, { title: '', output: 'ok', metadata: {} }),
      /minos:no-chat-context/,
    );
  });

  await t.test('warn appends to tool output', async () => {
    const meh = join(dir, 'todo.md');
    writeFileSync(meh, 'TODO: finish this');
    await before({ tool: 'write', callID: 'c4' }, { args: { filePath: meh } });
    const out = { title: '', output: 'ok', metadata: {} };
    await after({ tool: 'write', callID: 'c4' }, out);
    assert.match(out.output, /minos:todo-warn/);
  });

  await t.test('non-matching path passes and unknown tools ignored', async () => {
    const txt = join(dir, 'notes.txt');
    writeFileSync(txt, 'As discussed');
    await before({ tool: 'write', callID: 'c5' }, { args: { filePath: txt } });
    await after({ tool: 'write', callID: 'c5' }, { title: '', output: 'ok', metadata: {} });
    await before({ tool: 'read', callID: 'c6' }, { args: { filePath: txt } });
    await after({ tool: 'read', callID: 'c6' }, { title: '', output: 'ok', metadata: {} });
  });
});
