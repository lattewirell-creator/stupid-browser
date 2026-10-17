// electron-builder afterPack hook (macOS): give the whole .app a proper ad-hoc signature before the dmg/zip
// are made. Without it only the executables carry a linker signature, the bundle as a whole is unsigned, and
// macOS calls a downloaded copy "damaged and can't be opened". With it, macOS shows the normal
// "unidentified developer" prompt instead (right-click → Open, or Privacy & Security → Open Anyway).
// A Developer ID + notarization would remove that prompt too; this needs neither.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('/usr/bin/xattr', ['-cr', app]);   // codesign refuses files carrying Finder info / extended attributes
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', app], { stdio: 'inherit' });
  console.log('  • ad-hoc signed', path.basename(app));
};
