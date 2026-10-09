// Kopiert die PWA in cloudflare/public, ohne data/ (das kommt aus D1).
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const pub = join(here, 'public');
rmSync(pub, { recursive: true, force: true });
mkdirSync(pub, { recursive: true });
for (const name of ['index.html', 'app.js', 'style.css', 'sw.js', 'manifest.webmanifest']) {
  cpSync(join(root, name), join(pub, name));
}
cpSync(join(root, 'icons'), join(pub, 'icons'), { recursive: true });
console.log('Assets nach cloudflare/public kopiert.');
