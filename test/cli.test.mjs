import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'minos-cli-'));
  mkdirSync(join(dir, 'xdg'));
  mkdirSync(join(dir, '.minos'));
  writeFileSync(join(dir, '.minos', 'rules.jsonc'), JSON.stringify({
    rules: [{
      id: 'no-coauthor', appliesTo: { tools: ['Bash'], commandMatch: ['commit'] },
      trigger: { type: 'contains', patterns: ['Co-Authored-By: Claude'] },
      action: 'block', message: 'Strip it.',
    }],
  }));
  return dir;
}

function run(sub, stdin, cwd, extraEnv = {}) {
  return spawnSync('node', [CLI, ...sub.split(' ')], {
    input: stdin,
    cwd,
    env: { ...process.env, XDG_CONFIG_HOME: join(cwd, 'xdg'), ...extraEnv },
    encoding: 'utf8',
  });
}

test('cli hook contract', async (t) => {
  const dir = project();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  await t.test('pre-bash denies a violating command', () => {
    const r = run('hook pre-bash',
      JSON.stringify({ session_id: 's', cwd: dir, tool_name: 'Bash', tool_input: { command: 'git commit -m "x\n\nCo-Authored-By: Claude <n@a>"' } }),
      dir);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /no-coauthor/);
  });

  await t.test('pre-bash allows a clean command', () => {
    const r = run('hook pre-bash',
      JSON.stringify({ session_id: 's', cwd: dir, tool_name: 'Bash', tool_input: { command: 'git status' } }),
      dir);
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'allow');
  });

  await t.test('pre-bash fails open (exit 0) on malformed hook JSON', () => {
    const r = run('hook pre-bash', 'not json', dir);
    assert.equal(r.status, 0);
  });

  await t.test('post-write blocks a violating file with exit 2 + stderr', () => {
    const f = join(dir, 'notes.md');
    writeFileSync(f, 'git commit -m "Co-Authored-By: Claude"');
    // a content rule that matches .md
    writeFileSync(join(dir, '.minos', 'rules.jsonc'), JSON.stringify({
      rules: [{
        id: 'md-rule', appliesTo: { tools: ['Write'], pathGlob: ['**/*.md'] },
        trigger: { type: 'contains', patterns: ['Co-Authored-By: Claude'] },
        action: 'block', message: 'no',
      }],
    }));
    const r = run('hook post-write',
      JSON.stringify({ session_id: 's', cwd: dir, tool_name: 'Write', tool_input: { file_path: f } }),
      dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /md-rule/);
  });

  await t.test('check crashes cleanly (no stack) on malformed JSON', () => {
    const r = run('check', 'not json at all', dir);
    assert.equal(r.status, 1);
    assert.doesNotMatch(r.stderr, /SyntaxError|at Object|at Module/);
    assert.match(r.stdout, /invalid JSON input/);
  });

  await t.test('check returns a Decision for valid input', () => {
    const r = run('check',
      JSON.stringify({ event: 'command', tool: 'Bash', command: 'git status', cwd: dir }),
      dir);
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).decision, 'allow');
  });
});
