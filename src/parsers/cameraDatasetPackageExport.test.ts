import { File as NodeFile, Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeCameraDatasetPackage, normalizeFeatureMask } from './cameraDatasetPackageExport';
import { pngHeader } from '../test/imageHeaders';
import type { Reconstruction } from '../types/colmap';
import type { Sim3dEuler } from '../types/sim3d';
import { alphaMask } from '../dataset/importers/importedMedia';
vi.mock('./prepareReconstructionFiles',()=>({prepareReconstructionFiles:vi.fn(async ()=>({'cameras.bin':new Blob([new Uint8Array(1)]),'images.bin':new Blob([new Uint8Array(1)]),'points3D.bin':new Blob([new Uint8Array(8)])}))}));
vi.mock('../dataset/importers/importedMedia',()=>({alphaMask:vi.fn(async()=>null)}));
beforeEach(()=>{vi.stubGlobal('File',NodeFile);vi.stubGlobal('Blob',NodeBlob);vi.stubGlobal('createImageBitmap',vi.fn(async()=>({close:vi.fn()})));}); afterEach(()=>vi.unstubAllGlobals());
const model = () => ({ cameras:new Map([[1,{cameraId:1,width:4,height:3,modelId:1,params:[2,2,2,1.5]}]]),images:new Map([[1,{imageId:1,cameraId:1,name:'images/nested/a.png',points2D:[],qvec:[1,0,0,0],tvec:[0,0,0]}]]) }) as unknown as Reconstruction;
const file = () => new NodeFile([pngHeader(4,3)],'a.png') as unknown as File;
const signal = () => new AbortController().signal;
// Collect only these tiny fixtures; the production exporter awaits disk writes instead.
async function prepareCameraDatasetPackage(reconstruction: Reconstruction, source: null, transform: Sim3dEuler,
  media: import('./cameraDatasetPackageExport').CameraPackageMedia, masks: boolean, signal: AbortSignal) {
  const files: Record<string, Uint8Array> = Object.create(null);
  const result = await writeCameraDatasetPackage(reconstruction, source, transform, media, masks, signal,
    async (path, blob) => { files[path] = new Uint8Array(await blob.arrayBuffer()); });
  return { ...result, files };
}
it('repackages canonical native names without removing a real images directory',async()=>{
  const reconstruction=model();
  reconstruction.images.set(2,{...reconstruction.images.get(1)!,imageId:2,name:'nested/a.png'});
  const result=await prepareCameraDatasetPackage(reconstruction,null,{} as Sim3dEuler,{getOriginalImage:async()=>file(),getMask:async()=>null},false,signal());
  expect(result.files['images/images/nested/a.png']).toBeDefined();
  expect(result.files['images/nested/a.png']).toBeDefined();
});
it('preserves already-canonical imported names with a real nested images directory',async()=>{
  const reconstruction=model();
  reconstruction.images.set(2,{...reconstruction.images.get(1)!,imageId:2,name:'nested/a.png'});
  const media={getOriginalImage:async()=>file(),getMask:async()=>null,getBinding:(name: string)=>({sourceImagePath:'images/'+name,width:4,height:3,frameIndex:0})};
  const result=await prepareCameraDatasetPackage(reconstruction,null,{} as Sim3dEuler,media,false,signal());
  expect(result.files['images/images/nested/a.png']).toBeDefined();
  expect(result.files['images/nested/a.png']).toBeDefined();
});
it('packages each model image once with the exact original bytes and canonical name',async()=>{
  const rgb=file(); const getOriginalImage=vi.fn(async(_name: string, _options?: import('../dataset/types').DatasetAccessOptions)=>rgb);
  const result=await prepareCameraDatasetPackage(model(),null,{} as Sim3dEuler,{getOriginalImage,getMask:async()=>null},false,signal());
  expect(Object.keys(result.files)).toEqual(['sparse/0/cameras.bin','sparse/0/images.bin','sparse/0/points3D.bin','images/images/nested/a.png']);
  expect(result.files['images/images/nested/a.png']).toEqual(new Uint8Array(await rgb.arrayBuffer()));
  expect(getOriginalImage.mock.calls[0][1]).toMatchObject({maxBytes:64*1024*1024});
});
it('fails missing mandatory RGB, declared masks and unverified mask roles',async()=>{
  await expect(prepareCameraDatasetPackage(model(),null,{} as Sim3dEuler,{getOriginalImage:async()=>null,getMask:async()=>null},false,signal())).rejects.toThrow(/Required image/);
  const media={getOriginalImage:async()=>file(),getMask:async()=>null,getBinding:()=>({sourceImagePath:'a.png',width:4,height:3,frameIndex:0,mask:{kind:'file' as const,path:'mask.png',role:'validity' as const,invert:false}})};
  await expect(prepareCameraDatasetPackage(model(),null,{} as Sim3dEuler,media,true,signal())).rejects.toThrow(/Declared mask/);
  await expect(prepareCameraDatasetPackage(model(),null,{} as Sim3dEuler,{...media,getBinding:()=>({...media.getBinding(),mask:{...media.getBinding().mask,role:'unknown' as const}})},true,signal())).rejects.toThrow(/unverified/);
});
it('rejects case collisions, unexpected dimensions and cancellation',async()=>{
  const media={getOriginalImage:async()=>file(),getMask:async()=>null};
  const duplicate=model(); duplicate.images.set(2,{...duplicate.images.get(1)!,imageId:2,name:'images/nested/A.png'});
  await expect(prepareCameraDatasetPackage(duplicate,null,{} as Sim3dEuler,media,false,signal())).rejects.toThrow(/Duplicate/);
  const wrong=model(); wrong.cameras.get(1)!.width=8;
  await expect(prepareCameraDatasetPackage(wrong,null,{} as Sim3dEuler,media,false,signal())).rejects.toThrow(/calibration/);
  const controller=new AbortController();controller.abort();
  await expect(prepareCameraDatasetPackage(model(),null,{} as Sim3dEuler,media,false,controller.signal)).rejects.toMatchObject({name:'AbortError'});
});
it('derives alpha from the already-read original without fetching it twice',async()=>{
  const rgb=file(), getMask=vi.fn(async()=>{throw new Error('Must not reread the original RGB for alpha.');});
  const media={getOriginalImage:async()=>rgb,getMask,getBinding:()=>({sourceImagePath:'a.png',width:4,height:3,frameIndex:0,mask:{kind:'alpha' as const,role:'foreground' as const}})};
  const result=await prepareCameraDatasetPackage(model(),null,{} as Sim3dEuler,media,true,signal());
  expect(result.maskCount).toBe(0);expect(getMask).not.toHaveBeenCalled();
  expect(alphaMask).toHaveBeenCalledWith(rgb,'images/nested/a.png',expect.any(AbortSignal));
});
it('waits for the current write before reading another photo, including beyond 256 MiB', async () => {
  const names = Array.from({length: 6}, (_, index) => `${index}.png`);
  let written = 0, read = 0;
  const media = { getOriginalImage: vi.fn(async () => {
    expect(read).toBe(written);
    read++;
    const rgb = new NodeFile([pngHeader(4,3), new Uint8Array(8), new TextEncoder().encode('IDAT')], 'large.png') as unknown as File;
    // Lazy size stand-in: the sink must receive Blobs without materializing their bytes.
    Object.defineProperty(rgb, 'size', {value: 60 * 1024 * 1024});
    vi.spyOn(rgb, 'arrayBuffer').mockRejectedValue(new Error('Do not accumulate originals'));
    return rgb;
  }), getMask: async () => null };
  let total = 0;
  await writeCameraDatasetPackage(namedModel(names), null, {} as Sim3dEuler, media, false, signal(), async (path, blob) => {
    if (!path.startsWith('images/')) return;
    await Promise.resolve();
    total += blob.size; written++;
  });
  expect(written).toBe(6); expect(total).toBe(360 * 1024 * 1024);
  expect(media.getOriginalImage.mock.calls).toHaveLength(6);
});
it('still refuses a single oversized original before decoding or writing it', async () => {
  const rgb = file(); Object.defineProperty(rgb, 'size', {value: 64 * 1024 * 1024 + 1});
  const write = vi.fn(async () => {});
  await expect(writeCameraDatasetPackage(model(), null, {} as Sim3dEuler,
    {getOriginalImage: async () => rgb, getMask: async () => null}, false, signal(), write)).rejects.toThrow(/read budget/);
  expect(write.mock.calls).toHaveLength(3);
});
it('cancels during bitmap validation and closes a decoder that finishes late', async () => {
  const controller = new AbortController(), close = vi.fn();
  let resolve!: (bitmap: ImageBitmap) => void;
  vi.mocked(createImageBitmap).mockImplementationOnce(() => new Promise(done => {resolve = done;}));
  const write = vi.fn(async () => {});
  const pending = writeCameraDatasetPackage(model(), null, {} as Sim3dEuler,
    {getOriginalImage: async () => file(), getMask: async () => null}, false, controller.signal, write);
  const rejected = expect(pending).rejects.toMatchObject({name: 'AbortError'});
  await vi.waitFor(() => expect(resolve).toBeDefined()); controller.abort(); await rejected;
  resolve({close} as unknown as ImageBitmap); await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(write.mock.calls).toHaveLength(3);
});
it('converts declared IDR foreground luminance while rejecting untyped colored masks', async()=>{
  const values=new Uint8ClampedArray([10,200,10,255,200,10,10,255,128,128,128,255,127,127,127,255]);
  const canvas={width:0,height:0,getContext:()=>({drawImage:vi.fn(),getImageData:()=>({data:values}),putImageData:vi.fn()}),
    toBlob:(done: (value: Blob)=>void)=>done(new Blob([new Uint8Array(values)]))};
  const create=vi.spyOn(document,'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);
  const mask=new NodeFile([pngHeader(4,1)],'mask.png') as unknown as File;
  try {
    await expect(normalizeFeatureMask(mask,4,1,false,signal())).rejects.toThrow(/Colored label/);
    await normalizeFeatureMask(mask,4,1,false,signal(),'binary-luminance');
    expect([...values]).toEqual([255,255,255,255,0,0,0,255,255,255,255,255,0,0,0,255]);
  } finally {create.mockRestore();}
});

function namedModel(names: readonly string[]): Reconstruction {
  const result=model(),template=result.images.get(1)!;result.images.clear();
  names.forEach((name,index)=>result.images.set(index+1,{...template,imageId:index+1,name}));
  return result;
}
function maskCanvas() {
  const data=new Uint8ClampedArray(4*3*4);
  const canvas={width:0,height:0,getContext:()=>({drawImage:vi.fn(),getImageData:()=>({data}),putImageData:vi.fn()}),
    toBlob:(done:(value:Blob)=>void)=>done(new Blob([pngHeader(4,3)]))};
  return vi.spyOn(document,'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);
}
describe('package members form an extractable file tree',()=>{
  it.each([
    ['a.png','a.png/b.png'],['a.png/b.png','a.png'],
    ['Cam.png','cam.png/b.png'],['cam.png/b.png','CAM.png'],
    ['a.png','outer/../a.png/b.png'],
  ])('rejects RGB file/directory conflicts between %s and %s',async(first,second)=>{
    await expect(prepareCameraDatasetPackage(namedModel([first,second]),null,{} as Sim3dEuler,
      {getOriginalImage:async()=>file(),getMask:async()=>null},false,signal())).rejects.toThrow(/path conflict/i);
  });
  it.each([false,true])('rejects mask-only file/directory conflicts, descendant first: %s',async reverse=>{
    const names=['camera','camera.png/b.png'];if(reverse)names.reverse();
    const canvas=maskCanvas();
    try {
      const media={getOriginalImage:async()=>file(),getMask:async()=>file(),getBinding:()=>({sourceImagePath:'rgb.png',width:4,height:3,frameIndex:0,
        mask:{kind:'file' as const,path:'mask.png',role:'validity' as const,invert:false}})};
      await expect(prepareCameraDatasetPackage(namedModel(names),null,{} as Sim3dEuler,media,true,signal())).rejects.toThrow(/path conflict/i);
    }finally{canvas.mockRestore();}
  });
  it('accepts neighboring filename prefixes and model/image namespace reuse',async()=>{
    const names=['a.png','a.png-other/b.png','sparse/0/cameras.bin.png'];
    const result=await prepareCameraDatasetPackage(namedModel(names),null,{} as Sim3dEuler,
      {getOriginalImage:async()=>file(),getMask:async()=>null},false,signal());
    for(const name of names)expect(result.files['images/'+name]).toBeDefined();
    expect(result.files['sparse/0/cameras.bin']).toBeDefined();
  });
  it.each([0,1])('accepts a potential mask-prefix conflict when only mask %i exists',async selected=>{
    const names=['camera','camera.png/b.png'],canvas=maskCanvas();
    try {
      const media={getOriginalImage:async()=>file(),getMask:async(name:string)=>name===names[selected]?file():null,
        getBinding:(name:string)=>({sourceImagePath:'rgb.png',width:4,height:3,frameIndex:0,
          mask:name===names[selected]?{kind:'file' as const,path:'mask.png',role:'validity' as const,invert:false}:undefined})};
      const result=await prepareCameraDatasetPackage(namedModel(names),null,{} as Sim3dEuler,media,true,signal());
      expect(Object.keys(result.files).filter(path=>path.startsWith('masks/'))).toEqual(['masks/'+names[selected]+'.png']);
      expect(result.maskCount).toBe(1);
    }finally{canvas.mockRestore();}
  });
});
