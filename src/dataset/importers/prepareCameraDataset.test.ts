import { File as NodeFile } from 'node:buffer';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { pngHeader,jpegExifHeader } from '../../test/imageHeaders';
import { MAX_VIEWER_STATE_BYTES } from '../../utils/publishedViewerState';
import { parseCamerasBinary } from '../../parsers/cameras';
import { parseImagesBinary } from '../../parsers/images';
import { prepareLocalCameraDataset } from './prepareCameraDataset';
import { CameraModelId } from '../../types/cameraModelId';
import type { ArchiveEntry } from '../../archive/types';
import { prepareCameraDataset } from './prepareCameraDataset';

const matrix=[[1,0,0,1],[0,1,0,2],[0,0,1,3],[0,0,0,1]];
const file=(data: string|Uint8Array<ArrayBuffer>,name: string) => new NodeFile([data],name) as unknown as File;
const frame=(path: string) => ({ file_path:path,transform_matrix:matrix });
const data={ camera_angle_x:Math.PI/2,frames:[frame('./train/r_0'),frame('./train/r_1')] };
const files=(metadata: unknown=data) => new Map<string,File>([
  ['scene/transforms_train.json',file(JSON.stringify(metadata),'transforms_train.json')],
  ['scene/train/r_0.png',file(pngHeader(800,800),'r_0.png')],
  ['scene/train/r_1.png',file(pngHeader(800,800),'r_1.png')],
]);
beforeEach(() => vi.stubGlobal('File',NodeFile));
afterEach(() => vi.unstubAllGlobals());

describe('camera metadata preparation',() => {
  it.each(['local','archive'] as const)('imports sibling original photos and masks from %s metadata subfolders',async kind=>{
    const metadata={camera_model:'PINHOLE',w:800,h:800,fl_x:400,fl_y:400,cx:400,cy:400,
      frames:[{...frame('../images/a.png'),mask_path:'../masks/a.png'}]};
    const input=new Map<string,File>([
      ['scene/calibration/transforms.json',file(JSON.stringify(metadata),'transforms.json')],
      ['scene/images/a.png',file(pngHeader(800,800),'a.png')],['scene/masks/a.png',file(pngHeader(800,800),'a.png')],
    ]);
    const prepared=kind==='local' ? (await prepareLocalCameraDataset(input))! : (await prepareCameraDataset({kind:'archive',entries:new Map([...input].map(([path,value])=>[path,{name:value.name,size:value.size,lastModified:0,extract:async()=>value,extractPreview:async()=>value}]))}))!;
    expect(prepared.context.selection.sceneRoot).toBe('scene');
    expect([...prepared.context.bindings.keys()]).toEqual(['a.png']);
    expect(prepared.context.bindings.get('a.png')).toMatchObject({sourceImagePath:'scene/images/a.png',mask:{path:'scene/masks/a.png'}});
  });
  it('does not widen calibration scope into another scene with metadata',async()=>{
    const input=new Map<string,File>([
      ['collection/one/calibration/transforms.json',file(JSON.stringify({...data,frames:[frame('../../two/images/a.png')]}),'transforms.json')],
      ['collection/two/transforms.json',file(JSON.stringify(data),'transforms.json')],
      ['collection/two/images/a.png',file(pngHeader(800,800),'a.png')],
    ]);
    await expect(prepareLocalCameraDataset(input,{metadataPath:'collection/one/calibration/transforms.json'})).rejects.toThrow(/leaves the selected scene/);
  });
  it('resolves URL sibling photos and masks against the metadata directory',async()=>{
    const metadata=file(JSON.stringify({w:800,h:800,fl_x:400,fl_y:400,frames:[{...frame('../images/a.png'),mask_path:'../masks/a.png'}]}),'transforms.json');
    const prepared=(await prepareCameraDataset({kind:'url',baseUrl:'https://example.test/pinned/revision/calibration/'},{metadataPath:'transforms.json',metadataFile:metadata}))!;
    expect(prepared.context.bindings.get('a.png')).toMatchObject({sourceImagePath:'https://example.test/pinned/revision/images/a.png',mask:{path:'https://example.test/pinned/revision/masks/a.png'}});
  });
  it('preserves distinct directory names for absolute URLs with repeating filenames',async()=>{
    const metadata=file(JSON.stringify({w:800,h:800,fl_x:400,fl_y:400,frames:[frame('https://media.example.test/left/a.png'),frame('https://media.example.test/right/a.png')]}),'transforms.json');
    const prepared=(await prepareCameraDataset({kind:'url',baseUrl:'https://example.test/scene/'},{metadataPath:'transforms.json',metadataFile:metadata}))!;
    expect([...prepared.context.bindings.keys()]).toEqual(['left/a.png','right/a.png']);
  });
  const openMvgMetadata=(root_path: string)=>({root_path,
    views:[{key:0,value:{ptr_wrapper:{data:{filename:'a.png',local_path:'',id_pose:42,id_intrinsic:9}}}}],
    intrinsics:[{key:9,value:{polymorphic_name:'pinhole',ptr_wrapper:{data:{width:800,height:800,focal_length:400,principal_point:[400,400]}}}}],
    extrinsics:[{key:42,value:{rotation:[[1,0,0],[0,1,0],[0,0,1]],center:[0,0,0]}}],
  });
  it('honors the declared OpenMVG image root over same-named sibling files',async()=>{
    const input=new Map<string,File>([
      ['scene/sfm_data.json',file(JSON.stringify(openMvgMetadata('photos')),'sfm_data.json')],
      ['scene/a.png',file(pngHeader(4,4),'a.png')],['scene/photos/a.png',file(pngHeader(800,800),'a.png')],
    ]);
    const prepared=(await prepareLocalCameraDataset(input))!;
    expect(prepared.context.bindings.get('photos/a.png')?.sourceImagePath).toBe('scene/photos/a.png');
    input.delete('scene/photos/a.png');
    await expect(prepareLocalCameraDataset(input)).rejects.toMatchObject({code:'MISSING_RGB'});
  });
  it.each(['','photos'])('honors the portable OpenMVG URL image root %j',async root_path=>{
    const prepared=(await prepareCameraDataset({kind:'url',baseUrl:'https://example.test/scene/'},{metadataPath:'sfm_data.json',metadataFile:file(JSON.stringify(openMvgMetadata(root_path)),'sfm_data.json')}))!;
    expect([...prepared.context.bindings.values()][0].sourceImagePath).toBe(root_path ? 'photos/a.png' : 'a.png');
  });
  it.each(['images','./images'])('relocates the author OpenMVG Sceaux example with root %j to its published image repository',async root_path=>{
    const prepared=(await prepareCameraDataset({kind:'url',baseUrl:'https://raw.githubusercontent.com/openMVG/openMVG/develop/src/software/SfM/python/sfm_viewer/sample_data/'},
      {metadataPath:'sfm_data.json',metadataFile:file(JSON.stringify(openMvgMetadata(root_path)),'sfm_data.json')}))!;
    expect([...prepared.context.bindings.values()][0].sourceImagePath).toBe('https://raw.githubusercontent.com/openMVG/ImageDataset_SceauxCastle/master/images/a.png');
  });
  it.each(['','photos'])('keeps a changed author-example root %j authoritative',async root_path=>{
    const prepared=(await prepareCameraDataset({kind:'url',baseUrl:'https://raw.githubusercontent.com/openMVG/openMVG/develop/src/software/SfM/python/sfm_viewer/sample_data/'},
      {metadataPath:'sfm_data.json',metadataFile:file(JSON.stringify(openMvgMetadata(root_path)),'sfm_data.json')}))!;
    expect([...prepared.context.bindings.values()][0].sourceImagePath).toBe(root_path ? 'photos/a.png' : 'a.png');
  });
  it('discovers uppercase image extensions for extensionless URLs',async()=>{
    const fetch=vi.fn(async(url: string)=>new Response(null,{status:url==='https://example.test/scene/images/a.PNG' ? 200 : 404}));
    vi.stubGlobal('fetch',fetch);
    const prepared=(await prepareCameraDataset({kind:'url',baseUrl:'https://example.test/scene/'},{metadataPath:'transforms.json',metadataFile:file(JSON.stringify({w:800,h:800,fl_x:400,fl_y:400,frames:[frame('images/a')]}),'transforms.json')}))!;
    expect(prepared.context.bindings.get('a.PNG')?.sourceImagePath).toBe('images/a.PNG');
    expect(fetch).toHaveBeenCalledTimes(14);
  });
  it('resolves exact extensionless HF-style references from a complete listing without photo probes',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const prepared=(await prepareCameraDataset({kind:'url',baseUrl:'https://example.test/scene/',filePaths:['images/a 100%.PNG']},
      {metadataPath:'transforms.json',metadataFile:file(JSON.stringify({w:800,h:800,fl_x:400,fl_y:400,frames:[frame('images/a 100%')]}),'transforms.json')}))!;
    expect([...prepared.context.bindings.values()][0].sourceImagePath).toBe('images/a 100%.PNG');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects ambiguous extensions in a complete URL listing without preferring case or extension',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    await expect(prepareCameraDataset({kind:'url',baseUrl:'https://example.test/scene/',filePaths:['images/a.png','images/a.PNG']},
      {metadataPath:'transforms.json',metadataFile:file(JSON.stringify({w:800,h:800,fl_x:400,fl_y:400,frames:[frame('images/a')]}),'transforms.json')}))
      .rejects.toMatchObject({code:'AMBIGUOUS_IMAGE_PATH'});
    expect(fetch).not.toHaveBeenCalled();
  });
  it('still probes parent references outside a listed URL subtree and retains a signed query',async()=>{
    const fetch=vi.fn(async(url:string)=>new Response(null,{status:url==='https://example.test/images/a.PNG?key=one%2Ftwo' ? 200 : 404}));
    vi.stubGlobal('fetch',fetch);
    const prepared=(await prepareCameraDataset({kind:'url',baseUrl:'https://example.test/calibration/',filePaths:['transforms.json']},
      {metadataPath:'transforms.json',metadataFile:file(JSON.stringify({w:800,h:800,fl_x:400,fl_y:400,
        frames:[frame('https://example.test/images/a?key=one%2Ftwo')]}),'transforms.json')}))!;
    expect([...prepared.context.bindings.values()][0].sourceImagePath).toBe('https://example.test/images/a.PNG?key=one%2Ftwo');
    expect(fetch).toHaveBeenCalledTimes(14);
  });
  it('rejects distinct lowercase/uppercase URL matches instead of choosing one silently',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url: string)=>new Response(null,{status:/\/a\.(?:png|PNG)$/.test(url) ? 200 : 404})));
    await expect(prepareCameraDataset({kind:'url',baseUrl:'https://example.test/scene/'},{metadataPath:'transforms.json',metadataFile:file(JSON.stringify({w:800,h:800,fl_x:400,fl_y:400,frames:[frame('images/a')]}),'transforms.json')})).rejects.toMatchObject({code:'AMBIGUOUS_IMAGE_PATH'});
  });
  it('treats probes redirecting to the same image URL as one resource',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url: string)=>{
      const match=/\/a\.(?:png|PNG)$/.test(url),response=new Response(null,{status:match ? 200 : 404});
      Object.defineProperty(response,'url',{value:match ? 'https://example.test/scene/images/a.PNG' : url});
      return response;
    }));
    const prepared=(await prepareCameraDataset({kind:'url',baseUrl:'https://example.test/scene/'},{metadataPath:'transforms.json',metadataFile:file(JSON.stringify({w:800,h:800,fl_x:400,fl_y:400,frames:[frame('images/a')]}),'transforms.json')}))!;
    expect(prepared.context.bindings.size).toBe(1);
  });
  it.each([{skew:.1},{is_fisheye:'true'},{distortion_params:[0]},{k4:.1}])('validates lens metadata on absent photo frames: %j',async calibration=>{
    await expect(prepareLocalCameraDataset(files({...data,frames:[frame('train/r_0'),{...frame('missing.png'),...calibration}]}))).rejects.toThrow();
  });
  it('rejects escaped mask paths even on an omitted photo frame',async()=>{
    await expect(prepareLocalCameraDataset(files({...data,frames:[frame('train/r_0'),{...frame('missing.png'),mask_path:'../outside.png'}]}))).rejects.toThrow(/leaves the selected scene/);
  });
  it('rejects a false fisheye flag that contradicts the explicit fisheye camera',async()=>{
    const metadata={camera_model:'OPENCV_FISHEYE',fl_x:400,fl_y:400,cx:400,cy:400,w:800,h:800,is_fisheye:false,frames:[frame('train/r_0')]};
    await expect(prepareLocalCameraDataset(files(metadata))).rejects.toThrow(/is_fisheye/);
  });
  it.each([
    {camera_angle_x:Math.PI/2,k1:.01},
    {x_fov:90},
    {camera_angle_y:Math.PI/2},
  ])('infers each photo resolution for legacy FOV calibration %j',async calibration=>{
    const input=files({...calibration,frames:[frame('train/r_0'),frame('train/r_1')]});
    input.set('scene/train/r_0.png',file(pngHeader(400,200),'r_0.png'));
    input.set('scene/train/r_1.png',file(pngHeader(800,400),'r_1.png'));
    const prepared=(await prepareLocalCameraDataset(input))!;
    const cameras=parseCamerasBinary(await prepared.files.get('sparse/0/cameras.bin')!.arrayBuffer());
    expect([cameras.get(1)?.width,cameras.get(2)?.width]).toEqual([400,800]);
    expect(cameras.get(2)?.params[0]).toBeCloseTo('camera_angle_y' in calibration ? 200 : 400,10);
    expect(prepared.context.selection.schema).toBe('instant-ngp');
  });
  it('rejects equivalent source paths instead of replacing their original files',async()=>{
    const input=files();input.set('scene/train/./r_0.png',file(pngHeader(800,800),'different.png'));
    await expect(prepareLocalCameraDataset(input)).rejects.toThrow(/Duplicate source path/);
  });
  it('probes dotted extensionless URL filenames as exact stems',async()=>{
    const fetch=vi.fn(async(url: string)=>new Response(null,{status:url.endsWith('/images/DSC.001.jpg') ? 200 : 404}));
    vi.stubGlobal('fetch',fetch);
    const metadata=file(JSON.stringify({w:800,h:800,fl_x:400,fl_y:400,frames:[frame('images/DSC.001')]}),'transforms.json');
    const prepared=(await prepareCameraDataset({kind:'url',baseUrl:'https://example.test/scene/'},{metadataPath:'transforms.json',metadataFile:metadata}))!;
    expect(prepared.context.bindings.get('DSC.001.jpg')?.sourceImagePath).toBe('images/DSC.001.jpg');
    expect(fetch).toHaveBeenCalledTimes(14);
  });
  it('adds extensions to the pathname of absolute stem URLs while retaining their query',async()=>{
    const fetch=vi.fn(async(url: string)=>new Response(null,{status:url==='https://media.example.test/DSC.001.png?download=1' ? 200 : 404}));
    vi.stubGlobal('fetch',fetch);
    const metadata=file(JSON.stringify({w:800,h:800,fl_x:400,fl_y:400,frames:[frame('https://media.example.test/DSC.001?download=1')]}),'transforms.json');
    const prepared=(await prepareCameraDataset({kind:'url',baseUrl:'https://example.test/scene/'},{metadataPath:'transforms.json',metadataFile:metadata}))!;
    expect(prepared.context.bindings.get('DSC.001.png')).toMatchObject({sourceImagePath:'https://media.example.test/DSC.001.png?download=1',mask:{kind:'alpha'}});
  });
  it('tries another metadata candidate when an automatic filename hint contains unrelated JSON',async()=>{
    const input=files();input.set('scene/transforms.json',file(JSON.stringify({unrelated:true}),'transforms.json'));
    const prepared=(await prepareLocalCameraDataset(input))!;
    expect(prepared.context.selection.metadataPath).toBe('scene/transforms_train.json');
    expect(prepared.context.bindings.size).toBe(2);
  });
  it('rejects unrelated explicitly selected metadata instead of silently choosing another file',async()=>{
    const input=files();input.set('scene/transforms.json',file(JSON.stringify({unrelated:true}),'transforms.json'));
    await expect(prepareLocalCameraDataset(input,{metadataPath:'scene/transforms.json'})).rejects.toThrow(/Unsupported camera metadata/);
  });
  it('skips oversized optional settings without discarding valid cameras/photos',async()=>{
    const input=files();input.set('scene/colmapview.yaml',file(' '.repeat(MAX_VIEWER_STATE_BYTES+1),'colmapview.yaml'));
    const prepared=(await prepareLocalCameraDataset(input))!;
    expect(prepared.context.bindings.size).toBe(2);expect(prepared.files.has('colmapview.yaml')).toBe(false);
    expect(prepared.context.diagnostics).toContainEqual(expect.objectContaining({code:'UNAVAILABLE_SETTINGS'}));
  });
  it('rejects a rotated representative photo before inferring FOV calibration',async()=>{
    const input=files();input.delete('scene/train/r_0.png');input.set('scene/train/r_0.jpg',file(jpegExifHeader(800,800,6),'r_0.jpg'));
    await expect(prepareLocalCameraDataset(input)).rejects.toThrow(/orientation/);
  });
  it.each(['cx','cy','w','h'])('rejects missing %s in explicitly calibrated cameras',async key=>{
    const calibration: Record<string,unknown>={camera_model:'OPENCV',fl_x:400,fl_y:400,cx:0,cy:400,w:800,h:800};
    delete calibration[key];
    await expect(prepareLocalCameraDataset(files({...calibration,frames:[frame('train/r_0')]}))).rejects.toThrow(new RegExp(key));
  });
  it('reads per-photo dimensions for legacy per-frame calibration rather than assuming Blender resolution',async()=>{
    const input=files({frames:[{...frame('train/r_0'),fl_x:400,fl_y:400,cx:200,cy:100},{...frame('train/r_1'),fl_x:800,fl_y:800,cx:400,cy:200}]});
    input.set('scene/train/r_0.png',file(pngHeader(400,200),'r_0.png'));
    input.set('scene/train/r_1.png',file(pngHeader(800,400),'r_1.png'));
    const prepared=(await prepareLocalCameraDataset(input))!;
    const cameras=parseCamerasBinary(await prepared.files.get('sparse/0/cameras.bin')!.arrayBuffer());
    expect([cameras.get(1)?.width,cameras.get(2)?.width]).toEqual([400,800]);
    expect(prepared.context.selection.schema).toBe('instant-ngp');
  });
  it.each([{mask_path:null},{mask_path:'masks/a.png',mask_file_path:'masks/b.png'}])('rejects invalid/conflicting explicit masks instead of falling back to alpha: %j',async mask=>{
    await expect(prepareLocalCameraDataset(files({...data,frames:[{...frame('train/r_0'),...mask}]}))).rejects.toThrow(/mask/i);
  });
  it('rejects an overflowing FOV-derived focal length before serializing native files',async()=>{
    await expect(prepareLocalCameraDataset(files({...data,camera_angle_x:1e-320}))).rejects.toThrow(/finite/);
  });
  it('allows cancellation to run while omitting a long sequence of missing photos',async()=>{
    const controller=new AbortController();
    const input=files({...data,frames:Array.from({length:600},(_,index)=>frame(`missing/${index}.png`))});
    const pending=prepareLocalCameraDataset(input,{signal:controller.signal});
    setTimeout(()=>controller.abort(),0);
    await expect(pending).rejects.toMatchObject({name:'AbortError'});
  });
  it('produces posed native binary files and exact extensionless photo/alpha bindings',async () => {
    const prepared=(await prepareLocalCameraDataset(files()))!;
    const cameras=parseCamerasBinary(await prepared.files.get('sparse/0/cameras.bin')!.arrayBuffer());
    const images=parseImagesBinary(await prepared.files.get('sparse/0/images.bin')!.arrayBuffer());
    expect(cameras.get(1)?.params[0]).toBeCloseTo(400,10);
    expect(images.get(1)?.name).toBe('train/r_0.png');
    expect(images.get(1)?.tvec).toEqual([-1,2,3]);
    expect(prepared.files.get('sparse/0/points3D.bin')?.size).toBe(8);
    expect(prepared.context.bindings.get('train/r_0.png')).toMatchObject({ sourceImagePath:'scene/train/r_0.png',width:800,height:800,mask:{kind:'alpha'} });
  });
  it('preserves per-frame portrait calibration, zero principal points and explicit mask names',async () => {
    const f={...frame('images/a.png'),w:1080,h:1920,fl_x:710,fl_y:680,cx:0,cy:257,k1:.08,k2:-.01,p1:.003,p2:-.002,mask_path:'masks/00001.png'};
    const input=new Map<string,File>([
      ['transforms.json',file(JSON.stringify({camera_model:'OPENCV',frames:[f]}),'transforms.json')],
      ['images/a.png',file(pngHeader(1080,1920),'a.png')],['masks/00001.png',file(pngHeader(1080,1920),'00001.png')],
    ]);
    const p=(await prepareLocalCameraDataset(input))!;
    const c=parseCamerasBinary(await p.files.get('sparse/0/cameras.bin')!.arrayBuffer()).get(1)!;
    expect(c).toMatchObject({ modelId:CameraModelId.OPENCV,width:1080,height:1920,params:[710,680,0,257,.08,-.01,.003,-.002] });
    expect(p.context.bindings.get('a.png')?.mask).toEqual({kind:'file',path:'masks/00001.png',role:'validity',invert:false});
    expect(p.files.get('masks/a.png.png')).toBe(input.get('masks/00001.png'));
  });
  it('infers Fox-style OPENCV rather than dropping distortion without camera_model',async () => {
    const p=(await prepareLocalCameraDataset(files({...data,w:800,h:800,fl_x:400,fl_y:400,k1:.1})))!;
    expect(parseCamerasBinary(await p.files.get('sparse/0/cameras.bin')!.arrayBuffer()).get(1)?.modelId).toBe(CameraModelId.OPENCV);
  });
  it('retains query-bearing absolute media URLs and encodes literal relative filename characters',async()=>{
    const metadata=file(JSON.stringify({w:800,h:800,fl_x:400,fl_y:400,frames:[frame('https://media.example.test/a.png?download=1'),frame('images/a #%.png')]}),'transforms.json');
    const prepared=(await prepareCameraDataset({kind:'url',baseUrl:'https://example.test/pinned/revision/'},{metadataPath:'transforms.json',metadataFile:metadata}))!;
    expect(prepared.context.bindings.get('a.png')?.sourceImagePath).toBe('https://media.example.test/a.png?download=1');
    expect(prepared.context.bindings.get('a.png')?.mask).toEqual({kind:'alpha',role:'foreground'});
    expect(prepared.context.bindings.get('a #%.png')?.sourceImagePath).toBe('images/a #%.png');
  });
  it('keeps IDs stable when an earlier photograph is definitively missing',async () => {
    const input=files();input.delete('scene/train/r_0.png');
    const p=(await prepareLocalCameraDataset(input))!;
    expect([...parseImagesBinary(await p.files.get('sparse/0/images.bin')!.arrayBuffer()).keys()]).toEqual([2]);
    expect(p.context.diagnostics[0].code).toBe('MISSING_RGB');
  });
  it.each([
    {camera_model:'OPENCV',w:800,h:800,fl_x:400,fl_y:400,k4:.2},
    {w:800,h:800,fl_x:0,fl_y:400},
    {w:800,h:800,fl_x:null,fl_y:400},
    {w:800,h:800,camera_angle_x:0},
    {w:800,h:800,k1:null},
    {w:800,h:800,k5:.1},
    {w:800,h:800,camera_angle_x:Math.PI/2,x_fov:60},
  ])('rejects invalid or unrepresentable calibration %j',async calibration => {
    await expect(prepareLocalCameraDataset(files({...data,...calibration}))).rejects.toThrow();
  });
  it('rejects mixed global/frame coefficient groups and ambiguous image extensions',async () => {
    const input=files({...data,w:800,h:800,k1:.1,frames:[{...frame('train/r_0'),k2:.2}]});
    await expect(prepareLocalCameraDataset(input)).rejects.toThrow(/global and per-frame/);
    const ambiguous=files();ambiguous.set('scene/train/r_0.jpg',file(pngHeader(800,800),'r_0.jpg'));
    await expect(prepareLocalCameraDataset(ambiguous)).rejects.toThrow(/Multiple extensions/);
  });
  it('retains complete native priority and the unrelated-JSON fallback',async () => {
    const input=files();
    for (const name of ['cameras','images','points3D']) input.set(`sparse/0/${name}.bin`,file('native',name+'.bin'));
    await expect(prepareLocalCameraDataset(input)).resolves.toBeNull();
    await expect(prepareLocalCameraDataset(files({unrelated:true}))).resolves.toBeNull();
  });
  it('selects one archive root and reads metadata/one representative photo lazily',async () => {
    const reads:string[]=[];
    const input=files();
    input.set('other/transforms_train.json',file(JSON.stringify(data),'transforms_train.json'));
    input.set('other/train/r_0.png',file(pngHeader(100,100),'r_0.png'));
    const entries=new Map<string,ArchiveEntry>([...input].map(([path,value]) => [path,{name:value.name,size:value.size,lastModified:0,
      extract:async () => {reads.push(path);return value;},extractPreview:async () => value}]));
    const select=vi.fn(async candidates => candidates.find((c: {path:string}) => c.path==='scene/transforms_train.json')!);
    const p=(await prepareCameraDataset({kind:'archive',entries},{select}))!;
    expect(select).toHaveBeenCalledOnce();
    expect(p.context.selection.sceneRoot).toBe('scene');
    expect(reads).toEqual(['scene/transforms_train.json','scene/train/r_0.png']);
    expect(p.files.size).toBe(3);
  });
  it('does not repeat saved applied transforms and observes cancellation',async () => {
    const p=(await prepareLocalCameraDataset(files({...data,applied_transform:[[1,0,0,5],[0,1,0,6],[0,0,1,7]]})))!;
    expect(parseImagesBinary(await p.files.get('sparse/0/images.bin')!.arrayBuffer()).get(1)?.tvec).toEqual([-1,2,3]);
    const controller=new AbortController();controller.abort();
    await expect(prepareLocalCameraDataset(files(),{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
  });
});
