import { expect, test } from '@playwright/test';

test('a real worker indexes a pose file beyond 2 GiB and reads late original observations', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/src/wasm/reconstructionService.ts';
    const { ReconstructionService } = await import(/* @vite-ignore */ path);
    const header = (id: number, name: string, count: number) => {
      const encoded = new TextEncoder().encode(name), bytes = new Uint8Array(64 + encoded.length + 9);
      const view = new DataView(bytes.buffer);
      view.setUint32(0, id, true); view.setFloat64(4, 1, true); view.setUint32(60, 1, true);
      bytes.set(encoded, 64); view.setBigUint64(65 + encoded.length, BigInt(count), true);
      return bytes;
    };
    const cameras = new Uint8Array(64), camera = new DataView(cameras.buffer);
    camera.setBigUint64(0, 1n, true); camera.setUint32(8, 1, true); camera.setInt32(12, 1, true);
    camera.setBigUint64(16, 640n, true); camera.setBigUint64(24, 480n, true);
    [500, 500, 320, 240].forEach((value, index) => camera.setFloat64(32 + index * 8, value, true));
    const pointId = 2n ** 53n + 7n, points = new Uint8Array(67), point = new DataView(points.buffer);
    point.setBigUint64(0, 1n, true); point.setBigUint64(8, pointId, true);
    [1, 2, 3].forEach((value, index) => point.setFloat64(16 + index * 8, value, true));
    points[40] = 255; point.setFloat64(43, 0.25, true); point.setBigUint64(51, 1n, true);
    point.setUint32(59, 9, true); point.setUint32(63, 0, true);
    const count = new Uint8Array(8); new DataView(count.buffer).setBigUint64(0, 2n, true);
    const observations = 100_000_000, zero = new Blob([new Uint8Array(1024 * 1024)]);
    const payload = new Blob(Array.from({ length: Math.ceil(observations * 24 / zero.size) }, () => zero)).slice(0, observations * 24);
    const late = new Uint8Array(24), view = new DataView(late.buffer);
    view.setFloat64(0, 123.123456789, true); view.setFloat64(8, 456.987654321, true); view.setBigInt64(16, pointId, true);
    const imagesFile = new File([count, header(5, 'early.png', observations), payload, header(9, 'late.png', 1), late], 'images.bin');
    const service = new ReconstructionService({ camerasFile: new File([cameras], 'cameras.bin'), imagesFile,
      points3DFile: new File([points], 'points3D.bin') });
    try {
      const snapshot = await service.load();
      const selected = await snapshot.observations([9]);
      return { mode: service.mode, parser: snapshot.data.diagnostics.parser, bytes: imagesFile.size,
        retained: snapshot.data.diagnostics.retainedImageBufferBytes, count: snapshot.pointCount,
        images: [...snapshot.reconstruction.images.values()].map(image => [image.imageId, image.numPoints2D]),
        late: selected.get(9).map((value: { xy: number[]; point3DId: bigint }) => ({ xy: value.xy, id: String(value.point3DId) })) };
    } finally { service.dispose(); }
  });
  expect(result.mode).toBe('worker');
  expect(result.parser).toBe('wasm');
  expect(result.bytes).toBeGreaterThan(2 ** 31);
  expect(result.retained).toBeLessThan(1024);
  expect(result.count).toBe(1);
  expect(result.images).toEqual([[5, 100_000_000], [9, 1]]);
  expect(result.late).toEqual([{ xy: [123.123456789, 456.987654321], id: '9007199254740999' }]);
});
