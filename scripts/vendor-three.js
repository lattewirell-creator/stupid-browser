// Copies the parts of three.js the 3D buddy uses into src/vendor (the app loads only local scripts).
// Run after upgrading three: npm run vendor:three
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'src', 'vendor');
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/three/build/three.module.min.js'), path.join(out, 'three.module.min.js'));
for (const f of ['geometries/RoundedBoxGeometry.js', 'environments/RoomEnvironment.js']) {
  const src = fs.readFileSync(path.join(root, 'node_modules/three/examples/jsm', f), 'utf8').replace(/from\s+['"]three['"]/g, "from './three.module.min.js'");
  fs.writeFileSync(path.join(out, path.basename(f)), src);
}
fs.writeFileSync(path.join(out, 'THREE-LICENSE'), fs.readFileSync(path.join(root, 'node_modules/three/LICENSE')));
console.log('three.js', JSON.parse(fs.readFileSync(path.join(root, 'node_modules/three/package.json'), 'utf8')).version, '→ src/vendor');
