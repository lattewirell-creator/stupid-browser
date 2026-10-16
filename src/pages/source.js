'use strict';
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function highlight(line) {
  // single pass so inserted markup is never re-matched
  return esc(line).replace(/(&lt;!--.*?--&gt;)|(&lt;\/?)([a-zA-Z][\w:-]*)|(\s)([\w:-]+)(=)/g, (m, cm, lt, tag, sp, attr, eq) => {
    if (cm) return '<span class="cm">' + cm + '</span>';
    if (lt) return lt + '<span class="tg">' + tag + '</span>';
    return sp + '<span class="at">' + attr + '</span>' + eq;
  });
}
window.__setSource = (url, html) => {
  document.title = 'Source: ' + url;
  $('srcUrl').textContent = url;
  const pre = $('src'); pre.innerHTML = '';
  const lines = String(html).split('\n');
  const frag = document.createDocumentFragment();
  for (const l of lines.slice(0, 50000)) { const s = el('span', 'ln'); s.innerHTML = highlight(l); frag.appendChild(s); }
  pre.appendChild(frag);
};
$('wrap').onchange = (e) => $('src').classList.toggle('wrap', e.target.checked);
