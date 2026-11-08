// Build the root Pages release from a known source HEAD and verify every byte
// that can be published. Never reads .env files or uploads anything.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const base = resolve(root, '.pages-publish');
export const build = join(base, 'story-production-build');
export const manifestFile = join(base, 'story-production-manifest.json');
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const inventoryHash = files => digest(JSON.stringify(files));

export function git(args, cwd = root) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) throw Error(r.stderr?.trim() || r.error?.message || 'Git command failed');
  return r.stdout.trim();
}
function isDirectory(path) {
  const stat = lstatSync(path);
  return stat.isDirectory() && !stat.isSymbolicLink();
}
function safePart(part) { return /^[a-z0-9][a-z0-9_.-]*$/i.test(part) && !part.endsWith('.'); }
function safeOut(name) {
  return name === 'CNAME' || /^(?:index\.html|404\.html|favicon\.svg|robots\.txt)$/.test(name)
    || /^(?:assets|textures|credits)\/.+\.(?:css|m?js|json|glb|gz|svg|png|jpe?g|webp|avif|ico|mp3|ogg|opus|wav|webm|mp4|woff2?|md|txt|wasm)$/i.test(name);
}
export function inventory(dir) {
  if (!isDirectory(dir)) throw Error('Expected real package directory');
  const list = [];
  function walk(folder) {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      if (!safePart(item.name) || item.isSymbolicLink()) throw Error('Unsafe build path: ' + item.name);
      const path = join(folder, item.name);
      if (item.isDirectory()) { walk(path); continue; }
      const name = relative(dir, path).split(sep).join('/');
      if (!item.isFile() || !safeOut(name)) throw Error('Unexpected build file: ' + name);
      const stat = lstatSync(path);
      if (!stat.size || stat.size >= 100 * 1024 * 1024) throw Error('Empty file or over GitHub file limit: ' + name);
      list.push({ path: name, bytes: stat.size, sha256: digest(readFileSync(path)) });
    }
  }
  walk(dir);
  return list.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function packageBuild() {
  const options = process.argv.slice(2);
  if (options.some(arg => arg !== '--candidate')) throw Error('Usage: node scripts/package-story-production.mjs [--candidate]');
  const candidate = options.includes('--candidate');
  const source = git(['rev-parse', 'HEAD']);
  const status = () => git(['status', '--porcelain', '--untracked-files=all']);
  if (!candidate && status()) throw Error('Commit the source before creating a publishable package; use --candidate for local QA');

  mkdirSync(base, { recursive: true });
  if (!isDirectory(base)) throw Error('Expected a real .pages-publish directory');
  // A unique output dir prevents stale Vite files even when Vite disables emptyOutDir.
  const staged = mkdtempSync(join(base, 'root-package-'));
  const vite = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build',
    '--mode', 'story-production', '--outDir', staged], { cwd: root, stdio: 'inherit' });
  if (vite.status !== 0) throw Error(vite.error?.message || 'Production Vite build failed');

  const index = readFileSync(join(staged, 'index.html'), 'utf8');
  const entry = /<script[^>]*\bsrc="\.\/(assets\/index-[a-z0-9_-]+\.js)"/i.exec(index)?.[1];
  if (!entry || !existsSync(join(staged, entry))) throw Error('Production HTML has no relative Vite entry');
  const scripts = readdirSync(join(staged, 'assets')).filter(name => name.endsWith('.js'))
    .map(name => readFileSync(join(staged, 'assets', name), 'utf8')).join('\n');
  for (const value of ['assets/story-final/', 'assets/story-intro/']) {
    if (!scripts.includes(value)) throw Error('Wrong Vite build mode; expected JS to reference ' + value);
  }
  if (/outputs\/(?:story-intro|quality-overhaul)\/|__storyHomeTest/.test(scripts)) throw Error('Debug tooling or local export paths leaked into production');
  if (readFileSync(join(staged, 'CNAME'), 'utf8').trim() !== '100gate.online') throw Error('Production CNAME changed');

  const provenance = name => JSON.parse(readFileSync(join(root, 'art/provenance', name), 'utf8'));
  const opening = provenance('STORY-OPENING.json');
  const quality = provenance('STORY-QUALITY-OVERHAUL.json');
  const final = provenance('STORY-FINAL-CINEMATIC.json');
  const expected = new Set([
    'assets/story-intro/audio/night-city-223093.mp3', 'assets/story-intro/street/story-street.glb',
    'assets/story-intro/grocery/story-grocery-bag.glb', 'assets/story-intro/hero/story-hero-walk.glb',
    'assets/story-final/home/story-home.glb', 'assets/story-final/gait/story-hero-walk-mocap.glb',
    'assets/story-final/vehicle/story-sedan.glb', 'assets/story-final/stop/story-hero-stops.json',
    'assets/story-final/egress/egress-L.glb', 'assets/story-final/egress/egress-R.glb',
    'assets/story-final/sleeves/story-upright-escape.glb',
    'assets/story-final/dialogue/story-hero-home-face.glb', 'assets/story-final/dialogue/story-partner-home-face.glb',
  ]);
  const items = [];
  function copy(entry, sourceName, path) {
    if (!expected.delete(path)) throw Error('Unexpected or duplicate cinematic asset: ' + path);
    const input = resolve(root, sourceName);
    if (!input.startsWith(root) || !lstatSync(input).isFile()) throw Error('Expected a regular local asset: ' + sourceName);
    const bytes = readFileSync(input);
    if (digest(bytes) !== entry.sha256 || (entry.bytes && bytes.length !== entry.bytes)) {
      throw Error('Verified asset differs from provenance: ' + sourceName);
    }
    const target = join(staged, path);
    if (existsSync(target)) throw Error('Public asset collides with a packaged cinematic asset: ' + path);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, bytes);
    items.push({ path, sha256: entry.sha256, bytes: bytes.length });
  }
  for (const a of opening.assets) {
    const name = a.path.replace(/^outputs\/story-intro\//, '');
    const path = 'assets/story-intro/' + name;
    if (expected.has(path)) copy(a, 'release/story-assets/' + name, path);
  }
  for (const a of quality.assets) {
    const name = a.path.replace(/^outputs\/quality-overhaul\//, '');
    copy(a, a.path, 'assets/story-final/' + name);
  }
  if (final.assetRoot !== 'outputs/quality-overhaul') throw Error('Unexpected final-asset provenance root');
  for (const a of final.assets) copy(a, final.assetRoot + '/' + a.path, 'assets/story-final/' + a.path);
  if (expected.size) throw Error('Provenance omitted required assets: ' + [...expected].join(', '));

  const credits = join(staged, 'credits');
  mkdirSync(credits, { recursive: true });
  for (const name of ['STORY-OPENING.json', 'STORY-QUALITY-OVERHAUL.json', 'STORY-FINAL-CINEMATIC.json',
    'STORY-CITY-AUDIO.json', 'MPFB-SOURCES.json', 'MAKEHUMAN-LICENSE.md', 'MPFB-ASSETS-CC0.txt', 'MPFB-LICENSE.md']) {
    writeFileSync(join(credits, name), readFileSync(join(root, 'art/provenance', name)));
  }
  const files = inventory(staged);
  if (git(['rev-parse', 'HEAD']) !== source || (!candidate && status())) throw Error('Source changed during packaging');
  const buildSha256 = inventoryHash(files);
  // Directory renames can fail on the mounted Windows workspace. Copy the
  // verified tree to its stable QA path and prune only previous owned files.
  mkdirSync(build, { recursive: true });
  const oldFiles = inventory(build);
  const owned = new Map(existsSync(manifestFile)
    ? JSON.parse(readFileSync(manifestFile, 'utf8')).files.map(f => [f.path, f.sha256]) : []);
  const current = new Set(files.map(f => f.path));
  const stale = oldFiles.filter(f => !current.has(f.path));
  for (const f of stale) {
    if (owned.get(f.path) !== f.sha256) throw Error('Unowned stale package file; move aside after inspection: ' + f.path);
  }
  for (const f of files) {
    const target = join(build, f.path);
    mkdirSync(resolve(target, '..'), { recursive: true });
    copyFileSync(join(staged, f.path), target);
  }
  for (const f of stale) unlinkSync(join(build, f.path));
  if (inventoryHash(inventory(build)) !== buildSha256) throw Error('Stable package bytes differ from staged package');
  writeFileSync(manifestFile, JSON.stringify({
    kind: 'story-production', version: 1, source, candidate, entry, buildSha256, files, cinematic: items,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ source, candidate, build, entry, buildSha256, files: files.length, cinematic: items.length }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) packageBuild();
