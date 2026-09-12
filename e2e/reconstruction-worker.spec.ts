import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadTestDataset } from './fixtures/load-test-data';
import { parseCamerasText } from '../src/parsers/cameras';
import { parseImagesBinary, parseImagesText } from '../src/parsers/images';
import { parsePoints3DBinary, parsePoints3DText } from '../src/parsers/points3d';
import { writeCamerasBinary, writeImagesBinary, writePoints3DBinary } from '../src/parsers/colmapBinaryWriters';

const fixture = resolve('e2e/fixtures/test-data/sparse');
const binaryFiles = [
  ['cameras.bin', writeCamerasBinary(parseCamerasText(readFileSync(resolve(fixture, 'cameras.txt'), 'utf8')))],
  ['images.bin', writeImagesBinary(parseImagesText(readFileSync(resolve(fixture, 'images.txt'), 'utf8')))],
  ['points3D.bin', writePoints3DBinary(parsePoints3DText(readFileSync(resolve(fixture, 'points3D.txt'), 'utf8')))],
] as const;

for (const format of ['text', 'binary'] as const) {
  test(`${format} reconstruction uses a real worker through load, observations, edits and export`, async ({ page }, testInfo) => {
    const logs: string[] = [];
    page.on('console', message => logs.push(`${message.type()}: ${message.text()}`));
    page.on('pageerror', error => logs.push(`pageerror: ${error.message}`));
    await page.goto('/');
    await expect(page.getByTestId('drop-zone')).toBeVisible();
    const workerCreated = page.waitForEvent('worker', worker => worker.url().includes('reconstruction.worker'));
    await loadTestDataset(page, format === 'binary' ? binaryFiles.map(([name, bytes]) => ({ name, relativePath: `sparse/${name}`, base64: Buffer.from(bytes).toString('base64') })) : []);
    try {
      await expect(page.getByText('photo.jpg', { exact: true }).first()).toBeVisible({ timeout: 20000 });
    } finally {
      const path = testInfo.outputPath('browser.log');
      writeFileSync(path, logs.join('\n'));
      await testInfo.attach('browser-log', { path, contentType: 'text/plain' });
    }
    const worker = await workerCreated;
    expect(await worker.evaluate(() => ({ hasWindow: typeof window !== 'undefined', parses: performance.getEntriesByName('colmap-parse').length }))).toEqual({ hasWindow: false, parses: 1 });
    expect(await page.evaluate(() => performance.getEntriesByName('colmap-parse').length)).toBe(0);

    const result = await page.evaluate(async () => {
      const storePath = '/src/store/reconstructionStore.ts';
      const transformPath = '/src/store/actions/transformActions.ts';
      const transformStorePath = '/src/store/stores/transformStore.ts';
      const deletionPath = '/src/store/actions/deletionActions.ts';
      const deletionStorePath = '/src/store/stores/deletionStore.ts';
      const { useReconstructionStore } = await import(/* @vite-ignore */ storePath);
      const { applyTransformToData } = await import(/* @vite-ignore */ transformPath);
      const { useTransformStore } = await import(/* @vite-ignore */ transformStorePath);
      const { applyDeletionsToData } = await import(/* @vite-ignore */ deletionPath);
      const { useDeletionStore } = await import(/* @vite-ignore */ deletionStorePath);
      const initial = useReconstructionStore.getState().wasmReconstruction;
      const observations = await initial.observations([1, 2]);
      useTransformStore.getState().setTransform({ scale: 2, rotationX: 0, rotationY: 0, rotationZ: 0, translationX: 5, translationY: 0, translationZ: 0 });
      const transformed = await applyTransformToData();
      useDeletionStore.getState().markForDeletion(2);
      const deleted = await applyDeletionsToData();
      const state = useReconstructionStore.getState();
      return {
        mode: state.wasmReconstruction.service.mode, parser: initial.data.diagnostics.parser,
        observations: observations.get(1).map((point: { xy: number[]; point3DId: bigint }) => ({ xy: point.xy, id: String(point.point3DId) })),
        transformed, deleted, imageIds: [...state.reconstruction.images.keys()],
        materializedInUi: state.reconstruction.points3D !== undefined,
        uiObservationCount: state.reconstruction.images.get(1).points2D.length,
        tracks: [...state.wasmReconstruction.getTrackLengths()],
      };
    });
    expect(result.mode).toBe('worker');
    expect(result.parser).toBe(format === 'binary' ? 'wasm' : 'javascript');
    expect(result.observations).toEqual([{ xy: [320, 240], id: '1' }]);
    expect(result.transformed).toBe(true);
    expect(result.deleted).toBe(true);
    expect(result.imageIds).toEqual([1]);
    expect(result.materializedInUi).toBe(false);
    expect(result.uiObservationCount).toBe(0);
    expect(result.tracks).toEqual([1]);

    const imageDownload = page.waitForEvent('download', download => download.suggestedFilename() === 'images.bin');
    const pointDownload = page.waitForEvent('download', download => download.suggestedFilename() === 'points3D.bin');
    await page.evaluate(async () => {
      const storePath = '/src/store/reconstructionStore.ts';
      const writerPath = '/src/parsers/writers.ts';
      const { useReconstructionStore } = await import(/* @vite-ignore */ storePath);
      const { exportReconstructionBinary } = await import(/* @vite-ignore */ writerPath);
      const { reconstruction, wasmReconstruction } = useReconstructionStore.getState();
      await exportReconstructionBinary(reconstruction, wasmReconstruction);
    });
    const imagePath = await (await imageDownload).path();
    const pointPath = await (await pointDownload).path();
    const imageBytes = readFileSync(imagePath!);
    const pointBytes = readFileSync(pointPath!);
    const images = parseImagesBinary(Uint8Array.from(imageBytes).buffer);
    const points = parsePoints3DBinary(Uint8Array.from(pointBytes).buffer);
    expect([...images.keys()]).toEqual([1]);
    expect(images.get(1)?.points2D[0].point3DId).toBe(1n);
    expect(points.get(1n)?.track).toEqual([{ imageId: 1, point2DIdx: 0 }]);

    const closed = worker.waitForEvent('close');
    await page.evaluate(async () => {
      const storePath = '/src/store/reconstructionStore.ts';
      const { useReconstructionStore } = await import(/* @vite-ignore */ storePath);
      useReconstructionStore.getState().clear();
    });
    await closed;
  });
}

test('clearing a pending real worker load prevents snapshot installation', async ({ page }) => {
  await page.goto('/');
  // Hold worker module initialization so clear deterministically interrupts an active load.
  let release: () => void = () => undefined;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/reconstruction.worker.ts*', async route => { await held; await route.continue().catch(() => undefined); });
  await loadTestDataset(page);
  await expect.poll(() => page.evaluate(async () => {
    const storePath = '/src/store/reconstructionStore.ts';
    const { useReconstructionStore } = await import(/* @vite-ignore */ storePath);
    return useReconstructionStore.getState().loadedFiles?.camerasFile?.name;
  })).toBe('cameras.txt');
  await page.evaluate(async () => {
    const storePath = '/src/store/reconstructionStore.ts';
    const { useReconstructionStore } = await import(/* @vite-ignore */ storePath);
    useReconstructionStore.getState().clear();
  });
  release();
  await page.unroute('**/reconstruction.worker.ts*');
  await expect.poll(() => page.evaluate(async () => {
    const storePath = '/src/store/reconstructionStore.ts';
    const { useReconstructionStore } = await import(/* @vite-ignore */ storePath);
    return useReconstructionStore.getState().reconstruction;
  })).toBe(null);
  await loadTestDataset(page);
  await expect(page.getByText('photo.jpg', { exact: true }).first()).toBeVisible({ timeout: 45000 });
});
