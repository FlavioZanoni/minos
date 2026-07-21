import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonc } from '../dist/config.js';

test('strips line comments', () => {
  const out = parseJsonc(`{
    // a comment
    "a": 1
  }`);
  assert.deepEqual(out, { a: 1 });
});

test('strips block comments', () => {
  const out = parseJsonc(`{
    /* block
       comment */
    "a": 1
  }`);
  assert.deepEqual(out, { a: 1 });
});

test('preserves // inside strings', () => {
  const out = parseJsonc(`{ "url": "http://example.com" }`);
  assert.deepEqual(out, { url: 'http://example.com' });
});

test('preserves /* inside strings', () => {
  const out = parseJsonc(`{ "a": "/* not a comment */" }`);
  assert.deepEqual(out, { a: '/* not a comment */' });
});

test('allows trailing commas in objects and arrays', () => {
  const out = parseJsonc(`{
    "a": [1, 2, 3,],
    "b": 2,
  }`);
  assert.deepEqual(out, { a: [1, 2, 3], b: 2 });
});

test('handles escaped quotes inside strings', () => {
  const out = parseJsonc(`{ "a": "she said \\"hi // there\\"" }`);
  assert.deepEqual(out, { a: 'she said "hi // there"' });
});
