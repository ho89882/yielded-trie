import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Trie, TrieNode } from '../src/index.js';

/**
 * Yield all values from a generator into a sorted array. We sort because the trie's
 * natural DFS order follows Map insertion order, which tests should not be sensitive to.
 */
function sorted(gen) {
  return Array.from(gen).sort();
}

test('insert and has for a basic string', () => {
  const t = new Trie();
  t.insert('apple');
  assert.equal(t.has('apple'), true);
  assert.equal(t.has('appl'), false);
  assert.equal(t.has('applepie'), false);
});

test('size tracks unique insertions and is unaffected by duplicates', () => {
  const t = new Trie();
  assert.equal(t.size, 0);
  t.insert('a');
  t.insert('a');
  t.insert('a');
  assert.equal(t.size, 1);
  t.insert('b');
  assert.equal(t.size, 2);
});

test('has rejects non-string input without throwing', () => {
  const t = new Trie();
  t.insert('x');
  assert.equal(t.has(undefined), false);
  assert.equal(t.has(null), false);
  assert.equal(t.has(42), false);
  assert.equal(t.has({}), false);
});

test('insert throws on non-string input', () => {
  const t = new Trie();
  assert.throws(() => t.insert(42), TypeError);
  assert.throws(() => t.insert(null), TypeError);
});

test('delete removes a string and reports removal status', () => {
  const t = new Trie();
  t.insert('cat');
  assert.equal(t.delete('cat'), true);
  assert.equal(t.has('cat'), false);
  assert.equal(t.size, 0);
  // Deleting something that was never there.
  assert.equal(t.delete('cat'), false);
  assert.equal(t.delete('dog'), false);
});

test('delete does not damage a longer string sharing the deleted prefix', () => {
  const t = new Trie();
  t.insert('app');
  t.insert('apple');
  assert.equal(t.delete('app'), true);
  assert.equal(t.has('app'), false);
  assert.equal(t.has('apple'), true);
  assert.equal(t.size, 1);
});

test('delete does not damage a shorter prefix of a longer string', () => {
  const t = new Trie();
  t.insert('app');
  t.insert('apple');
  assert.equal(t.delete('apple'), true);
  assert.equal(t.has('apple'), false);
  assert.equal(t.has('app'), true);
  assert.equal(t.size, 1);
});

test('hasPrefix distinguishes prefix-of-someone-else from exact membership', () => {
  const t = new Trie();
  t.insert('apple');
  assert.equal(t.hasPrefix('app'), true);
  assert.equal(t.has('app'), false);
  assert.equal(t.hasPrefix('apple'), true);
  assert.equal(t.hasPrefix('applz'), false);
  assert.equal(t.hasPrefix(''), true);
});

test('startsWith with empty prefix yields everything', () => {
  const t = new Trie();
  t.insert('banana');
  t.insert('apple');
  t.insert('cherry');
  assert.deepEqual(sorted(t.startsWith()), ['apple', 'banana', 'cherry']);
});

test('startsWith yields only strings under the given prefix', () => {
  const t = new Trie();
  for (const w of ['apply', 'apple', 'ape', 'ban', 'bandana']) t.insert(w);
  assert.deepEqual(sorted(t.startsWith('ap')), ['ape', 'apple', 'apply']);
  assert.deepEqual(sorted(t.startsWith('app')), ['apple', 'apply']);
  assert.deepEqual(sorted(t.startsWith('b')), ['ban', 'bandana']);
  assert.deepEqual(sorted(t.startsWith('z')), []);
});

test('startsWith of a prefix that is itself a stored word still yields longer matches', () => {
  const t = new Trie();
  t.insert('go');
  t.insert('gone');
  t.insert('got');
  const out = sorted(t.startsWith('go'));
  assert.deepEqual(out, ['go', 'gone', 'got']);
});

test('multi-byte characters are handled as whole code points, not utf-16 units', () => {
  // '𝄞' (U+1D11E) is a single code point but two UTF-16 code units; iterating the
  // string with for..of yields it as one entry, which is what the trie keys on.
  const t = new Trie();
  t.insert('café');
  t.insert('caf');
  t.insert('𝄞clef');
  assert.equal(t.has('café'), true);
  assert.equal(t.has('caf'), true);
  assert.equal(t.has('𝄞clef'), true);
  assert.equal(t.hasPrefix('caf'), true);
  assert.deepEqual(sorted(t.startsWith('caf')), ['caf', 'café']);
  assert.equal(t.delete('café'), true);
  assert.equal(t.has('café'), false);
  assert.equal(t.has('caf'), true);
});

test('repeated insert/delete cycles converge to a consistent state', () => {
  const t = new Trie();
  for (let i = 0; i < 3; i++) {
    t.insert('word');
    assert.equal(t.size, 1);
    assert.equal(t.delete('word'), true);
    assert.equal(t.size, 0);
    assert.equal(t.delete('word'), false);
  }
  assert.equal(t.has('word'), false);
});

test('clear empties the trie', () => {
  const t = new Trie();
  t.insert('a');
  t.insert('ab');
  t.insert('abc');
  t.clear();
  assert.equal(t.size, 0);
  assert.equal(t.has('a'), false);
  assert.deepEqual(Array.from(t.entries()), []);
  // Trie is still usable after clear.
  t.insert('new');
  assert.equal(t.has('new'), true);
  assert.equal(t.size, 1);
});

test('TrieNode is exported and constructs with the documented shape', () => {
  const n = new TrieNode();
  assert.ok(n.children instanceof Map);
  assert.equal(n.end, false);
  assert.equal(n.count, 0);
});

test('startsWith on a trie whose root has no children yields nothing', () => {
  const t = new Trie();
  assert.deepEqual(Array.from(t.startsWith()), []);
  assert.deepEqual(Array.from(t.startsWith('x')), []);
});
