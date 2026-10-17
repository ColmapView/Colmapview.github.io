import { test, expect } from './fixtures/test-fixtures';
import { cameraFixture } from './fixtures/camera-dataset';
import { dropDatasetFiles } from './fixtures/load-test-data';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { unzipSync } from 'fflate';
import { parseImagesBinary } from '../src/parsers/images';
import { parseCamerasBinary } from '../src/parsers/cameras';

test('exports and reimports distinct originals in nested images directories',async({page})=>{
  await page.goto('/');const source=await cameraFixture(page);
  const photos=source.filter(file=>file.relativePath.includes('/images/'));
  photos[0].relativePath='scene/images/images/nested/a.png';
  photos[1].relativePath='scene/images/nested/a.png';photos[1].name='a.png';
  photos[1].base64=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=8;canvas.height=4;
    const context=canvas.getContext('2d')!;context.fillStyle='blue';context.fillRect(0,0,8,4);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const metadata=source.find(file=>file.name==='transforms.json')!;
  const value=JSON.parse(Buffer.from(metadata.base64,'base64').toString('utf8'));
  value.frames[0].file_path='images/images/nested/a.png';value.frames[1].file_path='images/nested/a.png';
  metadata.base64=Buffer.from(JSON.stringify(value)).toString('base64');
  await dropDatasetFiles(page,source);
  await expect(page.locator('text=Source:')).toBeVisible({timeout:45000});
  const button=page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
  await button.hover();await page.locator('select').first().selectOption('zip-images');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download COLMAP',exact:true}).click();
  const download=await pending,buffer=readFileSync((await download.path())!),archive=unzipSync(buffer);
  expect([...parseImagesBinary(new Uint8Array(archive['sparse/0/images.bin']).buffer).values()].map(image=>image.name))
    .toEqual(['images/nested/a.png','nested/a.png']);
  expect(Buffer.from(archive['images/images/nested/a.png'])).toEqual(Buffer.from(photos[0].base64,'base64'));
  expect(Buffer.from(archive['images/nested/a.png'])).toEqual(Buffer.from(photos[1].base64,'base64'));
  await button.hover();await dropDatasetFiles(page,[{relativePath:'nested.zip',name:'nested.zip',base64:buffer.toString('base64')}]);
  await expect.poll(async()=>page.evaluate(async()=>{
    const path='/src/store/reconstructionStore.ts';const {useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
    return Boolean(useReconstructionStore.getState().reconstruction) && !useReconstructionStore.getState().loadedFiles?.cameraImport;
  })).toBe(true);
  const originals=await page.evaluate(async()=>{
    const path='/src/dataset/index.ts';const {getDatasetManager}=await import(path) as typeof import('../src/dataset');
    const encode=async(name: string)=>{
      const file=await getDatasetManager().getOriginalImage(name);
      return file ? btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer()))) : null;
    };
    return Promise.all(['images/nested/a.png','nested/a.png'].map(encode));
  });
  expect(originals).toEqual(photos.map(photo=>photo.base64));
  // Scene replacement closes the panel; Firefox needs a new pointer entry to reopen it.
  await page.mouse.move(0,0);
  await button.hover();await page.locator('select').first().selectOption('zip-images');
  const nextDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download COLMAP',exact:true}).click();
  const repackaged=unzipSync(readFileSync((await (await nextDownload).path())!));
  expect([...parseImagesBinary(new Uint8Array(repackaged['sparse/0/images.bin']).buffer).values()].map(image=>image.name))
    .toEqual(['images/nested/a.png','nested/a.png']);
  expect(Buffer.from(repackaged['images/images/nested/a.png'])).toEqual(Buffer.from(photos[0].base64,'base64'));
  expect(Buffer.from(repackaged['images/nested/a.png'])).toEqual(Buffer.from(photos[1].base64,'base64'));
});

test('imports query-bearing PNG URLs and exports their partial alpha masks',async({page})=>{
  await page.goto('/');const source=await cameraFixture(page,'nerf-blender');
  const base='https://camera.example.test/pinned/revision/',metadata=source.find(file=>file.name==='transforms_train.json')!;
  const value=JSON.parse(Buffer.from(metadata.base64,'base64').toString('utf8'));
  value.frames.forEach((frame: {file_path: string},index: number)=>{frame.file_path=`${base}images/${index ? 'b' : 'a'}.png?download=1`;});
  metadata.base64=Buffer.from(JSON.stringify(value)).toString('base64');
  await page.route(base+'**',route=>{
    const path=new URL(route.request().url()).pathname.replace('/pinned/revision/','');
    const file=source.find(file=>file.relativePath==='scene/'+path);
    return route.fulfill(file ? {status:200,body:Buffer.from(file.base64,'base64'),contentType:path.endsWith('.json') ? 'application/json' : 'image/png'} : {status:404});
  });
  await page.goto('/?url='+encodeURIComponent(base+'transforms_train.json'));
  await expect(page.locator('text=Source:')).toBeVisible({timeout:45000});
  const button=page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
  await button.hover();await page.locator('select').first().selectOption('zip-masks');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download COLMAP',exact:true}).click();
  const archive=unzipSync(readFileSync((await (await pending).path())!));
  expect(archive['masks/a.png.png']).toBeDefined();expect(archive['masks/b.png.png']).toBeDefined();
  const pixels=await page.evaluate(async base64=>{
    const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),character=>character.charCodeAt(0))]));
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d')!;context.drawImage(bitmap,0,0);bitmap.close();
    return Array.from(context.getImageData(0,0,8,1).data).filter((_,index)=>index%4===0);
  },Buffer.from(archive['masks/a.png.png']).toString('base64'));
  expect(pixels).toEqual([0,0,128,128,128,255,255,255]);
});

for(const schema of ['nerfstudio','nerf-blender'] as const) {
  test(`exports ${schema} original RGB and normalized masks, then reloads the native package`,async({page})=>{
    await page.goto('/');const source=await cameraFixture(page,schema);await dropDatasetFiles(page,source);
    await expect(page.locator('text=Source:')).toBeVisible({timeout:45000});
    const button=page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
    await expect(button).toBeEnabled();await button.hover();
    await page.locator('select').first().selectOption('zip-masks');
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download COLMAP',exact:true}).click();
    const download=await pending;
    const archive=unzipSync(readFileSync((await download.path())!));
    expect(Object.keys(archive).sort()).toEqual(['images/a.png','images/b.png','masks/a.png.png','masks/b.png.png','sparse/0/cameras.bin','sparse/0/images.bin','sparse/0/points3D.bin'].sort());
    expect(Buffer.from(archive['images/a.png'])).toEqual(Buffer.from(source.find(file=>file.name==='a.png')!.base64,'base64'));
    expect(parseImagesBinary(new Uint8Array(archive['sparse/0/images.bin']).buffer).size).toBe(2);
    expect(parseCamerasBinary(new Uint8Array(archive['sparse/0/cameras.bin']).buffer).size).toBe(2);
    expect(new DataView(new Uint8Array(archive['sparse/0/points3D.bin']).buffer).getBigUint64(0,true)).toBe(0n);
    const pixels=await page.evaluate(async base64=>{
      const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),character=>character.charCodeAt(0))]));
      const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();
      return Array.from(ctx.getImageData(0,0,8,1).data).filter((_,index)=>index%4===0);
    },Buffer.from(archive['masks/a.png.png']).toString('base64'));
    expect(pixels).toEqual(schema==='nerfstudio'?[0,0,0,0,255,255,255,255]:[0,0,128,128,128,255,255,255]);
    for(const [path,bytes] of Object.entries(archive)) {
      const target=resolve('.tmp/camera-dataset-browser-exports',schema,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);
    }
    await button.hover();
    await dropDatasetFiles(page,[{relativePath:download.suggestedFilename(),name:download.suggestedFilename(),base64:readFileSync((await download.path())!).toString('base64')}]);
    await expect.poll(async()=>page.evaluate(async()=>{
      const path='/src/store/reconstructionStore.ts';const {useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
      const store=useReconstructionStore.getState();return {source:store.sourceType,images:store.reconstruction?.images.size,points:store.reconstruction?.globalStats.totalPoints,imported:Boolean(store.loadedFiles?.cameraImport)};
    })).toEqual({source:'zip',images:2,points:0,imported:false});
  });
}
test('exports original RGB without masks and exports a model-only archive',async({page})=>{
  await page.goto('/');await dropDatasetFiles(page,await cameraFixture(page));
  await expect(page.locator('text=Source:')).toBeVisible({timeout:45000});
  const button=page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
  for(const format of ['zip-images','zip']) {
    await button.hover();await page.locator('select').first().selectOption(format);
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download COLMAP',exact:true}).click();
    const download=await pending;const files=unzipSync(readFileSync((await download.path())!));
    expect(Object.keys(files).some(path=>path.startsWith('images/'))).toBe(format==='zip-images');
    expect(Object.keys(files).some(path=>path.startsWith('masks/'))).toBe(false);
  }
});
