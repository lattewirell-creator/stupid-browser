'use strict';
// Start page for every era. Links go through the Wayback Machine when time travel is on,
// so clicking "Yahoo" in the 90s lands on Yahoo as it looked that year.
const params = new URLSearchParams(location.search);
const era = params.get('era') || 'nineties';
const year = params.get('year') || '1997';
const travel = params.get('tt') === '1';
document.body.dataset.era = era;
document.title = { nineties: 'Welcome to Buddy Net!', explorer: 'buddy.com - Your Home on the Web', chrome: 'New Tab', labs: 'Start', ai: 'New tab' }[era] || 'Buddy Net';

const SITES = {
  nineties: [
    ['Yahoo!', 'http://www.yahoo.com/', 'The best directory on the Web'],
    ['Space Jam', 'http://www.spacejam.com/', 'Michael Jordan and the Looney Tunes'],
    ['GeoCities', 'http://www.geocities.com/', 'Free home pages for everyone'],
    ['Apple', 'http://www.apple.com/', 'Think different'],
    ['CNN Interactive', 'http://www.cnn.com/', 'News 24 hours a day'],
    ['AltaVista', 'http://www.altavista.com/', 'The fastest search on the Web'],
    ['NASA', 'http://www.nasa.gov/', 'Mars Pathfinder pictures!'],
    ['Amazon.com', 'http://www.amazon.com/', "Earth's biggest bookstore"]
  ],
  explorer: [
    ['Google', 'http://www.google.com/'], ['MSN', 'http://www.msn.com/'], ['eBay', 'http://www.ebay.com/'],
    ['Napster', 'http://www.napster.com/'], ['Ask Jeeves', 'http://www.ask.com/'], ['Neopets', 'http://www.neopets.com/'],
    ['Hotmail', 'http://www.hotmail.com/'], ['Homestar Runner', 'http://www.homestarrunner.com/']
  ],
  chrome: [
    ['YouTube', 'http://www.youtube.com/'], ['Facebook', 'http://www.facebook.com/'], ['MySpace', 'http://www.myspace.com/'],
    ['Digg', 'http://digg.com/'], ['Wikipedia', 'http://www.wikipedia.org/'], ['Flickr', 'http://www.flickr.com/'],
    ['Google', 'http://www.google.com/'], ['Twitter', 'http://twitter.com/'], ['Apple', 'http://www.apple.com/']
  ],
  labs: [
    ['Twitter', 'http://twitter.com/', '#55acee'], ['Instagram', 'http://instagram.com/', '#c13584'], ['Pinterest', 'http://pinterest.com/', '#cb2027'],
    ['Tumblr', 'http://www.tumblr.com/', '#35465c'], ['YouTube', 'http://www.youtube.com/', '#e52d27'], ['Reddit', 'http://www.reddit.com/', '#ff4500'],
    ['Facebook', 'http://www.facebook.com/', '#3b5998'], ['Google+', 'http://plus.google.com/', '#dd4b39'], ['Kickstarter', 'http://www.kickstarter.com/', '#2bde73']
  ],
  ai: [
    ['Wikipedia', 'https://www.wikipedia.org/'], ['YouTube', 'https://www.youtube.com/'], ['GitHub', 'https://github.com/'],
    ['Reddit', 'https://www.reddit.com/'], ['Hacker News', 'https://news.ycombinator.com/'], ['Claude', 'https://claude.ai/']
  ]
};
const href = (url) => (travel ? `https://web.archive.org/web/${year}0701if_/${url}` : url);
const el = (tag, attrs = {}, text = '') => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text) n.textContent = text;
  return n;
};

// Error page: shown when a page or snapshot can't be loaded, worded the way each era would.
const fail = params.get('fail');
if (fail) {
  const fromArchive = params.get('archive') === '1';
  const title = { nineties: 'Unable to connect', explorer: 'The page cannot be displayed', chrome: 'This webpage is not available', labs: 'Oops! This page went offline.', ai: "Buddy couldn't open that page" }[era];
  document.title = title;
  document.getElementById('fail-title').textContent = title;
  document.getElementById('fail-text').textContent = fromArchive
    ? `Buddy Net couldn't fetch ${fail} from the Wayback Machine for ${year} (${params.get('why') || 'no answer'}).`
    : `Buddy Net couldn't reach ${fail} (${params.get('why') || 'no answer'}).`;
  const tips = fromArchive
    ? ['Try another year with the arrows in the Time Machine.', 'Check that you are online. The Wayback Machine lives at web.archive.org.', 'Turn off "Time-travel pages" under the gear icon to see the site as it looks today.']
    : ['Check the address for typos.', 'Check your internet connection.'];
  for (const t of tips) document.getElementById('fail-tips').appendChild(Object.assign(document.createElement('li'), { textContent: t }));
  document.getElementById('fail').hidden = false;
  for (const sec of document.querySelectorAll('section')) sec.remove();
}

const box = document.querySelector(`[data-links="${era}"]`);
for (const [name, url, extra] of box ? SITES[era] || [] : []) {
  if (era === 'nineties') {
    const tr = el('tr');
    const a = el('a', { href: href(url) }, name);
    const td1 = el('td'); td1.appendChild(a);
    tr.append(td1, el('td', {}, extra));
    box.appendChild(tr);
  } else if (era === 'explorer') {
    const li = el('li'); li.appendChild(el('a', { href: href(url) }, name)); box.appendChild(li);
  } else if (era === 'chrome') {
    const a = el('a', { href: href(url), class: 'thumb' });
    a.append(el('span', { class: 'shot' }, name.slice(0, 1)), el('span', { class: 'cap' }, name));
    box.appendChild(a);
  } else if (era === 'labs') {
    const a = el('a', { href: href(url), class: 'tile', style: `background:${extra}` }, name);
    box.appendChild(a);
  } else {
    const a = el('a', { href: url, class: 'sc' });
    a.append(el('span', { class: 'ic' }, name.slice(0, 1)), el('span', {}, name));
    box.appendChild(a);
  }
}
for (const n of document.querySelectorAll('[data-year]')) n.textContent = year;
const counter = document.querySelector('[data-counter]');
if (counter) counter.textContent = String(4000 + Math.floor(Math.random() * 6000)).padStart(7, '0');

// Searches use DuckDuckGo's plain HTML page, which looks right at home in any decade.
for (const f of document.querySelectorAll(`section[data-era="${era}"] [data-search]`)) {
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = f.querySelector('input').value.trim();
    if (q) location.href = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
  });
}
// The AI start page hands questions to the Buddy sidebar through the URL hash.
const askForm = document.querySelector('[data-ask]');
if (askForm) {
  const send = (q) => { if (q) location.hash = 'ask=' + encodeURIComponent(q); };
  askForm.addEventListener('submit', (e) => { e.preventDefault(); send(askForm.querySelector('input').value.trim()); });
  for (const c of document.querySelectorAll('[data-chip]')) c.addEventListener('click', () => send(c.dataset.chip));
  if (era === 'ai') askForm.querySelector('input').focus();
}
