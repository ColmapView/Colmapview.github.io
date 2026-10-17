import { afterEach, expect, it, vi } from 'vitest';
import { getHuggingFaceUrlFilePaths } from './urlLoaderHuggingFaceListing';

afterEach(()=>vi.unstubAllGlobals());
const base='https://huggingface.co/datasets/owner/cameras/resolve/pinned/scene%20%23%25/';
const api='https://huggingface.co/api/datasets/owner/cameras/tree/pinned/scene%20%23%25?recursive=true';
const response=(data:unknown,next?:string)=>new Response(JSON.stringify(data),{headers:next ? {Link:`<${next}>; rel="next"`} : {}});
const entry=(path:string)=>({type:'file',path:'scene #%/'+path});

it('reads complete paginated scene paths without any photo probes',async()=>{
  const fetch=vi.fn(async(url:string)=>url===api ? response([entry('images/a.PNG')],api+'&cursor=next')
    : response([entry('images/a.PNG'),entry('mask/a.png'),{type:'file',path:'other/images/a.png'}]));
  vi.stubGlobal('fetch',fetch);
  expect(await getHuggingFaceUrlFilePaths(base)).toEqual(['images/a.PNG','mask/a.png']);
  expect(fetch.mock.calls.map(([url])=>url)).toEqual([api,api+'&cursor=next']);
});

it.each(['cycle','other-host','other-scene','invalid-body','http-error','malformed-json'])(
  'never marks an incomplete listing complete: %s',async mode=>{
    const fetch=vi.fn(async()=>mode==='http-error' ? new Response('',{status:503})
      : mode==='malformed-json' ? new Response('not json')
      : mode==='invalid-body' ? response({error:'not a listing'})
      : response([entry('images/a.png')],mode==='cycle' ? api
        : mode==='other-host' ? 'https://other.test/list' : api.replace('scene%20%23%25','other')));
    vi.stubGlobal('fetch',fetch);
    expect(await getHuggingFaceUrlFilePaths(base)).toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
  }
);

it('stops at the page budget without using a truncated tree for image order',async()=>{
  let page=0;vi.stubGlobal('fetch',vi.fn(async()=>response([entry('images/'+page+'.png')],api+'&cursor='+ ++page)));
  expect(await getHuggingFaceUrlFilePaths(base)).toBeUndefined();expect(page).toBe(50);
});

it('does not enumerate generic HTTP folders',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  expect(await getHuggingFaceUrlFilePaths('https://example.test/scene/')).toBeUndefined();expect(fetch).not.toHaveBeenCalled();
});

it('keeps cancellation fatal instead of treating it as an unavailable listing',async()=>{
  const controller=new AbortController();
  vi.stubGlobal('fetch',vi.fn(async()=>{
    controller.abort();
    controller.signal.throwIfAborted();
    return response([]);
  }));
  await expect(getHuggingFaceUrlFilePaths(base,controller.signal)).rejects.toMatchObject({name:'AbortError'});
});

it('falls back after a network failure without returning the pages already read',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(response([entry('images/a.png')],api+'&cursor=next'))
    .mockRejectedValueOnce(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch',fetch);
  expect(await getHuggingFaceUrlFilePaths(base)).toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each(['images/./a.png','images\\a.png'])('does not make normalized path collisions authoritative: %s',async alias=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response([entry('images/a.png'),entry(alias)])));
  expect(await getHuggingFaceUrlFilePaths(base)).toBeUndefined();
});
