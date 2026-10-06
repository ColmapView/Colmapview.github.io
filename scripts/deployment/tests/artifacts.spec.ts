import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync, zipSync, strToU8 } from 'fflate';
import { startArtifactServer } from '../static-server.mjs';
import { verifyIndexHtml } from '../artifact-verification.mjs';
import { loadTestDataset } from '../../../e2e/fixtures/load-test-data';

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
const profiles = (process.env.DEPLOYMENT_SMOKE_PROFILES || 'github,custom,preview').split(',');
const customOrigin = 'https://colmapview.opsiclear.com';
const driveUrl = 'https://drive.google.com/file/d/artifact_fixture_file/view?resourcekey=fixture-resource&access_token=must-not-transfer';
const fixture = path.resolve('e2e/fixtures/test-data');
const archive = Buffer.from(zipSync(Object.fromEntries(['cameras.txt', 'images.txt', 'points3D.txt'].map(name => [name, strToU8(readFileSync(path.join(fixture, 'sparse', name), 'utf8'))]))));
// A real USTAR fixture exercises native libarchive/WASM at the custom root, beyond mocked API success.
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
  driveArchive = { filename: 'artifact.zip', mimeType: 'application/zip', body: archive }) {
  const externalRequests: string[] = [];
  const assetRequests: string[] = [];
  const driveRequests: { url: string; authorization?: string }[] = [];
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
      driveRequests.push({ url: url.href, authorization: request.headers().authorization });
      if (url.searchParams.get('alt') === 'media') {
        await route.fulfill({ status: 200, contentType: driveArchive.mimeType, headers: { 'Content-Length': String(driveArchive.body.length) }, body: driveArchive.body });
      } else {
        await route.fulfill({ json: { id: 'artifact_fixture_file', name: driveArchive.filename, size: String(driveArchive.body.length), mimeType: driveArchive.mimeType, capabilities: { canDownload: true } } });
      }
      return;
    }
    // Provider SDKs, Analytics, fonts and any other external request are forbidden in this offline smoke.
    externalRequests.push(url.href);
    await route.abort('blockedbyclient');
  });
  return { externalRequests, driveRequests, assetRequests };
}

for (const directory of profiles) {
  const output = path.resolve(root, directory);
  const metadata: DeploymentMetadata = JSON.parse(readFileSync(path.join(output, 'deployment.json'), 'utf8'));
  baselineSha ??= metadata.sourceSha;
  const hosts = metadata.profile === 'custom' ? [customOrigin, 'https://artifact-check.pages.dev', 'https://colmapview.github.io']
    : metadata.profile === 'github' ? ['https://colmapview.github.io'] : ['https://artifact-check.pages.dev'];

  for (const origin of hosts) {
    test(`${directory} artifact at ${origin}: policies, native loading and Drive origin gate`, async ({ page, context }) => {
      expect(metadata.schemaVersion).toBe(1);
      verifyIndexHtml(readFileSync(path.join(output, 'index.html')), metadata);
      expect(metadata.sourceSha).toMatch(/^[a-f0-9]{40}$/);
      expect(metadata.sourceSha).toBe(baselineSha);
      if (process.env.DEPLOYMENT_SHA) expect(metadata.sourceSha).toBe(process.env.DEPLOYMENT_SHA);
      expect(metadata.version).toMatch(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/);
      // Trusted preview checks may run from a newer default branch than the selected preview source.
      if (metadata.profile !== 'preview') expect(metadata.version).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version);
      expect(metadata.googleDrive.enabled).toBe(metadata.profile === 'custom');
      expect(metadata.base).toMatch(/^\/(?:[A-Za-z0-9.+_-]+\/)*$/);
      if (metadata.profile !== 'github') {
        expect(metadata.base).toBe('/');
        const headers = readFileSync(path.join(output, '_headers'), 'utf8');
        expect(headers).toContain('Cross-Origin-Opener-Policy: same-origin-allow-popups');
        expect(headers).not.toContain('Cross-Origin-Embedder-Policy');
      }
      const enabled = metadata.profile === 'custom' && origin === customOrigin;
      const server = await startArtifactServer(output, metadata.base);
      const traffic = await routeArtifact(context, origin, server.origin, enabled);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        const viewer = `${origin}${metadata.base}`;
        for (const filename of ['about.html', 'privacy.html', 'terms.html']) {
          const response = await page.goto(`${viewer}${filename}`);
          expect(response?.status()).toBe(200);
          await expect(page.locator('h1')).toBeVisible();
          const links = await page.getByRole('navigation', { name: 'Main navigation', exact: true }).locator('a').evaluateAll(anchors => anchors.map(anchor => (anchor as HTMLAnchorElement).href));
          for (const link of links) expect(new URL(link).origin).toBe(origin);
          expect(links.some(link => link === viewer)).toBe(true);
        }
        const response = await page.goto(viewer);
        expect(response?.status()).toBe(200);
        if (metadata.profile !== 'github') expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
        await expect(page.getByRole('heading', { name: 'Load Dataset', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Google Drive account', exact: true })).toHaveCount(enabled ? 1 : 0);
        await expect(page.getByRole('button', { name: 'Publish to Google Drive', exact: true })).toHaveCount(enabled ? 1 : 0);
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
          expect(destination.origin).toBe(customOrigin);
          expect(destination.searchParams.get('url')).toBe('https://drive.google.com/file/d/artifact_fixture_file/view?resourcekey=fixture-resource');
          expect(destination.href).not.toContain('access_token');
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
  if (metadata.profile === 'custom') {
    for (const driveArchive of [
      { filename: 'artifact.tar', mimeType: 'application/x-tar', body: tarArchive },
      { filename: 'artifact.tar.gz', mimeType: 'application/gzip', body: Buffer.from(gzipSync(tarArchive)) },
    ]) {
      test(`${directory} custom root: native public ${driveArchive.filename} loading`, async ({ page, context }) => {
        const server = await startArtifactServer(output, '/');
        const traffic = await routeArtifact(context, customOrigin, server.origin, true, driveArchive);
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(`${customOrigin}/`);
          const dialog = await enterDriveUrl(page);
          await dialog.getByRole('button', { name: 'Load', exact: true }).click();
          await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45_000 });
          await expect(page.getByTestId('scene-3d').locator('canvas')).toBeVisible();
          expect(traffic.driveRequests).toHaveLength(2);
          expect(traffic.driveRequests.every(request => !request.authorization)).toBe(true);
          expect(traffic.assetRequests.some(url => url.endsWith('/libarchive.wasm'))).toBe(true);
          expect(traffic.assetRequests.some(url => /worker-bundle.*\.js$/.test(url))).toBe(true);
          expect(traffic.externalRequests).toEqual([]);
          expect(errors).toEqual([]);
        } finally { await server.close(); }
      });
    }
  }
}
