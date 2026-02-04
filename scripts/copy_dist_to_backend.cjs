const fs = require('fs');
const path = require('path');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else if (stat.isFile()) {
    fs.copyFileSync(src, dest);
  }
}

const repoRoot = path.resolve(__dirname, '..');
const distSrc = path.join(repoRoot, 'dist');
const backendDist = path.join(repoRoot, 'backend', 'dist');

if (!fs.existsSync(distSrc)) {
  console.error('Frontend dist not found. Run `npm run build` first.');
  process.exit(1);
}

try {
  if (fs.existsSync(backendDist)) {
    fs.rmSync(backendDist, { recursive: true, force: true });
  }
  copyRecursive(distSrc, backendDist);
  console.log('Copied frontend dist to backend/dist');
} catch (err) {
  console.error('Error copying dist to backend:', err);
  process.exit(2);
}
