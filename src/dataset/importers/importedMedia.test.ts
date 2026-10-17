import { File as NodeFile, Blob as NodeBlob } from 'node:buffer';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { DatasetManager } from '../DatasetManager';
import { prepareLocalCameraDataset } from './prepareCameraDataset';
import { pngHeader,jpegExifHeader } from '../../test/imageHeaders';
import { validateImportedImage } from './importedMedia';
import type { DatasetState } from '../types';
beforeEach(()=>vi.stubGlobal('File',NodeFile));afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
const matrix=[[1,0,0,1],[0,1,0,2],[0,0,1,3],[0,0,0,1]];
async function fixture() {
  const file=(bytes:string|Uint8Array<ArrayBuffer>,name:string)=>new NodeFile([bytes],name) as unknown as File;
  const files=new Map([['transforms.json',file(JSON.stringify({w:8,h:4,fl_x:5,fl_y:6,frames:[{file_path:'nested/a.png',mask_path:'masks/one.png',transform_matrix:matrix}]}),'transforms.json')],['nested/a.png',file(pngHeader(8,4),'a.png')],['other/a.png',file(pngHeader(8,4),'a.png')],['masks/one.png',file(pngHeader(8,4),'one.png')]]);
  const prepared=(await prepareLocalCameraDataset(files))!;
  return {prepared,files};
}
it('checks a newly derived alpha mask against the caller budget before publishing it',async()=>{
  const {prepared,files}=await fixture();
  const binding={...prepared.context.bindings.get('nested/a.png')!,mask:{kind:'alpha' as const,role:'foreground' as const}};
  const context={...prepared.context,bindings:new Map([['nested/a.png',binding]])};
  const state:DatasetState={sourceType:'local',imageUrlBase:null,maskUrlBase:null,imageNameToUrl:null,loadedFiles:{cameraImport:context,imageFiles:new Map(),hasMasks:true}};
  vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:8,height:4,close:vi.fn()})));
  const drawingContext={drawImage:vi.fn(),getImageData:()=>({data:new Uint8ClampedArray(8*4*4)}),putImageData:vi.fn()} as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation((()=>drawingContext) as unknown as HTMLCanvasElement['getContext']);
  vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(callback=>callback(new NodeBlob([new Uint8Array(100)]) as unknown as Blob));
  const manager=new DatasetManager(()=>state),onError=vi.fn();
  expect(files.get('nested/a.png')!.size).toBeLessThan(30);
  expect(await manager.getMask('nested/a.png',{maxBytes:30,onError})).toBeNull();
  expect(onError).toHaveBeenCalledOnce();expect(manager.getMaskSync('nested/a.png')).toBeUndefined();
  expect((await manager.getMask('nested/a.png',{maxBytes:200}))?.size).toBe(100);
});
it('uses exact photo/mask bindings and validates before synchronous publication',async()=>{
  const {prepared,files}=await fixture();
  const state:DatasetState={sourceType:'local',imageUrlBase:null,maskUrlBase:null,imageNameToUrl:null,loadedFiles:{cameraImport:prepared.context,imageFiles:new Map(),hasMasks:true}};
  const manager=new DatasetManager(()=>state);
  expect(manager.getImageSync('nested/a.png')).toBeUndefined();
  expect(await manager.getOriginalImage('nested/a.png')).toBe(files.get('nested/a.png'));
  expect(manager.getImageSync('nested/a.png')).toBe(files.get('nested/a.png'));
  expect(await manager.getOriginalImage('a.png')).toBeNull();
  expect(await manager.getMask('nested/a.png')).toBe(files.get('masks/one.png'));
  const onError=vi.fn();
  expect(await manager.getOriginalImage('nested/a.png',{maxBytes:1,onError})).toBeNull();
  expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({message:expect.stringContaining('budget')}));
});
it('rejects changed dimensions and EXIF rotation without silently changing intrinsics',async()=>{
  const binding={sourceImagePath:'a.jpg',width:8,height:4,frameIndex:0};
  await expect(validateImportedImage(new NodeFile([pngHeader(4,8)],'a.png') as unknown as File,binding)).rejects.toThrow(/dimensions/);
  await expect(validateImportedImage(new NodeFile([jpegExifHeader(8,4,6)],'a.jpg') as unknown as File,binding)).rejects.toThrow(/EXIF/);
});
it('drops original media completion after a different scene commits',async()=>{
  const {prepared}=await fixture();
  let state:DatasetState={sourceType:'local',imageUrlBase:null,maskUrlBase:null,imageNameToUrl:null,loadedFiles:{cameraImport:prepared.context,imageFiles:new Map(),hasMasks:true}};
  const manager=new DatasetManager(()=>state);
  const pending=manager.getOriginalImage('nested/a.png');
  state={...state,loadedFiles:{imageFiles:new Map(),hasMasks:false}};
  expect(await pending).toBeNull();
});
it('reports invalid photos and masks through onError and resolves null for the viewer',async()=>{
  const {prepared,files}=await fixture();
  const sourceFiles=new Map(files);
  sourceFiles.set('nested/a.png',new NodeFile([pngHeader(4,8)],'a.png') as unknown as File);
  sourceFiles.set('masks/one.png',new NodeFile([pngHeader(4,8)],'one.png') as unknown as File);
  const context={...prepared.context,source:{kind:'local' as const,files:sourceFiles}};
  const state:DatasetState={sourceType:'local',imageUrlBase:null,maskUrlBase:null,imageNameToUrl:null,loadedFiles:{cameraImport:context,imageFiles:new Map(),hasMasks:true}};
  const manager=new DatasetManager(()=>state);
  for(const method of ['getImage','getOriginalImage','getMask'] as const) {
    const onError=vi.fn();
    await expect(manager[method]('nested/a.png',{onError})).resolves.toBeNull();
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({message:expect.stringContaining('dimensions')}));
  }
});
it('invalidates a React-style bound dataset manager when the live scene changes',async()=>{
  const {prepared}=await fixture();
  const bound:DatasetState={sourceType:'local',imageUrlBase:null,maskUrlBase:null,imageNameToUrl:null,loadedFiles:{cameraImport:prepared.context,imageFiles:new Map(),hasMasks:true}};
  let live=bound;
  const manager=new DatasetManager(()=>bound,()=>live);
  const pending=manager.getOriginalImage('nested/a.png');
  live={...bound,loadedFiles:{imageFiles:new Map(),hasMasks:false}};
  expect(await pending).toBeNull();expect(manager.getImageSync('nested/a.png')).toBeUndefined();
  expect(await manager.getImage('nested/a.png')).toBeNull();
});
it('contains validation failures during prefetch and keeps fetching other photos',async()=>{
  const {prepared,files}=await fixture();const sourceFiles=new Map(files);
  sourceFiles.set('nested/a.png',new NodeFile([pngHeader(4,8)],'a.png') as unknown as File);
  const bindings=new Map(prepared.context.bindings);
  bindings.set('other/a.png',{sourceImagePath:'other/a.png',width:8,height:4,frameIndex:1});
  const context={...prepared.context,bindings,source:{kind:'local' as const,files:sourceFiles}};
  const state:DatasetState={sourceType:'local',imageUrlBase:null,maskUrlBase:null,imageNameToUrl:null,loadedFiles:{cameraImport:context,imageFiles:new Map(),hasMasks:true}};
  const manager=new DatasetManager(()=>state),onError=vi.fn();
  await expect(manager.prefetchImages(['nested/a.png','other/a.png'],1,{onError})).resolves.toBeUndefined();
  expect(onError).toHaveBeenCalledOnce();
  expect(manager.getImageSync('other/a.png')).toBe(sourceFiles.get('other/a.png'));
});
