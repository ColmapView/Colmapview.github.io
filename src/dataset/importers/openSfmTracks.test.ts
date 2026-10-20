import { afterEach, expect, it, vi } from 'vitest';
import { normalizeOpenSfm } from './sfmFormats';
import { addOpenSfmTracks, readOpenSfmTracks } from './openSfmTracks';
import type { ImportDiagnostic } from './types';
afterEach(()=>vi.unstubAllGlobals());

const root = { cameras: {c: {projection_type:'perspective',width:100,height:80,focal:1,k1:0,k2:0}},
  shots: {'a.jpg':{camera:'c',rotation:[0,0,0],translation:[0,0,0]}, 'b.jpg':{camera:'c',rotation:[0,0,0],translation:[0,0,0]}},
  points: {'string-id':{coordinates:[1,0,10],color:[1,2,3]}} };
const normalized = () => normalizeOpenSfm(root,async name => ({name,path:name,size:{width:100,height:80}}));
it.each([0,1,2])('joins native v%s track IDs, compacts feature IDs and converts pixel centers',async version => {
  const result=await normalized();
  const row=(shot:string,track:string,feature:number,x:number) => [shot,track,feature,x,0,...(version ? [1] : []),1,2,3,...(version===2 ? [-1,-1] : [])].join('\t');
  await addOpenSfmTracks(root,result,(version ? `OPENSFM_TRACKS_VERSION_v${version}\n` : '')+
    [row('a.jpg','string-id',9007199254740991,.1),row('b.jpg','string-id',5,.1),row('a.jpg','untriangulated',3,0),row('outside.jpg','string-id',1,0)].join('\n'));
  expect(result.images.get(1)!.points2D).toEqual([{xy:[50,40],point3DId:-1n},{xy:[60,40],point3DId:1n}]);
  expect(result.points3D!.get(1n)!.track).toEqual([{imageId:1,point2DIdx:1},{imageId:2,point2DIdx:0}]);
  expect(result.points3D!.get(1n)!.error).toBeCloseTo(0);
  expect(result.diagnostics.some(row=>row.code==='UNTRACKED_STRUCTURE')).toBe(false);
});
it.each([
  'OPENSFM_TRACKS_VERSION_v3\n',
  'a.jpg\tx\t1\tNaN\t0\t1\t2\t3',
  'a.jpg\tx\t-1\t0\t0\t1\t2\t3',
  'a.jpg\tx\t1\t0\t0\t256\t2\t3',
  'a.jpg\tx\t1\t0\t0\t1\t2\t3\na.jpg\ty\t1\t0\t0\t1\t2\t3',
  'a.jpg\tx\t1\t0\t0\t1\t2\t3\na.jpg\tx\t2\t0\t0\t1\t2\t3',
])('rejects malformed versions, nonfinite coordinates and conflicting feature associations',async text=>{
  await expect(addOpenSfmTracks(root,await normalized(),text)).rejects.toMatchObject({code:'INVALID_METADATA'});
});
it('honors cancellation before any observations are installed',async()=>{
  const controller=new AbortController();controller.abort();
  await expect(addOpenSfmTracks(root,await normalized(),'a.jpg\tx\t1\t0\t0\t1\t2\t3',controller.signal)).rejects.toMatchObject({name:'AbortError'});
});
it('keeps direct JSON geometry usable when an optional sibling has no browser read access',async()=>{
  const fetch=vi.fn(async()=>{throw new TypeError('Failed to fetch');});vi.stubGlobal('fetch',fetch);
  const source={kind:'url' as const,baseUrl:'https://camera.test/scene/'},diagnostics:ImportDiagnostic[]=[];
  expect(await readOpenSfmTracks(source,'reconstruction.json',undefined,undefined,diagnostics)).toBeNull();
  expect(diagnostics[0].code).toBe('UNAVAILABLE_TRACKS');
  await expect(readOpenSfmTracks(source,'reconstruction.json','https://camera.test/required.csv')).rejects.toThrow(/Failed to fetch/);
});
it('does not guess tracks excluded by an authoritative listing and preserves cancellation',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  const source={kind:'url' as const,baseUrl:'https://camera.test/scene/',filePaths:['reconstruction.json']};
  expect(await readOpenSfmTracks(source,'reconstruction.json',undefined)).toBeNull();expect(fetch).not.toHaveBeenCalled();
  const controller=new AbortController();controller.abort();
  await expect(readOpenSfmTracks({...source,filePaths:undefined},'reconstruction.json',undefined,controller.signal)).rejects.toMatchObject({name:'AbortError'});
});
