import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { safeOutputDirectory } from './profiles.mjs';

export const HUB_ORIGIN = 'https://colmapview.opsiclear.com';
export const HUB_FILES = ['index.html', 'datasets/index.html', 'datasets/entry/index.html'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function validateHubManifest(value) {
  assert.equal(value.schemaVersion, 1);
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
  assert.ok(html.startsWith('<!doctype html>') && html.includes('data-hub-frontend="github"'));
  assert.ok(html.includes('http-equiv="Content-Security-Policy"'));
  assert.doesNotMatch(html, /http-equiv=["']refresh|share-redirect\.js/i);
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

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const output = safeOutputDirectory(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || '.tmp/deployment/hub');
  const manifest = process.argv.includes('--verify') ? await verifyHub(output) : await downloadHub(output);
  if (process.argv.includes('--check-current')) {
    let changed = true;
    try {
      const current = JSON.parse(await bounded(await fetch('https://colmapview.github.io/hub/deployment.json', {
        redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      }), 16 * 1024));
      changed = JSON.stringify(validateHubManifest(current)) !== JSON.stringify(manifest);
    } catch { /* Missing/invalid previous publication needs replacement. */ }
    assert.ok(process.env.GITHUB_OUTPUT);
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  }
  console.log(`Verified public Hub ${manifest.version} (${manifest.source.slice(0, 12)}), ${manifest.files.length} pages.`);
}
