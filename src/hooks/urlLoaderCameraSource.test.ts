import { File as NodeFile } from 'node:buffer';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { loadCameraUrlSource } from './urlLoaderCameraSource';
import { prepareCameraDataset } from '../dataset/importers/prepareCameraDataset';
import { readCameraSourceFile } from '../dataset/importers/sourceAccess';

vi.mock('../dataset/importers/prepareCameraDataset',()=>({prepareCameraDataset:vi.fn(async()=>({files:new Map()}))}));
vi.mock('../dataset/importers/sourceAccess',()=>({readCameraSourceFile:vi.fn(),MAX_CAMERA_MEDIA_BYTES:64*1024*1024}));
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
