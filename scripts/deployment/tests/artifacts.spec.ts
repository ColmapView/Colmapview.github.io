import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync, zipSync, strToU8 } from 'fflate';
import { startArtifactServer } from '../static-server.mjs';
import { verifyIndexHtml } from '../artifact-verification.mjs';
import { CUSTOM_ORIGIN, GITHUB_ORIGIN, PROFILES } from '../profiles.mjs';
import { loadTestDataset } from '../../../e2e/fixtures/load-test-data';
import { decodeShareData } from '../../../src/utils/shareDataCodec';

interface DeploymentMetadata {
  schemaVersion: number;
  sourceSha: string;
  version: string;
  release: string;
  profile: 'github' | 'custom' | 'preview';
  base: string;
  indexHtmlSha256: string;
  googleDrive: { enabled: boolean; allowedOrigin: string | null };
}

const root = process.env.DEPLOYMENT_SMOKE_ROOT || '.tmp/deployment-smoke';
const profiles = (process.env.DEPLOYMENT_SMOKE_PROFILES || PROFILES.join(',')).split(',');
const driveUrl = 'https://drive.google.com/file/d/artifact_fixture_file/view?resourcekey=fixture-resource&access_token=must-not-transfer';
const fixture = path.resolve('e2e/fixtures/test-data');
const archive = Buffer.from(zipSync(Object.fromEntries(['cameras.txt', 'images.txt', 'points3D.txt'].map(name => [name, strToU8(readFileSync(path.join(fixture, 'sparse', name), 'utf8'))]))));
// A real USTAR fixture exercises archive extraction at the custom root, beyond mocked API success.
const tarParts: Buffer[] = [];
for (const name of ['cameras.txt', 'images.txt', 'points3D.txt']) {
  const body = readFileSync(path.join(fixture, 'sparse', name));
  const header = Buffer.alloc(512);
  header.write(name, 0);
  header.write('0000644\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124);
  header.write('00000000000\0', 136);
  header.fill(32, 148, 156);
  header.write('0', 156);
  header.write('ustar\0', 257);
  header.write('00', 263);
  header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148);
  tarParts.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
}
tarParts.push(Buffer.alloc(1024));
const tarArchive = Buffer.concat(tarParts);
let baselineSha: string | undefined;

async function enterDriveUrl(page: Page) {
  await page.getByRole('button', { name: 'Load URL', exact: true }).click();
  const dialog = page.getByTestId('url-modal');
  await dialog.locator('input[type="url"]').fill(driveUrl);
  return dialog;
}

async function routeArtifact(context: BrowserContext, origin: string, serverOrigin: string, allowDrive: boolean,
  driveArchive = { filename: 'artifact.zip', mimeType: 'application/zip', body: archive },
  googleSignIn?: { privateFile?: boolean; cancel?: boolean }) {
  const externalRequests: string[] = [];
  const assetRequests: string[] = [];
  const driveRequests: { url: string; authorization?: string; resourceKey?: string }[] = [];
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) {
      assetRequests.push(url.pathname);
      const response = await route.fetch({ url: `${serverOrigin}${url.pathname}${url.search}` });
      await route.fulfill({ response });
      return;
    }
    if (allowDrive && url.hostname === 'www.googleapis.com' && url.pathname === '/drive/v3/files/artifact_fixture_file') {
      driveRequests.push({ url: url.href, authorization: request.headers().authorization, resourceKey: request.headers()['x-goog-drive-resource-keys'] });
      if (googleSignIn?.privateFile && request.headers().authorization !== 'Bearer selected-file-token') {
        await route.fulfill({ status: 404, json: { error: { code: 404, message: 'File not found' } } });
        return;
      }
      if (url.searchParams.get('alt') === 'media') {
        await route.fulfill({ status: 200, contentType: driveArchive.mimeType, headers: { 'Content-Length': String(driveArchive.body.length) }, body: driveArchive.body });
      } else {
        await route.fulfill({ json: { id: 'artifact_fixture_file', name: driveArchive.filename, size: String(driveArchive.body.length), mimeType: driveArchive.mimeType, capabilities: { canDownload: true } } });
      }
      return;
    }
    if (allowDrive && googleSignIn && url.href === 'https://accounts.google.com/gsi/client') {
      await route.fulfill({ contentType: 'text/javascript', body: `window.google = { accounts: { oauth2: {
        initTokenClient(config) { return { requestAccessToken() {
          window.__driveConsent = { scope: config.scope, loginHint: config.login_hint };
          ${googleSignIn.cancel ? "config.error_callback({type: 'popup_closed'});" : "config.callback({ access_token: 'selected-file-token', token_type: 'Bearer', expires_in: 3600, scope: config.scope });"}
        } }; }
      } } };` });
      return;
    }
    // Provider SDKs, Analytics, fonts and any other external request are forbidden in this offline smoke.
    externalRequests.push(url.href);
    await route.abort('blockedbyclient');
  });
  return { externalRequests, driveRequests, assetRequests };
}

// Profile checks key on the trusted directory name, never on the artifact's own deployment.json, which the selected
// ref controls: a relabelled preview must not skip the preview-only checks. deploy.yml's `version` is a github build.
const directoryProfiles: Record<string, DeploymentMetadata['profile']> = { version: 'github', github: 'github', custom: 'custom', preview: 'preview' };

for (const directory of profiles) {
  const profile = directoryProfiles[directory];
  if (!profile) throw new Error(`Unknown deployment smoke directory: ${directory}`);
  const output = path.resolve(root, directory);
  const metadata: DeploymentMetadata = JSON.parse(readFileSync(path.join(output, 'deployment.json'), 'utf8'));
  baselineSha ??= metadata.sourceSha;
  const hosts = profile === 'custom' ? [CUSTOM_ORIGIN, 'https://artifact-check.pages.dev', GITHUB_ORIGIN]
    : profile === 'github' ? [GITHUB_ORIGIN] : ['https://artifact-check.pages.dev'];

  for (const origin of hosts) {
    if (profile !== 'preview') test(`${directory} at ${origin}: Drive Open with startup`, async ({ page, context }) => {
      const server = await startArtifactServer(output, metadata.base);
      const enabled = profile === 'custom' && origin === CUSTOM_ORIGIN;
      const traffic = await routeArtifact(context, origin, server.origin, enabled, undefined, { privateFile: true });
      const state = { action: 'open', ids: ['artifact_fixture_file'], resourceKeys: { artifact_fixture_file: 'fixture-resource' }, userId: '123456789' };
      try {
        await page.goto(`${origin}${metadata.base}?drive=open&state=${encodeURIComponent(JSON.stringify(state))}&url=https://untrusted.invalid/dataset.zip`);
        const dialog = page.getByRole('dialog', { name: 'Google Drive', exact: true });
        await expect(dialog).toBeVisible();
        await expect(page).not.toHaveURL(/state=/);
        expect(page.url()).not.toContain('123456789');
        expect(traffic.driveRequests).toEqual([]);
        if (enabled) {
          await dialog.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
          await expect(page.getByTestId('scene-3d').locator('canvas')).toBeVisible({ timeout: 45_000 });
          await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible();
          expect(await page.evaluate(() => (window as Window & { __driveConsent?: unknown }).__driveConsent)).toEqual({
            scope: 'https://www.googleapis.com/auth/drive.file', loginHint: '123456789',
          });
          expect(traffic.driveRequests.some(request => request.authorization === 'Bearer selected-file-token')).toBe(true);
          expect(traffic.driveRequests.every(request => request.resourceKey === 'artifact_fixture_file/fixture-resource')).toBe(true);
        } else {
          const link = new URL((await dialog.getByRole('link', { name: 'Open ColmapView', exact: true }).getAttribute('href'))!);
          expect(link.origin).toBe(CUSTOM_ORIGIN);
          expect(JSON.parse(link.searchParams.get('state')!)).toEqual(state);
          expect(traffic.driveRequests).toEqual([]);
        }
        expect(traffic.externalRequests).toEqual([]);
      } finally { await server.close(); }
    });
    test(`${directory} artifact at ${origin}: policies, native loading and Drive origin gate`, async ({ page, context }) => {
      expect(metadata.profile, 'artifact profile').toBe(profile);
      expect(metadata.schemaVersion).toBe(1);
      verifyIndexHtml(readFileSync(path.join(output, 'index.html')), metadata);
      expect(metadata.sourceSha).toMatch(/^[a-f0-9]{40}$/);
      expect(metadata.sourceSha).toBe(baselineSha);
      if (process.env.DEPLOYMENT_SHA) expect(metadata.sourceSha).toBe(process.env.DEPLOYMENT_SHA);
      expect(metadata.version).toMatch(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/);
      // Trusted preview checks may run from a newer default branch than the selected preview source.
      if (profile !== 'preview') expect(metadata.version).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version);
      expect(metadata.googleDrive.enabled).toBe(profile === 'custom');
      expect(metadata.base).toMatch(/^\/(?:[A-Za-z0-9.+_-]+\/)*$/);
      if (profile !== 'github') {
        expect(metadata.base).toBe('/');
        const headers = readFileSync(path.join(output, '_headers'), 'utf8');
        expect(headers).toContain('Cross-Origin-Opener-Policy: same-origin-allow-popups');
        expect(headers).not.toContain('Cross-Origin-Embedder-Policy');
        // Static files only: Cloudflare runs a _worker.js as server code under the deploying account.
        for (const entry of ['_worker.js', '_routes.json', 'functions']) expect(existsSync(path.join(output, entry)), entry).toBe(false);
      }
      const enabled = profile === 'custom' && origin === CUSTOM_ORIGIN;
      const server = await startArtifactServer(output, metadata.base);
      const traffic = await routeArtifact(context, origin, server.origin, enabled);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        const viewer = `${origin}${metadata.base}`;
        for (const filename of ['about.html', 'privacy.html', 'terms.html']) {
          const response = await page.goto(`${viewer}${filename}`);
          expect(response?.status()).toBe(200);
          if (profile !== 'github') expect(response?.headers()['cache-control']).toBe('public, no-cache, no-transform');
          await expect(page.locator('h1')).toBeVisible();
          const links = await page.getByRole('navigation', { name: 'Main navigation', exact: true }).locator('a').evaluateAll(anchors => anchors.map(anchor => (anchor as HTMLAnchorElement).href));
          for (const link of links) expect(new URL(link).origin).toBe(origin);
          expect(links.some(link => link === viewer)).toBe(true);
        }
        const response = await page.goto(viewer);
        expect(response?.status()).toBe(200);
        if (profile !== 'github') {
          expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
          expect(response?.headers()['cache-control']).toBe('public, no-cache, no-transform');
        }
        await expect(page.getByRole('button', { name: 'Browse for a COLMAP dataset folder', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Google Drive account', exact: true })).toHaveCount(enabled ? 1 : 0);
        await expect(page.getByRole('button', { name: 'Publish to Google Drive', exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Dismiss this panel', exact: true }).click();
        await page.getByRole('button', { name: 'Share', exact: true }).click();
        const share = page.getByRole('region', { name: 'Share', exact: true });
        await expect(share.getByRole('button', { name: 'Bucket storage', exact: true })).toBeVisible();
        await expect(share.getByRole('button', { name: 'Publish to Google Drive', exact: true })).toHaveCount(enabled ? 1 : 0);
        await expect(share.getByRole('link', { name: 'Use Google Drive', exact: true })).toHaveCount(enabled ? 0 : 1);
        await page.goto(viewer);
        expect(await page.evaluate(() => location.origin)).toBe(origin);
        const dialog = await enterDriveUrl(page);
        if (enabled) {
          await dialog.getByRole('button', { name: 'Load', exact: true }).click();
          await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45_000 });
          await expect(page.getByTestId('scene-3d').locator('canvas')).toBeVisible();
          expect(traffic.driveRequests).toHaveLength(2);
          expect(traffic.driveRequests.every(request => !request.authorization)).toBe(true);
          expect(traffic.driveRequests.every(request => new URL(request.url).searchParams.has('key'))).toBe(true);
        } else {
          const handoff = dialog.getByRole('link', { name: 'Use Google Drive', exact: true });
          const destination = new URL((await handoff.getAttribute('href'))!);
          const sharedDriveUrl = 'https://drive.google.com/file/d/artifact_fixture_file/view?resourcekey=fixture-resource';
          // Trusted preview checks may run on an older preview source, which hands the file over in ?url=.
          if (profile === 'preview' && destination.searchParams.has('url')) {
            expect(destination.origin + destination.pathname).toBe(`${CUSTOM_ORIGIN}/`);
            expect(destination.searchParams.get('url')).toBe(sharedDriveUrl);
            expect(destination.href).not.toContain('access_token');
          } else {
            // The file ID rides in the fragment, which never reaches the custom host's server.
            expect(destination.origin + destination.pathname + destination.search).toBe(`${CUSTOM_ORIGIN}/`);
            expect((await decodeShareData(destination.hash))?.manifestUrl).toBe(sharedDriveUrl);
          }
          await dialog.locator('input[type="url"]').press('Enter');
          await expect(dialog).toBeVisible();
          expect(traffic.driveRequests).toEqual([]);
          await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
          // Direct shared links must enforce the same gate even when the URL modal is bypassed.
          await page.goto(`${viewer}?url=${encodeURIComponent(driveUrl)}`);
          await expect(page.getByText(/^Google Drive is available at /)).toBeVisible();
          expect(traffic.driveRequests).toEqual([]);
          // The hosted build must still parse/render local COLMAP through production worker/WASM paths.
          await loadTestDataset(page);
          await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45_000 });
          await expect(page.getByTestId('scene-3d').locator('canvas')).toBeVisible();
        }
        expect(traffic.externalRequests).toEqual([]);
        expect(errors).toEqual([]);
      } finally { await server.close(); }
    });
  }
  if (profile === 'custom') {
    test(`${directory}: explicit Drive installation requests menu permission without loading a dataset`, async ({ page, context }) => {
      const server = await startArtifactServer(output, '/');
      const traffic = await routeArtifact(context, CUSTOM_ORIGIN, server.origin, true, undefined, {});
      try {
        await page.goto(`${CUSTOM_ORIGIN}/`);
        await page.getByRole('button', { name: 'Google Drive account', exact: true }).click();
        await page.getByRole('button', { name: 'Add to Google Drive', exact: true }).click();
        await expect(page.getByText(/ColmapView was added to Google Drive/)).toBeVisible();
        expect(await page.evaluate(() => (window as Window & { __driveConsent?: { scope: string } }).__driveConsent?.scope)).toBe('https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.install');
        expect(traffic.driveRequests).toEqual([]);
        expect(traffic.externalRequests).toEqual([]);
      } finally { await server.close(); }
    });
    test(`${directory}: canceled and malformed Drive launches never load data`, async ({ page, context }) => {
      const server = await startArtifactServer(output, '/');
      const traffic = await routeArtifact(context, CUSTOM_ORIGIN, server.origin, true, undefined, { cancel: true });
      const state = encodeURIComponent(JSON.stringify({ action: 'open', ids: ['artifact_fixture_file'] }));
      try {
        await page.goto(`${CUSTOM_ORIGIN}/?drive=open&state=${state}`);
        const dialog = page.getByRole('dialog', { name: 'Google Drive', exact: true });
        await dialog.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
        await expect(dialog.getByRole('alert')).toContainText('closed');
        await dialog.getByRole('button', { name: 'Close account dialog', exact: true }).click();
        await expect(dialog).not.toBeVisible();
        await page.goto(`${CUSTOM_ORIGIN}/?drive=open&state=invalid&url=${encodeURIComponent(driveUrl)}`);
        await expect(page.getByText(/This Google Drive launch link is invalid/)).toBeVisible();
        expect(traffic.driveRequests).toEqual([]);
        expect(traffic.externalRequests).toEqual([]);
      } finally { await server.close(); }
    });
    for (const driveArchive of [
      { filename: 'artifact.tar', mimeType: 'application/x-tar', body: tarArchive, compatibility: false },
      { filename: 'artifact.tar.gz', mimeType: 'application/gzip', body: Buffer.from(gzipSync(tarArchive)), compatibility: false },
      { filename: 'artifact.tgz', mimeType: 'application/gzip', body: Buffer.from(gzipSync(tarArchive)), compatibility: true },
      { filename: 'artifact-denied.tgz', mimeType: 'application/gzip', body: Buffer.from(gzipSync(tarArchive)), compatibility: true, storageDenied: true },
    ]) {
      test(`${directory} custom root: worker public ${driveArchive.filename} loading`, async ({ page, context }) => {
        expect(metadata.profile, 'artifact profile').toBe(profile);
        const server = await startArtifactServer(output, '/');
        const traffic = await routeArtifact(context, CUSTOM_ORIGIN, server.origin, true, driveArchive);
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          if (driveArchive.compatibility) {
            // API presence and usable OPFS access are separate compatibility cases.
            await page.addInitScript((storageDenied: boolean) => {
              const NativeWorker = Worker;
              window.Worker = class extends NativeWorker {
                constructor(url: string | URL, options?: WorkerOptions) {
                  if (String(url).includes('archive.worker-')) {
                    const target = new URL(String(url), location.href).href;
                    const setup = storageDenied
                      ? `Object.defineProperty(navigator.storage, 'getDirectory', { value: async () => { throw new DOMException('Storage denied', 'SecurityError'); } });`
                      : `Object.defineProperty(navigator, 'storage', { value: undefined });`;
                    const source = `${setup} import(${JSON.stringify(target)});`;
                    super(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })), options);
                  } else super(url, options);
                }
              };
            }, 'storageDenied' in driveArchive && driveArchive.storageDenied === true);
          }
          await page.goto(`${CUSTOM_ORIGIN}/`);
          const dialog = await enterDriveUrl(page);
          await dialog.getByRole('button', { name: 'Load', exact: true }).click();
          await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45_000 });
          await expect(page.getByTestId('scene-3d').locator('canvas')).toBeVisible();
          expect(traffic.driveRequests).toHaveLength(2);
          expect(traffic.driveRequests.every(request => !request.authorization)).toBe(true);
          expect(traffic.assetRequests.some(url => /archive\.worker-.*\.js$/.test(url))).toBe(true);
          expect(traffic.assetRequests.some(url => url.endsWith('/libarchive.wasm'))).toBe(driveArchive.compatibility);
          expect(traffic.assetRequests.some(url => /worker-bundle.*\.js$/.test(url))).toBe(false);
          expect(traffic.externalRequests).toEqual([]);
          expect(errors).toEqual([]);
        } finally { await server.close(); }
      });
    }
  }
}
