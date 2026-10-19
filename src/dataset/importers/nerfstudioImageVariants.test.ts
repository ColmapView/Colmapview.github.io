import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { pngHeader } from '../../test/imageHeaders';
import { parseCamerasBinary } from '../../parsers/cameras';
import { parseImagesBinary } from '../../parsers/images';
import { prepareCameraDataset } from './prepareCameraDataset';

beforeEach(() => vi.stubGlobal('File', NodeFile));
afterEach(() => vi.unstubAllGlobals());
const metadata = { camera_model: 'OPENCV', w: 80, h: 40, fl_x: 40, fl_y: 44, cx: 40, cy: 20, k1: 0.1,
  frames: [{ file_path: 'images/a.png', mask_path: 'masks/a.png', transform_matrix: [[1, 0, 0, 1], [0, 1, 0, 2], [0, 0, 1, 3], [0, 0, 0, 1]] }] };
const file = (body: string | Uint8Array<ArrayBuffer>, name: string) => new File([body], name);
function fixture() {
  return new Map([
    ['scene/transforms.json', file(JSON.stringify(metadata), 'transforms.json')],
    ['scene/images_8/a.png', file(pngHeader(10, 5), 'a.png')],
    ['scene/masks_8/a.png', file(pngHeader(10, 5), 'a.png')],
  ]);
}

it('exports images_8 calibration with scaled pixel intrinsics and unchanged poses/distortion', async () => {
  const files = fixture();
  const prepared = (await prepareCameraDataset({ kind: 'local', files }))!;
  const cameras = parseCamerasBinary(await prepared.files.get('sparse/0/cameras.bin')!.arrayBuffer());
  const camera = cameras.get(1)!;
  expect([camera.width, camera.height]).toEqual([10, 5]);
  expect(camera.params).toEqual([5, 5.5, 5, 2.5, 0.1, 0, 0, 0]);
  const binding = [...prepared.context.bindings.values()][0];
  expect(binding.sourceImagePath).toBe('scene/images_8/a.png');
  expect(binding.mask).toMatchObject({ path: 'scene/masks_8/a.png' });
  expect(prepared.context.diagnostics).toContainEqual(expect.objectContaining({ code: 'RESIZED_RGB' }));

  files.set('scene/images/a.png', file(pngHeader(80, 40), 'a.png'));
  const original = (await prepareCameraDataset({ kind: 'local', files }))!;
  const originalCameras = parseCamerasBinary(await original.files.get('sparse/0/cameras.bin')!.arrayBuffer());
  expect(originalCameras.get(1)!.width).toBe(80);
  const pose = [...parseImagesBinary(await prepared.files.get('sparse/0/images.bin')!.arrayBuffer()).values()][0];
  const originalPose = [...parseImagesBinary(await original.files.get('sparse/0/images.bin')!.arrayBuffer()).values()][0];
  expect([pose.qvec, pose.tvec]).toEqual([originalPose.qvec, originalPose.tvec]);
});

it('uses a listed URL variant and reads its dimensions, without probing guessed folders', async () => {
  const fetch = vi.fn(async (_url: RequestInfo | URL) => new Response(pngHeader(10, 5), { headers: { 'content-type': 'image/png' } }));
  vi.stubGlobal('fetch', fetch);
  const prepared = (await prepareCameraDataset({ kind: 'url', baseUrl: 'https://example.com/scene/',
    filePaths: ['transforms.json', 'images_8/a.png', 'masks_8/a.png'] },
  { metadataPath: 'transforms.json', metadataFile: file(JSON.stringify(metadata), 'transforms.json') }))!;
  expect([...prepared.context.bindings.values()][0].sourceImagePath).toBe('images_8/a.png');
  expect(fetch).toHaveBeenCalledOnce();
  expect(String(fetch.mock.calls[0][0])).toContain('/scene/images_8/a.png');
});

it('rejects a crop or inconsistent resize rather than silently changing calibration', async () => {
  const files = fixture();
  files.set('scene/images_8/a.png', file(pngHeader(10, 4), 'a.png'));
  await expect(prepareCameraDataset({ kind: 'local', files })).rejects.toMatchObject({ code: 'IMAGE_DIMENSION_MISMATCH' });
});

it('does not borrow a same-name downscaled image from another scene', async () => {
  const files = fixture();
  files.delete('scene/images_8/a.png');
  files.set('peer/images_8/a.png', file(pngHeader(10, 5), 'a.png'));
  files.set('peer/transforms.json', file(JSON.stringify(metadata), 'transforms.json'));
  await expect(prepareCameraDataset({ kind: 'local', files }, { metadataPath: 'scene/transforms.json' })).rejects.toMatchObject({ code: 'MISSING_RGB' });
});
