# Yielded Trie

A zero-dependency, generator-driven prefix tree for JavaScript. Stores a dynamic set of strings character by character and supports exact lookup, prefix queries, and deletion with eager pruning.

```js
import { Trie } from 'yielded-trie';

const t = new Trie();
t.insert('apple');
t.insert('apply');
t.insert('ape');

t.has('apple');          // true
t.has('app');            // false — "app" is a prefix, not a member
t.hasPrefix('app');      // true — some stored string starts with "app"

for (const w of t.startsWith('app')) console.log(w); // "apple", "apply" (DFS order)

t.delete('apple');       // true; "apply" survives
t.size;                   // 2
t.clear();
```

## Why this exists

The problem is narrow but recurring: you have a set of strings that grows and shrinks at runtime, and you need both "is this exact string present" and "is anything stored under this prefix" answers fast, without paying for a full scan on every lookup. A hash set answers the first question and nothing else; a sorted array answers both but at `O(log n)` per query and with allocation on every insert. A trie answers both in `O(m)` where `m` is the query length, independent of how many strings are stored.

The trade-off: memory. A trie pays a node per shared character; for small sets a hash set wins on every axis. This library is for the case where the prefix queries are the actual workload, not a nice-to-have.

Iteration is `yield`-based so a trie of a million strings does not have to materialise them all to answer `startsWith`. The cost is that an in-progress traversal observes live state: do not mutate the trie while iterating over it. Drain to an array first if you need a snapshot.

## Exports

- `Trie` — the class. Constructor takes no arguments. Methods: `insert(s)`, `has(s)`, `delete(s)` (returns `boolean`), `hasPrefix(prefix)` (returns `boolean`), `startsWith(prefix = '')` (returns a `Generator<string>`), `entries()` (returns a `Generator<string>` yielding everything), `clear()`, and a `size` getter returning the terminal count.
- `TrieNode` — the internal node type, exported for introspection and custom traversal. Has `children: Map<string, TrieNode>`, `end: boolean`, and `count: number` (terminal strings in this subtree). You normally do not need this; it is exported so that callers building tooling on top of the trie can walk the structure directly.

## Edge cases worth knowing

- `has` and `hasPrefix` are distinct. `has('app')` is false if only `apple` is stored; `hasPrefix('app')` is true. The README example above is the canonical illustration.
- `insert` is a set operation. Inserting the same string twice does not increase `size`; `size` counts distinct stored strings.
- `delete` prunes branches that become empty. Deleting `apple` when `apply` is also stored leaves `apply` intact and removes only the `l`/`e` tail below the shared `appl` prefix.
- Characters are iterated as code points via `for..of`, so astral-plane characters (emoji, musical symbols, rare CJK) are single trie edges, not pairs of surrogate halves. `𝄞` is one edge, not two.
- `startsWith()` with no argument yields every stored string; `startsWith('')` is equivalent.

`node --test` runs the suite from the project root.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

