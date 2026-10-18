// Splits Shield's rules for the Mac app (run by mac/build.sh): the "hide everywhere" element-hiding lists move
// out of WebKit's content blocker (which applies them inside every frame, slowing busy pages) into one
// stylesheet the app adds to each tab's main page only, skipping the sites the lists' exceptions name.
// Usage: node split-adblock.js <rules.json in> <dir out>
'use strict';
const fs = require('fs');
const path = require('path');
const [src, out] = process.argv.slice(2);
const rules = JSON.parse(fs.readFileSync(src, 'utf8'));
const generic = (r) => r.action.type === 'css-display-none' && r.trigger['url-filter'] === '.*' && !r.trigger['if-domain'] && !r.trigger['unless-domain'];
const selectors = rules.filter(generic).map((r) => r.action.selector);
// "$generichide" exceptions: ignore-previous-rules on whole pages of these sites.
const skip = [...new Set(rules.filter((r) => r.action.type === 'ignore-previous-rules' && r.trigger['url-filter'] === '.*' && (r.trigger['resource-type'] || []).includes('document'))
  .flatMap((r) => r.trigger['if-domain'] || []).map((d) => d.replace(/^\*/, '')))];
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'rules.json'), JSON.stringify(rules.filter((r) => !generic(r))));
fs.writeFileSync(path.join(out, 'generic.json'), JSON.stringify({ css: selectors.map((s) => s + '{display:none!important}').join('\n'), skip }));
console.log(`shield: ${rules.length - selectors.length} WebKit rules, ${selectors.length} generic hiding lists moved to the main page, ${skip.length} sites skipped`);
