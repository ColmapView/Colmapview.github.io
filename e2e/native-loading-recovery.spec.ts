import { test, expect } from './fixtures/test-fixtures';
import type { Page } from '@playwright/test';
import { readFileSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { dropDatasetFiles, type TestDatasetFileEntry } from './fixtures/load-test-data';
import { cameraFixture, fixtureZip, fixtureTar } from './fixtures/camera-dataset';
import { writeCamerasBinary, writeImagesBinary, writePoints3DBinary } from '../src/parsers/colmapBinaryWriters';
import { parseImagesBinary, parseImagesText } from '../src/parsers/images';
import { parsePoints3DBinary } from '../src/parsers/points3d';

const file = (path: string, bytes: Uint8Array | string): TestDatasetFileEntry => ({ relativePath:path, name:path.split('/').pop()!,
  base64:Buffer.from(bytes).toString('base64') });
async function cameraOnlyFixture(page: Page) {
  const photos = await cameraFixture(page);
  const rgb = photos.find(entry => entry.name === 'a.png')!.base64;
  const mask = photos.find(entry => entry.name === 'one.png')!.base64;
  const names = ['dslr_images/one.jpeg', 'dslr_images/two.jpeg'];
  const images = new Map(names.map((name, i) => [7+i, {imageId:7+i,cameraId:9,name,
    qvec:[1,0,0,0] as [number,number,number,number],tvec:[i+1,2,3] as [number,number,number],points2D:[{xy:[2,1] as [number,number],point3DId:999n}]}]));
  const files = [file('scene/sparse/0/cameras.bin', new Uint8Array(writeCamerasBinary(new Map([[9,{cameraId:9,modelId:1,width:8,height:4,params:[5,6,4,2]}]])))),
    file('scene/sparse/0/images.bin',new Uint8Array(writeImagesBinary(images)))];
  names.forEach((name,i) => {
    files.push({relativePath:`scene/images/${i ? 'two' : 'one'}.png`,name:'photo.png',base64:rgb});
    files.push({relativePath:`scene/masks/${name}.png`,name:'mask.png',base64:mask});
  });
  return {files,names,rgb};
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const path='/src/store/reconstructionStore.ts';const {useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
    const s=useReconstructionStore.getState();return {error:s.error,count:s.reconstruction?.images.size,
      matches:s.loadedFiles?.nativeMedia?.bindings.size,points:s.wasmReconstruction?.pointCount};
  });
}
async function exported(page: Page, format='zip-images') {
  // Tab deliberately wakes idle chrome, including after a long archive/public-source load.
  // Moving over the bare scene does not wake controls under the viewer's idle policy.
  await page.keyboard.press('Tab');
  await page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first().hover();
  await page.locator('select').first().selectOption(format);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download COLMAP',exact:true}).click();
  const download=await pending;return {download,entries:unzipSync(readFileSync((await download.path())!))};
}
for (const source of ['folder','zip','tar','hf-url'] as const) test(`camera-only ${source} recovers flattened photos, masks and consistent native export`,async({page})=>{
  await page.goto('/');const data=await cameraOnlyFixture(page);
  if(source==='hf-url'){
    const base='https://huggingface.co/datasets/colmapview-audit/camera-only/resolve/main';
    await page.route('https://huggingface.co/**',route=>{
      if(route.request().url().includes('/api/datasets/'))return route.fulfill({json:data.files.map(entry=>({type:'file',path:entry.relativePath,size:Buffer.from(entry.base64,'base64').length}))});
      const path=decodeURIComponent(route.request().url().split('/resolve/main/')[1]?.split('?')[0]??'');const entry=data.files.find(item=>item.relativePath===path);
      return route.fulfill(entry?{status:200,body:Buffer.from(entry.base64,'base64'),headers:{'Access-Control-Allow-Origin':'*'}}:{status:404});
    });
    await page.goto('/?url='+encodeURIComponent(base));
  }else await dropDatasetFiles(page,source==='folder'?data.files:[{relativePath:'scene.'+source,name:'scene.'+source,
    base64:(source==='zip'?fixtureZip(data.files):fixtureTar(data.files)).toString('base64')}]);
  await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:2,points:0});
  const {entries}=await exported(page,'zip-masks');
  const images=parseImagesBinary(new Uint8Array(entries['sparse/0/images.bin']).buffer);
  expect([...images.keys()]).toEqual([7,8]);
  expect([...images.values()].map(image=>image.name)).toEqual(data.names);
  expect([...images.values()].every(image=>image.points2D.length===0)).toBe(true);
  expect(parsePoints3DBinary(new Uint8Array(entries['sparse/0/points3D.bin']).buffer).size).toBe(0);
  data.names.forEach(name=>{expect(Buffer.from(entries['images/'+name]).toString('base64')).toBe(data.rgb);expect(entries['masks/'+name+'.png']).toBeDefined();});
});

for (const source of ['folder','zip','tar','hf-url','hf-model-url'] as const) test(`native masks without RGB in ${source} remain readable and exportable`,async({page})=>{
  await page.goto('/');const data=await cameraOnlyFixture(page);
  const files=data.files.filter(entry=>!entry.relativePath.startsWith('scene/images/'));
  if(source==='hf-url'||source==='hf-model-url'){
    const base='https://huggingface.co/datasets/colmapview-audit/masks-only/resolve/main'+(source==='hf-model-url'?'/scene/sparse/0':'');
    await page.route('https://huggingface.co/**',route=>{
      if(route.request().url().includes('/api/datasets/')){
        const tree=new URL(route.request().url()).pathname.split('/tree/main')[1];
        if(tree===undefined)return route.fulfill({json:{id:'colmapview-audit/masks-only',private:false,gated:false}});
        const scope=decodeURIComponent(tree).replace(/^\//,'');
        return route.fulfill({json:files.filter(entry=>!scope||entry.relativePath.startsWith(scope+'/'))
          .map(entry=>({type:'file',path:entry.relativePath,size:Buffer.from(entry.base64,'base64').length}))});
      }
      const path=decodeURIComponent(route.request().url().split('/resolve/main/')[1]?.split('?')[0]??'');const entry=files.find(item=>item.relativePath===path);
      return route.fulfill(entry?{status:200,body:Buffer.from(entry.base64,'base64'),headers:{'Access-Control-Allow-Origin':'*'}}:{status:404});
    });
    await page.goto('/?url='+encodeURIComponent(base));
  }else await dropDatasetFiles(page,source==='folder'?files:[{relativePath:'scene.'+source,name:'scene.'+source,
    base64:(source==='zip'?fixtureZip(files):fixtureTar(files)).toString('base64')}]);
  await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:0,points:0});
  await expect(page.getByText(/Masks are matched; choose Show: Mask/)).toBeVisible();
  const media=await page.evaluate(async names=>{
    const path='/src/dataset/index.ts';const {getDatasetManager}=await import(path) as typeof import('../src/dataset');
    const storePath='/src/store/reconstructionStore.ts';const {useReconstructionStore}=await import(storePath) as typeof import('../src/store/reconstructionStore');
    const manager=getDatasetManager();return {hasImages:manager.hasImages(),hasMasks:manager.hasMasks(),storedMasks:useReconstructionStore.getState().loadedFiles?.hasMasks,
      masks:await Promise.all(names.map(async name=>{
        const mask=await manager.getMask(name);return {photo:await manager.getOriginalImage(name),mask:mask?btoa(String.fromCharCode(...new Uint8Array(await mask.arrayBuffer()))):null};
      }))};
  },data.names);
  const expectedMask=files.find(entry=>entry.relativePath.includes('/masks/'))!.base64;
  expect(media).toEqual({hasImages:false,hasMasks:true,storedMasks:true,masks:data.names.map(()=>({photo:null,mask:expectedMask}))});
  await page.keyboard.press('Tab');
  await page.getByTestId('image-gallery-toolbar-slot').hover();
  await page.getByRole('combobox',{name:'Thumbnail display',exact:true}).selectOption('mask');
  const thumbnail=page.getByAltText(data.names[0]+' mask',{exact:true});
  await expect(thumbnail).toBeVisible();
  await expect.poll(()=>thumbnail.evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await thumbnail.dblclick();
  const detailMask=page.getByAltText('mask',{exact:true});
  await expect(detailMask).toBeVisible();
  await expect(detailMask).toHaveCSS('opacity','1');
  await expect(page.getByText('Mask only · original image unavailable',{exact:true})).toBeVisible();
  if(source==='hf-model-url'){
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(async()=>{
      const path='/src/store/stores/uiStore.ts';const {useUIStore}=await import(path) as typeof import('../src/store/stores/uiStore');
      useUIStore.getState().setTouchMode(true,'url');
    });
    await expect(page.getByText('Mask only · original image unavailable',{exact:true})).toBeVisible();
    await expect(detailMask).toHaveCSS('opacity','1');
    await expect.poll(()=>detailMask.evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.evaluate(async()=>{
      const path='/src/store/stores/uiStore.ts';const {useUIStore}=await import(path) as typeof import('../src/store/stores/uiStore');
      useUIStore.getState().setTouchMode(false,'url');
    });
    await page.setViewportSize({width:1280,height:720});
  }
  await page.keyboard.press('Escape');
  await expect(detailMask).toHaveCount(0);
  const model=await exported(page,'zip');
  expect([...parseImagesBinary(new Uint8Array(model.entries['sparse/0/images.bin']).buffer).values()].every(image=>image.points2D.length===0)).toBe(true);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download Masks',exact:true}).click();
  const masks=unzipSync(readFileSync((await (await pending).path())!));
  expect(Object.keys(masks).sort()).toEqual(data.names.map(name=>'masks/'+name+'.png').sort());
  for(const bytes of Object.values(masks))expect(Buffer.from(bytes).toString('base64')).toBe(expectedMask);
});

test('explicit split-host camera-only manifest preserves signed photo URLs and mask roles',async({page})=>{
  await page.goto('/');const data=await cameraOnlyFixture(page);
  const urls=['https://photos.test/one.png?key=one%2Ftwo','https://photos.test/two.png?key=three%2Ffour'];
  const manifest={version:1,baseUrl:'https://models.test/pinned/',files:{cameras:'cameras.bin',images:'images.bin'},
    imageNameToPath:Object.fromEntries(data.names.map((name,i)=>[name,urls[i]])),
    maskNameToPath:Object.fromEntries(data.names.map((name,i)=>[name,`https://masks.test/${i}.png`])),maskRole:'validity'};
  await page.route('https://models.test/**',route=>{
    const name=new URL(route.request().url()).pathname.split('/').pop();
    if(name==='manifest.json')return route.fulfill({json:manifest});
    const entry=data.files.find(item=>item.name===name);return route.fulfill(entry?{body:Buffer.from(entry.base64,'base64')}:{status:404});
  });
  const requested:string[]=[];
  await page.route('https://photos.test/**',route=>{requested.push(route.request().url());return route.fulfill({body:Buffer.from(data.rgb,'base64'),headers:{'Access-Control-Allow-Origin':'*'}});});
  await page.route('https://masks.test/**',route=>route.fulfill({body:Buffer.from(data.files.find(entry=>entry.relativePath.includes('/masks/'))!.base64,'base64'),headers:{'Access-Control-Allow-Origin':'*'}}));
  await page.goto('/?url='+encodeURIComponent('https://models.test/manifest.json'));
  await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:2,points:0});
  await exported(page,'zip-masks');
  expect(requested).toContain(urls[0]);expect(requested).toContain(urls[1]);
});

for(const mode of ['explicit-lists-complete-model','mask-prefix-camera-only'] as const)test(`manifest ${mode} preserves geometry and exports masks from arbitrary folders`,async({page})=>{
  await page.goto('/');const data=await cameraOnlyFixture(page),complete=mode==='explicit-lists-complete-model';
  const masks=data.files.find(entry=>entry.relativePath.includes('/masks/'))!.base64;
  const photos=data.names.map(name=>'segmentation/'+name);
  const maskPaths=data.names.map(name=>'annotations/'+(complete?name.replace(/\.[^/.]+$/,'.png'):name+'.png'));
  const manifest={version:1,baseUrl:'https://models.test/pinned/',files:{cameras:'cameras.bin',images:'images.bin',...(complete?{points3D:'points3D.bin'}:{})},
    images:photos,...(complete?{masks:maskPaths,maskRole:'foreground'}:{masksPath:'annotations/'})};
  const points=writePoints3DBinary(new Map([[999n,{point3DId:999n,xyz:[1,2,3],rgb:[10,20,30],error:0,track:[{imageId:7,point2DIdx:0},{imageId:8,point2DIdx:0}]}]]));
  await page.route('https://models.test/**',route=>{
    const path=decodeURIComponent(new URL(route.request().url()).pathname);
    if(path==='/manifest.json')return route.fulfill({json:manifest});
    const relative=path.replace(/^\/pinned\//,'');
    if(photos.includes(relative))return route.fulfill({body:Buffer.from(data.rgb,'base64')});
    if(maskPaths.includes(relative))return route.fulfill({body:Buffer.from(masks,'base64')});
    if(relative==='points3D.bin')return route.fulfill({body:Buffer.from(points)});
    const metadata=data.files.find(entry=>entry.name===relative);return route.fulfill(metadata?{body:Buffer.from(metadata.base64,'base64')}:{status:404});
  });
  await page.goto('/?url='+encodeURIComponent('https://models.test/manifest.json'));
  await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:2,points:complete?1:0});
  const {entries}=await exported(page,'zip-masks');
  const images=parseImagesBinary(new Uint8Array(entries['sparse/0/images.bin']).buffer);
  expect([...images.keys()]).toEqual([7,8]);expect([...images.values()].map(image=>image.tvec)).toEqual([[1,2,3],[2,2,3]]);
  expect([...images.values()].every(image=>image.points2D.length===(complete?1:0))).toBe(true);
  expect(parsePoints3DBinary(new Uint8Array(entries['sparse/0/points3D.bin']).buffer).size).toBe(complete?1:0);
  for(const name of data.names){expect(Buffer.from(entries['images/'+name]).toString('base64')).toBe(data.rgb);expect(entries['masks/'+name+'.png']).toBeDefined();}
});

test('ambiguous photo collections require selection and cancellation preserves the loaded scene',async({page})=>{
  await page.goto('/');const data=await cameraOnlyFixture(page);await dropDatasetFiles(page,data.files);
  await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:2,points:0});
  const alternatives=data.files.filter(entry=>!entry.relativePath.startsWith('scene/images/'));
  for(const root of ['scene/left','scene/right'])for(const name of data.names)alternatives.push({relativePath:root+'/'+name,name:name.split('/').pop()!,base64:data.rgb});
  await dropDatasetFiles(page,alternatives);
  await expect(page.getByRole('heading',{name:'Choose source photos'})).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:2,points:0});
  await dropDatasetFiles(page,alternatives);
  await page.getByRole('button',{name:'scene/right — 2/2 photos',exact:true}).click();
  await expect.poll(()=>page.evaluate(async()=>{
    const path='/src/store/reconstructionStore.ts';const {useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
    return [...useReconstructionStore.getState().loadedFiles!.nativeMedia!.bindings.values()].map(item=>item.sourceImagePath);
  })).toEqual(data.names.map(name=>'scene/right/'+name));
});

const originals=process.env.COLMAP_LOADING_RECOVERY_FIXTURES;
test('original TwinWorld assets are browser-readable from both published viewer origins',async({page},info)=>{
  test.skip(!originals,'Set COLMAP_LOADING_RECOVERY_FIXTURES to the ignored recovery fixture folder.');test.setTimeout(120000);
  const sample=JSON.parse(readFileSync(join(originals!,'twinworld-original-sources.json'),'utf8')) as {files:{url:string}[]};
  const results=[];
  for(const origin of ['https://colmapview.github.io','https://colmapview.opsiclear.com']){
    await page.goto(origin,{waitUntil:'load'});
    const probe=()=>page.evaluate(async urls=>Promise.all(urls.map(async url=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
      try{const response=await fetch(url,{signal:controller.signal});const bytes=await response.arrayBuffer();return{url,status:response.status,readable:response.ok,bytes:bytes.byteLength};}
      catch(error){return{url,readable:false,error:String(error)};}
      finally{clearTimeout(timer);}
    })),sample.files.map(file=>file.url));
    let probes: Awaited<ReturnType<typeof probe>> | undefined;
    // The public root pages redirect to a versioned app. Retry only an interrupted
    // execution context; actual network/CORS failures remain recorded failures.
    for(let attempt=0;attempt<3;attempt++){
      try{probes=await probe();break;}
      catch(error){if(!/Execution context was destroyed/.test(String(error))||attempt===2)throw error;await page.waitForLoadState('load');}
    }
    expect(probes).toBeDefined();
    results.push({origin,finalOrigin:new URL(page.url()).origin,probes});
    expect(probes!.every(probe=>probe.readable)).toBe(true);
  }
  writeFileSync(join(originals!,`twinworld-cors-${info.project.name}.json`),JSON.stringify(results,null,2));
});
for(const label of ['phomo-0','phomo-1','phomo-2'])test(`source-derived ${label} geometry and FIT-name PNG preview export as native COLMAP`,async({page},info)=>{
  test.skip(!originals,'Set COLMAP_LOADING_RECOVERY_FIXTURES to the ignored recovery fixture folder.');
  const fixtures=JSON.parse(readFileSync(join(originals!,'phomo-source-derived-fixtures.json'),'utf8')) as {label:string;registered_name:string;rgb_path:string;files:{role:string;prefix_file:string}[]}[];
  const fixture=fixtures.find(item=>item.label===label)!;
  const sourceImageFile=fixture.files.find(entry=>entry.role==='images')!;
  const original=parseImagesText(readFileSync(join(originals!,sourceImageFile.prefix_file),'utf8'),true).values().next().value!;
  await page.goto('/');await dropDatasetFiles(page,[{relativePath:label+'.zip',name:label+'.zip',base64:readFileSync(join(originals!,label+'.zip')).toString('base64')}]);
  await expect.poll(()=>state(page)).toEqual({error:null,count:1,matches:1,points:1});
  const result=await exported(page);
  const image=parseImagesBinary(new Uint8Array(result.entries['sparse/0/images.bin']).buffer).values().next().value!;
  expect(image.qvec).toEqual(original.qvec);expect(image.tvec).toEqual(original.tvec);expect(image.name).toBe(fixture.registered_name);
  const source=unzipSync(readFileSync(join(originals!,label+'.zip')));
  expect(result.entries['images/'+fixture.registered_name]).toEqual(source[fixture.rgb_path]);
  copyFileSync((await result.download.path())!,join(originals!,`${label}-${info.project.name}-export.zip`));
});
for(const mode of ['local-archive','live-hf-url'] as const)test(`original TwinWorld ${mode} loads all original registered photos and exports a complete package`,async({page},info)=>{
  test.skip(!originals,'Set COLMAP_LOADING_RECOVERY_FIXTURES to the ignored recovery fixture folder.');test.setTimeout(120000);
  const sample=JSON.parse(readFileSync(join(originals!,'twinworld-original-sources.json'),'utf8')) as {dataset:string;revision:string;directory:string;photos:{name:string;path:string}[]};
  await page.goto('/');
  if(mode==='local-archive')await dropDatasetFiles(page,[{relativePath:'twinworld.zip',name:'twinworld.zip',base64:readFileSync(join(originals!,'twinworld-original.zip')).toString('base64')}]);
  else await page.goto('/?url='+encodeURIComponent(`https://huggingface.co/datasets/${sample.dataset}/resolve/${sample.revision}/Data_Goldcoast/scene_009/test`));
  await expect.poll(()=>state(page),{timeout:60000}).toEqual({error:null,count:3,matches:3,points:0});
  const result=await exported(page);
  for(const photo of sample.photos)expect(Buffer.from(result.entries['images/'+photo.name])).toEqual(readFileSync(join(originals!,'camera-only','zqlin',photo.path)));
  copyFileSync((await result.download.path())!,join(originals!,`twinworld-${info.project.name}-${mode}.zip`));
});
for(const label of ['travisdriver','anonymous-user-submission','uniiii','zqlin','dynamic-maps','nyuvideolab','bugjudger','yutofurutani'])test(`original camera-only ${label} loads poses and exports without dangling tracks`,async({page},info)=>{
  test.skip(!originals,'Set COLMAP_LOADING_RECOVERY_FIXTURES to the ignored recovery fixture folder.');test.setTimeout(120000);
  const samples=JSON.parse(readFileSync(join(originals!,'camera-only-samples.json'),'utf8')) as {label:string;status:string;sample_files:{role:string;path:string}[]}[];
  const sample=samples.find(item=>item.label===label)!;expect(sample.status).toBe('downloaded');
  const files=sample.sample_files.map(entry=>file(entry.path,new Uint8Array(readFileSync(join(originals!,'camera-only',label,entry.path)))));
  const imageFile=files.find(entry=>entry.name.startsWith('images.'))!;const bytes=new Uint8Array(Buffer.from(imageFile.base64,'base64'));
  const original=imageFile.name.endsWith('.bin')?parseImagesBinary(bytes.buffer,true):parseImagesText(Buffer.from(bytes).toString('utf8'),true);
  await page.goto('/');await dropDatasetFiles(page,files);
  await expect.poll(async()=>({count:(await state(page)).count,error:(await state(page)).error}),{timeout:60000}).toEqual({count:original.size,error:null});
  const result=await exported(page,'zip');
  const images=parseImagesBinary(new Uint8Array(result.entries['sparse/0/images.bin']).buffer);
  expect(images.size).toBe(original.size);
  for(const[id,image]of images){expect(image.qvec).toEqual(original.get(id)!.qvec);expect(image.tvec).toEqual(original.get(id)!.tvec);expect(image.name).toBe(original.get(id)!.name);expect(image.points2D).toEqual([]);}
  copyFileSync((await result.download.path())!,join(originals!,`camera-only-${info.project.name}-${label}.zip`));
});

test('fractional-timestamp masks never substitute a different frame',async({page})=>{
  await page.goto('/');const data=await cameraOnlyFixture(page),names=['1697287.12345','1697287.23456'];
  const mask=data.files.find(entry=>entry.relativePath.includes('/masks/'))!.base64;
  const images=new Map(names.map((name,i)=>[7+i,{imageId:7+i,cameraId:9,name,qvec:[1,0,0,0] as [number,number,number,number],
    tvec:[i+1,2,3] as [number,number,number],points2D:[]}]));
  await dropDatasetFiles(page,[data.files[0],file('scene/sparse/0/images.bin',new Uint8Array(writeImagesBinary(images))),
    {relativePath:'scene/masks/'+names[0]+'.png',name:'mask.png',base64:mask},
    {relativePath:'scene/masks/1697287.png',name:'wrong-frame.png',base64:data.rgb}]);
  await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:0,points:0});
  const masks=await page.evaluate(async registered=>{
    const path='/src/dataset/index.ts';const {getDatasetManager}=await import(path) as typeof import('../src/dataset');
    return Promise.all(registered.map(async name=>{const mask=await getDatasetManager().getMask(name);
      return mask?btoa(String.fromCharCode(...new Uint8Array(await mask.arrayBuffer()))):null;}));
  },names);
  expect(masks).toEqual([mask,null]);
  await page.mouse.move(1,1);
  await page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first().hover();
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download Masks',exact:true}).click();
  const entries=unzipSync(readFileSync((await (await pending).path())!));
  expect(Object.keys(entries)).toEqual(['masks/'+names[0]+'.png']);
  expect(Buffer.from(entries['masks/'+names[0]+'.png']).toString('base64')).toBe(mask);
});

for(const mode of ['csv-folder','csv-zip','declared-flat-list','declared-signed-list'] as const)
test(`explicit photo roles recover ${mode} and export the correct originals and masks`,async({page},info)=>{
  await page.goto('/');const data=await cameraOnlyFixture(page);
  const secondRgb=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=8;canvas.height=4;
    const context=canvas.getContext('2d')!;context.fillStyle='rgb(40,90,180)';context.fillRect(0,0,8,4);return canvas.toDataURL('image/png').split(',')[1];});
  const rgbs=[data.rgb,secondRgb],stems=['one','two'],csv=mode.startsWith('csv-');
  const photos=stems.map(name=>csv?'scene/segmentation/'+name+'.png':mode==='declared-flat-list'?'segmentation/'+name+'.png'
    :'https://photos.test/capture%20photos/segmentation/'+name+'.png?token='+name+'%2Fvalue');
  if(csv){
    const files=data.files.filter(entry=>!entry.relativePath.startsWith('scene/images/'));
    photos.forEach((path,index)=>files.push({relativePath:path,name:stems[index]+'.png',base64:rgbs[index]}));
    files.push(file('scene/image_mapping.csv','colmap_image,raw_path\n'+data.names.map((name,index)=>name+','+photos[index]).join('\n')+'\n'));
    await dropDatasetFiles(page,mode==='csv-folder'?files:[{relativePath:'mapped.zip',name:'mapped.zip',base64:fixtureZip(files).toString('base64')}]);
  }else{
    const mask=data.files.find(entry=>entry.relativePath.includes('/masks/'))!.base64;
    const manifest={version:1,baseUrl:'https://models.test/pinned/',files:{cameras:'cameras.bin',images:'images.bin'},images:photos,
      maskNameToPath:Object.fromEntries(data.names.map((name,index)=>[name,'https://masks.test/'+index+'.png'])),maskRole:'validity'};
    await page.route('https://models.test/**',route=>{
      const pathname=new URL(route.request().url()).pathname;
      if(pathname==='/manifest.json')return route.fulfill({json:manifest});
      const relative=decodeURIComponent(pathname.replace(/^\/pinned\//,'')),index=photos.indexOf(relative);
      if(index>=0)return route.fulfill({body:Buffer.from(rgbs[index],'base64'),contentType:'image/png'});
      const entry=data.files.find(item=>item.name===relative);return route.fulfill(entry?{body:Buffer.from(entry.base64,'base64')}:{status:404});
    });
    const requested:string[]=[];
    await page.route('https://photos.test/**',route=>{requested.push(route.request().url());const index=photos.indexOf(route.request().url());
      return route.fulfill(index>=0?{body:Buffer.from(rgbs[index],'base64'),contentType:'image/png'}:{status:404});});
    await page.route('https://masks.test/**',route=>route.fulfill({body:Buffer.from(mask,'base64'),contentType:'image/png'}));
    await page.goto('/?url='+encodeURIComponent('https://models.test/manifest.json'));
    await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:2,points:0});
    if(mode==='declared-signed-list')await expect.poll(()=>photos.every(url=>requested.includes(url))).toBe(true);
  }
  await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:2,points:0});
  expect(await page.evaluate(async()=>{const path='/src/store/reconstructionStore.ts';const{useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
    return [...useReconstructionStore.getState().loadedFiles!.nativeMedia!.bindings.values()].map(binding=>binding.sourceImagePath);})).toEqual(photos);
  const result=await exported(page,'zip-masks'),entries=result.entries;
  expect(Buffer.from(entries['sparse/0/cameras.bin']).toString('base64')).toBe(data.files[0].base64);
  const images=parseImagesBinary(new Uint8Array(entries['sparse/0/images.bin']).buffer);
  expect([...images.values()].map(image=>({id:image.imageId,name:image.name,q:image.qvec,t:image.tvec,observations:image.points2D})))
    .toEqual(data.names.map((name,index)=>({id:7+index,name,q:[1,0,0,0],t:[index+1,2,3],observations:[]})));
  for(let index=0;index<data.names.length;index++){
    expect(Buffer.from(entries['images/'+data.names[index]]).toString('base64')).toBe(rgbs[index]);
    expect(entries['masks/'+data.names[index]+'.png']).toBeDefined();
  }
  const output=process.env.COLMAP_REVIEW2_OUTPUT;
  if(output){copyFileSync((await result.download.path())!,join(output,mode+'-'+info.project.name+'.zip'));
    writeFileSync(join(output,mode+'-'+info.project.name+'.json'),JSON.stringify({names:data.names,rgbs},null,2));}
});

for(const extraMask of [false,true])
test(`explicit shared-scene photo mappings recover adjacent masks with unrelated own mask ${extraMask}`,async({page},info)=>{
  await page.goto('/');const data=await cameraOnlyFixture(page);
  const cameras=Buffer.from(data.files[0].base64,'base64');
  const images=parseImagesBinary(new Uint8Array(Buffer.from(data.files[1].base64,'base64')).buffer);
  for(const image of images.values())image.points2D=[];
  const metadata=new Uint8Array(writeImagesBinary(images)),mask=data.files.find(entry=>entry.relativePath.includes('/masks/'))!.base64;
  const files=[file('dozer/sparse/0/cameras.bin',cameras),file('dozer/sparse/0/images.bin',metadata),
    file('dozer/sparse/0/points3D.bin',new Uint8Array(writePoints3DBinary(new Map()))),
    file('poster/sparse/0/cameras.bin',cameras),file('poster/sparse/0/images.bin',metadata),
    file('dozer/image_mapping.csv','colmap_image,raw_path\n'+data.names.map(name=>name+',poster/images/'+name).join('\n')+'\n')];
  for(const name of data.names){
    files.push({relativePath:'poster/images/'+name,name:'photo.png',base64:data.rgb});
    files.push({relativePath:'poster/masks/'+name+'.png',name:'mask.png',base64:mask});
  }
  if(extraMask)files.push({relativePath:'dozer/masks/unregistered.jpg.png',name:'unregistered.jpg.png',base64:mask});
  await dropDatasetFiles(page,files);
  await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:2,points:0});
  const bindings=await page.evaluate(async()=>{const path='/src/store/reconstructionStore.ts';
    const{useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
    const context=useReconstructionStore.getState().loadedFiles!.nativeMedia!;
    return {sceneRoot:context.selection.sceneRoot,media:[...context.bindings.values()].map(binding=>({photo:binding.sourceImagePath,mask:binding.mask}))};});
  expect(bindings.sceneRoot).toBe('dozer');
  expect(bindings.media).toEqual(data.names.map(name=>({photo:'poster/images/'+name,
    mask:{kind:'file',path:'poster/masks/'+name+'.png',role:'validity',invert:false}})));
  const result=await exported(page,'zip-masks');
  expect(Object.keys(result.entries).filter(name=>name.startsWith('masks/'))).toEqual(data.names.map(name=>'masks/'+name+'.png'));
  for(const name of data.names){
    expect(Buffer.from(result.entries['images/'+name]).toString('base64')).toBe(data.rgb);
    expect(result.entries['masks/'+name+'.png']).toBeDefined();
  }
  const output=process.env.COLMAP_REVIEW2_OUTPUT,mode=extraMask?'shared-map-with-own-mask':'shared-map-no-own-mask';
  if(output){copyFileSync((await result.download.path())!,join(output,mode+'-'+info.project.name+'.zip'));
    writeFileSync(join(output,mode+'-'+info.project.name+'.json'),JSON.stringify({names:data.names,rgbs:data.names.map(()=>data.rgb)},null,2));}
});

for(const extraMask of [false,true])
test(`missing registered photo paths cannot borrow foreign masks with unrelated own mask ${extraMask}`,async({page},info)=>{
  await page.goto('/');const data=await cameraOnlyFixture(page),names=['poster/one.jpeg','poster/two.jpeg'];
  const cameras=Buffer.from(data.files[0].base64,'base64'),mask=data.files.find(entry=>entry.relativePath.includes('/masks/'))!.base64;
  const images=new Map(names.map((name,index)=>[7+index,{imageId:7+index,cameraId:9,name,qvec:[1,0,0,0] as [number,number,number,number],
    tvec:[index+1,2,3] as [number,number,number],points2D:[]}]));
  const metadata=new Uint8Array(writeImagesBinary(images));
  const files=[file('dozer/sparse/0/cameras.bin',cameras),file('dozer/sparse/0/images.bin',metadata),
    file('dozer/sparse/0/points3D.bin',new Uint8Array(writePoints3DBinary(new Map()))),
    file('poster/sparse/0/cameras.bin',cameras),file('poster/sparse/0/images.bin',metadata),
    ...names.map(name=>({relativePath:'poster/masks/'+name+'.png',name:'mask.png',base64:mask}))];
  if(extraMask)files.push({relativePath:'dozer/masks/unregistered.jpg.png',name:'unregistered.jpg.png',base64:mask});
  await dropDatasetFiles(page,files);
  await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:0,points:0});
  expect(await page.evaluate(async registered=>{
    const storePath='/src/store/reconstructionStore.ts',datasetPath='/src/dataset/index.ts';
    const{useReconstructionStore}=await import(storePath) as typeof import('../src/store/reconstructionStore');
    const{getDatasetManager}=await import(datasetPath) as typeof import('../src/dataset');
    const context=useReconstructionStore.getState().loadedFiles!.nativeMedia!;
    return {maskBindings:context.nativeMasks?.size??0,masks:await Promise.all(registered.map(name=>getDatasetManager().getMask(name)))};
  },names)).toEqual({maskBindings:0,masks:[null,null]});
  const result=await exported(page,'zip');
  expect(Object.keys(result.entries).sort()).toEqual(['sparse/0/cameras.bin','sparse/0/images.bin','sparse/0/points3D.bin']);
  expect([...parseImagesBinary(new Uint8Array(result.entries['sparse/0/images.bin']).buffer).values()].map(image=>image.name)).toEqual(names);
  const output=process.env.COLMAP_REVIEW2_OUTPUT,mode=extraMask?'orphan-owner-with-own-mask':'orphan-owner-no-own-mask';
  if(output){copyFileSync((await result.download.path())!,join(output,mode+'-'+info.project.name+'.zip'));
    writeFileSync(join(output,mode+'-'+info.project.name+'.json'),JSON.stringify({names,rgbs:[],cameraOnly:true},null,2));}
});

for(const mode of ['nested-relative-folder','nested-relative-zip','signed-mask-list'] as const)
test(`nested mapping and mask-list recovery ${mode} exports calibrated originals and conventional masks`,async({page},info)=>{
  await page.goto('/');const data=await cameraOnlyFixture(page);
  const secondRgb=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=8;canvas.height=4;
    const context=canvas.getContext('2d')!;context.fillStyle='rgb(40,90,180)';context.fillRect(0,0,8,4);return canvas.toDataURL('image/png').split(',')[1];});
  const rgbs=[data.rgb,secondRgb],stems=['one','two'],mask=data.files.find(entry=>entry.relativePath.includes('/masks/'))!.base64;
  if(mode==='signed-mask-list'){
    const masks=data.names.map(name=>'https://masks.test/evidence%20masks/masks/'+name+'.png?token='+name+'%2Fvalue');
    const manifest={version:1,baseUrl:'https://models.test/pinned/',files:{cameras:'cameras.bin',images:'images.bin'},
      images:stems.map(name=>'segmentation/'+name+'.png'),masks};
    await page.route('https://models.test/**',route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/manifest.json')return route.fulfill({json:manifest});
      const photo=manifest.images.indexOf(path.replace(/^\/pinned\//,''));
      if(photo>=0)return route.fulfill({body:Buffer.from(rgbs[photo],'base64'),contentType:'image/png'});
      const entry=data.files.find(item=>item.name===path.split('/').pop());
      return route.fulfill(entry?{body:Buffer.from(entry.base64,'base64')}:{status:404});
    });
    const requested:string[]=[];
    await page.route('https://masks.test/**',route=>{requested.push(route.request().url());
      return route.fulfill(masks.includes(route.request().url())?{body:Buffer.from(mask,'base64'),contentType:'image/png'}:{status:404});});
    await page.goto('/?url='+encodeURIComponent('https://models.test/manifest.json'));
    await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:2,points:0});
    expect(await page.evaluate(async()=>{const path='/src/store/reconstructionStore.ts';
      const{useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
      return [...useReconstructionStore.getState().loadedFiles!.nativeMedia!.bindings.values()].map(binding=>binding.mask);
    })).toEqual(masks.map(path=>({kind:'file',path,role:'validity',invert:false})));
    const result=await exported(page,'zip-masks');
    expect(masks.every(url=>requested.includes(url))).toBe(true);
    await verify(result);
  }else{
    const files=data.files.filter(entry=>!entry.relativePath.startsWith('scene/images/')).map(entry=>({...entry,relativePath:'outer/'+entry.relativePath}));
    stems.forEach((name,index)=>files.push({relativePath:'outer/scene/segmentation/'+name+'.png',name:name+'.png',base64:rgbs[index]}));
    files.push(file('outer/scene/image_mapping.csv','colmap_image,raw_path\n'+data.names.map((name,index)=>name+',segmentation/'+stems[index]+'.png').join('\n')+'\n'));
    await dropDatasetFiles(page,mode==='nested-relative-folder'?files:[{relativePath:'nested.zip',name:'nested.zip',base64:fixtureZip(files).toString('base64')}]);
    await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:2,points:0});
    await verify(await exported(page,'zip-masks'));
  }
  async function verify(result:Awaited<ReturnType<typeof exported>>){
    expect(Buffer.from(result.entries['sparse/0/cameras.bin']).toString('base64')).toBe(data.files[0].base64);
    const images=parseImagesBinary(new Uint8Array(result.entries['sparse/0/images.bin']).buffer);
    expect([...images.values()].map(image=>({id:image.imageId,name:image.name,q:image.qvec,t:image.tvec,observations:image.points2D})))
      .toEqual(data.names.map((name,index)=>({id:7+index,name,q:[1,0,0,0],t:[index+1,2,3],observations:[]})));
    for(let index=0;index<data.names.length;index++){
      expect(Buffer.from(result.entries['images/'+data.names[index]]).toString('base64')).toBe(rgbs[index]);
      expect(result.entries['masks/'+data.names[index]+'.png']).toBeDefined();
    }
    const output=process.env.COLMAP_REVIEW3_OUTPUT;
    if(output){copyFileSync((await result.download.path())!,join(output,mode+'-'+info.project.name+'.zip'));
      writeFileSync(join(output,mode+'-'+info.project.name+'.json'),JSON.stringify({names:data.names,rgbs},null,2));}
  }
});

for(const mode of ['hf-shared-peer','hf-shared-no-peer','renamed-source-sidecar','explicit-image-map-over-list','explicit-mask-prefix'] as const)
test(`owned media recovery ${mode} preserves photo identity and mask ownership through export`,async({page},info)=>{
  await page.goto('/');const data=await cameraOnlyFixture(page),stems=['one','two'];
  const rendered=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=8;canvas.height=4;const context=canvas.getContext('2d')!;
    context.fillStyle='rgb(40,90,180)';context.fillRect(0,0,8,4);const rgb=canvas.toDataURL('image/png').split(',')[1];
    context.fillStyle='white';context.fillRect(0,0,4,4);context.fillStyle='black';context.fillRect(4,0,4,4);
    return {rgb,inverted:canvas.toDataURL('image/png').split(',')[1]};
  });
  const rgbs=[data.rgb,rendered.rgb],normal=data.files.find(entry=>entry.relativePath.includes('/masks/'))!.base64;
  const cameras=Buffer.from(data.files[0].base64,'base64');
  const images=parseImagesBinary(new Uint8Array(Buffer.from(data.files[1].base64,'base64')).buffer);
  for(const image of images.values())image.points2D=[];
  const metadata=new Uint8Array(writeImagesBinary(images)),points=new Uint8Array(writePoints3DBinary(new Map()));
  let expectedPhotos:string[],expectedMasks:string[]=[];
  const maskKind=mode==='hf-shared-no-peer'?'none':mode==='explicit-mask-prefix'?'inverted':'normal';
  if(mode.startsWith('hf-')){
    const base='https://huggingface.co/datasets/colmapview-audit/owned-media/resolve/pinned/';
    expectedPhotos=data.names.map(name=>base+'poster/images/'+name+'?token=exact%2Fvalue');
    if(mode==='hf-shared-peer')expectedMasks=data.names.map(name=>'poster/masks/'+name+'.png');
    const files=[file('dozer/sparse/0/cameras.bin',cameras),file('dozer/sparse/0/images.bin',metadata),file('dozer/sparse/0/points3D.bin',points),
      file('poster/sparse/0/cameras.bin',cameras),file('poster/sparse/0/images.bin',metadata),
      file('dozer/image_mapping.csv','colmap_image,raw_path\n'+data.names.map((name,index)=>name+','+expectedPhotos[index]).join('\n')+'\n')];
    data.names.forEach((name,index)=>{
      files.push({relativePath:'dozer/images/'+name,name:'photo.png',base64:data.rgb});
      files.push({relativePath:'poster/images/'+name,name:'photo.png',base64:rgbs[index]});
      files.push({relativePath:'dozer/masks/'+name+'.png',name:'own-mask.png',base64:rendered.inverted});
      if(mode==='hf-shared-peer')files.push({relativePath:'poster/masks/'+name+'.png',name:'peer-mask.png',base64:normal});
    });
    const requested:string[]=[];
    await page.route('https://huggingface.co/**',route=>{
      if(route.request().url().includes('/api/datasets/'))return route.fulfill({json:files.map(entry=>({type:'file',path:entry.relativePath,size:Buffer.from(entry.base64,'base64').length}))});
      requested.push(route.request().url());
      const path=decodeURIComponent(new URL(route.request().url()).pathname.split('/resolve/pinned/')[1]??'');
      const entry=files.find(item=>item.relativePath===path);
      return route.fulfill(entry?{body:Buffer.from(entry.base64,'base64')}:{status:404});
    });
    await page.goto('/?url='+encodeURIComponent(base));
    await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:2,points:0});
    await expect.poll(()=>expectedPhotos.every(url=>requested.includes(url))).toBe(true);
  }else if(mode==='renamed-source-sidecar'){
    expectedPhotos=stems.map(stem=>'scene/images/raw/'+stem+'.png');
    expectedMasks=stems.map(stem=>'scene/masks/raw/'+stem+'.png.png');
    const files=[file('scene/sparse/0/cameras.bin',cameras),file('scene/sparse/0/images.bin',metadata),file('scene/sparse/0/points3D.bin',points),
      file('scene/image_mapping.csv','colmap_image,raw_path\n'+data.names.map((name,index)=>name+','+expectedPhotos[index]).join('\n')+'\n')];
    expectedPhotos.forEach((path,index)=>files.push({relativePath:path,name:'photo.png',base64:rgbs[index]}));
    expectedMasks.forEach(path=>files.push({relativePath:path,name:'mask.png',base64:normal}));
    await dropDatasetFiles(page,files);
  }else{
    const base='https://owned.test/pinned/';
    expectedPhotos=stems.map(stem=>base+(mode==='explicit-mask-prefix'?'poster/images/'+stem+'.png?token=exact%2Fvalue':'segmentation/'+stem+'.png'));
    expectedMasks=data.names.map((name,index)=>base+(mode==='explicit-mask-prefix'?'dozer/masks/'+name+'.png':'annotations/'+index+'.png'));
    const manifest={version:1,baseUrl:base,files:{cameras:'dozer/sparse/0/cameras.bin',images:'dozer/sparse/0/images.bin',points3D:'dozer/sparse/0/points3D.bin'},images:[],
      imageNameToPath:Object.fromEntries(data.names.map((name,index)=>[name,mode==='explicit-mask-prefix'?expectedPhotos[index]:'segmentation/'+stems[index]+'.png'])),
      ...(mode==='explicit-mask-prefix'?{masksPath:'dozer/masks/'}:{masks:[],maskNameToPath:Object.fromEntries(data.names.map((name,index)=>[name,'annotations/'+index+'.png'])),maskRole:'validity'})};
    await page.route('https://owned.test/**',route=>{
      const url=route.request().url(),path=new URL(url).pathname;
      if(path==='/manifest.json')return route.fulfill({json:manifest});
      const photo=expectedPhotos.indexOf(url),mask=expectedMasks.indexOf(url);
      if(photo>=0)return route.fulfill({body:Buffer.from(rgbs[photo],'base64'),contentType:'image/png'});
      if(mask>=0)return route.fulfill({body:Buffer.from(maskKind==='inverted'?rendered.inverted:normal,'base64'),contentType:'image/png'});
      const bytes=path.endsWith('/cameras.bin')?cameras:path.endsWith('/images.bin')?metadata:path.endsWith('/points3D.bin')?points:undefined;
      return route.fulfill(bytes?{body:Buffer.from(bytes)}:{status:404});
    });
    await page.goto('/?url='+encodeURIComponent('https://owned.test/manifest.json'));
  }
  await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:2,points:0});
  expect(await page.evaluate(async()=>{const path='/src/store/reconstructionStore.ts';
    const{useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
    return [...useReconstructionStore.getState().loadedFiles!.nativeMedia!.bindings.values()].map(binding=>({photo:binding.sourceImagePath,mask:binding.mask}));
  })).toEqual(expectedPhotos.map((photo,index)=>({photo,mask:expectedMasks[index]?{kind:'file',path:expectedMasks[index],role:'validity',invert:false}:undefined})));
  const result=await exported(page,maskKind==='none'?'zip-images':'zip-masks');
  expect(Object.keys(result.entries).filter(path=>path.startsWith('masks/')).sort()).toEqual(expectedMasks.length?data.names.map(name=>'masks/'+name+'.png').sort():[]);
  data.names.forEach((name,index)=>expect(Buffer.from(result.entries['images/'+name]).toString('base64')).toBe(rgbs[index]));
  const output=process.env.COLMAP_REVIEW4_OUTPUT;
  if(output){copyFileSync((await result.download.path())!,join(output,mode+'-'+info.project.name+'.zip'));
    writeFileSync(join(output,mode+'-'+info.project.name+'.json'),JSON.stringify({names:data.names,rgbs,mask:maskKind},null,2));}
});

for(const source of ['folder','zip','hf-url'] as const)
test(`scene-root photos in ${source} recover qualified names and export original RGB and masks`,async({page},info)=>{
  await page.goto('/');const data=await cameraOnlyFixture(page);
  const secondRgb=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=8;canvas.height=4;
    const context=canvas.getContext('2d')!;context.fillStyle='rgb(40,90,180)';context.fillRect(0,0,8,4);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const rgbs=[data.rgb,secondRgb],photos=['scene/one.png','scene/two.png'];
  const files=data.files.filter(entry=>!entry.relativePath.startsWith('scene/images/'));
  photos.forEach((path,index)=>files.push({relativePath:path,name:path.split('/').pop()!,base64:rgbs[index]}));
  if(source==='hf-url'){
    const base='https://huggingface.co/datasets/colmapview-audit/scene-root/resolve/pinned/';
    await page.route('https://huggingface.co/**',route=>{
      if(route.request().url().includes('/api/datasets/'))return route.fulfill({json:files.map(entry=>({type:'file',path:entry.relativePath,size:Buffer.from(entry.base64,'base64').length}))});
      const path=decodeURIComponent(new URL(route.request().url()).pathname.split('/resolve/pinned/')[1]??'');
      const entry=files.find(item=>item.relativePath===path);
      return route.fulfill(entry?{body:Buffer.from(entry.base64,'base64')}:{status:404});
    });
    await page.goto('/?url='+encodeURIComponent(base));
  }else await dropDatasetFiles(page,source==='folder'?files:[{relativePath:'scene.zip',name:'scene.zip',base64:fixtureZip(files).toString('base64')}]);
  await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:2,points:0});
  expect(await page.evaluate(async()=>{const path='/src/store/reconstructionStore.ts';
    const{useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
    return [...useReconstructionStore.getState().loadedFiles!.nativeMedia!.bindings.values()].map(binding=>binding.sourceImagePath);
  })).toEqual(photos);
  const result=await exported(page,'zip-masks');
  expect([...parseImagesBinary(new Uint8Array(result.entries['sparse/0/images.bin']).buffer).values()].map(image=>image.name)).toEqual(data.names);
  data.names.forEach((name,index)=>{
    expect(Buffer.from(result.entries['images/'+name]).toString('base64')).toBe(rgbs[index]);
    expect(result.entries['masks/'+name+'.png']).toBeDefined();
  });
  const output=process.env.COLMAP_REVIEW4_OUTPUT;
  if(output){copyFileSync((await result.download.path())!,join(output,'root-'+source+'-'+info.project.name+'.zip'));
    writeFileSync(join(output,'root-'+source+'-'+info.project.name+'.json'),JSON.stringify({names:data.names,rgbs,mask:'normal'},null,2));}
});

for(const mode of ['signed-csv','host-masks','host-depth','host-images','query-root','encoded-peer'] as const)
test(`controlled URL listing ${mode} fetches exact originals and exports calibrated masks`,async({page},info)=>{
  await page.goto('/');const data=await cameraOnlyFixture(page);
  await dropDatasetFiles(page,data.files);
  await expect.poll(()=>state(page)).toEqual({error:null,count:2,matches:2,points:0});
  const second=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=8;canvas.height=4;
    const context=canvas.getContext('2d')!;context.fillStyle='rgb(40,90,180)';context.fillRect(0,0,8,4);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const encodedPeer=mode==='encoded-peer';
  const rgbs=[data.rgb,second],base='https://url-layouts.test/'+(encodedPeer?'%E7%99%BE':mode.startsWith('host-')?mode.slice(5):'pinned')+'/';
  const suffix='?token=exact%2Fvalue',stems=['one','two'];
  const photoPaths=stems.map(stem=>(encodedPeer?'poster/images/':'scene/'+(mode==='signed-csv'?'segmentation/':mode==='query-root'?'':'images/'))+stem+'.png');
  const photos=photoPaths.map(path=>(encodedPeer?base.replace(/%[0-9A-F]{2}/g,escape=>escape.toLowerCase()):base)+path+(mode==='query-root'?'?redirect=/depth/&tag=/masks/':suffix));
  const masks=data.names.map(name=>base+'scene/masks/'+name+'.png'+suffix);
  const csv=base+'scene/image_mapping.csv'+suffix,requested:string[]=[];
  const mask=data.files.find(entry=>entry.relativePath.includes('/masks/'))!.base64;
  await page.route('https://url-layouts.test/**',route=>{
    const url=route.request().url();requested.push(url);
    if(url===csv)return route.fulfill({body:'colmap_image,raw_path\n'+data.names.map((name,index)=>name+','+(encodedPeer?photos[index]:photoPaths[index])).join('\n')+'\n',headers:{'Access-Control-Allow-Origin':'*'}});
    const photo=photos.indexOf(url);
    if(photo>=0)return route.fulfill({body:Buffer.from(rgbs[photo],'base64'),contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'}});
    return route.fulfill(masks.includes(url)?{body:Buffer.from(mask,'base64'),contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'}}:{status:404});
  });
  // These source-listing representations exercise the binding API directly. They do not
  // claim that HF's tree API emits absolute URLs. Subsequent reads/export use the real viewer.
  const bindings=await page.evaluate(async({base,paths})=>{
    const storePath='/src/store/reconstructionStore.ts',mediaPath='/src/dataset/nativeMedia.ts';
    const{useReconstructionStore}=await import(storePath) as typeof import('../src/store/reconstructionStore');
    const{rememberNativeMediaSource,prepareNativeMedia}=await import(mediaPath) as typeof import('../src/dataset/nativeMedia');
    const current=useReconstructionStore.getState(),file=current.loadedFiles!.camerasFile!,files=new Map([['cameras.bin',file]]);
    rememberNativeMediaSource(files,{source:{kind:'url',baseUrl:base},modelDir:'scene/sparse/0',paths});
    const nativeMedia=await prepareNativeMedia(files,file,current.reconstruction!.cameras,current.reconstruction!.images);
    current.setLoadedFiles({...current.loadedFiles!,nativeMedia,imageFiles:new Map(),hasMasks:true});
    current.setSourceInfo('url',null,base+'scene/images/',base+'scene/masks/');
    return [...nativeMedia!.bindings.values()].map(binding=>({photo:binding.sourceImagePath,mask:binding.mask}));
  },{base,paths:['cameras.bin','images.bin'].map(name=>base+'scene/sparse/0/'+name).concat(photos,masks,
    mode==='signed-csv'||encodedPeer?[csv]:[],encodedPeer?['cameras.bin','images.bin'].map(name=>base+'poster/sparse/0/'+name):[])});
  expect(bindings).toEqual(photos.map((photo,index)=>({photo,mask:encodedPeer?undefined:{kind:'file',path:masks[index],role:'validity',invert:false}})));
  const result=await exported(page,encodedPeer?'zip-images':'zip-masks');
  data.names.forEach((name,index)=>{
    expect(Buffer.from(result.entries['images/'+name]).toString('base64')).toBe(rgbs[index]);
    if(encodedPeer)expect(result.entries['masks/'+name+'.png']).toBeUndefined();
    else expect(result.entries['masks/'+name+'.png']).toBeDefined();
  });
  expect(photos.every(url=>requested.includes(url))).toBe(true);
  if(mode==='signed-csv'||encodedPeer)expect(requested.filter(url=>url===csv)).toHaveLength(1);
  const output=process.env.COLMAP_REVIEW5_OUTPUT;
  if(output){copyFileSync((await result.download.path())!,join(output,mode+'-'+info.project.name+'.zip'));
    writeFileSync(join(output,mode+'-'+info.project.name+'.json'),JSON.stringify({names:data.names,rgbs,mask:encodedPeer?'none':'normal'},null,2));}
});
