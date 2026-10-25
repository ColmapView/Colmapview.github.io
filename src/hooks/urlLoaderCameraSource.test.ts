import { File as NodeFile } from 'node:buffer';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { loadCameraUrlSource } from './urlLoaderCameraSource';
import { prepareCameraDataset } from '../dataset/importers/prepareCameraDataset';
import { readCameraSourceFile } from '../dataset/importers/sourceAccess';
import { discoverManifestSplatCatalog } from './urlLoaderSplatDiscovery';
import { fetchPublishedViewerState } from './urlLoaderViewerState';
import type { CameraDatasetManifest } from '../types/cameraDatasetManifest';

vi.mock('../dataset/importers/prepareCameraDataset',()=>({prepareCameraDataset:vi.fn(async()=>({files:new Map()}))}));
vi.mock('../dataset/importers/sourceAccess',()=>({readCameraSourceFile:vi.fn(),MAX_CAMERA_MEDIA_BYTES:64*1024*1024}));
vi.mock('./urlLoaderSplatDiscovery',()=>({discoverManifestSplatCatalog:vi.fn()}));
vi.mock('./urlLoaderViewerState',()=>({fetchPublishedViewerState:vi.fn()}));
beforeEach(()=>vi.clearAllMocks());afterEach(()=>vi.restoreAllMocks());
const deps=()=>({processFiles:vi.fn(async()=>true),setSourceInfo:vi.fn(),setUrlProgress:vi.fn()});
it('fetches a direct metadata URL with its original query and fragment intact',async()=>{
  const metadata=new NodeFile(['# Bundle file v0.3\n'],'bundle.out') as unknown as File;
  vi.mocked(readCameraSourceFile).mockResolvedValue(metadata);
  const url='https://example.test/pinned/scene/bundle.out?download=1#view';
  expect(await loadCameraUrlSource(url,deps())).toBe(true);
  expect(readCameraSourceFile).toHaveBeenCalledWith(expect.objectContaining({kind:'url',baseUrl:'https://example.test/pinned/scene/'}),url,undefined,16*1024*1024);
  expect(prepareCameraDataset).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({metadataPath:'bundle.out',metadataFile:metadata}));
});
it('reuses already fetched JSON metadata without another body request',async()=>{
  const metadata=new NodeFile(['{}'],'transforms.json') as unknown as File;
  await loadCameraUrlSource('https://example.test/transforms.json?download=1',deps(),metadata);
  expect(readCameraSourceFile).not.toHaveBeenCalled();
  expect(prepareCameraDataset).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({metadataFile:metadata}));
});
it('retains a wrapper manifest as the source used for subsequent sharing',async()=>{
  const metadata=new NodeFile(['{}'],'transforms.json') as unknown as File;
  const dependencies={...deps(),processFiles:vi.fn(async (_files:Map<string,File>,_range?:{start:number;end:number},options?:{onSceneReplaced?:()=>void})=>{options?.onSceneReplaced?.();return true;})};
  const manifestUrl='https://catalog.test/selected.manifest.json';
  await loadCameraUrlSource('https://camera.test/transforms.json',dependencies,metadata,undefined,manifestUrl);
  expect(dependencies.setSourceInfo).toHaveBeenCalledWith('url',manifestUrl);
});

const splatManifest: CameraDatasetManifest = { format:'colmapview-camera-dataset', version:2,
  metadataUrl:'https://camera.test/mic/transforms_train.json', splats:['https://camera.test/trained/mic.ply'], viewerStatePath:'alignment.json' };

it('loads cameras, a separately counted Gaussian source and its required saved alignment as one scene',async()=>{
  const metadata=new NodeFile(['{}'],'transforms_train.json') as unknown as File;
  const catalog=[{path:splatManifest.splats[0],size:3083474,splatCount:13059}];
  vi.mocked(discoverManifestSplatCatalog).mockResolvedValue(catalog);
  const state={version:1 as const,viewerVersion:'test',viewState:null,config:{splat:{activeSourceId:catalog[0].path}}};
  vi.mocked(fetchPublishedViewerState).mockResolvedValue(state);
  const order:string[]=[];
  const dependencies={...deps(),isTouchDevice:false,
    processFiles:vi.fn(async()=>{order.push('cameras');return true;}),
    onRemoteSplatCatalog:vi.fn(()=>{order.push('catalog');}),
    onViewerState:vi.fn(async()=>{order.push('alignment');}), onAutoSplatSource:vi.fn(()=>{order.push('autoload');})};
  expect(await loadCameraUrlSource(splatManifest.metadataUrl,dependencies,metadata,splatManifest,'https://catalog.test/manifests/mic.json')).toBe(true);
  expect(fetchPublishedViewerState).toHaveBeenCalledWith({baseUrl:'https://catalog.test/manifests/',viewerStatePath:'alignment.json'},expect.any(Function));
  expect(dependencies.onRemoteSplatCatalog).toHaveBeenCalledWith(catalog);
  expect(dependencies.onViewerState).toHaveBeenCalledWith(state);
  expect(order).toEqual(['cameras','catalog','alignment','autoload']);
});

it('does not commit an explicitly aligned Gaussian scene when its required settings fail',async()=>{
  vi.mocked(discoverManifestSplatCatalog).mockResolvedValue([{path:splatManifest.splats[0],size:3000000}]);
  vi.mocked(fetchPublishedViewerState).mockRejectedValue(new Error('Invalid alignment'));
  const dependencies=deps(), metadata=new NodeFile(['{}'],'transforms_train.json') as unknown as File;
  await expect(loadCameraUrlSource(splatManifest.metadataUrl,dependencies,metadata,splatManifest,'https://catalog.test/mic.json')).rejects.toThrow('Invalid alignment');
  expect(dependencies.processFiles).not.toHaveBeenCalled();
});

it('keeps large companion Gaussians selectable without automatically downloading them',async()=>{
  vi.mocked(discoverManifestSplatCatalog).mockResolvedValue([{path:splatManifest.splats[0],size:500000000}]);
  vi.mocked(fetchPublishedViewerState).mockResolvedValue(null);
  const dependencies={...deps(),isTouchDevice:false,onRemoteSplatCatalog:vi.fn(),onAutoSplatSource:vi.fn()};
  const metadata=new NodeFile(['{}'],'transforms_train.json') as unknown as File;
  expect(await loadCameraUrlSource(splatManifest.metadataUrl,dependencies,metadata,splatManifest,'https://catalog.test/mic.json')).toBe(true);
  expect(dependencies.onRemoteSplatCatalog).toHaveBeenCalled();
  expect(dependencies.onAutoSplatSource).not.toHaveBeenCalled();
});
