import test from 'node:test';
import assert from 'node:assert/strict';
import { splitText } from '../public/reading-model.js';

test('divide textos sem perder palavras', () => {
  const chunks = splitText('um dois três quatro cinco', 10);
  assert.deepEqual(chunks, ['um dois', 'três', 'quatro', 'cinco']);
  assert.equal(chunks.join(' '), 'um dois três quatro cinco');
});

test('divide uma palavra longa para respeitar o limite', () => {
  assert.deepEqual(splitText('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
});
