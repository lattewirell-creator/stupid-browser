'use strict';
// The 2010s start screen: Windows 8-style groups of live tiles with each app's logo.
// Logos are simple white glyphs drawn here (no image files), sized by the tile.
const LOGOS = {
  facebook: '<svg viewBox="0 0 48 48"><path d="M27 46V27h6.4l1-7.4H27v-4.7c0-2.1.6-3.6 3.7-3.6h3.9V4.7c-.7-.1-3-.3-5.7-.3-5.7 0-9.5 3.4-9.5 9.8v5.4H13V27h6.4v19z"/></svg>',
  twitter: '<svg viewBox="0 0 24 24"><path d="M23.95 4.57a10 10 0 0 1-2.82.78 4.96 4.96 0 0 0 2.16-2.72 9.9 9.9 0 0 1-3.13 1.19 4.92 4.92 0 0 0-8.38 4.48A13.96 13.96 0 0 1 1.64 3.16a4.92 4.92 0 0 0 1.52 6.57 4.9 4.9 0 0 1-2.23-.62v.06a4.92 4.92 0 0 0 3.95 4.83 4.96 4.96 0 0 1-2.21.08 4.93 4.93 0 0 0 4.6 3.42A9.87 9.87 0 0 1 0 19.54a13.94 13.94 0 0 0 7.55 2.21c9.05 0 14-7.5 14-13.98 0-.21 0-.42-.02-.63A9.94 9.94 0 0 0 24 4.59z"/></svg>',
  instagram: '<svg viewBox="0 0 48 48"><g style="fill:none;stroke:#fff;stroke-width:3.6"><rect x="6" y="6" width="36" height="36" rx="10"/><circle cx="24" cy="24" r="8.5"/></g><circle cx="35" cy="13" r="2.2"/></svg>',
  pinterest: '<svg viewBox="0 0 48 48"><path d="M24 3a21 21 0 0 0-7.65 40.55c-.18-1.66-.34-4.2.07-6l2.47-10.5s-.63-1.26-.63-3.13c0-2.93 1.7-5.12 3.82-5.12 1.8 0 2.67 1.35 2.67 2.97 0 1.81-1.15 4.52-1.75 7.03-.5 2.1 1.05 3.82 3.13 3.82 3.76 0 6.65-3.96 6.65-9.68 0-5.06-3.64-8.6-8.83-8.6-6.02 0-9.55 4.51-9.55 9.18 0 1.82.7 3.77 1.57 4.83a.63.63 0 0 1 .15.6l-.59 2.38c-.1.39-.31.47-.71.28-2.64-1.23-4.3-5.1-4.3-8.2 0-6.68 4.86-12.82 14-12.82 7.35 0 13.06 5.24 13.06 12.23 0 7.3-4.6 13.17-11 13.17-2.14 0-4.16-1.11-4.85-2.43l-1.32 5.03c-.48 1.84-1.77 4.15-2.64 5.56A21 21 0 1 0 24 3z"/></svg>',
  tumblr: '<svg viewBox="0 0 48 48"><path d="M28.6 42c-6.2 0-10.4-3.2-10.4-10.6V20h-5.6v-6.2c6.2-1.6 8.8-6.9 9.1-11.8h6.5v10.2h7.5V20h-7.5v10.3c0 3.1 1.6 4.2 4.1 4.2h3.6V42z"/></svg>',
  youtube: '<svg viewBox="0 0 48 48"><rect x="3" y="9" width="42" height="30" rx="9" fill="#fff"/><path d="M20 17v14l12-7z" fill="#e52d27"/></svg>',
  spotify: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="#fff"/><g fill="none" stroke="#1db954" stroke-linecap="round"><path d="M12 18c8-2.6 17-2 24.5 2" stroke-width="3.6"/><path d="M13.5 25c6.6-2 14-1.4 20 1.8" stroke-width="3"/><path d="M15 31.5c5.2-1.4 10.6-1 15.4 1.3" stroke-width="2.6"/></g></svg>',
  netflix: '<svg viewBox="0 0 48 48"><path d="M13 4h7.4l7.2 21V4H35v40c-2.4-.3-4.9-.5-7.4-.6L20.4 23v20.3c-2.5.2-5 .5-7.4.9z" fill="#e50914"/></svg>',
  reddit: '<svg viewBox="0 0 48 48"><circle cx="37" cy="9" r="3.5"/><path d="M24 15.5l3-9.5 10 3" fill="none" stroke="#fff" stroke-width="2"/><circle cx="9.5" cy="23" r="4.5"/><circle cx="38.5" cy="23" r="4.5"/><ellipse cx="24" cy="29" rx="16" ry="12"/><circle cx="18" cy="27" r="2.8" fill="#ff4500"/><circle cx="30" cy="27" r="2.8" fill="#ff4500"/><path d="M17.5 34c4 2.6 9 2.6 13 0" fill="none" stroke="#ff4500" stroke-width="2" stroke-linecap="round"/></svg>',
  wikipedia: '<svg viewBox="0 0 48 48"><text x="24" y="34" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-size="30">W</text></svg>',
  kickstarter: '<svg viewBox="0 0 48 48"><path d="M19 13.5l7.5-8a7 7 0 0 1 10 9.8l-5.6 5.7 6.2 6.3a7.2 7.2 0 0 1-10.2 10.2L19 29.6v3.4a7 7 0 0 1-14 0V15a7 7 0 0 1 14-1.5z"/></svg>',
  googleplus: '<svg viewBox="0 0 48 48"><path d="M17 22v5.2h8.4c-.6 3.2-3.4 5.6-8.4 5.6a9.4 9.4 0 0 1 0-18.8c2.6 0 4.6.9 6 2.3l3.9-3.8A14.6 14.6 0 0 0 17 8.6a15.4 15.4 0 1 0 0 30.8c8.9 0 14.4-6.3 13.3-17.4zM42 21h-4.5v-4.5h-3.6V21h-4.5v3.6h4.5v4.5h3.6v-4.5H42z"/></svg>',
  weather: '<svg viewBox="0 0 48 48"><circle cx="20" cy="18" r="8"/><g stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M20 3v4M20 29v4M5 18h4M31 18h4M9.4 7.4l2.8 2.8M27.8 25.8l2.8 2.8M9.4 28.6l2.8-2.8M27.8 10.2l2.8-2.8"/></g><path d="M18 40h20a7 7 0 0 0 0-14 9 9 0 0 0-17 3 5.5 5.5 0 0 0-3 11z" fill="#fff" stroke="#1ba1e2" stroke-width="1.5"/></svg>',
  flickr: '<svg viewBox="0 0 48 48"><circle cx="14" cy="24" r="9" fill="#0063dc"/><circle cx="34" cy="24" r="9" fill="#ff0084"/></svg>'
};

// size: s = square, w = wide. live: lines a wide tile flips through, like Windows 8 live tiles.
const LABS_GROUPS = [
  { name: 'Social', tiles: [
    { name: 'Facebook', url: 'http://www.facebook.com/', logo: 'facebook', color: '#3b5998', size: 'w', live: ['Buddy and 3 friends like your photo', 'You have 2 new friend requests'] },
    { name: 'Twitter', url: 'http://twitter.com/', logo: 'twitter', color: '#55acee', size: 's' },
    { name: 'Instagram', url: 'http://instagram.com/', logo: 'instagram', color: '#3f729b', size: 's' },
    { name: 'Pinterest', url: 'http://pinterest.com/', logo: 'pinterest', color: '#cb2027', size: 's' },
    { name: 'Tumblr', url: 'http://www.tumblr.com/', logo: 'tumblr', color: '#35465c', size: 's' },
    { name: 'Google+', url: 'http://plus.google.com/', logo: 'googleplus', color: '#dd4b39', size: 'w', live: ['Buddy added you to a circle', 'Hangout with 4 friends now'] }
  ] },
  { name: 'Watch & listen', tiles: [
    { name: 'YouTube', url: 'http://www.youtube.com/', logo: 'youtube', color: '#e52d27', size: 'w', live: ['Gangnam Style: 1,000,000,000 views', 'Trending: Charlie bit my finger'] },
    { name: 'Spotify', url: 'http://www.spotify.com/', logo: 'spotify', color: '#1db954', size: 's' },
    { name: 'Netflix', url: 'http://www.netflix.com/', logo: 'netflix', color: '#141414', size: 's' },
    { name: 'Flickr', url: 'http://www.flickr.com/', logo: 'flickr', color: '#f3f3f3', size: 's', dark: true }
  ] },
  { name: 'Discover', tiles: [
    { name: 'Weather', url: 'http://www.weather.com/', logo: 'weather', color: '#1ba1e2', size: 'w', live: ['Stockholm  21°  Sunny', 'Tomorrow  18°  Clouds'] },
    { name: 'Reddit', url: 'http://www.reddit.com/', logo: 'reddit', color: '#ff4500', size: 's' },
    { name: 'Wikipedia', url: 'http://www.wikipedia.org/', logo: 'wikipedia', color: '#5a5a5a', size: 's' },
    { name: 'Kickstarter', url: 'http://www.kickstarter.com/', logo: 'kickstarter', color: '#2bde73', size: 'w', live: ['Pebble watch: $10,266,845 pledged', 'Ouya console: fully funded!'] }
  ] }
];

function renderLabsStart(box, href) {
  let n = 0;
  for (const group of LABS_GROUPS) {
    const g = document.createElement('div');
    g.className = 'w8-group';
    const h = document.createElement('h2');
    h.textContent = group.name;
    const grid = document.createElement('div');
    grid.className = 'w8-grid';
    for (const t of group.tiles) {
      const a = document.createElement('a');
      a.href = href(t.url);
      a.className = `w8-tile ${t.size}${t.live ? ' live' : ''}${t.dark ? ' dark' : ''}`;
      a.style.background = t.color;
      a.style.animationDelay = `${n * 35}ms`;
      a.title = t.name;
      const face = document.createElement('span');
      face.className = 'face';
      face.innerHTML = `<span class="logo">${LOGOS[t.logo]}</span>`;
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = t.name;
      face.appendChild(label);
      a.appendChild(face);
      if (t.live) {
        // Stagger the flips so the screen feels alive without everything moving at once.
        a.style.setProperty('--flip-delay', `${2 + (n % 4) * 1.6}s`);
        const back = document.createElement('span');
        back.className = 'face back';
        for (const line of t.live) {
          const p = document.createElement('span');
          p.className = 'news';
          p.textContent = line;
          back.appendChild(p);
        }
        const mini = document.createElement('span');
        mini.className = 'mini';
        mini.innerHTML = LOGOS[t.logo];
        back.appendChild(mini);
        a.appendChild(back);
      }
      grid.appendChild(a);
      n++;
    }
    g.append(h, grid);
    box.appendChild(g);
  }
}
