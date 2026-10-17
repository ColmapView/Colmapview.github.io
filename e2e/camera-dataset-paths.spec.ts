import { test,expect } from './fixtures/test-fixtures';
import { dropDatasetFiles,type TestDatasetFileEntry } from './fixtures/load-test-data';
import { cameraFixture,fixtureZip } from './fixtures/camera-dataset';
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { parseImagesBinary } from '../src/parsers/images';
import { writeCamerasBinary,writeImagesBinary,writePoints3DBinary } from '../src/parsers/colmapBinaryWriters';

async function imageNames(page: import('@playwright/test').Page) {
  return page.evaluate(async()=>{
    const path='/src/store/reconstructionStore.ts';
    const {useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
    return [...useReconstructionStore.getState().reconstruction?.images.values() ?? []].map(image=>image.name);
  });
}
async function exportPackage(page: import('@playwright/test').Page,masks=false) {
  const button=page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
  await button.hover();await page.locator('select').first().selectOption(masks ? 'zip-masks' : 'zip-images');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download COLMAP',exact:true}).click();
  return unzipSync(readFileSync((await (await pending).path())!));
}
async function bluePhoto(page: import('@playwright/test').Page) {
  return page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=8;canvas.height=4;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='blue';ctx.fillRect(0,0,8,4);
    return canvas.toDataURL('image/png').split(',')[1];
  });
}

for(const transport of ['folder','zip'] as const) test(`imports and packages sibling photos/masks from a calibration ${transport}`,async({page})=>{
  await page.goto('/');const files=await cameraFixture(page),metadata=files.find(file=>file.name==='transforms.json')!;
  const value=JSON.parse(Buffer.from(metadata.base64,'base64').toString('utf8'));
  value.frames.forEach((frame: {file_path:string;mask_path:string})=>{frame.file_path='../'+frame.file_path;frame.mask_path='../'+frame.mask_path;});
  metadata.relativePath='scene/calibration/transforms.json';metadata.base64=Buffer.from(JSON.stringify(value)).toString('base64');
  await dropDatasetFiles(page,transport==='folder' ? files : [{relativePath:'sibling-scene.zip',name:'sibling-scene.zip',base64:fixtureZip(files).toString('base64')}]);
  await expect.poll(()=>imageNames(page)).toEqual(['a.png','b.png']);
  const archive=await exportPackage(page,true);
  expect(Buffer.from(archive['images/a.png'])).toEqual(Buffer.from(files.find(file=>file.relativePath==='scene/images/a.png')!.base64,'base64'));
  expect(archive['masks/a.png.png']).toBeDefined();expect(archive['masks/b.png.png']).toBeDefined();
  expect([...parseImagesBinary(new Uint8Array(archive['sparse/0/images.bin']).buffer).values()].map(image=>image.name)).toEqual(['a.png','b.png']);
});

test('uses the declared OpenMVG photo root when a different sibling photo has the same name',async({page})=>{
  await page.goto('/');const files=await cameraFixture(page,'openmvg'),metadata=files.find(file=>file.name==='sfm_data.json')!;
  const value=JSON.parse(Buffer.from(metadata.base64,'base64').toString('utf8'));value.root_path='photos';
  metadata.base64=Buffer.from(JSON.stringify(value)).toString('base64');
  files.forEach(file=>{file.relativePath=file.relativePath.replace('/images/','/photos/');});
  files.push({relativePath:'scene/a.png',name:'a.png',base64:await bluePhoto(page)});
  await dropDatasetFiles(page,files);await expect.poll(()=>imageNames(page)).toEqual(['photos/a.png','photos/b.png']);
  const archive=await exportPackage(page);
  expect(Buffer.from(archive['images/photos/a.png'])).toEqual(Buffer.from(files.find(file=>file.relativePath==='scene/photos/a.png')!.base64,'base64'));
  expect(Buffer.from(archive['images/photos/a.png'])).not.toEqual(Buffer.from(files.find(file=>file.relativePath==='scene/a.png')!.base64,'base64'));
});

test('keeps native priority for calibration metadata and images in the same archive scene',async({page})=>{
  await page.goto('/');const files=await cameraFixture(page),metadata=files.find(file=>file.name==='transforms.json')!;
  metadata.relativePath='scene/calibration/transforms.json';
  const binary=(path:string,bytes:ArrayBuffer)=>({relativePath:path,name:path.split('/').pop()!,base64:Buffer.from(bytes).toString('base64')});
  files.push(
    binary('scene/sparse/0/cameras.bin',writeCamerasBinary(new Map([[1,{cameraId:1,modelId:1,width:8,height:4,params:[5,6,4,2]}]]))),
    binary('scene/sparse/0/images.bin',writeImagesBinary(new Map([[1,{imageId:1,cameraId:1,name:'a.png',qvec:[1,0,0,0],tvec:[10,20,30],points2D:[]}]]))),
    binary('scene/sparse/0/points3D.bin',writePoints3DBinary(new Map())),
  );
  await dropDatasetFiles(page,[{relativePath:'same-scene.zip',name:'same-scene.zip',base64:fixtureZip(files).toString('base64')}]);
  await expect.poll(()=>imageNames(page)).toEqual(['a.png']);
  await expect(page.getByRole('dialog',{name:'Choose a camera dataset'})).toBeHidden();
  expect(await page.evaluate(async()=>{
    const path='/src/store/reconstructionStore.ts';const {useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
    const store=useReconstructionStore.getState();
    return {imported:Boolean(store.loadedFiles?.cameraImport),translation:store.reconstruction!.images.get(1)!.tvec};
  })).toEqual({imported:false,translation:[10,20,30]});
});

test('imports an empty OpenMVG URL image root and packages the adjacent photos',async({page})=>{
  await page.goto('/');const files=await cameraFixture(page,'openmvg'),metadata=files.find(file=>file.name==='sfm_data.json')!;
  const value=JSON.parse(Buffer.from(metadata.base64,'base64').toString('utf8'));value.root_path='';
  metadata.base64=Buffer.from(JSON.stringify(value)).toString('base64');
  files.forEach(file=>{file.relativePath=file.relativePath.replace('/images/','/');});
  const base='https://camera.example.test/scene/';
  await page.route(base+'**',route=>{
    const path=new URL(route.request().url()).pathname.replace('/scene/','');
    const file=files.find(file=>file.relativePath==='scene/'+path);
    return route.fulfill(file ? {status:200,body:Buffer.from(file.base64,'base64'),contentType:path.endsWith('.json') ? 'application/json' : 'image/png'} : {status:404});
  });
  await page.goto('/?url='+encodeURIComponent(base+'sfm_data.json'));await expect.poll(()=>imageNames(page)).toEqual(['a.png','b.png']);
  const archive=await exportPackage(page);
  expect(Buffer.from(archive['images/a.png'])).toEqual(Buffer.from(files.find(file=>file.relativePath==='scene/a.png')!.base64,'base64'));
});

test('packages parent-relative uppercase URLs and distinct absolute directories without changing original RGB',async({page})=>{
  await page.goto('/');const files=await cameraFixture(page),metadata=files.find(file=>file.name==='transforms.json')!;
  const base='https://camera.example.test/pinned/revision/';
  const value=JSON.parse(Buffer.from(metadata.base64,'base64').toString('utf8'));
  value.frames[0].file_path='../left/a';value.frames[0].mask_path='../masks/one.png';
  value.frames[1].file_path=base+'right/a.PNG?download=1';value.frames[1].mask_path='../masks/two.png';
  metadata.relativePath='scene/calibration/transforms.json';metadata.base64=Buffer.from(JSON.stringify(value)).toString('base64');
  files.find(file=>file.relativePath==='scene/images/a.png')!.relativePath='scene/left/a.PNG';
  const second=files.find(file=>file.relativePath==='scene/images/b.png')!;second.relativePath='scene/right/a.PNG';second.base64=await bluePhoto(page);
  await page.route(base+'**',route=>{
    const url=new URL(route.request().url()),path=url.pathname.replace('/pinned/revision/','');
    const file=files.find(file=>file.relativePath==='scene/'+path);
    if(path==='right/a.PNG' && url.search!=='?download=1') return route.fulfill({status:403});
    return route.fulfill(file ? {status:200,body:Buffer.from(file.base64,'base64'),contentType:path.endsWith('.json') ? 'application/json' : 'image/png'} : {status:404});
  });
  await page.goto('/?url='+encodeURIComponent(base+'calibration/transforms.json'));
  await expect.poll(()=>imageNames(page)).toEqual(['left/a.PNG','right/a.PNG']);
  const archive=await exportPackage(page,true);
  for(const name of ['left/a.PNG','right/a.PNG']) {
    const original=files.find((file: TestDatasetFileEntry)=>file.relativePath==='scene/'+name)!;
    expect(Buffer.from(archive['images/'+name])).toEqual(Buffer.from(original.base64,'base64'));
    expect(archive['masks/'+name+'.png']).toBeDefined();
  }
});
