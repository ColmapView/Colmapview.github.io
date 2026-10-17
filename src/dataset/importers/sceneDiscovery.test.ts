import { expect, it, vi } from 'vitest';
import { chooseMixedCameraScene,isPathInCameraScene } from './sceneDiscovery';
const native = ['cameras.bin','images.bin','points3D.bin'].map(name => 'native/sparse/0/'+name);
it('keeps native priority when camera metadata is in a calibration subfolder of the same scene',async()=>{
  const select=vi.fn();
  expect(await chooseMixedCameraScene([...native,'native/calibration/transforms.json'],undefined,select)).toBeNull();
  expect(select).not.toHaveBeenCalled();
});
it('offers separate native/JSON roots and keeps native priority within its own root', async () => {
  const select = vi.fn(async candidates => candidates.find((candidate: { path:string }) => candidate.path === 'json/transforms.json')!);
  const selected = await chooseMixedCameraScene([...native,'native/transforms.json','json/transforms.json'],undefined,select);
  expect(selected).toEqual({root:'json',metadataPath:'json/transforms.json'});
  expect(select.mock.calls[0][0]).toHaveLength(2);
});
it('does not assemble native roles scattered across different directories', async () => {
  const select = vi.fn();
  expect(await chooseMixedCameraScene(['a/cameras.bin','b/images.bin','c/points3D.bin','d/transforms.json'],undefined,select)).toBeNull();
  expect(select).not.toHaveBeenCalled();
});
it('does not let a root-level native scene silently override a distinct JSON scene',async()=>{
  const paths=['sparse/0/cameras.bin','sparse/0/images.bin','sparse/0/points3D.bin','images/a.png','json/transforms.json','json/images/a.png'];
  const select=vi.fn(async candidates=>candidates.find((candidate:{sceneRoot:string})=>candidate.sceneRoot==='')!);
  const chosen=(await chooseMixedCameraScene(paths,undefined,select))!;
  expect(select).toHaveBeenCalledOnce();
  expect(paths.filter(path=>isPathInCameraScene(path,chosen))).toEqual(paths.slice(0,4));
});
it('recognizes sparse/ as the native model of its parent scene and offers each native root once',async()=>{
  const root=['sparse/cameras.bin','sparse/images.bin','sparse/points3D.bin'];
  expect(await chooseMixedCameraScene([...root,'transforms.json'],undefined,vi.fn())).toBeNull();
  const other=native.map(path=>path.replace('/0/','/1/'));
  const select=vi.fn(async candidates=>candidates[0]);
  await chooseMixedCameraScene([...native,...other,'json/transforms.json'],undefined,select);
  expect(select.mock.calls[0][0]).toHaveLength(2);
});
