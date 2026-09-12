import { test, expect } from '@playwright/test';
import { loadTestDataset } from './fixtures/load-test-data';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

test.use({ channel: process.env.COLMAP_TRAINING_BROWSER_CHANNEL || undefined });

interface TrainingRendererProbe {
  getImageIds(): number[];
  getTrainingAlignmentState(): { camera: number[]; root: number[] | null; splats: number[][] };
  getWebGpuSplatDebugCounters(): Promise<{ renderSessions: number }>;
}

const representativePlyPath = process.env.COLMAP_TRAINING_REPRESENTATIVE_PLY;
const REPRESENTATIVE_PREVIEW_CAP = 100_000;
const requiredPreviewFields = [
  'x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity',
  'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3',
] as const;

async function buildRepresentativePreview(path: string) {
  const source = await readFile(path);
  const headerEnd = source.indexOf(Buffer.from('end_header\n'));
  if (headerEnd < 0) throw new Error('Representative PLY has no end_header line.');
  const dataOffset = headerEnd + Buffer.byteLength('end_header\n');
  const sourceHeader = source.subarray(0, dataOffset).toString('ascii');
  if (!sourceHeader.includes('format binary_little_endian 1.0')) {
    throw new Error('Representative PLY must use binary little endian encoding.');
  }
  const totalSplats = Number(/element vertex (\d+)/.exec(sourceHeader)?.[1]);
  if (!Number.isSafeInteger(totalSplats) || totalSplats < 1) throw new Error('Invalid representative vertex count.');
  const propertyNames = [...sourceHeader.matchAll(/^property float (\S+)$/gm)].map(match => match[1]);
  for (const field of requiredPreviewFields) {
    if (!propertyNames.includes(field)) throw new Error(`Representative PLY is missing ${field}.`);
  }
  const sourceStride = propertyNames.length * Float32Array.BYTES_PER_ELEMENT;
  if (dataOffset + totalSplats * sourceStride !== source.length) {
    throw new Error('Representative PLY has unsupported trailing data or property types.');
  }
  const shownSplats = Math.min(REPRESENTATIVE_PREVIEW_CAP, totalSplats);
  const previewHeader = Buffer.from(sourceHeader.replace(/element vertex \d+/, `element vertex ${shownSplats}`));
  const payload = Buffer.allocUnsafe(previewHeader.length + shownSplats * sourceStride);
  previewHeader.copy(payload);
  for (let outputIndex = 0; outputIndex < shownSplats; outputIndex += 1) {
    const sourceIndex = Math.floor(outputIndex * totalSplats / shownSplats);
    const sourceBase = dataOffset + sourceIndex * sourceStride;
    const outputBase = previewHeader.length + outputIndex * sourceStride;
    source.copy(payload, outputBase, sourceBase, sourceBase + sourceStride);
  }
  return {
    payload,
    totalSplats,
    shownSplats,
    propertyCount: propertyNames.length,
    sourceBytes: source.length,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    payloadSha256: createHash('sha256').update(payload).digest('hex'),
  };
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

// Fake frame production, real browser decoders/renderers and GPU disposal.
// This is resource qualification, not training cadence/performance evidence.
for (const backend of ['spark', 'webgpu'] as const) {
  test(`FRAME-04 ${backend}: 100 warmup + 500 growth/prune frames retain bounded resources`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'This resource receipt targets Chromium.');
    test.skip(
      backend === 'webgpu' && !process.env.COLMAP_TRAINING_BROWSER_CHANNEL,
      'Set COLMAP_TRAINING_BROWSER_CHANNEL to a hardware WebGPU browser.',
    );
    test.setTimeout(180000);
    await page.goto(`/?splatBackend=${backend}&e2eProbe=1`);
    await loadTestDataset(page);
    await page.waitForFunction(() => Boolean(window.__COLMAP_WEBVIEW_E2E__));
    await expect.poll(() => page.evaluate(() => (window.__COLMAP_WEBVIEW_E2E__ as unknown as TrainingRendererProbe).getImageIds().length)).toBeGreaterThan(0);
    await page.evaluate(async () => {
      const storePath = '/src/store/index.ts';
      const controllerPath = '/src/training/previewController.ts';
      const { useTrainingStore } = await import(storePath);
      const { trainingPreviewController: controller } = await import(controllerPath);
      let version = 0;
      controller.setTarget({ jobId: 'soak', snapshotId: 'synthetic', isCurrent: () => true,
        async fetch() {
          version++;
          const count = version % 2 ? 4 : 16;
          const fields = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
          const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${count}\n${fields.map((field) => `property float ${field}\n`).join('')}end_header\n`;
          const data = new Float32Array(count * fields.length);
          for (let i = 0; i < count; i++) data.set([i / count, 0, 0, 1, 0, 0, 2, -2, -2, -2, 1, 0, 0, 0], i * fields.length);
          return { file: new File([header, data], 'soak.ply'), etag: `"soak:${version}"`, optimizerStep: version, imageExposures: version, capturedAt: null };
        }, onFrame() {}, onError(message: string) { throw new Error(message); },
      });
      useTrainingStore.setState({ previewActive: true, previewEnabled: true, finalLoadedJobId: null });
      controller.setEnabled(true);
    });
    await expect.poll(async () => page.evaluate(async () => {
      const path = '/src/training/previewController.ts';
      const { trainingPreviewController: controller } = await import(path);
      controller.setEnabled(true);
      await controller.tick();
      return controller.inspect().renderer?.backend;
    }), { timeout: 30000 }).toBe(backend);
    const receipt = await page.evaluate(async () => {
      const path = '/src/training/previewController.ts';
      const { trainingPreviewController: controller } = await import(path);
      const nextRender = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const loop = async (count: number) => {
        for (let i = 0; i < count; i++) { await controller.tick(); await nextRender(); }
        return controller.inspect();
      };
      const warm = await loop(100);
      const end = await loop(500);
      // End production before inspecting cleanup. invalidate(true) alone only
      // clears the current resource; the retained target is allowed to refill it.
      controller.setEnabled(false);
      controller.setTarget(null);
      await nextRender();
      const cleanup = controller.inspect();
      controller.dispose();
      return { warm, end, cleanup };
    });
    expect(receipt.end.version - receipt.warm.version).toBeGreaterThanOrEqual(500);
    expect(receipt.warm.displayedResources).toBe(1);
    expect(receipt.end.displayedResources).toBe(1);
    expect(receipt.end.inFlight).toBe(0);
    expect(receipt.end.renderer?.camera).toEqual(receipt.warm.renderer?.camera);
    if (backend === 'spark') {
      expect(receipt.end.renderer?.meshes).toBe(1);
      expect(receipt.end.renderer?.textures).toBe(receipt.warm.renderer?.textures);
    } else {
      for (const field of ['devices', 'buffers', 'textures', 'renderSessions']) {
        expect(receipt.end.renderer?.[field]).toBe(receipt.warm.renderer?.[field]);
      }
    }
    expect(receipt.cleanup.displayedResources).toBe(0);
    if (backend === 'spark') expect(receipt.cleanup.renderer?.meshes).toBe(0);
    else expect(receipt.cleanup.renderer?.renderSessions).toBe(0);
    await test.info().attach(`${backend}-resource-soak.json`, { body: JSON.stringify(receipt, null, 2), contentType: 'application/json' });
    await mkdir('.tmp/training-qualification', { recursive: true });
    await writeFile(`.tmp/training-qualification/${backend}-resource-soak.json`, JSON.stringify({ browser: await page.context().browser()?.version(), ...receipt }, null, 2));
  });

  test(`VIEW-03 ${backend}: final attachment and source reselection preserve baked/display alignment`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'This alignment receipt targets Chromium.');
    test.skip(
      backend === 'webgpu' && !process.env.COLMAP_TRAINING_BROWSER_CHANNEL,
      'Set COLMAP_TRAINING_BROWSER_CHANNEL to a hardware WebGPU browser.',
    );
    test.setTimeout(90000);
    await page.goto(`/?splatBackend=${backend}&e2eProbe=1`);
    await loadTestDataset(page);
    await page.waitForFunction(() => Boolean(window.__COLMAP_WEBVIEW_E2E__));
    await expect.poll(() => page.evaluate(() => (window.__COLMAP_WEBVIEW_E2E__ as unknown as TrainingRendererProbe).getImageIds().length)).toBeGreaterThan(0);
    const setup = await page.evaluate(async () => {
      const storePath = '/src/store/index.ts';
      const trainingPath = '/src/training/index.ts';
      const transformPath = '/src/utils/sim3dTransforms.ts';
      const { useReconstructionStore: reconstruction, useTransformStore: transforms, useTrainingStore: training, applyTransformToData } = await import(storePath);
      const { createTrainingSnapshot } = await import(trainingPath);
      const { createIdentityEuler, createSim3dFromEuler, sim3dToMatrix4, transformPoint } = await import(transformPath);
      const makeFile = (point: number[], name: string) => {
        const fields = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
        const header = `ply\nformat binary_little_endian 1.0\nelement vertex 1\n${fields.map((field) => `property float ${field}\n`).join('')}end_header\n`;
        return new File([header, new Float32Array([...point, 1, 0, 0, 2, -2, -2, -2, 1, 0, 0, 0])], name);
      };
      const original = makeFile([0, 0, 0], 'original.ply');
      const loaded = reconstruction.getState().loadedFiles;
      reconstruction.setState({ loadedFiles: { ...loaded, splatFile: original, splatFiles: [original], splatFileSources: [{ id: 'original', path: original.name, file: original }] } });
      const baked = { ...createIdentityEuler(), scale: 2, rotationX: 0.3, rotationY: -0.5, translationX: 1, translationY: -2, translationZ: 0.5 };
      transforms.getState().setTransform(baked);
      applyTransformToData();
      const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
      const display = { ...createIdentityEuler(), scale: 0.8, rotationZ: 0.7, translationX: -1, translationY: 0.5, translationZ: 2 };
      transforms.getState().setTransform(display);
      const final = makeFile(transformPoint(createSim3dFromEuler(baked), [0, 0, 0]), 'final.ply');
      const job = { job_id: 'alignment', client_snapshot_id: snapshot.id, state: 'succeeded', artifacts: [{ artifact_id: 'final', format: 'ply', coordinate_space: 'colmap' }] };
      training.getState().setSnapshot(snapshot);
      training.setState({ currentJobId: job.job_id, currentJob: job, requestsEnabled: false, previewActive: true, previewEnabled: true });
      Object.assign(window, { __trainingAlignmentFixture: { job, final } });
      return { baked: sim3dToMatrix4(createSim3dFromEuler(baked)).toArray(), display: sim3dToMatrix4(createSim3dFromEuler(display)).toArray() };
    });
    await page.evaluate(() => window.__COLMAP_WEBVIEW_E2E__!.waitForRenderFrames(4));
    const cameraBefore = await page.evaluate(() => (window.__COLMAP_WEBVIEW_E2E__ as unknown as TrainingRendererProbe).getTrainingAlignmentState().camera);
    expect(await page.evaluate(async () => {
      const path = '/src/training/index.ts';
      const storePath = '/src/store/index.ts';
      const { loadTrainingResult, TrainingClient } = await import(path);
      const { useTrainingStore } = await import(storePath);
      const fixture = (window as unknown as { __trainingAlignmentFixture: { job: unknown; final: File } }).__trainingAlignmentFixture;
      const client = new TrainingClient({ baseUrl: useTrainingStore.getState().serverUrl, fetchImpl: async () => new Response(fixture.final, { headers: { 'Content-Type': 'application/octet-stream' } }) });
      return loadTrainingResult(fixture.job, client);
    })).toBe(true);
    const samples: unknown[] = [];
    for (const selection of ['final', 'original', 'final']) {
      await page.evaluate(async (selection) => {
        const path = '/src/store/index.ts';
        const { useReconstructionStore } = await import(path);
        const state = useReconstructionStore.getState();
        const source = state.loadedFiles.splatFileSources.find((item: { id: string; trainingResult?: unknown }) => selection === 'original' ? item.id === 'original' : Boolean(item.trainingResult));
        await state.selectSplatSource(source.id);
      }, selection);
      await expect.poll(async () => page.evaluate(async (backend) => {
        const state = (window.__COLMAP_WEBVIEW_E2E__ as unknown as TrainingRendererProbe).getTrainingAlignmentState();
        if (backend === 'spark') return state.splats.length;
        return (await (window.__COLMAP_WEBVIEW_E2E__ as unknown as TrainingRendererProbe).getWebGpuSplatDebugCounters()).renderSessions;
      }, backend), { timeout: 15000, message: `${backend} renderer ready after selecting ${selection}` }).toBe(1);
      await page.evaluate(() => window.__COLMAP_WEBVIEW_E2E__!.waitForRenderFrames(4));
      const sample = await page.evaluate(async ({ selection, setup, backend }) => {
        const threePath = '/node_modules/.vite/deps/three.js';
        const runtimePath = '/src/components/viewer3d/WebGpuSplatCanvasRuntime.ts';
        const storePath = '/src/store/index.ts';
        const { Matrix4 } = await import(threePath);
        const { getActiveWebGpuSplatFrameSnapshot } = await import(runtimePath);
        const { useReconstructionStore } = await import(storePath);
        const scene = (window.__COLMAP_WEBVIEW_E2E__ as unknown as TrainingRendererProbe).getTrainingAlignmentState();
        const model = new Matrix4().fromArray(setup.display);
        if (selection === 'original') model.multiply(new Matrix4().fromArray(setup.baked));
        const actual: number[] = backend === 'spark'
          ? scene.splats[0]
          : Array.from(getActiveWebGpuSplatFrameSnapshot().camera.worldMatrix);
        const expected: number[] = backend === 'spark'
          ? model.toArray()
          : model.clone().invert().multiply(new Matrix4().fromArray(scene.camera)).toArray();
        return { selection, actual, expected, camera: scene.camera, root: scene.root, sources: useReconstructionStore.getState().loadedFiles.splatFileSources.length };
      }, { selection, setup, backend });
      expect(sample.sources).toBe(2);
      expect(sample.camera).toEqual(cameraBefore);
      sample.actual.forEach((value: number, index: number) => expect(value).toBeCloseTo(sample.expected[index], 4));
      sample.root!.forEach((value: number, index: number) => expect(value).toBeCloseTo(setup.display[index], 10));
      samples.push(sample);
    }
    await mkdir('.tmp/training-qualification', { recursive: true });
    await writeFile(`.tmp/training-qualification/${backend}-alignment.json`, JSON.stringify({ browser: await page.context().browser()?.version(), samples }, null, 2));
  });
}

for (const backend of ['spark', 'webgpu'] as const) {
  test(`FRAME-05 representative Bicycle 100k ${backend} preview sustains displayed cadence`, async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium', 'The representative renderer receipt targets Chromium.');
    test.skip(!representativePlyPath, 'Set COLMAP_TRAINING_REPRESENTATIVE_PLY to a completed Bicycle PLY.');
    test.skip(
      backend === 'webgpu' && !process.env.COLMAP_TRAINING_BROWSER_CHANNEL,
      'Set COLMAP_TRAINING_BROWSER_CHANNEL to a hardware WebGPU browser.',
    );
    test.setTimeout(120_000);
    const fixture = await buildRepresentativePreview(representativePlyPath!);
    await page.route('http://representative.invalid/preview.ply', route => route.fulfill({
      status: 200,
      body: fixture.payload,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'application/octet-stream',
        'content-length': String(fixture.payload.length),
      },
    }));
    await page.goto(`/?splatBackend=${backend}&e2eProbe=1`);
    await loadTestDataset(page);
    await page.waitForFunction(() => Boolean(window.__COLMAP_WEBVIEW_E2E__));
    await expect.poll(() => page.evaluate(() => (
      window.__COLMAP_WEBVIEW_E2E__ as unknown as TrainingRendererProbe
    ).getImageIds().length)).toBeGreaterThan(0);
    await page.evaluate(async ({ totalSplats, shownSplats }) => {
      const storePath = '/src/store/index.ts';
      const controllerPath = '/src/training/previewController.ts';
      const { useTrainingStore } = await import(storePath);
      const { trainingPreviewController: controller } = await import(controllerPath);
      const receipt = { times: [] as number[], errors: [] as string[], version: 0, timer: 0 };
      Object.assign(window, { __representativeCadence: receipt });
      controller.setTarget({
        jobId: 'bicycle-representative',
        snapshotId: 'bicycle-100k',
        isCurrent: () => true,
        async fetch(_etag: string | null, signal: AbortSignal) {
          const response = await fetch('http://representative.invalid/preview.ply', { signal });
          const blob = await response.blob();
          receipt.version += 1;
          return {
            file: new File([blob], 'bicycle-preview.ply'),
            etag: `"bicycle:${receipt.version}"`,
            optimizerStep: receipt.version,
            imageExposures: receipt.version * 4,
            capturedAt: new Date().toISOString(),
            totalSplats,
            shownSplats,
            jobId: 'bicycle-representative',
            snapshotId: 'bicycle-100k',
          };
        },
        onFrame() { receipt.times.push(performance.now()); },
        onError(message: string) { receipt.errors.push(message); },
      });
      useTrainingStore.setState({ previewActive: true, previewEnabled: true, finalLoadedJobId: null });
      controller.setEnabled(true);
      receipt.timer = window.setInterval(() => { void controller.tick(); }, 333);
      void controller.tick();
    }, { totalSplats: fixture.totalSplats, shownSplats: fixture.shownSplats });
    await expect.poll(() => page.evaluate(() => {
      const receipt = (window as unknown as { __representativeCadence: { times: number[] } }).__representativeCadence;
      return receipt.times.length > 1 ? receipt.times.at(-1)! - receipt.times[0] : 0;
    }), { timeout: 90_000, message: 'ten-second representative displayed-preview window' }).toBeGreaterThanOrEqual(10_000);
    const browserReceipt = await page.evaluate(async () => {
      const controllerPath = '/src/training/previewController.ts';
      const { trainingPreviewController: controller } = await import(controllerPath);
      const receipt = (window as unknown as { __representativeCadence: {
        times: number[]; errors: string[]; timer: number;
      } }).__representativeCadence;
      window.clearInterval(receipt.timer);
      const inspect = controller.inspect();
      controller.setEnabled(false);
      controller.setTarget(null);
      return { times: receipt.times, errors: receipt.errors, inspect };
    });
    expect(browserReceipt.errors).toEqual([]);
    expect(browserReceipt.inspect.displayedResources).toBe(1);
    expect(browserReceipt.inspect.renderer?.backend).toBe(backend);
    const endIndex = browserReceipt.times.findIndex(time => time - browserReceipt.times[0] >= 10_000);
    const times = browserReceipt.times.slice(0, endIndex + 1);
    const intervals = times.slice(1).map((time, index) => time - times[index]);
    const medianGapMs = percentile(intervals, 0.5);
    const receipt = {
      browser: page.context().browser()?.version(),
      backend,
      scene: 'MipNeRF360 Bicycle',
      derivation: 'uniform 100k complete production-layout rows from a completed matched Bicycle B4/D4 candidate PLY',
      sourceBytes: fixture.sourceBytes,
      sourceSha256: fixture.sourceSha256,
      payloadBytes: fixture.payload.length,
      payloadSha256: fixture.payloadSha256,
      totalSplats: fixture.totalSplats,
      shownSplats: fixture.shownSplats,
      propertyCount: fixture.propertyCount,
      displayedFrames: times.length,
      windowSeconds: (times.at(-1)! - times[0]) / 1000,
      medianDisplayedFps: 1000 / medianGapMs,
      p95InterUpdateGapMs: percentile(intervals, 0.95),
    };
    expect(receipt.shownSplats).toBe(REPRESENTATIVE_PREVIEW_CAP);
    expect(receipt.propertyCount).toBeGreaterThan(requiredPreviewFields.length);
    expect(receipt.medianDisplayedFps).toBeGreaterThanOrEqual(2);
    expect(receipt.medianDisplayedFps).toBeLessThanOrEqual(4);
    expect(receipt.p95InterUpdateGapMs).toBeLessThanOrEqual(1000);
    await testInfo.attach(`bicycle-100k-${backend}-cadence.json`, {
      body: JSON.stringify(receipt, null, 2),
      contentType: 'application/json',
    });
    await mkdir('.tmp/training-qualification', { recursive: true });
    await writeFile(`.tmp/training-qualification/bicycle-100k-${backend}-cadence.json`, JSON.stringify(receipt, null, 2));
  });
}
