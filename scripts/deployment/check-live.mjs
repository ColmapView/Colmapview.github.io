import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { CUSTOM_ORIGIN, sourceSha } from './profiles.mjs';
import { fetchVerifiedArtifact, verifyIndexHtml, verifyPolicyHtml } from './artifact-verification.mjs';

const [baseValue, profile, ...args] = process.argv.slice(2);
const base = new URL(baseValue);
if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/')) {
  throw new Error('Live smoke requires a public HTTPS directory URL without credentials, query or fragment.');
}
if (profile === 'custom' && (base.origin !== CUSTOM_ORIGIN || base.pathname !== '/')) throw new Error('Custom smoke must use the fixed production origin.');
if (profile === 'github' && base.origin !== 'https://colmapview.github.io') throw new Error('GitHub smoke must use the independent GitHub host.');
if (profile === 'preview' && !base.hostname.endsWith('.pages.dev')) throw new Error('Preview smoke must use the isolated Pages hostname.');
if (!['github', 'custom', 'preview'].includes(profile)) throw new Error('Unknown live deployment profile.');
const expectedSha = sourceSha();
const manifestPath = args.find(arg => arg.startsWith('--manifest='))?.slice('--manifest='.length);
if (!manifestPath) throw new Error('Live checks require --manifest=PATH from the exact prepared artifact.');
const expected = JSON.parse(readFileSync(manifestPath, 'utf8'));
assert.equal(expected.sourceSha, expectedSha);
assert.equal(expected.schemaVersion, 1);
assert.equal(expected.profile, profile);
assert.equal(expected.base, base.pathname);
assert.equal(expected.googleDrive.enabled, profile === 'custom');
if (process.env.DEPLOYMENT_RELEASE) assert.equal(expected.release, process.env.DEPLOYMENT_RELEASE);
let metadata;
let lastError;

// CDNs can expose the prior release briefly. Never accept it as a successful deployment.
// GitHub branch uploads return before the Pages build completes; allow five minutes there.
const readinessAttempts = profile === 'github' ? 60 : 18;
for (let attempt = 1; attempt <= readinessAttempts; attempt++) {
  try {
    metadata = await fetchVerifiedArtifact(base, expected);
    break;
  } catch (error) {
    lastError = error;
    metadata = undefined;
    console.log(`Waiting for ${profile} artifact (${attempt}/${readinessAttempts}).`);
    if (attempt < readinessAttempts) await delay(5_000);
  }
}
if (!metadata) throw new Error(`Expected ${profile} artifact was not available.`, { cause: lastError });

/** Marks a failure a later attempt can clear: a network error, a timeout or an HTTP 5xx answer. */
const transient = error => Object.assign(error, { transient: true });
const retryable = promise => promise.catch(error => { throw transient(error); });
function transientIf(condition, assertion) {
  try { assertion(); } catch (error) { throw condition ? transient(error) : error; }
}

/** One attempt at the policy pages and a fresh browser load of the bare viewer URL. */
async function verifyPublicPages(browser) {
  for (const filename of ['about.html', 'privacy.html', 'terms.html', 'policy.css']) {
    // Pages may canonicalize about.html to /about. Only a same-host public final response is accepted.
    const response = await retryable(fetch(new URL(filename, base), { signal: AbortSignal.timeout(10_000) }));
    assert.equal(new URL(response.url).origin, base.origin, 'Policy navigation must stay on this host.');
    transientIf(response.status >= 500, () => assert.equal(response.status, 200, `${filename} must be public HTTP 200.`));
    if (filename.endsWith('.html')) verifyPolicyHtml(filename, await retryable(response.text()));
  }
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  try {
    const unexpected = [];
    const failedAssets = [];
    const errors = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === base.origin) return route.continue();
      unexpected.push(route.request().url());
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failedAssets.push(`${response.status()} ${response.url()}`); });
    const response = await retryable(page.goto(base.href, { waitUntil: 'networkidle', timeout: 45_000 }));
    transientIf(response.status() >= 500, () => assert.equal(response.status(), 200, 'Viewer navigation must be public HTTP 200.'));
    verifyIndexHtml(await retryable(response.body()), expected);
    assert.equal(new URL(page.url()).origin, base.origin, 'Viewer must stay on its independent host.');
    await retryable(page.getByRole('heading', { name: 'Load Dataset', exact: true }).waitFor());
    const expectedControls = profile === 'custom' ? 1 : 0;
    assert.equal(await page.getByRole('button', { name: 'Google Drive account', exact: true }).count(), expectedControls);
    assert.equal(await page.getByRole('button', { name: 'Publish to Google Drive', exact: true }).count(), expectedControls);
    assert.deepEqual(unexpected, [], 'An idle viewer must not contact provider SDKs/APIs or analytics.');
    transientIf(failedAssets.every(entry => entry.startsWith('5')),
      () => assert.deepEqual(failedAssets, [], 'All application assets must resolve on the public host.'));
    assert.deepEqual(errors, [], 'The deployed viewer must start without browser exceptions.');
  } finally { await context.close(); }
}

// The upload is already public here, so a transient failure (network error, timeout or HTTP 5xx) gets
// bounded retries instead of failing a published deployment at once. Any other failure, such as the privacy
// page's content or an analytics request, fails at once, since a retry would fetch the same content.
const PUBLIC_PAGE_ATTEMPTS = 3;
const browser = await chromium.launch({ args: ['--enable-webgl', '--use-gl=angle', '--ignore-gpu-blocklist'] });
try {
  for (let attempt = 1; ; attempt++) {
    try { await verifyPublicPages(browser); break; }
    catch (error) {
      if (!error.transient || attempt === PUBLIC_PAGE_ATTEMPTS) throw error;
      console.log(`Public page check failed (${attempt}/${PUBLIC_PAGE_ATTEMPTS}): ${String(error.message).split('\n')[0]}`);
      await delay(15_000);
    }
  }
} finally { await browser.close(); }
console.log(`Verified ${base.href}: ${profile}, source ${expectedSha}, version ${metadata.version}.`);
