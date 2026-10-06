import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export function htmlSha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifyIndexHtml(bytes, expected) {
  assert.match(expected.indexHtmlSha256, /^[a-f0-9]{64}$/);
  assert.equal(htmlSha256(bytes), expected.indexHtmlSha256, 'Delivered HTML does not match the prepared artifact.');
}

export function verifyPolicyHtml(filename, html) {
  const titles = { 'about.html': 'About ColmapView', 'privacy.html': 'Privacy policy · ColmapView', 'terms.html': 'Terms of use · ColmapView' };
  assert.ok(html.includes(`<title>${titles[filename]}</title>`), `${filename} must serve its policy page, not an SPA fallback.`);
}

/** Compare with the trusted local build manifest, rather than trusting a remote SHA claim alone. */
export async function fetchVerifiedArtifact(base, expected, fetchImpl = fetch) {
  const options = { redirect: 'error', signal: AbortSignal.timeout(10_000), cache: 'no-store' };
  const response = await fetchImpl(new URL(`deployment.json?verify=${expected.sourceSha}`, base), options);
  assert.equal(response.status, 200, 'Deployment metadata must be public HTTP 200.');
  const actual = await response.json();
  for (const name of ['schemaVersion', 'sourceSha', 'version', 'release', 'profile', 'base', 'indexHtmlSha256']) {
    assert.equal(actual[name], expected[name], `Public artifact ${name} differs from the prepared build.`);
  }
  assert.deepEqual(actual.googleDrive, expected.googleDrive);
  const viewer = new URL(base);
  viewer.searchParams.set('verify', expected.sourceSha);
  const html = await fetchImpl(viewer, { ...options, signal: AbortSignal.timeout(10_000) });
  assert.equal(html.status, 200, 'Viewer HTML must be public HTTP 200.');
  verifyIndexHtml(Buffer.from(await html.arrayBuffer()), expected);
  return actual;
}
