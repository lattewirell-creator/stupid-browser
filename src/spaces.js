'use strict';
/* Spaces: the switcher at the start of the tab strip. One dot per space (the current one shows its name); click to
   switch, the "+" to make a new one, right-click (or click the current one) to rename, recolour or delete.
   Uses renderer.js globals (spaces, curSpace, tabs, inSpace, activate_, newTab, closeTab, renderAll, scheduleSave,
   $, el, toast, showPopAt, hidePop, GROUP_COLORS). */
(function () {
  const strip = $('pinnedTabs').parentNode;
  const box = el('div', 'spaces'); box.id = 'spaceBtn';
  strip.insertBefore(box, $('pinnedTabs'));
  const colorOf = (sp) => GROUP_COLORS[sp.color] || GROUP_COLORS.clay;

  function render() {
    box.innerHTML = '';
    box.classList.toggle('hidden', !!(typeof info !== 'undefined' && info && info.incognito));
    for (const sp of spaces) {
      const on = sp.id === curSpace;
      const b = el('button', 'space-dot' + (on ? ' on' : ''));
      b.style.setProperty('--sc', colorOf(sp));
      if (on && spaces.length > 1) b.appendChild(el('span', 'space-name', sp.name || 'Space'));
      const count = tabs.filter((t) => !t.pinned && (t.space || 'home') === sp.id).length;
      b.title = `${sp.name || 'Space'} · ${count} tab${count === 1 ? '' : 's'}` + (on ? ' (click to edit)' : '');
      b.addEventListener('click', () => (on ? edit(sp, b) : switchSpace(sp.id)));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); edit(sp, b); });
      box.appendChild(b);
    }
    const add = el('button', 'space-add', '+'); add.title = 'New space (Work, School, Private…)';
    add.addEventListener('click', () => newSpace());
    box.appendChild(add);
  }
  window.renderSpaceBtn = render;

  function switchSpace(id) {
    if (id === curSpace || !spaces.some((x) => x.id === id)) return;
    curSpace = id;
    // Back to where you were in that space: its most recently used tab, or a fresh new tab in an empty space.
    const mine = tabs.filter((t) => !t.pinned && (t.space || 'home') === id).sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
    if (mine.length) activate_(mine[0].id); else newTab();
    render(); renderAll(); scheduleSave();
    const sp = spaces.find((x) => x.id === id);
    toast(`Space: ${sp.name || 'Space'}`);
  }
  window.switchSpace = switchSpace;

  function newSpace() {
    const used = new Set(spaces.map((x) => x.color));
    const color = Object.keys(GROUP_COLORS).find((k) => !used.has(k) && k !== 'ink') || 'sky';
    const sp = { id: 's' + Date.now().toString(36), name: ['Work', 'Private', 'School', 'Projects', 'Fun'].find((n) => !spaces.some((x) => x.name === n)) || 'Space', color };
    spaces.push(sp);
    switchSpace(sp.id);
    setTimeout(() => { const b = box.querySelector('.space-dot.on'); if (b) edit(sp, b); }, 60);
  }

  function edit(sp, anchor) {
    const r = anchor.getBoundingClientRect();
    const pop = $('popover'); pop.innerHTML = ''; pop.className = 'pop group-pop';
    const input = el('input', 'text-in'); input.placeholder = 'Name this space'; input.value = sp.name; input.maxLength = 40;
    input.addEventListener('input', () => { sp.name = input.value; render(); scheduleSave(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') hidePop(); });
    pop.appendChild(input);
    const sw = el('div', 'swatches');
    for (const [k, c] of Object.entries(GROUP_COLORS)) {
      const b = el('button', 'swatch' + (sp.color === k ? ' on' : '')); b.style.background = c; b.title = k;
      b.addEventListener('click', () => { sp.color = k; render(); scheduleSave(); [...sw.children].forEach((x) => x.classList.toggle('on', x === b)); });
      sw.appendChild(b);
    }
    pop.appendChild(sw);
    if (spaces.length > 1) {
      const del = el('button', 'menu-item', 'Delete space (its tabs move to another space)');
      del.addEventListener('click', () => { hidePop(); remove(sp); });
      pop.appendChild(del);
    }
    showPopAt(pop, r.left, r.bottom + 6);
    input.focus(); input.select();
  }

  function remove(sp) {
    if (spaces.length < 2) return;
    const to = spaces.find((x) => x.id !== sp.id);
    for (const t of tabs) if ((t.space || 'home') === sp.id) t.space = to.id;
    spaces = spaces.filter((x) => x !== sp);
    if (curSpace === sp.id) { curSpace = to.id; }
    render(); renderAll(); scheduleSave();
    toast(`Deleted “${sp.name || 'Space'}” — its tabs are in ${to.name || 'Space'}`);
  }

  // "Move to space" for a tab (used by the tab menu).
  window.moveTabToSpace = (tab, id) => {
    if (!tab || tab.pinned || !spaces.some((x) => x.id === id)) return;
    const wasActive = tab.id === activeId;
    tab.space = id;
    // A group or split view stays in one space: the moved tab leaves them.
    if (tab.groupId) { tab.groupId = null; normalizeOrder(); }
    if (split && split.includes(tab.id)) split = null;
    if (wasActive) {
      const here = tabs.filter((t) => inSpace(t) && t !== tab).sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
      if (here.length) activate_(here[0].id); else newTab();
    }
    render(); renderAll(); scheduleSave();
    const sp = spaces.find((x) => x.id === id); toast(`Moved to ${sp.name || 'Space'}`);
  };

  render();
})();
