import { describe,expect,it } from 'vitest';
import { canonicalImageName,imageResourceUrl,resolveSourcePath,resolveIndexedImage,cameraSourceSceneScope } from './sourcePaths';
describe('exact camera source paths',() => {
  it('allows sibling media while keeping other named scenes outside the scope',()=>{
    expect(cameraSourceSceneScope('scene/calibration',['scene/calibration/transforms.json','scene/images/a.png'])).toBe('scene');
    expect(cameraSourceSceneScope('scene/calibration',['scene/calibration/transforms.json','scene/sparse/0/cameras.bin','scene/images/a.png'])).toBe('scene');
    expect(cameraSourceSceneScope('calibration',['calibration/transforms.json','images/a.png'])).toBe('');
    expect(cameraSourceSceneScope('collection/one/calibration',['collection/one/calibration/transforms.json','collection/two/transforms.json'])).toBe('collection/one');
    expect(cameraSourceSceneScope('collection/one/calibration',['collection/one/calibration/transforms.json','collection/two/sparse/0/cameras.bin'])).toBe('collection/one');
    expect(cameraSourceSceneScope('scene',['scene/transforms.json','outside.png'])).toBe('scene');
  });
  it('resolves parent-relative URLs and retains directory names for absolute URLs',()=>{
    const base='https://example.test/pinned/revision/calibration/';
    const path=resolveSourcePath('','../images/a #%.png','',true,base);
    expect(path).toBe('https://example.test/pinned/revision/images/a%20%23%25.png');
    expect(canonicalImageName(path,'',base)).toBe('a #%.png');
    expect(canonicalImageName('https://media.example.test/left/a.png','',base)).toBe('left/a.png');
    expect(canonicalImageName('https://media.example.test/right/a.png','',base)).toBe('right/a.png');
    expect(()=>resolveSourcePath('','../bad\n.png','',true,base)).toThrow();
  });
  it('resolves uppercase image extensions and dotted stems without folding source filename case',()=>{
    const paths=new Set(['images/DSC.001.JPG']);
    expect(resolveIndexedImage('images/DSC.001',paths)).toBe('images/DSC.001.JPG');
    expect(resolveIndexedImage('images/dsc.001',paths)).toBeNull();
    expect(()=>resolveIndexedImage('images/a',new Set(['images/a.png','images/a.PNG']))).toThrow(/Multiple extensions/);
  });
  it('preserves nested filenames and encodes literal URL characters once',() => {
    expect(canonicalImageName('scene/images/sub/A #?%.png','scene')).toBe('sub/A #?%.png');
    expect(imageResourceUrl('https://huggingface.co/datasets/u/d/resolve/pinned/scene/','images/A #?%.png'))
      .toBe('https://huggingface.co/datasets/u/d/resolve/pinned/scene/images/A%20%23%3F%25.png');
  });
  it('allows parents inside an explicit scene scope but rejects escapes/absolute local paths',() => {
    expect(resolveSourcePath('scene/calibration','../images/a.png','scene')).toBe('scene/images/a.png');
    for (const path of ['../../other/a.png','C:\\images\\a.png','/images/a.png','a\n.png']) {
      expect(() => resolveSourcePath('scene',path,'scene')).toThrow();
    }
  });
});
