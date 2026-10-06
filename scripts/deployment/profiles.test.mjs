import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import yaml from 'js-yaml';
import { CUSTOM_ORIGIN, FIXTURE_GOOGLE_CONFIG, profileEnvironment, safeOutputDirectory, validateBase, validatePreviewConfiguration, validateReleaseConfiguration } from './profiles.mjs';
import { fetchVerifiedArtifact, htmlSha256, verifyPolicyHtml } from './artifact-verification.mjs';
import { cloudflareStaticHeaders } from './headers.mjs';
import { startArtifactServer } from './static-server.mjs';

const release = {
  CLOUDFLARE_PAGES_ENABLED: 'true', CLOUDFLARE_API_TOKEN_CONFIGURED: 'true',
  CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_PAGES_PROJECT: 'colmapview-production',
  ...FIXTURE_GOOGLE_CONFIG,
};

test('disabled profiles erase inherited test credentials and preview erases provider auth', () => {
  const inherited = { VITE_GOOGLE_DRIVE_API_KEY: 'private-fixture', GOOGLE_DRIVE_API_KEY: 'private-alias', VITE_GOOGLE_DRIVE_ENABLED: 'true', VITE_HF_AUTH_ENABLED: 'true', VITE_HF_OAUTH_CLIENT_ID: 'test-app' };
  for (const profile of ['github', 'preview']) {
    const env = profileEnvironment(profile, inherited);
    assert.equal(env.VITE_GOOGLE_DRIVE_ENABLED, 'false');
    assert.equal(env.VITE_GOOGLE_DRIVE_API_KEY, '');
    assert.equal(env.GOOGLE_DRIVE_API_KEY, '');
    assert.equal(env.VITE_GOOGLE_DRIVE_CLIENT_ID, '');
    assert.equal(env.VITE_GOOGLE_DRIVE_APP_ID, '');
  }
  assert.equal(profileEnvironment('preview', inherited).VITE_HF_AUTH_ENABLED, 'false');
  assert.equal(profileEnvironment('preview', inherited).VITE_HF_OAUTH_CLIENT_ID, '');
});

test('custom builds require their own production configuration and exact fixed origin', () => {
  assert.throws(() => profileEnvironment('custom', { VITE_GOOGLE_DRIVE_API_KEY: 'legacy-test' }), /CUSTOM_GOOGLE_DRIVE_API_KEY/);
  const env = profileEnvironment('custom', { ...FIXTURE_GOOGLE_CONFIG, VITE_GOOGLE_DRIVE_API_KEY: 'legacy-test', VITE_HF_AUTH_ENABLED: 'true' });
  assert.equal(env.VITE_GOOGLE_DRIVE_API_KEY, FIXTURE_GOOGLE_CONFIG.CUSTOM_GOOGLE_DRIVE_API_KEY);
  assert.equal(env.VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN, CUSTOM_ORIGIN);
  assert.equal(env.VITE_GOOGLE_DRIVE_ENABLED, 'true');
  assert.equal(env.VITE_HF_AUTH_ENABLED, 'false');
  assert.throws(() => profileEnvironment('custom', { ...FIXTURE_GOOGLE_CONFIG, CUSTOM_HF_AUTH_ENABLED: 'true', CUSTOM_HF_OAUTH_CLIENT_ID: 'fixture', CUSTOM_HF_OAUTH_REDIRECT_URI: 'https://colmapview.github.io/latest/' }), /custom origin/);
  assert.throws(() => profileEnvironment('custom', { ...FIXTURE_GOOGLE_CONFIG, CUSTOM_HF_AUTH_ENABLED: 'true', CUSTOM_HF_OAUTH_CLIENT_ID: 'fixture', CUSTOM_HF_OAUTH_REDIRECT_URI: `${CUSTOM_ORIGIN}/` }), /hf-callback/);
  assert.throws(() => profileEnvironment('custom', { ...FIXTURE_GOOGLE_CONFIG, CUSTOM_HF_AUTH_ENABLED: 'true', CUSTOM_HF_OAUTH_CLIENT_ID: 'fixture', CUSTOM_HF_OAUTH_REDIRECT_URI: `${CUSTOM_ORIGIN}/hf-callback.html` }), /hf-callback/);
  assert.equal(profileEnvironment('custom', { ...FIXTURE_GOOGLE_CONFIG, CUSTOM_HF_AUTH_ENABLED: 'true', CUSTOM_HF_OAUTH_CLIENT_ID: 'fixture', CUSTOM_HF_OAUTH_REDIRECT_URI: `${CUSTOM_ORIGIN}/hf-callback` }).VITE_HF_AUTH_ENABLED, 'true');
});

test('enabled release fails before publication if any required field is missing', () => {
  assert.deepEqual(validateReleaseConfiguration(release, true), { customEnabled: true });
  for (const name of ['CLOUDFLARE_API_TOKEN_CONFIGURED', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_PAGES_PROJECT', ...Object.keys(FIXTURE_GOOGLE_CONFIG)]) {
    assert.throws(() => validateReleaseConfiguration({ ...release, [name]: '' }, true), new RegExp(name.replace('_CONFIGURED', '')));
  }
  assert.throws(() => validateReleaseConfiguration({ ...release, CLOUDFLARE_PAGES_PROJECT: 'project; echo unsafe' }, true), /PROJECT/);
  assert.throws(() => validateReleaseConfiguration({ ...release, CLOUDFLARE_PAGES_ENABLED: 'yes' }, true), /true or false/);
  assert.deepEqual(validateReleaseConfiguration({}, true), { customEnabled: false });
  assert.deepEqual(validateReleaseConfiguration(release, false), { customEnabled: false });
});

test('manual preview requires a separate project and bounded output/base paths', () => {
  assert.throws(() => validatePreviewConfiguration({ ...release, CLOUDFLARE_PREVIEW_PROJECT: release.CLOUDFLARE_PAGES_PROJECT }), /separate/);
  validatePreviewConfiguration({ ...release, CLOUDFLARE_PREVIEW_PROJECT: 'colmapview-preview' });
  assert.throws(() => safeOutputDirectory('..'), /dist or a child/);
  assert.throws(() => safeOutputDirectory('.tmp'), /dist or a child/);
  assert.throws(() => validateBase('custom', '/latest/'), /root base/);
  assert.throws(() => validateBase('github', '/../../'), /absolute directory/);
});

test('release workflow gates both real artifacts before first publish and pins Wrangler', () => {
  const workflow = yaml.load(readFileSync('.github/workflows/deploy.yml', 'utf8'));
  const steps = workflow.jobs.deploy.steps;
  const firstPublish = steps.findIndex(step => step.uses?.startsWith('peaceiris/'));
  for (const name of ['Preflight deployment configuration', 'Build custom production', 'Smoke prepared artifacts']) {
    assert.ok(steps.findIndex(step => step.name === name) < firstPublish, `${name} must precede publication`);
  }
  const customDeploy = steps.find(step => step.name === 'Deploy custom production');
  assert.match(customDeploy.if, /custom_enabled/);
  assert.match(customDeploy.run, /wrangler@4\.147\.0/);
  assert.match(customDeploy.run, /--branch main/);
  assert.ok(!steps.some(step => step.run?.includes('cp public/google')));
  assert.equal(workflow.jobs.deploy.env.CUSTOM_GOOGLE_DRIVE_CLIENT_ID, '${{ vars.CUSTOM_GOOGLE_DRIVE_CLIENT_ID }}');
  const validation = yaml.load(readFileSync('.github/workflows/e2e.yml', 'utf8'));
  assert.ok(validation.jobs.artifacts.steps.some(step => step.run === 'npm run test:deployment'));
});

test('Cloudflare deployment token is scoped only to trusted upload steps', () => {
  const releaseWorkflow = yaml.load(readFileSync('.github/workflows/deploy.yml', 'utf8'));
  assert.equal(releaseWorkflow.jobs.deploy.env.CLOUDFLARE_API_TOKEN, undefined);
  for (const step of releaseWorkflow.jobs.deploy.steps) {
    if (step.env?.CLOUDFLARE_API_TOKEN) assert.equal(step.name, 'Deploy custom production');
  }
  const preview = yaml.load(readFileSync('.github/workflows/deploy-preview.yml', 'utf8'));
  assert.equal(preview.jobs.build.env?.CLOUDFLARE_API_TOKEN, undefined);
  assert.ok(!JSON.stringify(preview.jobs.build).includes('secrets.CLOUDFLARE_API_TOKEN'));
  assert.equal(preview.jobs.publish.needs, 'build');
  assert.equal(preview.jobs.publish.steps[0].with.ref, '${{ github.event.repository.default_branch }}');
  assert.equal(preview.jobs.publish.env.CLOUDFLARE_API_TOKEN, undefined);
  for (const step of preview.jobs.publish.steps) {
    if (step.env?.CLOUDFLARE_API_TOKEN) assert.equal(step.name, 'Upload preview only');
  }
  assert.ok(preview.jobs.publish.steps.some(step => step.name === 'Smoke downloaded preview with trusted tests'));
});

test('public verification rejects fresh metadata paired with old HTML and accepts the exact prepared artifact', async () => {
  const preparedHtml = '<html><script type="module" src="/assets/new-entry-hash.js"></script></html>';
  let deliveredHtml = '<html><script type="module" src="/assets/old-entry-hash.js"></script></html>';
  const expected = { schemaVersion: 1, sourceSha: 'f'.repeat(40), version: '0.15.4', release: 'v0.15.4', profile: 'github', base: '/latest/', googleDrive: { enabled: false, allowedOrigin: null }, indexHtmlSha256: htmlSha256(preparedHtml) };
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': request.url.startsWith('/latest/deployment.json') ? 'application/json' : 'text/html' });
    response.end(request.url.startsWith('/latest/deployment.json') ? JSON.stringify(expected) : deliveredHtml);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/latest/`;
    await assert.rejects(fetchVerifiedArtifact(base, expected), /Delivered HTML does not match/);
    deliveredHtml = preparedHtml;
    assert.deepEqual(await fetchVerifiedArtifact(base, expected), expected);
    await assert.rejects(fetchVerifiedArtifact(base, { ...expected, sourceSha: 'e'.repeat(40) }), /sourceSha differs/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('public policy verification rejects a hosting SPA fallback even when it returns HTTP 200', () => {
  assert.throws(() => verifyPolicyHtml('privacy.html', '<html lang="en"><title>ColmapView</title></html>'), /SPA fallback/);
  verifyPolicyHtml('privacy.html', '<html lang="en"><title>Privacy policy · ColmapView</title></html>');
});

test('Cloudflare artifact headers preserve HTML on canonical and alias routes without changing asset or metadata rules', async () => {
  mkdirSync('.tmp', { recursive: true });
  const directory = mkdtempSync(path.resolve('.tmp/deployment-headers-'));
  const htmlRoutes = ['/', '/index', '/index.html', '/about', '/about.html', '/privacy', '/privacy.html', '/terms', '/terms.html', '/hf-callback', '/hf-callback.html'];
  writeFileSync(path.join(directory, '_headers'), cloudflareStaticHeaders());
  for (const name of ['index.html', 'about.html', 'privacy.html', 'terms.html', 'hf-callback.html']) writeFileSync(path.join(directory, name), '<html><body>prepared bytes</body></html>');
  for (const name of ['entry.js', 'style.css', 'worker.wasm', 'deployment.json']) writeFileSync(path.join(directory, name), 'fixture');
  const server = await startArtifactServer(directory);
  try {
    for (const route of htmlRoutes) {
      const response = await fetch(`${server.origin}${route}?url=private-file-identifier`);
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get('cache-control'), 'public, no-cache, no-transform', route);
      assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
      assert.equal(response.headers.get('referrer-policy'), 'strict-origin');
      assert.equal(await response.text(), '<html><body>prepared bytes</body></html>');
    }
    for (const name of ['entry.js', 'style.css', 'worker.wasm']) {
      const response = await fetch(`${server.origin}/${name}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store', `${name} must not inherit no-transform`);
    }
    const metadata = await fetch(`${server.origin}/deployment.json`);
    assert.equal(metadata.headers.get('cache-control'), 'no-cache');
    assert.equal((await fetch(`${server.origin}/missing-file`)).status, 404);
  } finally {
    await server.close();
    rmSync(directory, { recursive: true });
  }
});
