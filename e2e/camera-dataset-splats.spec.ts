import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures/test-fixtures';
import { cameraFixture } from './fixtures/camera-dataset';
import { getSplatBackendState, PLY_FIXTURE, waitForSceneProbe } from './fixtures/splat-probe';

test('a camera manifest restores its Gaussian companion while sparse points remain separate', async ({ page }) => {
  await page.goto('/?e2eProbe=1&splatBackend=spark');
  await waitForSceneProbe(page);
  const files=await cameraFixture(page,'nerf-blender');
  const origin=new URL(page.url()).origin, prefix='/__camera_splats/';
  const assetUrl=origin+prefix+'gaussian.ply';
  const manifest={format:'colmapview-camera-dataset',version:2,metadataUrl:origin+prefix+'transforms.json',
    splats:[assetUrl],viewerStatePath:'alignment.json'};
  const metadata=files.find(file=>/transforms.*\.json$/.test(file.name))!;
  const state={version:1,viewerVersion:'test',viewState:null,
    config:{splat:{activeSourceId:assetUrl,transform:{scale:1,rotationX:90,rotationY:0,rotationZ:0,translationX:0,translationY:0,translationZ:0}}}};
  const gaussian=readFileSync(PLY_FIXTURE);
  await page.route('**/__camera_splats/**',async route=>{
    const path=new URL(route.request().url()).pathname.slice(prefix.length);
    if(path==='scene.manifest.json') return route.fulfill({json:manifest});
    if(path==='alignment.json') return route.fulfill({json:state});
    if(path==='transforms.json') return route.fulfill({contentType:'application/json',body:Buffer.from(metadata.base64,'base64')});
    if(path==='gaussian.ply') return route.fulfill({contentType:'application/octet-stream',headers:{'Content-Length':String(gaussian.length)},body:gaussian});
    const file=files.find(file=>file.relativePath.replace(/^scene\//,'')===path);
    return file ? route.fulfill({contentType:'image/png',body:Buffer.from(file.base64,'base64')}) : route.fulfill({status:404});
  });
  await page.goto('/?e2eProbe=1&splatBackend=spark&url='+encodeURIComponent(origin+prefix+'scene.manifest.json'));
  await waitForSceneProbe(page);
  await expect.poll(async()=>page.evaluate(async()=>{
    const path='/src/store/reconstructionStore.ts';
    const {useReconstructionStore}=await import(path) as typeof import('../src/store/reconstructionStore');
    const state=useReconstructionStore.getState();
    return {images:state.reconstruction?.images.size,points:state.reconstruction?.globalStats.totalPoints,error:state.error};
  })).toEqual({images:2,points:0,error:null});
  await expect.poll(async()=>(await getSplatBackendState(page)).resolution.backend,{timeout:45000}).toBe('spark');
  expect(await page.evaluate(async()=>{
    const path='/src/store/index.ts';
    const {useTransformStore}=await import(path) as typeof import('../src/store');
    return useTransformStore.getState().splatTransform.rotationX;
  })).toBe(90);
  await expect(page.getByRole('img',{name:'a.png',exact:true}).first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get('url')).toBe(origin+prefix+'scene.manifest.json');
});
