/* Yielded Trie — single-file implementation of a dynamic, character-keyed prefix tree. */

/**
 * A TrieNode holds the outgoing character edges, an `end` flag marking the end of a
 * stored string, and a cached `count` of terminal strings in the subtree rooted here.
 *
 * The `count` field is what lets `delete` decide whether a subtree is worth keeping in
 * O(1): if a node is not an endpoint and has no outgoing strings, it can be pruned
 * without further inspection. Keeping it updated on insert/delete is the whole reason
 * deletion is not a separate walk of the tree.
 */
export class TrieNode {
  constructor() {
    /** @type {Map<string, TrieNode>} */
    this.children = new Map();
    /** @type {boolean} */
    this.end = false;
    /** @type {number} count of terminal strings in this subtree (this node included). */
    this.count = 0;
  }
}

/**
 * A `yield`-driven Trie. Strings are stored character by character; each character is a
 * key into a `Map`, so the trie is agnostic to character width: emoji, astral-plane CJK,
 * and combining sequences all work because no assumption about byte length is made.
 *
 * Iteration uses generator functions so that a large trie does not have to materialise
 * all its strings at once to satisfy a prefix query. The trade-off: an in-progress
 * traversal that runs while the trie is mutated may observe a torn state. Do not mutate
 * while iterating; collect into an array first if you need a snapshot.
 */
export class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  /**
   * Insert `s` into the trie. Re-inserting an existing string is a no-op: the `count`
   * fields only move when a string transitions from absent to present. This keeps the
   * counts honest as a set-membership signal rather than a multiset cardinality.
   *
   * @param {string} s
   * @returns {void}
   */
  insert(s) {
    if (typeof s !== 'string') {
      throw new TypeError('Trie.insert expects a string');
    }
    let node = this.root;
    for (const ch of s) {
      let child = node.children.get(ch);
      if (child === undefined) {
        child = new TrieNode();
        node.children.set(ch, child);
      }
      node = child;
    }
    if (node.end) return; // already a member; no count change
    node.end = true;
    // Walk back up, incrementing counts on every ancestor including the terminal node.
    // The terminal node itself gains count 1 (from 0), and every ancestor gains 1.
    node.count += 1;
    let n = this.root;
    for (const ch of s) {
      n.count += 1;
      n = n.children.get(ch);
    }
  }

  /**
   * Exact membership test.
   *
   * @param {string} s
   * @returns {boolean}
   */
  has(s) {
    if (typeof s !== 'string') return false;
    let node = this.root;
    for (const ch of s) {
      const child = node.children.get(ch);
      if (child === undefined) return false;
      node = child;
    }
    return node.end;
  }

  /**
   * Remove `s` from the trie if present. Returns true if a string was actually removed,
   * false if it was not a member. Pruning of now-empty branches is performed eagerly so
   * the trie never retains dead subtrees after a deletion.
   *
   * @param {string} s
   * @returns {boolean}
   */
  delete(s) {
    if (typeof s !== 'string') return false;
    // First confirm membership; without this we must not touch counts.
    let node = this.root;
    for (const ch of s) {
      const child = node.children.get(ch);
      if (child === undefined) return false;
      node = child;
    }
    if (!node.end) return false;

    // Perform the deletion: clear the end flag and decrement counts along the path.
    node.end = false;
    let n = this.root;
    for (const ch of s) {
      n.count -= 1;
      n = n.children.get(ch);
    }
    n.count -= 1;

    // Prune dead subtrees. We walk from the root again, deleting a child whose subtree
    // has count 0. We stop as soon as we hit a node whose remaining children are non-empty
    // (or the terminal node we just cleared, which we leave if it still has children).
    const path = [this.root];
    let cur = this.root;
    for (const ch of s) {
      cur = cur.children.get(ch);
      path.push(cur);
    }
    // path[i] is the node for prefix s[0..i-1]; path[s.length] is the terminal node.
    for (let i = path.length - 1; i >= 1; i--) {
      const parent = path[i - 1];
      const child = path[i];
      // A child is removable only if it is not itself an endpoint and has no live edges.
      if (!child.end && child.children.size === 0) {
        const ch = s[i - 1];
        parent.children.delete(ch);
      } else {
        // Once we hit a node worth keeping, nothing above it can be dead either.
        break;
      }
    }
    return true;
  }

  /**
   * Number of terminal strings stored. O(1).
   *
   * @returns {number}
   */
  get size() {
    return this.root.count;
  }

  /**
   * Does any stored string start with `prefix`? Distinct from `has`: `hasPrefix("app")`
   * is true even if "app" itself is not stored, as long as "apple" is.
   *
   * @param {string} prefix
   * @returns {boolean}
   */
  hasPrefix(prefix) {
    if (typeof prefix !== 'string') return false;
    let node = this.root;
    for (const ch of prefix) {
      const child = node.children.get(ch);
      if (child === undefined) return false;
      node = child;
    }
    return node.count > 0;
  }

  /**
   * Yield every stored string that starts with `prefix`, in DFS order (shorter first
   * within a given edge ordering). The empty prefix yields the entire set. Results are
   * streamed via a generator; callers who need a stable snapshot across mutations should
   * drain into an array.
   *
   * Map iteration order follows insertion order in V8, so for a fixed insertion sequence
   * the output is deterministic. Tests that compare full output use a sorted array so they
   * do not depend on that fact.
   *
   * @param {string} [prefix]
   * @returns {Generator<string, void, undefined>}
   */
  *startsWith(prefix = '') {
    if (typeof prefix !== 'string') {
      throw new TypeError('Trie.startsWith prefix must be a string');
    }
    let node = this.root;
    for (const ch of prefix) {
      const child = node.children.get(ch);
      if (child === undefined) return;
      node = child;
    }
    yield* this._emit(node, prefix);
  }

  /**
   * Internal DFS emitter. We do a recursive generator rather than an explicit stack
   * because the depth of a trie is bounded by the length of the longest stored string,
   * which in practice fits comfortably inside the JS call budget; the clarity wins.
   *
   * @param {TrieNode} node
   * @param {string} acc
   * @returns {Generator<string, void, undefined>}
   */
  *_emit(node, acc) {
    if (node.end) yield acc;
    for (const [ch, child] of node.children) {
      yield* this._emit(child, acc + ch);
    }
  }

  /**
   * Drain every stored string. Equivalent to `startsWith('')` but named for clarity at
   * call sites that want the whole set.
   *
   * @returns {Generator<string, void, undefined>}
   */
  *entries() {
    yield* this._emit(this.root, '');
  }

  /**
   * Empty the trie.
   *
   * @returns {void}
   */
  clear() {
    this.root = new TrieNode();
  }
}
