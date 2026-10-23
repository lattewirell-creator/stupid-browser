'use strict';
/* Default rows. An app tile tries each Samsung app ID in turn (they differ between TV generations and
   regions); when none of them is installed it opens the service's website in the TV's own browser instead.
   The IDs come from community lists, not Samsung, so the website fallback is what keeps every tile working. */
var DEFAULT_ROWS = [
  {
    id: 'watch', title: 'Watch', tiles: [
      { name: 'YouTube', color: '#E62117', apps: ['111299001912'], url: 'https://www.youtube.com' },
      { name: 'Netflix', color: '#141414', ink: '#E50914', apps: ['3201907018807', '11101200001'], url: 'https://www.netflix.com' },
      { name: 'SVT Play', color: '#1F8A4C', apps: ['3201608010191'], url: 'https://www.svtplay.se' },
      { name: 'Disney+', color: '#0B1B4D', apps: ['3201901017640'], url: 'https://www.disneyplus.com' },
      { name: 'Prime Video', color: '#0F79AF', apps: ['3201910019365', '3201512006785'], url: 'https://www.primevideo.com' },
      { name: 'Max', color: '#002BE7', apps: ['3202301029760', '3201601007230'], url: 'https://www.max.com' },
      { name: 'Apple TV', color: '#1D1D1F', apps: ['3201807016597'], url: 'https://tv.apple.com' },
      { name: 'Twitch', color: '#6441A5', apps: ['3202203026841'], url: 'https://www.twitch.tv' }
    ]
  },
  {
    id: 'listen', title: 'Listen', tiles: [
      { name: 'Spotify', color: '#121212', ink: '#1ED760', apps: ['3201606009684'], url: 'https://open.spotify.com' },
      { name: 'YouTube Music', color: '#212121', ink: '#FF0033', apps: [], url: 'https://music.youtube.com' },
      { name: 'Sveriges Radio', color: '#0B6CB4', apps: [], url: 'https://sverigesradio.se' }
    ]
  },
  {
    id: 'sites', title: 'Websites', tiles: [
      { name: 'Google', url: 'https://www.google.com' },
      { name: 'Wikipedia', url: 'https://www.wikipedia.org' },
      { name: 'SVT Nyheter', url: 'https://www.svt.se' },
      { name: 'Claude', url: 'https://claude.ai' }
    ]
  }
];
var BROWSER_APP = 'org.tizen.browser';
var ACCENTS = { clay: '#D97757', sand: '#C9963F', sage: '#6F9161', sky: '#5B87B5', plum: '#9A6390', rose: '#C8606F' };
