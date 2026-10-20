import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readCompanionPointCloud } from './companionPointCloud';
import type { CameraDatasetSource, ImportDiagnostic } from './types';

const ply = 'ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n1 2 3\n';
const file = (body = ply) => new NodeFile([body], 'points_gt.ply') as unknown as File;
beforeEach(() => vi.stubGlobal('File', NodeFile));
afterEach(() => vi.unstubAllGlobals());

it.each(['local', 'archive', 'url'] as const)('reads one scene-local XYZ cloud from %s', async kind => {
  const points = file(), files = new Map([['scene/points_gt.ply', points]]);
  const source: CameraDatasetSource = kind === 'local' ? { kind, files } : kind === 'archive' ? { kind,
    entries: new Map([...files].map(([path, value]) => [path, { name: value.name, size: value.size, lastModified: 0,
      extract: async () => value, extractPreview: async () => value }])) }
    : { kind, baseUrl: 'https://example.test/root/', filePaths: [...files.keys()] };
  const fetch = vi.fn(async () => new Response(ply));
  vi.stubGlobal('fetch', fetch);
  const result = (await readCompanionPointCloud(source, 'scene/transforms.json', {}, []))!;
  expect(await result.file.text()).toBe(ply);
  expect(result.sourcePath).toBe(kind === 'url' ? 'https://example.test/root/scene/points_gt.ply' : 'scene/points_gt.ply');
  expect(fetch).toHaveBeenCalledTimes(kind === 'url' ? 1 : 0);
});

it('does not attach another scene, an object mesh or an unlisted URL guess', async () => {
  const files = new Map([['other/points_gt.ply', file()], ['scene/mesh_raw.ply', file()]]);
  expect(await readCompanionPointCloud({ kind: 'local', files }, 'scene/transforms.json', {}, [])).toBeUndefined();
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(await readCompanionPointCloud({ kind: 'url', baseUrl: 'https://example.test/scene/' }, 'transforms.json', {}, [])).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps multiple candidates unresolved until metadata explicitly selects one', async () => {
  const files = new Map([['scene/points_gt.ply', file()], ['scene/points3D.ply', file()]]);
  const diagnostics: ImportDiagnostic[] = [];
  expect(await readCompanionPointCloud({ kind: 'local', files }, 'scene/transforms.json', {}, diagnostics)).toBeUndefined();
  expect(diagnostics[0].code).toBe('AMBIGUOUS_POINT_CLOUD');
  expect((await readCompanionPointCloud({ kind: 'local', files }, 'scene/transforms.json', { ply_file_path: './points3D.ply' }, []))?.sourcePath).toBe('scene/points3D.ply');
});

it('honors a declared URL without a directory listing and preserves its query', async () => {
  const fetch = vi.fn(async () => new Response(ply)); vi.stubGlobal('fetch', fetch);
  const result = await readCompanionPointCloud({ kind: 'url', baseUrl: 'https://example.test/scene/' }, 'transforms.json',
    { ply_file_path: 'https://geometry.example.test/source.ply?version=2' }, []);
  expect(result?.sourcePath).toBe('https://geometry.example.test/source.ply?version=2');
  expect(fetch).toHaveBeenCalledWith('https://geometry.example.test/source.ply?version=2', expect.anything());
});

it('applies an explicit row-major world similarity to XYZ without changing source bytes', async () => {
  const source={kind:'url' as const,baseUrl:'https://example.test/scene/'};
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(ply)));
  const result=await readCompanionPointCloud(source,'transforms.json',{},[],undefined,{url:'https://example.test/cloud.ply',format:'ply',transform:[0,1,0,10,1,0,0,0,0,0,-1,0,0,0,0,1]});
  const {parsePointCloudPlyFile}=await import('../../parsers/plyPointCloud');
  expect([...(await parsePointCloudPlyFile(result!.file)).values()][0].xyz).toEqual([12,1,-3]);
  await expect(readCompanionPointCloud(source,'transforms.json',{},[],undefined,{url:'https://example.test/cloud.ply',format:'ply',transform:[1,1,0,0,0,1,0,0,0,0,1,0,0,0,0,1]})).rejects.toThrow(/similarity/);
});

it.each(['../other.ply', '/other.ply', 'C:\\other.ply'])('rejects local declared point paths outside the scene: %s', async path => {
  await expect(readCompanionPointCloud({ kind: 'local', files: new Map() }, 'scene/transforms.json', { ply_file_path: path }, [])).rejects.toThrow();
});

it.each([ply.replace('end_header', 'element face 1\nproperty list uchar int vertex_indices\nend_header'),
  ply.replace('element vertex 1', 'element vertex 0'),
  ply.replace('end_header', ['f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'].map(name => 'property float ' + name).join('\n') + '\nend_header')])(
  'rejects a mesh, empty cloud or Gaussian PLY instead of treating it as XYZ points', async body => {
    await expect(readCompanionPointCloud({ kind: 'local', files: new Map([['scene/points_gt.ply', file(body)]]) }, 'scene/transforms.json', {}, []))
      .rejects.toMatchObject({ code: 'INVALID_POINT_CLOUD' });
  });

it('reports a declared missing cloud and honors cancellation', async () => {
  await expect(readCompanionPointCloud({ kind: 'local', files: new Map() }, 'scene/transforms.json', { ply_file_path: 'missing.ply' }, []))
    .rejects.toMatchObject({ code: 'SOURCE_ACCESS_FAILED' });
  const controller = new AbortController(); controller.abort();
  await expect(readCompanionPointCloud({ kind: 'local', files: new Map([['scene/points_gt.ply', file()]]) }, 'scene/transforms.json', {}, [], controller.signal))
    .rejects.toMatchObject({ name: 'AbortError' });
});

it('bounds a listed cloud before extracting an archive entry or reading a response body', async () => {
  const extract = vi.fn();
  await expect(readCompanionPointCloud({ kind: 'archive', entries: new Map([['points_gt.ply', {
    name: 'points_gt.ply', size: 65 * 1024 * 1024, lastModified: 0, extract, extractPreview: extract,
  }]]) }, 'transforms.json', {}, [])).rejects.toMatchObject({ code: 'IMPORT_LIMIT_EXCEEDED' });
  expect(extract).not.toHaveBeenCalled();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(ply, { headers: { 'content-length': String(65 * 1024 * 1024) } })));
  await expect(readCompanionPointCloud({ kind: 'url', baseUrl: 'https://example.test/', filePaths: ['points_gt.ply'] },
    'transforms.json', {}, [])).rejects.toMatchObject({ code: 'IMPORT_LIMIT_EXCEEDED' });
});
