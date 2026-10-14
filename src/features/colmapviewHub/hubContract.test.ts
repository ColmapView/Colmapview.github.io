import { describe, expect, it } from 'vitest';
import { buildHubPayload, type HubMetadata } from './payload';
import { PUBLICATION_LICENSES, publicationLicenseInfo } from '../datasetPublishing/publicationMetadata';

/**
 * A copy of the Hub's creation rules: colmapview_hub src/worker/validation.ts at commit HUB_COMMIT.
 * When the Hub changes them, update this copy and the commit together.
 */
const HUB_COMMIT = '519ad1b';
const KEYS = new Set(['viewerUrl', 'title', 'description', 'thumbnailBase64', 'license', 'assets', 'managementSecret', 'listed', 'access', 'publicAcknowledged']);
const VIEWER_ORIGINS = new Set(['https://colmapview.opsiclear.com', 'https://colmapview.github.io']);
const VIEWER_PATH = /^\/(?:latest\/|dev\/|v\d+\.\d+\.\d+\/)?$/;
const CREDENTIAL_PARAMS = new Set(['access_token', 'refresh_token', 'secret_access_key', 'aws_secret_access_key', 'secretkey',
  'x-amz-signature', 'x-amz-credential', 'x-amz-security-token', 'x-goog-signature', 'x-goog-credential', 'sig', 'signature', 'token', 'awsaccesskeyid']);
const ASSET_KEYS = new Set(['format', 'imageFormat', 'colmap', 'images', 'masks', 'splats', 'viewerSettings', 'preview']);
const hasControls = (value: string) => [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function textRule(value: unknown, max: number, optional: boolean): string | null {
  if (optional && (value === undefined || value === '')) return null;
  if (typeof value !== 'string') return 'not a string';
  const normalized = value.trim().replace(/\s+/g, ' ');
  return (!optional && !normalized) || normalized.length > max || hasControls(normalized) ? 'invalid or too long' : null;
}

function credentialRule(url: URL): string | null {
  const names = [...url.searchParams.keys(), ...new URLSearchParams(url.hash.slice(1)).keys()];
  return url.username || url.password || names.some(name => CREDENTIAL_PARAMS.has(name.toLowerCase())) ? 'credentials' : null;
}

/**
 * The first Hub creation rule a payload breaks, or null when the Hub would accept it. JPEG structure is checked by the thumbnail tests and e2e.
 * Rules run in the Hub's order. This is the production Hub, which refuses loopback viewers; only a Hub running on loopback accepts them.
 */
function hubRejection(payload: Record<string, unknown>): string | null {
  const unknown = Object.keys(payload).find(key => !KEYS.has(key));
  if (unknown) return `unknown key ${unknown}`;
  if (payload.publicAcknowledged !== true) return 'publicAcknowledged';
  if (typeof payload.managementSecret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.managementSecret)) return 'managementSecret';
  if (payload.access !== undefined && payload.access !== 'public' && payload.access !== 'private') return 'access';
  if (payload.listed !== undefined && typeof payload.listed !== 'boolean') return 'listed';
  if (payload.listed === true && payload.access === 'private') return 'listed private';
  if (payload.license !== undefined) {
    const license = payload.license;
    if (!isObject(license) || Object.keys(license).some(key => !['id', 'name', 'url'].includes(key))) return 'license shape';
    for (const [key, max] of [['id', 80], ['name', 160]] as const) {
      const rule = textRule(license[key], max, true);
      if (rule) return `license ${key} ${rule}`;
    }
    if (license.url !== undefined && license.url !== '') {
      if (typeof license.url !== 'string' || license.url.length > 2048) return 'license url';
      // The Hub stores the normalized link, which can be longer than the one sent, and caps it too.
      try { const parsed = new URL(license.url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.href.length > 2048) return 'license url'; } catch { return 'license url'; }
    }
  }
  if (payload.assets !== undefined) {
    const assets = payload.assets;
    if (!isObject(assets) || Object.keys(assets).some(key => !ASSET_KEYS.has(key)) || (assets.format !== 'folder' && assets.format !== 'zip')
      || (assets.imageFormat !== 'original' && assets.imageFormat !== 'jpeg') || (assets.format === 'folder' && assets.imageFormat !== 'original')
      || typeof assets.viewerSettings !== 'boolean' || typeof assets.preview !== 'boolean'
      || !isObject(assets.colmap) || Object.keys(assets.colmap).some(key => !['files', 'cameras', 'points'].includes(key))) return 'assets shape';
    const counts = [assets.colmap.files, assets.colmap.cameras, assets.colmap.points, assets.images, assets.masks, assets.splats];
    if (counts.some(count => typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)) return 'asset counts';
  }
  const viewer = payload.viewerUrl;
  if (typeof viewer !== 'string' || viewer.length > 32768 || /\s/.test(viewer) || hasControls(viewer)) return 'viewerUrl';
  let url: URL;
  try { url = new URL(viewer); } catch { return 'viewerUrl'; }
  // Normalizing percent-encodes characters such as '€' (one becomes nine), so the Hub caps the normalized link too.
  if (url.href.length > 32768) return 'viewerUrl';
  if (!VIEWER_ORIGINS.has(url.origin) || !VIEWER_PATH.test(url.pathname)) return 'viewer origin';
  const credentials = credentialRule(url);
  if (credentials) return credentials;
  const source = url.searchParams.get('url');
  if (source) {
    // Parsed without a base, as the Hub does: a relative or protocol-relative source skips the check (a known, parked Hub issue).
    try { const sourceRule = credentialRule(new URL(source)); if (sourceRule) return sourceRule; } catch { /* the Hub ignores an unparseable source */ }
  }
  for (const [key, max, optional] of [['title', 120, false], ['description', 280, true]] as const) {
    const rule = textRule(payload[key], max, optional);
    if (rule) return `${key} ${rule}`;
  }
  return null;
}

const secret = 'S'.repeat(43);
const viewer = (source: string, base = 'https://colmapview.opsiclear.com/') => `${base}?url=${source}`;
const build = (metadata: HubMetadata, access: 'public' | 'private' = 'public', viewerUrl = viewer('https://huggingface.co/datasets/user/scene')) =>
  buildHubPayload({ viewerUrl, metadata, access, thumbnailBase64: '/9j/AAAA', managementSecret: secret }) as unknown as Record<string, unknown>;

describe(`viewer payloads against the Hub's creation rules (colmapview_hub ${HUB_COMMIT})`, () => {
  it.each([
    ['plain text', { title: 'Scene', description: 'A reconstruction.' }],
    ['a long emoji title', { title: '👍🏽'.repeat(80) }],
    ['combining marks', { title: 'é'.repeat(300), description: 'é'.repeat(900) }],
    ['controls and line breaks', { title: 'Scene\u0007\tname', description: 'Line one\nline two\r\n\u0000end' }],
    ['a long custom license', { title: 'Scene', license: publicationLicenseInfo({ license: 'other', licenseName: 'L'.repeat(200), licenseUrl: 'https://example.com/license' }) }],
    ['an asset summary', { title: 'Scene', assets: { format: 'zip', imageFormat: 'jpeg', colmap: { files: 3, cameras: 2, points: 10 }, images: 2, masks: 0, splats: 1, viewerSettings: true, preview: true } }],
    ['a license link too long once normalized', { title: 'Scene', license: { name: 'Custom', url: `https://example.com/${'€'.repeat(300)}` } }],
  ] satisfies Array<[string, HubMetadata]>)('accepts %s', (_name, metadata) => {
    expect(hubRejection(build(metadata))).toBeNull();
  });

  it.each(PUBLICATION_LICENSES.filter(option => option.id !== 'other').map(option => option.id))('accepts the %s license', id => {
    expect(hubRejection(build({ title: 'Scene', license: publicationLicenseInfo({ license: id }) }))).toBeNull();
  });

  it('accepts private uploads from every viewer host and path', () => {
    for (const viewerUrl of [
      viewer('https://drive.google.com/file/d/abc/view'),
      viewer('https://bucket.example/scene/manifest.json', 'https://colmapview.github.io/latest/'),
      viewer('https://bucket.example/scene.zip', 'https://colmapview.github.io/v0.16.13/'),
      viewer('https://huggingface.co/datasets/u/s', 'https://colmapview.github.io/dev/'),
    ]) expect(hubRejection(build({ title: 'Scene' }, 'private', viewerUrl)), viewerUrl).toBeNull();
  });

  it('mirrors rejections, so a passing payload means something', () => {
    expect(hubRejection({ ...build({ title: 'Scene' }), listed: 'yes' })).toBe('listed');
    expect(hubRejection({ ...build({ title: 'Scene' }), extra: true })).toBe('unknown key extra');
    expect(hubRejection(build({ title: 'Scene' }, 'public', viewer(encodeURIComponent('https://bucket.example/scene.zip?X-Amz-Signature=abc'))))).toBe('credentials');
    // Normalized links are capped too, the production Hub refuses loopback viewers, and a folder upload keeps original images.
    expect(hubRejection(build({ title: 'Scene' }, 'public', viewer(`https://bucket.example/${'€'.repeat(4000)}`)))).toBe('viewerUrl');
    expect(hubRejection({ ...build({ title: 'Scene' }), license: { name: 'Custom', url: `https://example.com/${'€'.repeat(300)}` } })).toBe('license url');
    expect(hubRejection(build({ title: 'Scene' }, 'public', viewer('https://huggingface.co/datasets/u/s', 'http://localhost:5173/')))).toBe('viewer origin');
    expect(hubRejection({ ...build({ title: 'Scene' }), assets: { format: 'folder', imageFormat: 'jpeg', colmap: { files: 3, cameras: 2, points: 10 },
      images: 2, masks: 0, splats: 1, viewerSettings: true, preview: true } })).toBe('assets shape');
  });
});
