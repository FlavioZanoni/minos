import { test } from 'node:test';
import assert from 'node:assert';
import { judgeCommand } from '../dist/judge.js';

test('explicit judge.command wins over model', () => {
  assert.deepEqual(judgeCommand({ command: ['sh', '-c', 'echo PASS'], model: 'openai/gpt-5' }),
    ['sh', '-c', 'echo PASS']);
});

test('provider/model ids route via opencode CLI', () => {
  assert.deepEqual(judgeCommand({ model: 'anthropic/claude-haiku-4-5' }),
    ['opencode', 'run', '-m', 'anthropic/claude-haiku-4-5']);
});

test('bare ids route via claude CLI, default model when unset', () => {
  assert.deepEqual(judgeCommand({ model: 'claude-sonnet-5' }),
    ['claude', '-p', '--model', 'claude-sonnet-5']);
  assert.deepEqual(judgeCommand({}),
    ['claude', '-p', '--model', 'claude-haiku-4-5-20251001']);
});
