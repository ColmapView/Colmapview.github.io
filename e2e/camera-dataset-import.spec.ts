import { test, expect } from './fixtures/test-fixtures';
import { dropDatasetFiles } from './fixtures/load-test-data';
import { cameraFixture, fixtureZip, fixtureTar, type CameraFixtureSchema } from './fixtures/camera-dataset';
import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeCamerasBinary,writeImagesBinary,writePoints3DBinary } from '../src/parsers/colmapBinaryWriters';

async function state(page: import('@playwright/test').Page) {
  return page.evaluate(async()=>{
    const path='/src/store/reconstructionStore.ts';
    const {useReconstructionStore} = await import(path) as typeof import('../src/store/reconstructionStore');
    const store=useReconstructionStore.getState();
    return {schema:store.loadedFiles?.cameraImport?.selection.schema,names:[...store.reconstruction?.images.values() ?? []].map(image=>image.name),points:store.reconstruction?.globalStats.totalPoints,error:store.error};
  });
}
for (const schema of ['nerf-blender','nerfstudio','instant-ngp','opensfm','openmvg','bundler','gaussian-splatting','llff','dtu'] as CameraFixtureSchema[]) {
  test(`imports original ${schema} folder into posed cameras and photos`,async({page})=>{
    await page.goto('/');
    await dropDatasetFiles(page,await cameraFixture(page,schema));
    await expect.poll(async()=> (await state(page)).schema).toBe(schema);
    const loaded=await state(page);expect(loaded.names).toHaveLength(2);expect(loaded.points).toBe(0);expect(loaded.error).toBeNull();
    await expect(page.getByText(schema==='dtu' ? 'image/a.png' : 'a.png',{exact:true}).first()).toBeVisible();
    expect(await page.evaluate(async name=>{
      const path='/src/dataset/index.ts';const {getDatasetManager}=await import(path) as typeof import('../src/dataset');
      const file=await getDatasetManager().getOriginalImage(name);return file?.size;
    },schema==='dtu' ? 'image/a.png' : 'a.png')).toBeGreaterThan(0);
  });
}
for (const transport of ['zip','tar','tar.gz'] as const) {
  test(`imports original camera metadata from ${transport}`,async({page})=>{
    await page.goto('/');
    const files=await cameraFixture(page);
    const bytes=transport==='zip'?fixtureZip(files):fixtureTar(files);
    await dropDatasetFiles(page,[{relativePath:`scene.${transport}`,name:`scene.${transport}`,base64:bytes.toString('base64')}]);
    await expect.poll(async()=> (await state(page)).schema).toBe('nerfstudio');
    const result=await page.evaluate(async()=>{
      const path='/src/dataset/index.ts';const {getDatasetManager}=await import(path) as typeof import('../src/dataset');
      const file=await getDatasetManager().getOriginalImage('a.png'),mask=await getDatasetManager().getMask('a.png');
      return {file:file?.size,mask:mask?.size};
    });
    expect(result.file).toBeGreaterThan(0);expect(result.mask).toBeGreaterThan(0);
  });
}
test('loads one native model and its own RGB from an archive containing two scenes',async({page})=>{
  await page.goto('/');const photos=await cameraFixture(page);
  const binary=(path: string,bytes: ArrayBuffer)=>({relativePath:path,name:path.split('/').pop()!,base64:Buffer.from(bytes).toString('base64')});
  const models=['a','b'].flatMap((root,index)=>[
    binary(`${root}/sparse/0/cameras.bin`,writeCamerasBinary(new Map([[1,{cameraId:1,modelId:1,width:8,height:4,params:[5,6,4,2]}]]))),
    binary(`${root}/sparse/0/images.bin`,writeImagesBinary(new Map([[1,{imageId:1,cameraId:1,name:'a.png',qvec:[1,0,0,0],tvec:index ? [4,5,6] : [1,2,3],points2D:[]}]]))),
    binary(`${root}/sparse/0/points3D.bin`,writePoints3DBinary(new Map())),
  ]);
  const first=photos.find(file=>file.name==='a.png')!;
  const second=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=8;canvas.height=4;
    const context=canvas.getContext('2d')!;context.fillStyle='blue';context.fillRect(0,0,8,4);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const archive=fixtureZip([...models,{...first,relativePath:'a/images/a.png'},{...first,relativePath:'b/images/a.png',base64:second},
    {...photos.find(file=>file.name==='one.png')!,relativePath:'b/masks/a.png.png'}]);
  await dropDatasetFiles(page,[{relativePath:'native-scenes.zip',name:'native-scenes.zip',base64:archive.toString('base64')}]);
  await expect.poll(async()=> (await state(page)).names).toEqual(['a.png']);
  const result=await page.evaluate(async()=>{
    const storePath='/src/store/reconstructionStore.ts',datasetPath='/src/dataset/index.ts';
    const {useReconstructionStore}=await import(storePath) as typeof import('../src/store/reconstructionStore');
    const {getDatasetManager}=await import(datasetPath) as typeof import('../src/dataset');
    const manager=getDatasetManager(),file=await manager.getOriginalImage('a.png');
    return {translation:useReconstructionStore.getState().reconstruction!.images.get(1)!.tvec,
      bytes:file ? Array.from(new Uint8Array(await file.arrayBuffer())) : null,mask:Boolean(await manager.getMask('a.png'))};
  });
  expect(result.translation).toEqual([1,2,3]);expect(Buffer.from(result.bytes!)).toEqual(Buffer.from(first.base64,'base64'));expect(result.mask).toBe(false);
});
test('keeps per-photo calibration for a variable-resolution legacy FOV scene',async({page})=>{
  await page.goto('/');const files=await cameraFixture(page,'nerf-blender');
  const metadata=files.find(file=>file.name==='transforms_train.json')!,value=JSON.parse(Buffer.from(metadata.base64,'base64').toString('utf8'));
  value.k1=.01;metadata.base64=Buffer.from(JSON.stringify(value)).toString('base64');
  files.find(file=>file.name==='b.png')!.base64=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=16;canvas.height=8;
    const context=canvas.getContext('2d')!;context.fillStyle='blue';context.fillRect(0,0,16,8);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await dropDatasetFiles(page,files);await expect.poll(async()=> (await state(page)).schema).toBe('instant-ngp');
  const result=await page.evaluate(async()=>{
    const storePath='/src/store/reconstructionStore.ts',datasetPath='/src/dataset/index.ts';
    const {useReconstructionStore}=await import(storePath) as typeof import('../src/store/reconstructionStore');
    const {getDatasetManager}=await import(datasetPath) as typeof import('../src/dataset');
    return {widths:[...useReconstructionStore.getState().reconstruction!.cameras.values()].map(camera=>camera.width),usable:Boolean(await getDatasetManager().getOriginalImage('b.png'))};
  });
  expect(result).toEqual({widths:[8,16],usable:true});
});
test('loads relative images and explicit masks from a direct camera JSON URL',async({page})=>{
  await page.goto('/');const files=await cameraFixture(page);
  const base='https://camera.example.test/pinned/revision/';
  await page.route(base+'**',route=>{
    const path=decodeURIComponent(new URL(route.request().url()).pathname.replace('/pinned/revision/',''));
    const file=files.find(file=>file.relativePath==='scene/'+path);
    return route.fulfill(file?{status:200,body:Buffer.from(file.base64,'base64'),contentType:path.endsWith('.json')?'application/json':'image/png'}:{status:404});
  });
  await page.goto('/?url='+encodeURIComponent(base+'transforms.json'));
  await expect.poll(async()=> (await state(page)).schema).toBe('nerfstudio');
  const result=await page.evaluate(async()=>{
    const path='/src/dataset/index.ts';const {getDatasetManager}=await import(path) as typeof import('../src/dataset');
    return Boolean(await getDatasetManager().getOriginalImage('a.png')) && Boolean(await getDatasetManager().getMask('a.png'));
  });expect(result).toBe(true);
});
test('loads Bundler metadata from the exact query-bearing URL',async({page})=>{
  await page.goto('/');const files=await cameraFixture(page,'bundler');
  const base='https://camera.example.test/pinned/revision/';
  await page.route(base+'**',route=>{
    const url=new URL(route.request().url()),path=url.pathname.replace('/pinned/revision/','');
    if (path==='bundle.out' && url.search!=='?download=1') return route.fulfill({status:403});
    const file=files.find(file=>file.relativePath==='scene/'+path);
    return route.fulfill(file ? {status:200,body:Buffer.from(file.base64,'base64'),contentType:path.endsWith('.png') ? 'image/png' : 'text/plain'} : {status:404});
  });
  await page.goto('/?url='+encodeURIComponent(base+'bundle.out?download=1'));
  await expect.poll(async()=> (await state(page)).schema).toBe('bundler');
  const images=await page.evaluate(async()=>{
    const path='/src/dataset/index.ts';const {getDatasetManager}=await import(path) as typeof import('../src/dataset');
    return Promise.all(['b.png','a.png'].map(async name=>Boolean(await getDatasetManager().getOriginalImage(name))));
  });
  expect(images).toEqual([true,true]);
});
test('chooses one scene and cancels a replacement without losing the current scene',async({page})=>{
  await page.goto('/');const first=await cameraFixture(page);await dropDatasetFiles(page,first);
  await expect.poll(async()=> (await state(page)).schema).toBe('nerfstudio');
  const multi=[...first.map(file=>({...file,relativePath:file.relativePath.replace('scene/','one/')})),...first.map(file=>({...file,relativePath:file.relativePath.replace('scene/','two/')}))];
  await dropDatasetFiles(page,multi);
  await expect(page.getByRole('dialog',{name:'Choose a camera dataset'})).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).last().click();
  await expect(page.getByRole('dialog',{name:'Choose a camera dataset'})).toBeHidden();
  expect((await state(page)).names).toHaveLength(2);
  await dropDatasetFiles(page,multi);
  await page.getByRole('button',{name:'two/transforms.json',exact:true}).click();
  await expect.poll(async()=>page.evaluate(async()=>{
    const path='/src/store/reconstructionStore.ts';const {useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
    return useReconstructionStore.getState().loadedFiles?.cameraImport?.selection.metadataPath;
  })).toBe('two/transforms.json');
  const exportButton=page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
  await exportButton.hover();
  await page.getByRole('button',{name:'Reload',exact:true}).click();
  await expect.poll(async()=>page.evaluate(async()=>{
    const path='/src/store/reconstructionStore.ts';const {useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
    const store=useReconstructionStore.getState();return {loading:store.urlLoading,path:store.loadedFiles?.cameraImport?.selection.metadataPath};
  })).toEqual({loading:false,path:'two/transforms.json'});
  await expect(page.getByRole('dialog',{name:'Choose a camera dataset'})).toBeHidden();
});

for (const choice of ['native','json'] as const) test(`selects the ${choice} scene in a root-level native plus JSON archive`,async({page})=>{
  await page.goto('/');const json=await cameraFixture(page);
  const nativeRgb=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=8;canvas.height=4;const ctx=canvas.getContext('2d')!;ctx.fillStyle='red';ctx.fillRect(0,0,8,4);return canvas.toDataURL('image/png').split(',')[1];});
  const binary=(path:string,bytes:ArrayBuffer)=>({relativePath:path,name:path.split('/').pop()!,base64:Buffer.from(bytes).toString('base64')});
  const files=[
    binary('sparse/cameras.bin',writeCamerasBinary(new Map([[1,{cameraId:1,modelId:1,width:8,height:4,params:[5,6,4,2]}]]))),
    binary('sparse/images.bin',writeImagesBinary(new Map([[1,{imageId:1,cameraId:1,name:'a.png',qvec:[1,0,0,0],tvec:[1,2,3],points2D:[]}]]))),
    binary('sparse/points3D.bin',writePoints3DBinary(new Map())),
    {relativePath:'images/a.png',name:'a.png',base64:nativeRgb},
    ...json.map(file=>({...file,relativePath:file.relativePath.replace('scene/','next/')})),
  ];
  await dropDatasetFiles(page,[{relativePath:'mixed.zip',name:'mixed.zip',base64:fixtureZip(files).toString('base64')}]);
  const dialog=page.getByRole('dialog',{name:'Choose a camera dataset'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:choice==='native'?'(dataset root) — COLMAP':'next/transforms.json',exact:true}).click();
  await expect.poll(async()=> (await state(page)).names.length).toBe(choice==='native'?1:2);
  const loaded=await state(page);expect(loaded.schema).toBe(choice==='native'?undefined:'nerfstudio');expect(loaded.error).toBeNull();
  const body=await page.evaluate(async()=>{
    const path='/src/dataset/index.ts';const {getDatasetManager}=await import(path) as typeof import('../src/dataset');
    const file=await getDatasetManager().getOriginalImage('a.png');return file ? Array.from(new Uint8Array(await file.arrayBuffer())) : null;
  });
  const expected=choice==='native'?nativeRgb:json.find(file=>file.name==='a.png')!.base64;
  expect(Buffer.from(body!)).toEqual(Buffer.from(expected,'base64'));
});

const publicFixture=process.env.COLMAP_CAMERA_PUBLIC_FIXTURE;
if(publicFixture) test('loads the downloaded complete GrowSplat quinoa capture',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/');
  await dropDatasetFiles(page,[{relativePath:'quinoa.zip',name:'quinoa.zip',base64:readFileSync(publicFixture).toString('base64')}]);
  await expect.poll(async()=> (await state(page)).names.length,{timeout:45000}).toBe(15);
  expect((await state(page)).points).toBe(0);
  const result=await page.evaluate(async()=>{
    const storePath='/src/store/reconstructionStore.ts',datasetPath='/src/dataset/index.ts';
    const {useReconstructionStore}=await import(storePath) as typeof import('../src/store/reconstructionStore');
    const {getDatasetManager}=await import(datasetPath) as typeof import('../src/dataset');
    const cameras=[...useReconstructionStore.getState().reconstruction!.cameras.values()];
    const photo=await getDatasetManager().getOriginalImage('frame_00001.png');const mask=await getDatasetManager().getMask('frame_00001.png');
    return {camera: cameras[0],photo:photo?.size,mask:mask?.size};
  });expect(result.camera.width).toBe(1080);expect(result.camera.height).toBe(1920);expect(result.photo).toBeGreaterThan(1000);expect(result.mask).toBeGreaterThan(100);
  const button=page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
  await page.keyboard.press('Tab');
  await button.hover();await page.locator('select').first().selectOption('zip-masks');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download COLMAP',exact:true}).click();
  const download=await pending;
  mkdirSync('.tmp/dataset-import-test-data-2026-10-13',{recursive:true});
  copyFileSync((await download.path())!,'.tmp/dataset-import-test-data-2026-10-13/growsplat-quinoa-colmap.zip');
  await page.screenshot({path:'.tmp/dataset-import-test-data-2026-10-13/growsplat-quinoa-viewer.png'});
});

const sfmFixtureRoot=process.env.COLMAP_CAMERA_SFM_FIXTURES;
if(sfmFixtureRoot) for(const [name,schema,count] of [['opensfm-berlin','opensfm',3],['openmvg-sceaux','openmvg',2],['bundler-kermit','bundler',2]] as const) {
  test(`loads and exports the downloaded ${name} source sample`,async({page})=>{
    await page.goto('/');
    await dropDatasetFiles(page,[{relativePath:name+'.zip',name:name+'.zip',base64:readFileSync(join(sfmFixtureRoot,name+'.zip')).toString('base64')}]);
    await expect.poll(async()=> (await state(page)).schema,{timeout:45000}).toBe(schema);
    expect((await state(page)).names).toHaveLength(count);expect((await state(page)).points).toBe(0);
    const button=page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
    await page.keyboard.press('Tab');await button.hover();await page.locator('select').first().selectOption('zip-images');
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download COLMAP',exact:true}).click();
    const download=await pending;copyFileSync((await download.path())!,join(sfmFixtureRoot,name+'-colmap.zip'));
  });
}
