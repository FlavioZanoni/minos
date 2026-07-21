import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadMergedConfig } from '../dist/config.js';

function makeGlobalConfigDir() {
  const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'minos-xdg-'));
  const dir = path.join(xdg, 'minos');
  fs.mkdirSync(dir, { recursive: true });
  return { xdg, dir };
}

function makeProjectDir() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'minos-proj-'));
  const dir = path.join(cwd, '.minos');
  fs.mkdirSync(dir, { recursive: true });
  return { cwd, dir };
}

async function withXdg(xdg, fn) {
  const prev = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = xdg;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = prev;
  }
}

test('project rule with same id fully replaces global rule', async () => {
  const { xdg, dir: globalDir } = makeGlobalConfigDir();
  const { cwd, dir: projDir } = makeProjectDir();

  fs.writeFileSync(
    path.join(globalDir, 'rules.jsonc'),
    JSON.stringify({
      rules: [
        {
          id: 'shared',
          appliesTo: { tools: ['Bash'] },
          trigger: { type: 'contains', patterns: ['old'] },
          action: 'warn',
          message: 'global message',
        },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(projDir, 'rules.jsonc'),
    JSON.stringify({
      rules: [
        {
          id: 'shared',
          appliesTo: { tools: ['Write'] },
          trigger: { type: 'contains', patterns: ['new'] },
          action: 'block',
          message: 'project message',
        },
      ],
    }),
  );

  await withXdg(xdg, async () => {
    const merged = await loadMergedConfig(cwd);
    assert.equal(merged.rules.length, 1);
    const rule = merged.rules[0];
    assert.equal(rule.id, 'shared');
    assert.equal(rule.source, 'project-override');
    assert.equal(rule.action, 'block');
    assert.equal(rule.message, 'project message');
    assert.deepEqual(rule.appliesTo, { tools: ['Write'] });
    assert.deepEqual(rule.trigger, { type: 'contains', patterns: ['new'] });
  });
});

test('disable drops global rules (string form)', async () => {
  const { xdg, dir: globalDir } = makeGlobalConfigDir();
  const { cwd, dir: projDir } = makeProjectDir();

  fs.writeFileSync(
    path.join(globalDir, 'rules.jsonc'),
    JSON.stringify({
      rules: [
        { id: 'keep', appliesTo: {}, trigger: { type: 'contains', patterns: ['a'] }, action: 'warn' },
        { id: 'drop', appliesTo: {}, trigger: { type: 'contains', patterns: ['b'] }, action: 'warn' },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(projDir, 'rules.jsonc'),
    JSON.stringify({ disable: ['drop'] }),
  );

  await withXdg(xdg, async () => {
    const merged = await loadMergedConfig(cwd);
    assert.equal(merged.rules.length, 1);
    assert.equal(merged.rules[0].id, 'keep');
    assert.equal(merged.disabled.length, 1);
    assert.equal(merged.disabled[0].rule.id, 'drop');
    assert.equal(merged.disabled[0].reason, undefined);
  });
});

test('disable drops global rules ({id, reason} form) and records reason', async () => {
  const { xdg, dir: globalDir } = makeGlobalConfigDir();
  const { cwd, dir: projDir } = makeProjectDir();

  fs.writeFileSync(
    path.join(globalDir, 'rules.jsonc'),
    JSON.stringify({
      rules: [
        { id: 'drop', appliesTo: {}, trigger: { type: 'contains', patterns: ['b'] }, action: 'warn' },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(projDir, 'rules.jsonc'),
    JSON.stringify({ disable: [{ id: 'drop', reason: 'not relevant here' }] }),
  );

  await withXdg(xdg, async () => {
    const merged = await loadMergedConfig(cwd);
    assert.equal(merged.rules.length, 0);
    assert.equal(merged.disabled.length, 1);
    assert.equal(merged.disabled[0].rule.id, 'drop');
    assert.equal(merged.disabled[0].reason, 'not relevant here');
  });
});

test('new project rules are appended with source "project"', async () => {
  const { xdg, dir: globalDir } = makeGlobalConfigDir();
  const { cwd, dir: projDir } = makeProjectDir();

  fs.writeFileSync(
    path.join(globalDir, 'rules.jsonc'),
    JSON.stringify({
      rules: [
        { id: 'g1', appliesTo: {}, trigger: { type: 'contains', patterns: ['a'] }, action: 'warn' },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(projDir, 'rules.jsonc'),
    JSON.stringify({
      rules: [
        { id: 'p1', appliesTo: {}, trigger: { type: 'contains', patterns: ['b'] }, action: 'block' },
      ],
    }),
  );

  await withXdg(xdg, async () => {
    const merged = await loadMergedConfig(cwd);
    assert.equal(merged.rules.length, 2);
    const bySource = Object.fromEntries(merged.rules.map((r) => [r.id, r.source]));
    assert.equal(bySource.g1, 'global');
    assert.equal(bySource.p1, 'project');
  });
});

test('missing global and project config files are tolerated', async () => {
  const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'minos-xdg-empty-'));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'minos-proj-empty-'));

  await withXdg(xdg, async () => {
    const merged = await loadMergedConfig(cwd);
    assert.deepEqual(merged.rules, []);
    assert.deepEqual(merged.disabled, []);
    assert.deepEqual(merged.tooling, {});
    assert.deepEqual(merged.judge, {});
  });
});

test('tooling/judge config: project wins over global, global is fallback', async () => {
  const { xdg, dir: globalDir } = makeGlobalConfigDir();
  const { cwd, dir: projDir } = makeProjectDir();

  fs.writeFileSync(
    path.join(globalDir, 'rules.jsonc'),
    JSON.stringify({
      tooling: { describe: ['declared'] },
      judge: { timeoutMs: 1000 },
    }),
  );
  fs.writeFileSync(
    path.join(projDir, 'rules.jsonc'),
    JSON.stringify({ judge: { timeoutMs: 5000 } }),
  );

  await withXdg(xdg, async () => {
    const merged = await loadMergedConfig(cwd);
    // project has no tooling key -> falls back to global's
    assert.deepEqual(merged.tooling, { describe: ['declared'] });
    // project defines judge -> project's wins entirely
    assert.deepEqual(merged.judge, { timeoutMs: 5000 });
  });
});
