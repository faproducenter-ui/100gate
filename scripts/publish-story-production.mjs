// Prepare or publish the checked root package to the existing Pages site.
// Default is dry-run. No force, no deletions, no changes to story-preview.
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, base, build, manifestFile, git, inventory, inventoryHash } from './package-story-production.mjs';

const args = process.argv.slice(2);
if (args.some(a => a !== '--apply')) throw Error('Usage: node scripts/publish-story-production.mjs [--apply]');
const apply = args.includes('--apply');
const origin = git(['remote', 'get-url', 'origin']);
if (origin !== 'https://github.com/faproducenter-ui/100gate.git' ||
    git(['remote', 'get-url', '--push', 'origin']) !== origin) throw Error('Unexpected Pages repository');
const source = git(['rev-parse', 'HEAD']);
const assertClean = () => {
  if (git(['rev-parse', 'HEAD']) !== source || git(['status', '--porcelain', '--untracked-files=all'])) {
    throw Error('Source changed or is not clean; commit and package first');
  }
};
assertClean();
if (!lstatSync(base).isDirectory() || lstatSync(base).isSymbolicLink()) throw Error('Unexpected staging root');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
if (manifest.version !== 1 || manifest.kind !== 'story-production' || manifest.candidate || manifest.source !== source) {
  throw Error('Package does not belong to this committed HEAD. Run package-story-production.mjs without --candidate');
}
const files = inventory(build);
if (inventoryHash(files) !== manifest.buildSha256 || JSON.stringify(files) !== JSON.stringify(manifest.files)) {
  throw Error('Packaged files changed after build; refusing publication');
}
if (!files.some(f => f.path === manifest.entry) || !/^assets\/index-[a-z0-9_-]+\.js$/i.test(manifest.entry)) {
  throw Error('Unexpected production entry');
}
function remoteHash(branch) {
  const ref = 'refs/heads/' + branch;
  const row = git(['ls-remote', '--exit-code', '--heads', 'origin', ref]);
  const [sha, name] = row.split(/\s+/);
  if (name !== ref || !/^[0-9a-f]{40}$/.test(sha)) throw Error('Unexpected remote head: ' + branch);
  return sha;
}
if (apply && remoteHash('main') !== source) throw Error('Push this exact source to origin/main without force before publishing');

const stage = mkdtempSync(join(base, 'production-root-stage-'));
const run = a => git(a, stage);
run(['init', '--initial-branch=gh-pages']);
run(['remote', 'add', 'origin', origin]);
run(['fetch', '--depth=1', 'origin', 'gh-pages']);
run(['checkout', '-B', 'gh-pages', 'FETCH_HEAD']);
const previous = run(['rev-parse', 'HEAD']);
const preview = run(['rev-parse', previous + ':story-preview']);
const cname = readFileSync(join(stage, 'CNAME'), 'utf8');
if (cname.trim() !== '100gate.online' || !lstatSync(join(stage, '.nojekyll')).isFile()) {
  throw Error('Existing Pages root is not the known custom-domain setup');
}
const releasePath = join(stage, 'release.json');
if (existsSync(releasePath)) {
  const prior = JSON.parse(readFileSync(releasePath, 'utf8'));
  if (prior.kind !== 'story-production') throw Error('Do not overwrite an unrelated root release marker');
  if (prior.source === source) throw Error('This source is already present at the Pages root');
}
function guardTarget(path, folder) {
  if (existsSync(path)) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (folder ? !stat.isDirectory() : !stat.isFile())) throw Error('Unexpected Pages path type: ' + path);
  } else if (folder) mkdirSync(path);
}

// Overlay exactly the prepared files; don't purge old hashes because already
// loaded clients may still request them. Unrelated root entries remain intact.
const allowed = new Set(['release.json']);
for (const { path } of files) {
  if (path === 'CNAME') continue;
  let target = stage;
  const parts = path.split('/');
  for (const [i, part] of parts.entries()) {
    target = join(target, part);
    guardTarget(target, i < parts.length - 1);
  }
  copyFileSync(join(build, ...parts), target);
  allowed.add(path);
}
const release = { kind: 'story-production', source, previousPagesCommit: previous,
  buildSha256: manifest.buildSha256, entry: manifest.entry };
guardTarget(releasePath, false);
writeFileSync(releasePath, JSON.stringify(release, null, 2) + '\n');
run(['add', '-A']);
const paths = run(['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
if (!paths.length || paths.some(path => !allowed.has(path))) throw Error('Pages diff escaped the allowlist');
const tree = run(['write-tree']);
for (const path of ['CNAME', '.nojekyll', 'story-preview']) {
  const expected = path === 'story-preview' ? preview : run(['rev-parse', previous + ':' + path]);
  if (run(['rev-parse', tree + ':' + path]) !== expected) throw Error('Protected Pages entry changed: ' + path);
}
const result = { ...release, filesChanged: paths.length, stage, dryRun: !apply };
if (apply) {
  assertClean();
  if (remoteHash('main') !== source || remoteHash('gh-pages') !== previous) throw Error('Remote refs changed while staging; rebuild the release plan');
  run(['config', 'user.name', git(['config', 'user.name'], root)]);
  run(['config', 'user.email', git(['config', 'user.email'], root)]);
  run(['commit', '-m', 'Publish 100gate production from ' + source.slice(0, 7)]);
  const commit = run(['rev-parse', 'HEAD']);
  if (run(['rev-parse', commit + '^']) !== previous) throw Error('Deployment is not a direct fast-forward');
  run(['push', 'origin', 'HEAD:refs/heads/gh-pages']);
  result.pagesCommit = commit;
}
console.log(JSON.stringify(result));
