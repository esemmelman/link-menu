import test from 'node:test';
import assert from 'node:assert/strict';
import { move, validate, importLinks } from '../src/model.js';
const n = (id, children = []) => ({ id, title: id, url: '', children });
test('reorders siblings and moves between parents without mutating input', () => {
  const original = [n('a', [n('x'), n('y')]), n('b')];
  const reordered = move(original, 'y', 'x', 'before');
  assert.equal(reordered[0].children[0].id, 'y');
  const nested = move(original, 'x', 'b');
  assert.equal(nested[1].children[0].id, 'x');
  assert.equal(original[0].children.length, 2);
});
test('rejects cycles and fourth levels, including deep subtrees', () => {
  const nodes = [n('a', [n('b', [n('c')])]), n('d', [n('e')])];
  assert.throws(() => move(nodes, 'a', 'c'), /itself/);
  assert.throws(() => move(nodes, 'd', 'b'), /three levels/);
  assert.throws(() => move(nodes, 'e', 'c'), /three levels/);
  assert.equal(move(nodes, 'c', null).at(-1).id, 'c');
});
test('import groups categories and preserves moved links without duplicates', () => {
  const links = [{ id: '1', title: 'Example', url: 'https://example.com', category: 'Main' }];
  const nodes = importLinks([], links);
  assert.equal(nodes[0].title, 'Main');
  const moved = move(nodes, nodes[0].children[0].id, null);
  assert.deepEqual(importLinks(moved, links), moved);
});
test('rejects executable link schemes', () => {
  assert.throws(() => validate([{ ...n('a'), url: 'javascript:alert(1)' }]), /http/);
});
