'use strict';
/* Ask Buddy (stupid://ask/?q=…): Buddy searches the web, reads the best pages and writes an answer with sources. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let sources = [];
  /** Light Markdown, with [1] citations turned into links to the sources. */
  function md(text) {
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/\[(\d{1,2})\]/g, (m, n) => { const s = sources[n - 1]; return s ? `<a class="cite" href="${esc(s.url)}" title="${esc(s.title)}">${n}</a>` : m; });
    const out = []; let list = null;
    for (const line of String(text || '').split('\n')) {
      const h = /^#{1,3}\s+(.*)/.exec(line); if (h) { list = null; out.push('<p><b>' + inline(h[1]) + '</b></p>'); continue; }
      const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)/.exec(line);
      if (m) { if (!list) { list = []; out.push(list); } list.push(m[1]); continue; }
      list = null; if (line.trim()) out.push('<p>' + inline(line) + '</p>');
    }
    return out.map((x) => (Array.isArray(x) ? '<ul>' + x.map((i) => '<li>' + inline(i) + '</li>').join('') + '</ul>' : x)).join('');
  }
  const ERR = {
    nokey: 'Buddy needs an AI to answer. Pick one in <a href="stupid://settings/#buddy">Settings → Buddy</a> (Ollama is free and runs on this computer).',
    badkey: 'The AI key didn’t work. Check it in <a href="stupid://settings/#buddy">Settings → Buddy</a>.',
    ratelimit: 'The AI says “too many questions” for now. Try again in a little while.',
    offline: 'Buddy couldn’t reach the web or the AI. Are you online?',
    noresults: 'Buddy didn’t find anything on the web for that. Try other words?',
  };
  async function ask(q) {
    q = q.trim(); if (!q) return;
    document.title = q + ' · Ask Buddy';
    history.replaceState(null, '', '?q=' + encodeURIComponent(q));
    for (const id of ['answer', 'sources', 'error']) $(id).classList.add('hidden');
    $('status').classList.remove('hidden'); $('step').textContent = 'Searching the web';
    const r = await window.stupid.invoke('buddy:search', q).catch((e) => ({ error: 'api', detail: e.message }));
    $('status').classList.add('hidden');
    if (r.error) { $('error').innerHTML = ERR[r.error] || ('Something went wrong' + (r.detail ? ': ' + esc(r.detail) : '.')); $('error').classList.remove('hidden'); return; }
    sources = r.sources || [];
    $('answer').innerHTML = '<h1>' + esc(q) + '</h1>' + md(r.answer);
    $('answer').classList.remove('hidden');
    const list = $('srcList'); list.replaceChildren();
    sources.forEach((s, i) => {
      const a = document.createElement('a'); a.className = 'src'; a.href = s.url;
      let host = ''; try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch {}
      a.innerHTML = `<span class="site"><img src="https://icons.duckduckgo.com/ip3/${esc(host)}.ico" alt="">${i + 1} · ${esc(host)}</span><b>${esc(s.title)}</b>`;
      a.querySelector('img').onerror = function () { this.remove(); };
      list.appendChild(a);
    });
    $('sources').classList.toggle('hidden', !sources.length);
  }
  window.stupid.on('ask:progress', (step) => { $('step').textContent = step; });
  $('form').addEventListener('submit', (e) => { e.preventDefault(); ask($('q').value); });
  const q0 = new URLSearchParams(location.search).get('q') || '';
  $('q').value = q0;
  if (q0) ask(q0); else $('q').focus();
})();
