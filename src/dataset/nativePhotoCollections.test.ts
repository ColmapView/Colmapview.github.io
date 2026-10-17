import { describe, expect, it } from 'vitest';
import { findNativePhotoCollections } from './nativePhotoCollections';
import { NativeMediaPathIndex } from './nativeMediaPaths';

describe('native photo collection recovery', () => {
  it('recovers flattened ETH3D paths as one injective collection', () => {
    const collections = findNativePhotoCollections(['office/images/DSC_01.JPG', 'office/images/DSC_02.JPG'], ['dslr_images/DSC_01.JPG', 'dslr_images/DSC_02.JPG']);
    expect(collections).toHaveLength(1);
    expect(collections[0]).toMatchObject({ root: 'office/images', flattened: true });
    expect([...collections[0].bindings]).toEqual([['dslr_images/DSC_01.JPG', 'office/images/DSC_01.JPG'], ['dslr_images/DSC_02.JPG', 'office/images/DSC_02.JPG']]);
  });
  it('does not flatten colliding camera basenames or substitute another camera folder', () => {
    expect(findNativePhotoCollections(['images/a.jpg'], ['cam1/a.jpg', 'cam2/a.jpg'])).toEqual([]);
    expect(findNativePhotoCollections(['images/cam2/a.jpg'], ['cam1/a.jpg'])).toEqual([]);
  });
  it('handles a mixture of bare and flattened unique names in the same collection', () => {
    const [collection] = findNativePhotoCollections(['images/a.png','images/b.png'], ['camera/a.jpeg','b.png']);
    expect(collection.bindings.size).toBe(2); expect(collection.flattened).toBe(true);
  });
  it('does not infer two registered images from the same physical file', () => {
    expect(findNativePhotoCollections(['images/a.png'], ['a.jpg','a.jpeg'])).toEqual([]);
  });
  it('keeps qualified camera paths when many cameras reuse the same basename', () => {
    const names=Array.from({length:1000},(_,i)=>`camera_${i}/a.jpg`);
    const [collection]=findNativePhotoCollections(names.map(name=>'images/'+name),names);
    expect(collection.root).toBe('images');expect(collection.flattened).toBe(false);expect(collection.bindings.size).toBe(1000);
  });
  it('reserves the bounded collection budget for the selected scene in a large repository',()=>{
    const paths=Array.from({length:300},(_,i)=>`scene_${i}/images/a.png`);
    const collections=findNativePhotoCollections(paths,['camera/a.jpg'],path=>path.startsWith('scene_299/'));
    expect(collections.find(item=>item.root==='scene_299/images')?.bindings.get('camera/a.jpg')).toBe('scene_299/images/a.png');
    expect(collections.length).toBeLessThanOrEqual(256);
  });
  it('retains distinct thermal, ERP and CPP collections for explicit selection', () => {
    const result = findNativePhotoCollections(['scene/cpp_imgs/a.png', 'scene/erp_imgs/a.png', 'scene/thermal/a.png', 'scene/depth/a.png', 'scene/masks/a.png'], ['a.png']);
    expect(result.map(item => item.root)).toEqual(['scene/cpp_imgs', 'scene/erp_imgs', 'scene/thermal']);
  });
  it('uses extensionless or changed-extension qualified names without cross-camera substitution', () => {
    const index = new NativeMediaPathIndex(['images/cam1/a.png', 'images/cam2/b.png'], 'sparse/0');
    expect(index.image('cam1/a.jpeg').path).toBe('images/cam1/a.png');
    expect(index.image('cam1/a.FIT').path).toBe('images/cam1/a.png');
    expect(index.image('cam2/b').path).toBe('images/cam2/b.png');
    expect(index.image('cam2/a.jpg').status).toBe('missing');
  });
  it('preserves the fractional part of extensionless timestamp names',()=>{
    const index=new NativeMediaPathIndex(['images/cam/1697287.12345.png'],'sparse/0');
    expect(index.image('cam/1697287.12345').path).toBe('images/cam/1697287.12345.png');
    const [collection]=findNativePhotoCollections(['scene/images/1697287.12345.png'],['dslr/1697287.12345']);
    expect(collection.bindings.get('dslr/1697287.12345')).toBe('scene/images/1697287.12345.png');
  });
  it('leaves competing extensions ambiguous and preserves literal percent signs', () => {
    const index = new NativeMediaPathIndex(['images/a.png', 'images/a.webp', 'images/cam%2Fone/a.png'], 'sparse/0');
    expect(index.image('a.jpeg').status).toBe('ambiguous');
    expect(index.image('cam%2Fone/a.jpg').path).toBe('images/cam%2Fone/a.png');
  });
});
