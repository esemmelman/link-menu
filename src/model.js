export const clone = value => structuredClone(value);
export function walk(nodes, fn, depth = 1, parent = null) {
  for (const node of nodes) { fn(node, depth, parent); walk(node.children, fn, depth + 1, node); }
}
export function find(nodes, id) {
  for (const node of nodes) { if (node.id === id) return node; const found = find(node.children, id); if (found) return found; }
  return null;
}
export function height(node) { return 1 + Math.max(0, ...node.children.map(height)); }
export function validate(nodes) {
  if (!Array.isArray(nodes)) throw new Error('Invalid menu.');
  const ids = new Set();
  walk(nodes, (node, depth) => {
    if (depth > 3) throw new Error('Menus can have at most three levels.');
    if (!node.id || ids.has(node.id) || !node.title?.trim() || !Array.isArray(node.children)) throw new Error('Invalid menu item.');
    ids.add(node.id);
    if (node.url && !/^https?:$/.test(new URL(node.url).protocol)) throw new Error('Links must start with http:// or https://.');
  });
  return nodes;
}
export function remove(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return nodes.splice(i, 1)[0];
    const removed = remove(nodes[i].children, id); if (removed) return removed;
  }
}
export function move(nodes, id, targetId, position = 'inside') {
  const result = clone(nodes), node = find(result, id);
  if (!node) throw new Error('Item not found.');
  if (id === targetId || find(node.children, targetId)) throw new Error('An item cannot be placed inside itself.');
  remove(result, id);
  if (!targetId) result.push(node);
  else {
    let inserted = false;
    function insert(list) {
      const index = list.findIndex(x => x.id === targetId);
      if (index >= 0) {
        if (position === 'inside') list[index].children.push(node);
        else list.splice(index + (position === 'after' ? 1 : 0), 0, node);
        inserted = true; return;
      }
      for (const item of list) insert(item.children);
    }
    insert(result); if (!inserted) throw new Error('Parent not found.');
  }
  return validate(result);
}
export function importLinks(nodes, links) {
  const result = clone(nodes), seen = new Set();
  walk(result, node => { if (node.sourceId) seen.add(node.sourceId); });
  for (const link of links) {
    if (seen.has(link.id)) continue;
    const category = link.category?.trim() || 'Uncategorized';
    let parent = result.find(x => x.title === category);
    if (!parent) { parent = { id: crypto.randomUUID(), title: category, url: '', children: [] }; result.push(parent); }
    parent.children.push({ id: crypto.randomUUID(), sourceId: link.id, title: link.title, url: link.url, children: [] });
    seen.add(link.id);
  }
  return validate(result);
}
