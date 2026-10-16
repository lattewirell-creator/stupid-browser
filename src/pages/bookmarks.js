'use strict';
let all = [], folder = null, editing = null, dragId = null;
const FOLDER_ICON = '<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>';
const uid = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const save = () => call('bookmarks:set', all);
const childrenOf = (pid) => all.filter((b) => (b.parentId || null) === pid);
const descendants = (id) => { const out = new Set([id]); let grew = true; while (grew) { grew = false; for (const b of all) if (b.parentId && out.has(b.parentId) && !out.has(b.id)) { out.add(b.id); grew = true; } } return out; };
function folderPath(id) { const f = all.find((b) => b.id === id); return f ? (f.parentId ? folderPath(f.parentId) + ' / ' : '') + f.title : 'Bookmarks bar'; }

function renderTree() {
  const box = $('folders'); box.innerHTML = '';
  const node = (id, title, depth) => {
    const f = el('div', 'folder' + (folder === id ? ' on' : ''));
    f.style.paddingLeft = 12 + depth * 16 + 'px';
    f.appendChild(icon(FOLDER_ICON)); f.appendChild(el('span', 'ellipsis', title));
    f.onclick = () => { folder = id; editing = null; render(); };
    f.ondragover = (e) => { if (dragId && !descendants(dragId).has(id)) { e.preventDefault(); f.classList.add('drop'); } };
    f.ondragleave = () => f.classList.remove('drop');
    f.ondrop = (e) => { e.preventDefault(); f.classList.remove('drop'); const b = all.find((x) => x.id === dragId); if (b && !descendants(b.id).has(id)) { b.parentId = id; save(); render(); } };
    box.appendChild(f);
    for (const c of childrenOf(id).filter((b) => b.type === 'folder')) node(c.id, c.title, depth + 1);
  };
  node(null, 'Bookmarks bar', 0);
}
function render() {
  renderTree();
  const q = $('q').value.trim().toLowerCase();
  $('folderTitle').textContent = q ? 'Search results' : folderPath(folder);
  $('renameFolder').classList.toggle('hidden', !folder || !!q);
  $('deleteFolder').classList.toggle('hidden', !folder || !!q);
  const items = q ? all.filter((b) => (b.title || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q)) : childrenOf(folder);
  const list = $('list'); list.innerHTML = '';
  if (!items.length) { list.appendChild(el('div', 'empty', q ? 'No bookmarks match.' : 'This folder is empty. Add a bookmark above or drag one here.')); return; }
  const card = el('div', 'card'); list.appendChild(card);
  for (const b of items) {
    const r = el('div', 'bm-item'); r.draggable = editing !== b.id;
    r.ondragstart = () => { dragId = b.id; r.classList.add('dragging'); };
    r.ondragend = () => { dragId = null; r.classList.remove('dragging'); };
    r.ondragover = (e) => { if (dragId && dragId !== b.id && !q) e.preventDefault(); };
    r.ondrop = (e) => { e.preventDefault(); const src = all.find((x) => x.id === dragId); if (!src || src === b) return; if (b.type === 'folder' && !descendants(src.id).has(b.id)) { src.parentId = b.id; } else { all.splice(all.indexOf(src), 1); src.parentId = b.parentId || null; all.splice(all.indexOf(b), 0, src); } save(); render(); };
    if (b.type === 'folder') r.appendChild(icon(FOLDER_ICON)); else r.appendChild(favImg(b.url));
    if (editing === b.id) {
      const ed = el('form', 'edit');
      const t = el('input', 'input'); t.value = b.title || ''; t.placeholder = 'Name';
      ed.appendChild(t);
      let u = null; if (b.type !== 'folder') { u = el('input', 'input grow'); u.value = b.url; ed.appendChild(u); }
      const mv = el('select', 'input');
      const opt = (v, txt) => { const o = el('option', null, txt); o.value = v; mv.appendChild(o); };
      opt('', 'Bookmarks bar');
      const bad = descendants(b.id);
      for (const f of all.filter((x) => x.type === 'folder' && !bad.has(x.id))) opt(f.id, folderPath(f.id));
      mv.value = b.parentId || '';
      ed.appendChild(mv);
      const ok = el('button', 'btn small primary', 'Save'); ed.appendChild(ok);
      ed.onsubmit = (e) => {
        e.preventDefault();
        b.title = t.value.trim() || b.title;
        if (u) { let v = u.value.trim(); if (!/^(https?|stupid):\/\//.test(v)) v = 'https://' + v; try { new URL(v); b.url = v; } catch { toast('That URL does not look right'); return; } }
        b.parentId = mv.value || null; editing = null; save(); render();
      };
      r.appendChild(ed);
      setTimeout(() => t.focus(), 0);
    } else {
      const tt = el('div', 't');
      if (b.type === 'folder') { const a = el('a', null, b.title); a.href = '#'; a.onclick = (e) => { e.preventDefault(); folder = b.id; $('q').value = ''; render(); }; tt.append(a, el('span', 'h', `${childrenOf(b.id).length} items`)); }
      else { const a = el('a', null, b.title || b.url); a.href = b.url; tt.append(a, el('span', 'h', b.url)); }
      r.appendChild(tt);
      const acts = el('div', 'acts');
      const e1 = el('button', 'btn small', 'Edit'); e1.onclick = () => { editing = b.id; render(); };
      const x = el('button', 'icon-btn'); x.title = 'Delete'; x.appendChild(icon(X_ICON));
      x.onclick = () => {
        if (b.type === 'folder' && childrenOf(b.id).length && !confirm(`Delete “${b.title}” and everything in it?`)) return;
        const gone = descendants(b.id); all = all.filter((y) => !gone.has(y.id)); save(); render();
      };
      acts.append(e1, x); r.appendChild(acts);
    }
    card.appendChild(r);
  }
}
$('addForm').onsubmit = (e) => {
  e.preventDefault();
  let u = $('addUrl').value.trim(); if (!u) { toast('Add a URL'); return; }
  if (!/^(https?|stupid):\/\//.test(u)) u = 'https://' + u;
  try { new URL(u); } catch { toast('That URL does not look right'); return; }
  all.push({ id: uid(), type: 'bookmark', title: $('addTitle').value.trim() || hostOf(u), url: u, parentId: folder, ts: Date.now() });
  $('addTitle').value = ''; $('addUrl').value = ''; save(); render();
};
// window.prompt() isn't available in Electron, so folders are named with the inline editor.
$('newFolder').onclick = () => { $('q').value = ''; const f = { id: uid(), type: 'folder', title: 'New folder', parentId: folder, ts: Date.now() }; all.push(f); save(); editing = f.id; render(); };
$('renameFolder').onclick = () => { const f = all.find((b) => b.id === folder); if (!f) return; folder = f.parentId || null; editing = f.id; render(); };
$('deleteFolder').onclick = () => { const f = all.find((b) => b.id === folder); if (!f) return; if (!confirm(`Delete “${f.title}” and everything in it?`)) return; const gone = descendants(f.id); all = all.filter((b) => !gone.has(b.id)); folder = f.parentId || null; save(); render(); };
$('q').oninput = render;
S.on('bookmarks:changed', (b) => { all = b; if (folder && !all.some((x) => x.id === folder)) folder = null; if (!editing) render(); });
call('bookmarks:get').then((b) => { all = b; render(); });
