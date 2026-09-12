import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apiUrl = process.env.COLMAP_TRAIN_REAL_API_URL;
const source = process.env.COLMAP_TRAIN_REAL_DATASET_DIR;

test('native partial-mask snapshot reaches real API readiness without fallback uploads', async ({ page, browserName }) => {
  test.skip(!apiUrl || !source, 'Requires a native-mask-enabled local API and the two-view training fixture.');
  test.setTimeout(90_000);
  if (browserName === 'chromium') {
    await page.context().grantPermissions(['local-network-access'], { origin: 'http://localhost:5173' });
  }
  // Exercise production parsing/snapshot/transfer against real HTTP, without
  // mounting a renderer or admitting a job that competes for the training GPU.
  await page.route('**/native-upload-harness', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Native upload test</title>',
  }));
  await page.goto('/native-upload-harness');
  const paths = ['sparse/0/cameras.bin', 'sparse/0/images.bin', 'sparse/0/points3D.bin',
    'images/left/same.png', 'images/right/same.png', 'masks/left/same.png'];
  const files = paths.map(path => ({ path, data: readFileSync(join(source!, path)).toString('base64') }));
  const putHeaders: number[][] = [];
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().startsWith(apiUrl!)) {
      putHeaders.push([...request.postDataBuffer()!.subarray(0, 3)]);
    }
  });
  const result = await page.evaluate(async ({ apiUrl, files }) => {
    const storePath = '/src/store/index.ts';
    const cameraPath = '/src/parsers/cameras.ts';
    const imagePath = '/src/parsers/images.ts';
    const pointsPath = '/src/parsers/points3d.ts';
    const builderPath = '/src/test/builders/colmapBuilders.ts';
    const snapshotPath = '/src/training/trainingSnapshot.ts';
    const transferPath = '/src/training/trainingTransfer.ts';
    const clientPath = '/src/training/trainingClient.ts';
    const { useReconstructionStore } = await import(storePath) as typeof import('../src/store');
    const { parseCamerasBinary } = await import(cameraPath) as typeof import('../src/parsers/cameras');
    const { parseImagesBinary } = await import(imagePath) as typeof import('../src/parsers/images');
    const { parsePoints3DBinary } = await import(pointsPath) as typeof import('../src/parsers/points3d');
    const { buildReconstruction } = await import(builderPath) as typeof import('../src/test/builders/colmapBuilders');
    const { createTrainingSnapshot } = await import(snapshotPath) as typeof import('../src/training/trainingSnapshot');
    const { prepareExistingDataset } = await import(transferPath) as typeof import('../src/training/trainingTransfer');
    const { TrainingClient } = await import(clientPath) as typeof import('../src/training/trainingClient');
    const input = new Map(files.map(({ path, data }) => [path, new File([
      Uint8Array.from(atob(data), value => value.charCodeAt(0)),
    ], path.split('/').at(-1)!)]));
    const reconstruction = buildReconstruction({
      cameras: [...parseCamerasBinary(await input.get('sparse/0/cameras.bin')!.arrayBuffer()).values()],
      images: [...parseImagesBinary(await input.get('sparse/0/images.bin')!.arrayBuffer()).values()],
      points3D: [...parsePoints3DBinary(await input.get('sparse/0/points3D.bin')!.arrayBuffer()).values()],
    });
    useReconstructionStore.setState({ reconstruction, sourceType: 'local', wasmReconstruction: null,
      loadedFiles: { hasMasks: true, imageFiles: new Map([...input].filter(([path]) => !path.startsWith('sparse/'))
        .map(([path, file]) => [path.replace(/^images\//, ''), file])) } });
    const client = new TrainingClient({ baseUrl: apiUrl });
    const config = await client.config();
    if (config.input_requirements.missing_mask_transport !== 'omit') throw new Error('Native fallback was not advertised');
    const snapshot = await createTrainingSnapshot({ maskSource: config.input_requirements.mask_source,
      missingMaskPolicy: config.input_requirements.missing_mask_policy,
      missingMaskTransport: config.input_requirements.missing_mask_transport });
    const dataset = await client.createDataset(snapshot);
    try {
      const ready = await prepareExistingDataset(client, dataset.id, snapshot, new AbortController().signal,
        () => undefined, () => undefined, undefined, config.limits.max_concurrent_uploads);
      return { state: ready.state, paths: ready.files.map(file => file.path),
        committed: ready.files.filter(file => file.receipt !== null).length,
        imageCount: snapshot.imageCount, pointCount: snapshot.pointCount };
    } finally {
      await client.cancelDataset(dataset.id);
    }
  }, { apiUrl: apiUrl!, files });
  expect(result.state).toBe('ready');
  expect(result.imageCount).toBe(2);
  expect(result.pointCount).toBe(64);
  expect(result.paths.filter(path => path.startsWith('masks/'))).toEqual(['masks/left/same.jpg.png']);
  expect(result.paths.filter(path => path.startsWith('images/'))).toEqual(['images/left/same.jpg', 'images/right/same.jpg']);
  expect(result.committed).toBe(6);
  expect(putHeaders).toHaveLength(6);
  expect(putHeaders.filter(bytes => bytes.join(',') === '255,216,255')).toHaveLength(2);
  expect(putHeaders.filter(bytes => bytes.join(',') === '137,80,78')).toHaveLength(1);
});
