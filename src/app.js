import { createClient } from '@supabase/supabase-js';
import { clone, walk, find, height, validate, remove, move, importLinks } from './model.js';
import './style.css';
import { version } from '../package.json';

const db = createClient('https://fgomaujsdblpzxhnnqrg.supabase.co', 'sb_publishable_JOUqLZDnfGu_yCa6k6FVDQ_AYwpr72i');
const $ = id => document.getElementById(id);
$('version').textContent = `v${version}`;
let nodes = [], user = null, revision = 0, dirty = false, saving = false, generation = 0, history = [], dragId = null, editingId = null, ready = false, timer;
let statusTimer;
const status = (message, duration = 2000) => {
  clearTimeout(statusTimer);
  $('status').textContent = message;
  if (duration) statusTimer = setTimeout(() => { $('status').textContent = ''; }, duration);
};
function button(text, action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = action; return b; }
function closeMenus() { document.querySelectorAll('#menu .open').forEach(x => { x.classList.remove('open'); x.querySelector('button')?.setAttribute('aria-expanded', 'false'); }); }
function openMenu(li, b) {
  [...li.parentElement.children].filter(x => x !== li).forEach(x => { x.classList.remove('open'); x.querySelector('button')?.setAttribute('aria-expanded', 'false'); });
  li.classList.add('open'); b.setAttribute('aria-expanded', 'true');
  const sub = li.querySelector(':scope > ul'); sub.classList.remove('flip');
  if (sub.getBoundingClientRect().right > window.innerWidth && li.parentElement.id !== 'menu') sub.classList.add('flip');
  else if (li.parentElement.id === 'menu' && sub.getBoundingClientRect().right > window.innerWidth) { sub.style.left = 'auto'; sub.style.right = '0'; }
}
function menuItem(node) {
  const li = document.createElement('li');
  const visibleChildren = node.children.filter(child => !child.archived);
  if (visibleChildren.length || !node.url) {
    const b = button(node.title, e => { if (li.classList.contains('open') && e.pointerType !== 'mouse') { li.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); } else openMenu(li, b); });
    b.className = 'branch'; b.setAttribute('aria-label', node.title); b.setAttribute('aria-expanded', 'false');
    const sub = document.createElement('ul');
    if (node.url) { const link = document.createElement('li'); link.append(anchor('Open ' + node.title, node.url)); sub.append(link); }
    sub.append(...visibleChildren.map(menuItem));
    if (!sub.children.length) { const empty = document.createElement('li'); empty.textContent = 'Empty submenu'; empty.style.padding = '10px'; sub.append(empty); }
    li.append(b, sub);
    li.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') openMenu(li, b); });
    b.onkeydown = e => { if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); openMenu(li, b); sub.querySelector('button,a')?.focus(); } };
  } else li.append(anchor(node.title, node.url));
  return li;
}
function anchor(title, url) { const a = document.createElement('a'); a.textContent = title; a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.onclick = closeMenus; return a; }
function render() {
  $('menu').replaceChildren(...nodes.filter(node => !node.archived).map(menuItem)); $('tree').replaceChildren();
  const hiddenItems = new Set();
  walk(nodes, (node, depth, parent) => {
    const row = document.createElement('div'); row.className = 'row'; row.dataset.id = node.id; row.style.setProperty('--depth', depth - 1); row.draggable = true;
    const handle = document.createElement('span'); handle.className = 'handle'; handle.textContent = '⠿'; handle.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span'); name.className = 'name'; name.textContent = node.title;
    if (node.archived || hiddenItems.has(parent?.id)) {
      hiddenItems.add(node.id);
      const badge = document.createElement('small'); badge.className = 'archive-badge'; badge.textContent = node.archived ? 'Archived' : 'Archived parent'; name.append(' ', badge);
    }
    row.append(handle, name, button('Edit', () => edit(node.id)));
    if (depth < 3) row.append(button('+ Submenu', () => edit(null, node.id)));
    row.ondragstart = e => { dragId = node.id; e.dataTransfer.setData('text/plain', node.id); e.dataTransfer.effectAllowed = 'move'; };
    row.ondragend = clearDrag;
    row.ondragover = e => { if (!dragId) return; e.preventDefault(); clearIndicators(); const bounds = row.getBoundingClientRect(), fraction = (e.clientY - bounds.top) / bounds.height; row.dataset.drop = fraction < .25 ? 'before' : fraction > .75 ? 'after' : 'inside'; e.dataTransfer.dropEffect = 'move'; };
    row.ondragleave = () => { delete row.dataset.drop; };
    row.ondrop = e => { e.preventDefault(); const position = row.dataset.drop || 'inside'; try { change(move(nodes, dragId, node.id, position)); } catch (err) { status(err.message); } clearDrag(); };
    $('tree').append(row);
  });
  $('undo').disabled = !history.length; $('save').disabled = !dirty || saving;
}
function clearIndicators() { document.querySelectorAll('[data-drop]').forEach(x => delete x.dataset.drop); }
function clearDrag() { dragId = null; clearIndicators(); $('rootDrop').classList.remove('over'); }
function change(next, remember = true) {
  if (!ready) return;
  validate(next); if (remember) { history.push(clone(nodes)); if (history.length > 30) history.shift(); }
  nodes = next; generation++; dirty = true; render(); status('Saving…'); clearTimeout(timer); timer = setTimeout(save, 400);
}
async function save() {
  if (!dirty || saving || !user || !ready) return;
  saving = true; $('save').disabled = true; const snapshot = clone(nodes), version = generation, owner = user.id;
  try {
    const { data, error } = await db.from('link_menu_layouts').update({ nodes: snapshot, revision: revision + 1, updated_at: new Date().toISOString() }).eq('user_id', owner).eq('revision', revision).select('revision,nodes').single();
    if (error) throw new Error(error.code === 'PGRST116' ? 'This menu changed in another tab or device. Your edits are still here. Reload the saved menu to use the other version.' : error.message);
    if (user?.id !== owner) return;
    // Preserve in-flight edits and undo history while retaining server-assigned Link IDs.
    const sources = new Map();
    walk(data.nodes, node => { if (node.sourceId) sources.set(node.id, node.sourceId); });
    for (const tree of [nodes, ...history]) walk(tree, node => { if (sources.has(node.id)) node.sourceId = sources.get(node.id); });
    revision = data.revision; dirty = generation !== version; status(dirty ? 'Saving…' : '');
  } catch (error) { status('Not saved. ' + error.message); return; }
  finally { saving = false; $('save').disabled = !dirty; }
  if (dirty) save();
}
async function sourceLinks() {
  const all = []; let offset = 0;
  while (true) {
    const { data, error } = await db.from('link_deck_links').select('id,title,url,category').order('id').range(offset, offset + 999);
    if (error) throw error; all.push(...data); if (data.length < 1000) return all; offset += 1000;
  }
}
async function load() {
  ready = false; status('Loading…'); $('editor').hidden = true; $('editToggle').hidden = true;
  try {
    const { data, error } = await db.from('link_menu_layouts').select('nodes,revision').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (data) { nodes = validate(data.nodes); revision = data.revision; }
    else {
      nodes = importLinks([], await sourceLinks());
      const { error: insertError } = await db.from('link_menu_layouts').insert({ user_id: user.id, nodes });
      if (insertError) throw insertError; revision = 1;
    }
    history = []; dirty = false; generation = 0; ready = true; render(); $('editToggle').hidden = false; $('editToggle').textContent = 'Edit menu'; status('');
  } catch (error) { status('Could not load menu. ' + error.message); $('editor').hidden = false; }
}
function edit(id = null, parentId = '') {
  editingId = id; const node = id ? find(nodes, id) : null; let currentParent = parentId;
  if (id) walk(nodes, (n, depth, parent) => { if (n.id === id) currentParent = parent?.id || ''; });
  $('itemTitle').value = node?.title || ''; $('itemUrl').value = node?.url || ''; $('itemError').textContent = ''; $('delete').hidden = !id;
  $('itemArchived').checked = !!node?.archived;
  $('parent').replaceChildren(new Option('Top level', ''));
  walk(nodes, (n, depth) => {
    if (n.id === id || (node && find(node.children, n.id)) || depth + (node ? height(node) : 1) > 3) return;
    $('parent').add(new Option('— '.repeat(depth - 1) + n.title, n.id));
  });
  $('parent').value = currentParent; $('itemDialog').showModal(); $('itemTitle').focus();
}
$('itemForm').onsubmit = e => {
  e.preventDefault();
  try {
    let next = clone(nodes), node = editingId ? find(next, editingId) : { id: crypto.randomUUID(), children: [] };
    node.title = $('itemTitle').value.trim(); node.url = $('itemUrl').value.trim();
    node.archived = $('itemArchived').checked;
    const parent = $('parent').value;
    if (editingId) {
      let previousParent = ''; walk(nodes, (n, depth, p) => { if (n.id === editingId) previousParent = p?.id || ''; });
      if (parent !== previousParent) next = move(next, editingId, parent);
    } else { (parent ? find(next, parent).children : next).push(node); }
    change(validate(next)); $('itemDialog').close();
  } catch (error) { $('itemError').textContent = error.message; }
};
$('delete').onclick = () => { const node = find(nodes, editingId); if (node.children.length && !confirm('Delete this menu and everything inside it?')) return; const next = clone(nodes); remove(next, editingId); change(next); $('itemDialog').close(); };
$('cancel').onclick = () => $('itemDialog').close();
$('add').onclick = () => edit();
$('undo').onclick = () => { if (history.length) change(history.pop(), false); };
$('save').onclick = save;
$('editToggle').onclick = () => { closeMenus(); $('editor').hidden = !$('editor').hidden; $('editToggle').textContent = $('editor').hidden ? 'Edit menu' : 'Done'; };
$('import').onclick = async () => {
  $('import').disabled = true;
  try { const next = importLinks(nodes, await sourceLinks()); if (JSON.stringify(next) === JSON.stringify(nodes)) status('No new links.', 2000); else change(next); }
  catch (error) { status('Could not import links. ' + error.message); }
  finally { $('import').disabled = false; }
};
$('reload').onclick = () => { if (saving) return; if (dirty && !confirm('Discard unsaved edits and reload the saved menu?')) return; clearTimeout(timer); load(); };
$('rootDrop').ondragover = e => { if (dragId) { e.preventDefault(); clearIndicators(); $('rootDrop').classList.add('over'); } };
$('rootDrop').ondragleave = () => $('rootDrop').classList.remove('over');
$('rootDrop').ondrop = e => { e.preventDefault(); try { change(move(nodes, dragId, null)); } catch (error) { status(error.message); } clearDrag(); };
$('signOut').onclick = async () => { if (saving) return; if (dirty && !confirm('Sign out and discard unsaved edits?')) return; const { error } = await db.auth.signOut(); if (error) status(error.message); };
$('loginForm').onsubmit = async e => {
  e.preventDefault(); $('signIn').disabled = true; $('loginError').textContent = '';
  try { const { error } = await db.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value }); if (error) throw error; $('password').value = ''; }
  catch (error) { $('loginError').textContent = error.message; }
  finally { $('signIn').disabled = false; }
};
db.auth.onAuthStateChange((_event, session) => {
  setTimeout(() => {
    const nextUser = session?.user || null;
    if (nextUser?.id && nextUser.id === user?.id) return;
    user = nextUser; clearTimeout(timer); nodes = []; ready = false; dirty = false; history = []; render();
    $('login').hidden = !!user; $('editor').hidden = true; $('editToggle').hidden = true;
    if (user) load(); else { status(''); $('itemDialog').close(); }
  }, 0);
});
document.addEventListener('click', e => { if (!e.target.closest('nav')) closeMenus(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { const open = e.target.closest('#menu li.open'); closeMenus(); open?.querySelector('button')?.focus(); }
  if (e.target.closest('#menu') && ['ArrowDown', 'ArrowUp'].includes(e.key) && !e.defaultPrevented) {
    const li = e.target.closest('li'), next = e.key === 'ArrowDown' ? li.nextElementSibling : li.previousElementSibling;
    if (next) { e.preventDefault(); next.querySelector('button,a')?.focus(); }
  }
});
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
