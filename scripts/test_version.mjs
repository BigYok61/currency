import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const versionJs = readFileSync(new URL('../version.js', import.meta.url), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(`${versionJs}\nthis.APP_VERSION = APP_VERSION;\nthis.label = appVersionLabel();`, ctx);
assert.equal(ctx.APP_VERSION, '2.0.0');
assert.equal(ctx.label, 'Version 2.0');

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8');
const prepare = readFileSync(new URL('../cloudflare/prepare-assets.mjs', import.meta.url), 'utf8');
for (const name of ['style.css', 'version.js', 'app.js']) {
  assert.match(html, new RegExp(`${name}\\?v=${ctx.APP_VERSION}`));
}
assert.match(sw, /importScripts\('version\.js'\)/);
assert.match(sw, /const CACHE = 'wu-v' \+ APP_VERSION/);
assert.match(sw, /'version\.js'/);
assert.equal(JSON.parse(manifest).version, ctx.APP_VERSION);
assert.match(prepare, /'version\.js'/);
console.log('version 2.0.0 ok');
