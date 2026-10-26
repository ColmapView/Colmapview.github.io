import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { HUB_FILES, HUB_ORIGIN, downloadHub, sha256, validateHubManifest, verifyHub } from './hub-site.mjs';

const html = Buffer.from('<!doctype html><html data-hub-frontend="github"><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body>Public gallery</body></html>');
const digest = sha256(html);
const manifest = () => ({ schemaVersion: 1, version: '0.19.0', source: 'a'.repeat(40), dirty: false,
  files: HUB_FILES.map(path => ({ path, artifact: `/hub/assets/github/${digest}.html`, sha256: digest, bytes: html.length })) });

test('Hub publication rejects uncommitted, foreign, duplicate, traversal and oversized exports', () => {
  assert.equal(validateHubManifest(manifest()).files.length, 3);
  for (const mutate of [m => { m.dirty = true; }, m => { m.files[0].path = '../index.html'; },
    m => { m.files[0].artifact = 'https://evil.example/a.html'; }, m => { m.files[0].bytes = 1024 * 1024 + 1; },
    m => { m.files[0] = m.files[1]; }, m => { m.source = 'not-a-commit'; }]) {
    const value = manifest(); mutate(value); assert.throws(() => validateHubManifest(value));
  }
});

test('download uses fixed public paths without credentials or redirects, then verifies exact bytes and files', async () => {
  await mkdir('.tmp', { recursive: true });
  const output = await mkdtemp('.tmp/hub-site-test-');
  const fetcher = async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
    assert.ok(url === `${HUB_ORIGIN}/hub/assets/github/site.json` || url === `${HUB_ORIGIN}/hub/assets/github/${digest}.html`);
    return url.endsWith('site.json') ? Response.json(manifest()) : new Response(html);
  };
  await downloadHub(output, fetcher);
  assert.deepEqual(await verifyHub(output), manifest());
  assert.equal((await readFile(`${output}/datasets/index.html`)).toString(), html.toString());
  await writeFile(`${output}/index.html`, 'changed');
  await assert.rejects(verifyHub(output));
  await writeFile(`${output}/index.html`, html);
  await writeFile(`${output}/unexpected.js`, 'code');
  await assert.rejects(verifyHub(output), /Unexpected Hub export/);
  await assert.rejects(downloadHub(output, async url => url.endsWith('site.json')
    ? Response.json(manifest()) : new Response(Buffer.alloc(html.length + 1))), /size limit/);
});
