import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { test, expect } from './fixtures/test-fixtures';
import { dropDatasetFiles, type TestDatasetFileEntry } from './fixtures/load-test-data';
import { cameraFixture, fixtureZip, fixtureTar, type CameraFixtureSchema } from './fixtures/camera-dataset';
import { parseImagesBinary } from '../src/parsers/images';
import { writeCamerasBinary, writeImagesBinary, writePoints3DBinary } from '../src/parsers/colmapBinaryWriters';
import { writeCamerasText, writeImagesText, writePoints3DText } from '../src/parsers/colmapTextWriters';

const schemas: CameraFixtureSchema[] = ['nerf-blender', 'nerfstudio', 'instant-ngp', 'opensfm', 'openmvg',
  'bundler', 'gaussian-splatting', 'llff', 'dtu'];
const root = 'S Ω#%';
const names = ['left #/a 100%.PNG', 'right Ω/b %23.PNG'];
const maskNames = ['one #%.PNG', 'two Ω%.PNG'];
const urlBase = 'https://paths.example.test/pinned/revision/';
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

async function pathFixture(page: Page, schema: CameraFixtureSchema) {
  const files = await cameraFixture(page, schema);
  const blue = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 4;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'rgba(10,20,200,.5)'; ctx.fillRect(0,0,8,4);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const photoDir = schema === 'dtu' ? 'image' : 'images';
  const photoPaths = names.map(name => `${root}/${photoDir}/${name}`);
  const originals = new Map<string, string>();
  for (const [index, leaf] of ['a.png', 'b.png'].entries()) {
    const entry = files.find(file => file.relativePath === `scene/${photoDir}/${leaf}`)!;
    entry.relativePath = photoPaths[index]; entry.name = names[index].split('/').pop()!;
    if (index === 1) entry.base64 = blue;
    originals.set(entry.relativePath, entry.base64);
  }
  for (const [index, leaf] of (schema === 'dtu' ? ['a.png','b.png'] : ['one.png','two.png']).entries()) {
    const entry = files.find(file => file.relativePath === `scene/${schema === 'dtu' ? 'mask' : 'masks'}/${leaf}`)!;
    entry.relativePath = schema === 'dtu'
      ? `${root}/calibration/mask/${names[index].split('/').pop()!}` : `${root}/masks/${maskNames[index]}`;
    entry.name = entry.relativePath.split('/').pop()!;
  }
  const metadata = files.find(file => /\.(json|out|npy|npz)$/.test(file.name))!;
  metadata.relativePath = `${root}/calibration/${metadata.name}`;
  const refs = names.map(name => `../${photoDir}/${name}`);
  if (metadata.name.endsWith('.json')) {
    const value = JSON.parse(Buffer.from(metadata.base64,'base64').toString('utf8'));
    if (schema === 'opensfm') value[0].shots = Object.fromEntries(Object.values(value[0].shots)
      .map((shot, index) => [refs[index], shot]));
    else if (schema === 'openmvg') {
      value.root_path = '../images';
      value.views.forEach((row: { value: { ptr_wrapper: { data: { filename: string; local_path: string } } } }, index: number) => {
        row.value.ptr_wrapper.data.filename = names[index].split('/').pop()!;
        row.value.ptr_wrapper.data.local_path = names[index].split('/')[0];
      });
    } else if (schema === 'gaussian-splatting') value.forEach((frame: { img_name: string }, index: number) => { frame.img_name = refs[index]; });
    else value.frames.forEach((frame: { file_path: string; mask_path?: string }, index: number) => {
      frame.file_path = schema === 'nerf-blender' ? refs[index].replace(/\.PNG$/, '') : refs[index];
      if (schema === 'nerfstudio') frame.mask_path = '../masks/' + maskNames[index];
    });
    metadata.base64 = Buffer.from(JSON.stringify(value)).toString('base64');
  }
  if (schema === 'bundler') {
    const list = files.find(file => file.name === 'list.txt')!;
    list.relativePath = `${root}/calibration/list.txt`;
    list.base64 = Buffer.from([...refs].reverse().map(ref => `"${ref}" 0 0`).join('\n')+'\n').toString('base64');
  } else if (schema === 'llff' || schema === 'dtu') {
    files.push({ relativePath: `${root}/calibration/list.txt`, name: 'list.txt', base64: Buffer.from(refs.join('\n')+'\n').toString('base64') });
  }
  return { files, metadata, originals };
}

async function routeFiles(page: Page, files: TestDatasetFileEntry[], requests: string[]) {
  await page.route(urlBase+'**', route => {
    requests.push(route.request().url());
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice('/pinned/revision/'.length));
    const entry = files.find(file => file.relativePath === path);
    return route.fulfill(entry ? { status: 200, body: Buffer.from(entry.base64,'base64'), headers: { 'Access-Control-Allow-Origin': '*' } } : { status: 404 });
  });
}

async function inspectMedia(page: Page) {
  return page.evaluate(async () => {
    const sp = '/src/store/reconstructionStore.ts', dp = '/src/dataset/index.ts';
    const { useReconstructionStore } = await import(sp) as typeof import('../src/store/reconstructionStore');
    const { getDatasetManager } = await import(dp) as typeof import('../src/dataset');
    const s = useReconstructionStore.getState(), context = s.loadedFiles?.cameraImport;
    const manager = getDatasetManager();
    return { schema: context?.selection.schema, error: s.error, points: s.wasmReconstruction?.pointCount,
      media: await Promise.all([...context?.bindings ?? []].map(async ([name, binding]) => {
        const original = await manager.getOriginalImage(name), mask = await manager.getMask(name);
        const bitmap = mask ? await createImageBitmap(mask) : null;
        const maskSize = bitmap ? [bitmap.width, bitmap.height] : null; bitmap?.close();
        return { name, source: binding.sourceImagePath, bytes: original ? btoa(String.fromCharCode(...new Uint8Array(await original.arrayBuffer()))) : null,
          maskSize, maskKind: binding.mask?.kind };
      })) };
  });
}

for (const schema of schemas) for (const transport of ['folder', 'zip', 'tar', 'url', 'remote-zip'] as const) {
  test(`${schema} ${transport}: nested metadata and exact special-character photos/masks export correctly`, async ({ page }) => {
    await page.goto('/');
    const data = await pathFixture(page, schema), requests: string[] = [];
    if (transport === 'url') {
      await routeFiles(page, data.files, requests);
      await page.goto('/?url='+encodeURIComponent(urlBase+encodePath(data.metadata.relativePath)+'?download=1'));
    } else if (transport === 'remote-zip') {
      const bytes = fixtureZip(data.files), source = urlBase+'scene%20%23%25.zip?download=1';
      await page.route(urlBase+'**', route => {
        if (route.request().url() !== source) return route.fulfill({ status: 404 });
        const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
        const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]),bytes.length-1) : bytes.length-1;
        return route.fulfill({ status: range ? 206 : 200, body: bytes.subarray(start,end+1), headers: {
          'Content-Type':'application/zip', 'Content-Length':String(end-start+1), 'Accept-Ranges':'bytes',
          ...(range ? { 'Content-Range':`bytes ${start}-${end}/${bytes.length}` } : {}),
          'Access-Control-Allow-Origin':'*', 'Access-Control-Expose-Headers':'Content-Length,Content-Range,Accept-Ranges',
        } });
      });
      await page.goto('/?url='+encodeURIComponent(source));
    } else await dropDatasetFiles(page, transport === 'folder' ? data.files : [{ relativePath: `scene.${transport}`, name: `scene.${transport}`,
      base64: (transport === 'zip' ? fixtureZip(data.files) : fixtureTar(data.files)).toString('base64') }]);
    await expect.poll(async () => (await inspectMedia(page)).schema).toBe(schema);
    const result = await inspectMedia(page);
    expect(result.error).toBeNull(); expect(result.points).toBe(0); expect(result.media).toHaveLength(2);
    const observed = result.media.map(media => media.bytes).sort();
    expect(observed).toEqual([...data.originals.values()].sort());
    for (const media of result.media) {
      expect(media.maskSize).toEqual([8,4]);
      const decoded = media.source.startsWith('https:') ? decodeURIComponent(new URL(media.source).pathname.slice('/pinned/revision/'.length)) : media.source;
      expect(media.bytes).toBe(data.originals.get(decoded));
    }
    if (transport === 'url') expect(requests).toContain(urlBase+encodePath(data.metadata.relativePath)+'?download=1');
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: 'Export', exact: true }).hover();
    await page.locator('select').first().selectOption('zip-masks');
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download COLMAP', exact: true }).click();
    const download = await pending, entries = unzipSync(readFileSync((await download.path())!));
    const images = parseImagesBinary(new Uint8Array(entries['sparse/0/images.bin']).buffer);
    expect(images.size).toBe(2);
    for (const media of result.media) {
      expect(Buffer.from(entries['images/'+media.name]).toString('base64')).toBe(media.bytes);
      expect(entries[`masks/${media.name}.png`]).toBeDefined();
    }
  });
}

for (const schema of schemas) test(`${schema} HF metadata URL: complete listing resolves exact media without guessed extensions or array lists`,async({page})=>{
  await page.goto('/');const files=await cameraFixture(page,schema);
  const metadata=files.find(file=>/\.(?:json|out|npy|npz)$/.test(file.name))!;
  const base='https://huggingface.co/datasets/colmapview-audit/camera-paths/resolve/pinned/';
  const probes:string[]=[];
  await page.route('https://huggingface.co/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.includes('/api/datasets/')){
      if(!url.pathname.includes('/tree/'))return route.fulfill({json:{private:false,gated:false}});
      return route.fulfill({json:files.map(file=>({type:'file',path:file.relativePath,size:Buffer.from(file.base64,'base64').length}))});
    }
    if(route.request().headers().range)probes.push(url.href);
    const path=decodeURIComponent(url.pathname.split('/resolve/pinned/')[1]??'');
    const file=files.find(file=>file.relativePath===path);
    return route.fulfill(file?{body:Buffer.from(file.base64,'base64')}:{status:404});
  });
  await page.goto('/?url='+encodeURIComponent(base+encodePath(metadata.relativePath)+'?download=1'));
  await expect.poll(async()=> (await inspectMedia(page)).schema).toBe(schema);
  const result=await inspectMedia(page);
  expect(result.error).toBeNull();expect(result.media).toHaveLength(2);
  for(const media of result.media){expect(media.bytes).not.toBeNull();expect(media.maskSize).toEqual([8,4]);}
  expect(probes).toEqual([]);
  if(schema==='dtu')expect(result.media.every(media=>media.maskKind==='file')).toBe(true);
});

for (const encoding of ['binary','text'] as const) for (const cameraOnly of [false,true]) {
  for (const transport of ['folder','zip','tar','hf-scene','hf-model','hf-colmap','hf-sparse','hf-component',
    'hf-workspace','hf-workspace-native','hf-workspace-seed','manifest'] as const) {
    test(`native ${encoding} ${cameraOnly ? 'camera-only' : 'complete'} ${transport}: special-character paths keep model/photo/mask identity`, async ({page}) => {
      await page.goto('/');
      const photos = await cameraFixture(page);
      const modelDir = transport.startsWith('hf-workspace')
        ? root+'/colmap_workspace/'+(transport==='hf-workspace-seed'?'sparse_seed':'sparse_native')
        : ['hf-colmap','hf-sparse','hf-component'].includes(transport) ? root+'/colmap/sparse/0' : root+'/triangulated_model';
      const cameras = new Map([[9,{cameraId:9,modelId:1 as const,width:8,height:4,params:[5,6,4,2]}]]);
      const images = new Map(names.map((name,index) => [index+7,{imageId:index+7,cameraId:9,name,
        qvec:[1,0,0,0] as [number,number,number,number], tvec:[index+1,2,3] as [number,number,number],
        points2D:[{xy:[2,1] as [number,number],point3DId:2n}]}]));
      const points = new Map([[2n,{point3DId:2n,xyz:[1,2,3] as [number,number,number],rgb:[10,20,30] as [number,number,number],
        error:0,track:[{imageId:7,point2DIdx:0},{imageId:8,point2DIdx:0}]}]]);
      const ext = encoding === 'binary' ? 'bin' : 'txt';
      const add = (path:string,value:ArrayBuffer|string):TestDatasetFileEntry => ({relativePath:path,name:path.split('/').pop()!,
        base64:Buffer.from(typeof value === 'string' ? value : new Uint8Array(value)).toString('base64')});
      const files = [add(`${modelDir}/cameras.${ext}`,encoding === 'binary' ? writeCamerasBinary(cameras) : writeCamerasText(cameras)),
        add(`${modelDir}/images.${ext}`,encoding === 'binary' ? writeImagesBinary(images) : writeImagesText(images))];
      if (!cameraOnly) files.push(add(`${modelDir}/points3D.${ext}`,encoding === 'binary' ? writePoints3DBinary(points) : writePoints3DText(points)));
      const rgb = photos.find(file=>file.relativePath==='scene/images/a.png')!.base64, mask = photos.find(file=>file.name==='one.png')!.base64;
      for (const name of names) files.push({relativePath:`${root}/images/${name}`,name:name.split('/').pop()!,base64:rgb},
        {relativePath:`${root}/masks/${name}.png`,name:name.split('/').pop()!+'.png',base64:mask});
      if (transport.startsWith('hf-')) {
        const base = 'https://huggingface.co/datasets/colmapview-audit/typed-paths/resolve/pinned/';
        await page.route('https://huggingface.co/**',route=>{
          const url=new URL(route.request().url());
          if (url.pathname.includes('/api/datasets/')) {
            const tree=url.pathname.split('/tree/pinned')[1];
            if (tree === undefined) return route.fulfill({json:{private:false,gated:false}});
            const scope=decodeURIComponent(tree).replace(/^\//,'');
            return route.fulfill({json:files.filter(file=>!scope || file.relativePath.startsWith(scope+'/'))
              .map(file=>({type:'file',path:file.relativePath,size:Buffer.from(file.base64,'base64').length}))});
          }
          const path=decodeURIComponent(url.pathname.split('/resolve/pinned/')[1] ?? '');
          const file=files.find(file=>file.relativePath===path);
          return route.fulfill(file ? {body:Buffer.from(file.base64,'base64')} : {status:404});
        });
        const selectedPath=transport==='hf-model'||transport==='hf-component'||transport==='hf-workspace-native'||transport==='hf-workspace-seed' ? modelDir
          : transport==='hf-workspace' ? root+'/colmap_workspace'
          : transport==='hf-colmap' ? root+'/colmap' : transport==='hf-sparse' ? root+'/colmap/sparse' : root;
        await page.goto('/?url='+encodeURIComponent(base+encodePath(selectedPath)));
      } else if (transport==='manifest') {
        const manifest={version:1,baseUrl:urlBase+encodePath(root),files:{cameras:`triangulated_model/cameras.${ext}`,
          images:`triangulated_model/images.${ext}`,...(cameraOnly ? {} : {points3D:`triangulated_model/points3D.${ext}`})},
          images:names.map(name=>'images/'+name),masks:names.map(name=>'masks/'+name+'.png'),maskRole:'validity'};
        await routeFiles(page,files,[]);
        // The specific route must be registered last so it wins over the media wildcard.
        await page.route(urlBase+'manifest.json',route=>route.fulfill({json:manifest}));
        await page.goto('/?url='+encodeURIComponent(urlBase+'manifest.json'));
      } else await dropDatasetFiles(page,transport==='folder' ? files : [{relativePath:'native.'+transport,name:'native.'+transport,
        base64:(transport==='zip' ? fixtureZip(files) : fixtureTar(files)).toString('base64')}]);
      await expect.poll(()=>page.evaluate(async()=>{
        const path='/src/store/reconstructionStore.ts';const{useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
        const s=useReconstructionStore.getState();return {error:s.error,count:s.reconstruction?.images.size,points:s.wasmReconstruction?.pointCount};
      })).toEqual({error:null,count:2,points:cameraOnly ? 0 : 1});
      const media=await page.evaluate(async names=>{
        const path='/src/dataset/index.ts';const{getDatasetManager}=await import(path) as typeof import('../src/dataset');
        const m=getDatasetManager(),encode=async(file:File|null)=>file ? btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer()))) : null;
        return Promise.all(names.map(async name=>({photo:await encode(await m.getOriginalImage(name)),mask:await encode(await m.getMask(name))})));
      },names);
      expect(media).toEqual(names.map(()=>({photo:rgb,mask})));
      await page.keyboard.press('Tab');await page.getByRole('button',{name:'Export',exact:true}).hover();
      await page.locator('select').first().selectOption('zip-masks');
      const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download COLMAP',exact:true}).click();
      const entries=unzipSync(readFileSync((await(await pending).path())!));
      const exported=parseImagesBinary(new Uint8Array(entries['sparse/0/images.bin']).buffer);
      expect([...exported.values()].map(image=>image.name)).toEqual(names);
      for (const name of names) expect(Buffer.from(entries['images/'+name]).toString('base64')).toBe(rgb);
    });
  }
}
