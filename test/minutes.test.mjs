import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDelay } from '../src/core.mjs';
import { isMinutesDraft } from '../src/minutes.ts';

test('minutes drafts allow numeric editing and fractional minutes', () => {
  for (const text of ['', '1', '5', '10', '30', '180', '1.', '1.5', '1,5']) {
    assert.equal(isMinutesDraft(text), true, text);
  }
});

test('minutes drafts reject prompts, units, multiple decimals and multiline pastes', () => {
  for (const text of ['.5', 'write a prompt', '5m', '90s', '1.2.3', '1,2.3', '1\n5', '5\n', ' 5 ', '-5', '1234567890123']) {
    assert.equal(isMinutesDraft(text), false, text);
  }
});

test('numeric drafts still require a valid duration before submission', () => {
  for (const text of ['', '0', '181', '1.', '0.001']) assert.equal(parseDelay(text).ok, false, text);
  for (const text of ['1', '5', '10', '30', '1.5', '1,5', '180']) assert.equal(parseDelay(text).ok, true, text);
});
