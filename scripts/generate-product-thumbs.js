const fs = require('fs');
const path = require('path');
const helpers = require('../api/helpers');

const baseDir = path.join(__dirname, '..', 'static', 'uploads', 'products');
const width = Number(process.argv[2]) || 480;
const quality = Number(process.argv[3]) || 70;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  if (!fs.existsSync(baseDir)) {
    console.log('No products uploads dir:', baseDir);
    return;
  }

  const files = walk(baseDir)
    .filter((p) => p.toLowerCase().endsWith('.webp'))
    .filter((p) => !p.toLowerCase().endsWith('-thumb.webp'));

  let ok = 0;
  for (const file of files) {
    const res = await helpers.ensureThumbVariant(file, { width, quality });
    if (res) ok += 1;
  }

  console.log(`Generated ${ok} thumbnails (${width}px) in ${baseDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
