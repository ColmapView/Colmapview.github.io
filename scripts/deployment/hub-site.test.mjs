import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { HUB_FILES, HUB_ORIGIN, downloadHub, mergeHubRoot, preservePublishedHub, sameHubFrontend, sha256, validateHubManifest, verifyHub, verifyLiveHub } from './hub-site.mjs';

const html = Buffer.from('<!doctype html><html data-hub-frontend="github" data-hub-public-catalog="true"><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body>Public gallery</body></html>');
const redirect = Buffer.from('<!doctype html><html data-hub-redirect="true"><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body><a href="/hub/">Hub</a></body></html>');
const bytesFor = path => path.startsWith('datasets/') ? redirect : html;
const manifest = () => ({ schemaVersion: 2, version: '0.20.0', source: 'a'.repeat(40), dirty: false,
  files: HUB_FILES.map(path => ({ path, artifact: `/hub/assets/github/${sha256(bytesFor(path))}.html`, sha256: sha256(bytesFor(path)), bytes: bytesFor(path).length })) });

test('Hub publication rejects uncommitted, foreign, duplicate, traversal and oversized exports', () => {
  assert.equal(validateHubManifest(manifest()).files.length, 4);
  for (const mutate of [m => { m.dirty = true; }, m => { m.files[0].path = '../index.html'; },
    m => { m.files[0].artifact = 'https://evil.example/a.html'; }, m => { m.files[0].bytes = 1024 * 1024 + 1; },
    m => { m.files[0] = m.files[1]; }, m => { m.source = 'not-a-commit'; }]) {
    const value = manifest(); mutate(value); assert.throws(() => validateHubManifest(value));
  }
});

test('backend-only releases do not republish identical frontend files', () => {
  const newer = manifest(); newer.version = '0.20.1'; newer.source = 'b'.repeat(40); newer.files.reverse();
  assert.equal(sameHubFrontend(manifest(), newer), true);
  newer.files[0].sha256 = 'b'.repeat(64); newer.files[0].artifact = `/hub/assets/github/${'b'.repeat(64)}.html`;
  assert.equal(sameHubFrontend(manifest(), newer), false);
});

test('download uses fixed public paths without credentials or redirects, then verifies exact bytes and files', async t => {
  await mkdir('.tmp', { recursive: true });
  const output = await mkdtemp('.tmp/hub-site-test-');
  t.after(() => rm(output, { recursive: true, force: true }));
  const fetcher = async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
    if (url === `${HUB_ORIGIN}/hub/assets/github/site.json`) return Response.json(manifest());
    const file = manifest().files.find(file => url === HUB_ORIGIN + file.artifact);
    assert.ok(file);
    return new Response(bytesFor(file.path));
  };
  await downloadHub(output, fetcher);
  assert.deepEqual(await verifyHub(output), manifest());
  await verifyLiveHub(output, async (url, options) => {
    assert.ok(url.startsWith('https://colmapview.github.io/hub/'));
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    return url.endsWith('deployment.json') ? Response.json(manifest())
      : new Response(bytesFor(url.slice('https://colmapview.github.io/hub/'.length) + 'index.html'));
  });
  await assert.rejects(verifyLiveHub(output, async url => url.endsWith('deployment.json')
    ? Response.json(manifest()) : new Response('Old deployment')));
  const root = await mkdtemp('.tmp/hub-root-test-');
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(`${root}/index.html`, 'Existing viewer root');
  await mergeHubRoot(output, root);
  assert.equal(await readFile(`${root}/index.html`, 'utf8'), 'Existing viewer root');
  assert.deepEqual(await verifyHub(`${root}/hub`), manifest());
  assert.equal((await readFile(`${output}/datasets/index.html`)).toString(), redirect.toString());
  await writeFile(`${output}/index.html`, 'changed');
  await assert.rejects(verifyHub(output));
  await writeFile(`${output}/index.html`, html);
  await writeFile(`${output}/unexpected.js`, 'code');
  await assert.rejects(verifyHub(output), /Unexpected Hub export/);
  await assert.rejects(downloadHub(output, async url => url.endsWith('site.json')
    ? Response.json(manifest()) : new Response(Buffer.alloc(html.length + 1))), /size limit/);
});


test('root releases preserve published Hub bytes and fail closed on unsafe or unavailable Git objects', async t => {
  await mkdir('.tmp', { recursive: true });
  const output = await mkdtemp('.tmp/hub-preserve-test-');
  t.after(() => rm(output, { recursive: true, force: true }));
  await downloadHub(output, async url => url.endsWith('site.json') ? Response.json(manifest())
    : new Response(bytesFor(manifest().files.find(f => url.endsWith(f.artifact)).path)));
  const newer = manifest(); newer.version = '0.20.1'; newer.source = 'b'.repeat(40);
  const updated = Buffer.from(html.toString().replace('Public gallery', 'New gallery'));
  for (const file of newer.files.filter(f => !f.path.startsWith('datasets/'))) {
    file.bytes = updated.length; file.sha256 = sha256(updated); file.artifact = `/hub/assets/github/${file.sha256}.html`;
  }
  const ok = stdout => ({ status: 0, stdout: Buffer.from(stdout) });
  const git = args => {
    if (args[0] === 'ls-remote') {
      assert.deepEqual(args, ['ls-remote', '--exit-code', '--refs', 'origin', 'refs/heads/gh-pages']);
      return ok('a'.repeat(40) + '\trefs/heads/gh-pages\n');
    }
    if (args[0] === 'fetch') {
      assert.deepEqual(args, ['fetch', '--no-tags', '--depth=1', 'origin', 'refs/heads/gh-pages']);
      return ok('');
    }
    if (args[0] === 'ls-tree') {
      const name = args.at(-1);
      return ok(`${name === 'hub' ? '040000 tree' : '100644 blob'} ${'a'.repeat(40)}\t${name}\n`);
    }
    assert.equal(args[0], 'show');
    const file = args[1].slice('FETCH_HEAD:hub/'.length);
    return ok(file === 'deployment.json' ? JSON.stringify(newer) : file.startsWith('datasets/') ? redirect : updated);
  };
  assert.equal(await preservePublishedHub(output, () => ({ status: 2 })), false);
  assert.equal(await preservePublishedHub(output, args => args[0] === 'ls-tree' ? ok('') : git(args)), false);
  for (const status of [1, 128, null]) await assert.rejects(preservePublishedHub(output, () => ({ status })), /failed/);
  await assert.rejects(preservePublishedHub(output, args => args[0] === 'show' ? ok('invalid') : git(args)));
  for (const entry of ['', `120000 blob ${'a'.repeat(40)}\thub/deployment.json\n`]) {
    await assert.rejects(preservePublishedHub(output, args => args[0] === 'ls-tree' && args.at(-1) !== 'hub' ? ok(entry) : git(args)), /unsafe/);
  }
  await assert.rejects(preservePublishedHub(output, args => args[0] === 'show' && !args[1].endsWith('deployment.json') ? ok(html) : git(args)));
  assert.deepEqual(await verifyHub(output), manifest(), 'failed reads leave the verified candidate intact');
  assert.equal(await preservePublishedHub(output, git), true);
  assert.deepEqual(await verifyHub(output), newer);
  assert.deepEqual(await readFile(`${output}/index.html`), updated);
  // Exercise the real Git tree/blob format, including a local fetch, without touching any remote service.
  const repository = await mkdtemp('.tmp/hub-git-test-');
  t.after(() => rm(repository, { recursive: true, force: true }));
  await cp(output, `${repository}/hub`, { recursive: true });
  const realGit = args => spawnSync('git', args, { cwd: repository, windowsHide: true });
  for (const args of [
    ['init'], ['add', 'hub'],
    ['-c', 'user.name=Deployment test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Published Hub'],
    ['branch', 'gh-pages'], ['remote', 'add', 'origin', path.resolve(repository)],
  ]) assert.equal(realGit(args).status, 0);
  assert.equal(await preservePublishedHub(output, realGit), true);
  assert.deepEqual(await verifyHub(output), newer);
});
