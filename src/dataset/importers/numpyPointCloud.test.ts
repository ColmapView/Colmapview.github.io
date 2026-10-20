import { File as NodeFile, Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { zipSync } from 'fflate';
import { numpyFixture } from '../../test/numpyCameraFixtures';
import { parsePointCloudPlyFile } from '../../parsers/plyPointCloud';
import { numpyPointCloud } from './numpyPointCloud';
beforeEach(()=>{vi.stubGlobal('File',NodeFile);vi.stubGlobal('Blob',NodeBlob);});afterEach(()=>vi.unstubAllGlobals());
function vertices() {
  const source=numpyFixture(2,3,[1,2,3,4,5,6]),old=new TextDecoder().decode(source.subarray(10,128));
  source.set(new TextEncoder().encode(old.replace("(2, 3)","(2, 1, 3)").trimEnd().padEnd(old.length-1)+'\n'),10);
  return source;
}
it('reads exactly the selected temporal frame without interpreting other arrays',async()=>{
  const file=await numpyPointCloud(zipSync({'pos.npy':vertices(),'ignored.npy':new Uint8Array([1])}),'pos',1);
  expect([...(await parsePointCloudPlyFile(file)).values()].map(p=>({xyz:p.xyz,rgb:p.rgb}))).toEqual([{xyz:[4,5,6],rgb:[255,255,255]}]);
});
it('rejects missing arrays, invalid frames, objects and damaged ZIP payloads',async()=>{
  const array=vertices(),bytes=zipSync({'pos.npy':array},{level:0});
  await expect(numpyPointCloud(bytes,'other',0)).rejects.toThrow(/absent/);
  await expect(numpyPointCloud(bytes,'pos',2)).rejects.toThrow(/frame/);
  array.set(new TextEncoder().encode('|O8'),new TextDecoder().decode(array).indexOf('<f8'));
  await expect(numpyPointCloud(zipSync({'pos.npy':array}),'pos',0)).rejects.toThrow(/float/);
  const view=new DataView(bytes.buffer);bytes[30+view.getUint16(26,true)+view.getUint16(28,true)+130]^=1;
  await expect(numpyPointCloud(bytes,'pos',0)).rejects.toThrow(/integrity/);
});
