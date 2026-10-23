# thestupidcompany.net

The Stupid Company's website: one static page in `site/` (no build step). `site/index.html` lists the apps; their
icons are in `site/img/`, and each card shows the app's latest version from GitHub Releases.

Deployed on Vercel: Project → Settings → Git → connect `lattewirell-creator/stupid-browser`, Production Branch
`company-site`, Root Directory `site`, Framework Preset "Other". Every push to this branch then goes live.
