import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { safeOutputDirectory } from './profiles.mjs';

export const HUB_ORIGIN = 'https://colmapview.opsiclear.com';
export const HUB_FILES = ['index.html', 'entry/index.html', 'datasets/index.html', 'datasets/entry/index.html'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function validateHubManifest(value) {
  assert.equal(value.schemaVersion, 2);
  assert.match(value.version, /^\d+\.\d+\.\d+$/);
  assert.match(value.source, /^[a-f0-9]{40}$/);
  assert.equal(value.dirty, false, 'Only committed Hub builds can be published.');
  assert.equal(value.files?.length, HUB_FILES.length);
  assert.deepEqual(value.files.map(file => file.path).sort(), [...HUB_FILES].sort());
  for (const file of value.files) {
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.equal(file.artifact, `/hub/assets/github/${file.sha256}.html`);
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 100 && file.bytes <= 1024 * 1024);
  }
  return value;
}

export function sameHubFrontend(current, next) {
  const files = value => validateHubManifest(value).files.map(file => [file.path, file.sha256, file.bytes])
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(files(current)) === JSON.stringify(files(next));
}

async function bounded(response, max) {
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      assert.ok(size <= max, 'Hub export exceeds its size limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}

function validateHtml(bytes, file) {
  assert.equal(bytes.length, file.bytes);
  assert.equal(sha256(bytes), file.sha256, 'Hub HTML digest mismatch.');
  const html = bytes.toString('utf8');
  assert.ok(html.startsWith('<!doctype html>'));
  if (file.path.startsWith('datasets/')) {
    assert.ok(html.includes('data-hub-redirect="true"') && html.includes('href="/hub/"'));
    assert.ok(!html.includes('data-hub-public-catalog') && !html.includes('data-hub-frontend'));
  } else {
    assert.ok(html.includes('data-hub-frontend="github"'));
    assert.doesNotMatch(html, /http-equiv=["']refresh/i);
  }
  assert.ok(html.includes('http-equiv="Content-Security-Policy"'));
  assert.doesNotMatch(html, /share-redirect\.js/i);
}

/** Fixed public origin, no credentials or redirects; data is never evaluated by this tool. */
export async function downloadHub(output, fetcher = fetch) {
  const get = pathname => fetcher(HUB_ORIGIN + pathname, { redirect: 'error', credentials: 'omit',
    cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  const raw = await bounded(await get('/hub/assets/github/site.json'), 16 * 1024);
  const manifest = validateHubManifest(JSON.parse(raw));
  for (const file of manifest.files) {
    const bytes = await bounded(await get(file.artifact), file.bytes);
    validateHtml(bytes, file);
    const target = path.join(output, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  await writeFile(path.join(output, 'deployment.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

/** The privileged publisher only checks bytes and known paths; it never executes downloaded HTML/JS. */
export async function verifyHub(output) {
  const manifest = validateHubManifest(JSON.parse(await readFile(path.join(output, 'deployment.json'), 'utf8')));
  const files = await readdir(output, { recursive: true, withFileTypes: true });
  const allowed = new Set(['deployment.json', ...HUB_FILES]);
  for (const file of files) {
    assert.ok(!file.isSymbolicLink(), 'Symlinks are not publishable.');
    if (file.isDirectory()) continue;
    const name = path.relative(output, path.join(file.parentPath, file.name)).split(path.sep).join('/');
    assert.ok(file.isFile() && allowed.has(name), `Unexpected Hub export file: ${name}`);
  }
  for (const file of manifest.files) validateHtml(await readFile(path.join(output, file.path)), file);
  return manifest;
}

/** Read only fixed Git objects, never published code. Any transport or malformed-tree error stops publication. */
export async function preservePublishedHub(output, git = args => spawnSync('git', args, {
  maxBuffer: 2 * 1024 * 1024, timeout: 60_000, windowsHide: true,
})) {
  await verifyHub(output);
  const run = (args, absent = false) => {
    const result = git(args);
    if (absent && !result.error && result.status === 2) return null;
    assert.ok(!result.error && result.status === 0, `Cannot read published Hub: git ${args[0]} failed.`);
    return Buffer.from(result.stdout);
  };
  if (run(['ls-remote', '--exit-code', '--refs', 'origin', 'refs/heads/gh-pages'], true) === null) return false;
  run(['fetch', '--no-tags', '--depth=1', 'origin', 'refs/heads/gh-pages']);
  const tree = run(['ls-tree', 'FETCH_HEAD', '--', 'hub']).toString('utf8');
  if (!tree) return false; // First Hub publication uses the read-only-tested artifact.
  assert.match(tree, /^040000 tree [a-f0-9]{40,64}\thub\n$/);
  const read = (file, limit) => {
    const object = `hub/${file}`;
    const entry = run(['ls-tree', 'FETCH_HEAD', '--', object]).toString('utf8');
    assert.ok(entry.startsWith('100644 blob ') && entry.endsWith(`\t${object}\n`), `Missing or unsafe published Hub file: ${file}`);
    const bytes = run(['show', `FETCH_HEAD:${object}`]);
    assert.ok(bytes.length <= limit, 'Published Hub file exceeds its size limit.');
    return bytes;
  };
  const raw = read('deployment.json', 16 * 1024);
  const manifest = validateHubManifest(JSON.parse(raw));
  const files = new Map([['deployment.json', raw]]);
  for (const file of manifest.files) {
    const bytes = read(file.path, file.bytes);
    validateHtml(bytes, file);
    files.set(file.path, bytes);
  }
  // Replace the expected artifact only after every published blob passes verification.
  for (const [file, bytes] of files) await writeFile(path.join(output, file), bytes);
  return true;
}

/** Merge only a previously tested public artifact; the release publisher never runs its code. */
export async function mergeHubRoot(output, root) {
  await verifyHub(output);
  for (const file of ['deployment.json', ...HUB_FILES]) {
    const target = path.join(root, 'hub', file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(output, file), target);
  }
}

export async function verifyLiveHub(output, fetcher = fetch) {
  const expected = await verifyHub(output);
  const base = 'https://colmapview.github.io/hub/';
  const get = pathname => fetcher(base + pathname, { redirect: 'error', credentials: 'omit',
    cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  const actual = validateHubManifest(JSON.parse(await bounded(await get('deployment.json'), 16 * 1024)));
  assert.deepEqual(actual, expected, 'Published Hub metadata differs from the tested artifact.');
  for (const file of expected.files) validateHtml(await bounded(await get(file.path.replace(/index\.html$/, '')), file.bytes), file);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const output = safeOutputDirectory(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || '.tmp/deployment/hub');
  const merge = process.argv.find(arg => arg.startsWith('--merge-root='))?.slice(13);
  const live = process.argv.includes('--live');
  let manifest = process.argv.includes('--verify') || merge || live ? await verifyHub(output) : await downloadHub(output);
  if (process.argv.includes('--preserve-published')) {
    assert.ok(merge, '--preserve-published requires --merge-root.');
    await preservePublishedHub(output);
    manifest = await verifyHub(output);
  }
  if (merge) await mergeHubRoot(output, safeOutputDirectory(merge));
  if (live) {
    const deadline = Date.now() + 180_000;
    for (;;) {
      try { await verifyLiveHub(output); break; }
      catch (error) {
        if (Date.now() >= deadline) throw error;
        console.log('Waiting for the tested Hub pages to reach GitHub Pages.');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }
  if (process.argv.includes('--check-current')) {
    let changed = true;
    try {
      const current = JSON.parse(await bounded(await fetch('https://colmapview.github.io/hub/deployment.json', {
        redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      }), 16 * 1024));
      changed = !sameHubFrontend(current, manifest);
    } catch { /* Missing/invalid previous publication needs replacement. */ }
    assert.ok(process.env.GITHUB_OUTPUT);
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  }
  console.log(`Verified public Hub ${manifest.version} (${manifest.source.slice(0, 12)}), ${manifest.files.length} pages.`);
}
