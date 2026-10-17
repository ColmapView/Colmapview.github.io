import type { Page } from '@playwright/test';
import { zipSync } from 'fflate';
import type { TestDatasetFileEntry } from './load-test-data';
import { numpyFixture, dtuFixture } from '../../src/test/numpyCameraFixtures';

export type CameraFixtureSchema = 'nerf-blender' | 'nerfstudio' | 'instant-ngp' | 'opensfm' | 'openmvg' | 'bundler' | 'gaussian-splatting' | 'llff' | 'dtu';
const identity = [[1,0,0,1],[0,1,0,2],[0,0,1,3],[0,0,0,1]];
export async function cameraFixture(page: Page, schema: CameraFixtureSchema = 'nerfstudio'): Promise<TestDatasetFileEntry[]> {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 4;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(20,160,80,0.5)'; ctx.fillRect(2,0,3,4);
    ctx.fillStyle = 'rgb(200,40,20)'; ctx.fillRect(5,0,3,4);
    const rgb = canvas.toDataURL('image/png').split(',')[1];
    ctx.fillStyle = 'black'; ctx.fillRect(0,0,8,4); ctx.fillStyle = 'white'; ctx.fillRect(4,0,4,4);
    return { rgb, mask: canvas.toDataURL('image/png').split(',')[1] };
  });
  const result = [
    {relativePath:'scene/images/a.png',name:'a.png',base64:png.rgb},
    {relativePath:'scene/images/b.png',name:'b.png',base64:png.rgb},
    {relativePath:'scene/masks/one.png',name:'one.png',base64:png.mask},
    {relativePath:'scene/masks/two.png',name:'two.png',base64:png.mask},
  ];
  const append = (path: string, value: unknown, raw = false) => result.push({relativePath:'scene/'+path,name:path.split('/').pop()!,base64:Buffer.from(raw ? value as string : JSON.stringify(value)).toString('base64')});
  const frames = ['a','b'].map((name,index)=>({file_path:`images/${name}.png`,transform_matrix:identity,
    ...(schema === 'nerfstudio' ? {mask_path:`masks/${index ? 'two' : 'one'}.png`} : {})}));
  if (schema === 'nerfstudio') append('transforms.json',{camera_model:'OPENCV',w:8,h:4,fl_x:5,fl_y:6,cx:0,cy:2,k1:.01,k2:-.002,frames});
  if (schema === 'instant-ngp') append('transforms.json',{w:8,h:4,fl_x:5,fl_y:6,cx:4,cy:2,k1:.01,frames});
  if (schema === 'nerf-blender') append('transforms_train.json',{camera_angle_x:Math.PI/2,frames:frames.map(frame=>({...frame,file_path:frame.file_path.replace('.png','')}))});
  if (schema === 'opensfm') append('reconstruction.json',[{cameras:{c:{projection_type:'perspective',width:8,height:4,focal:.7,k1:.01,k2:0}},shots:Object.fromEntries(['a','b'].map(name=>[name+'.png',{camera:'c',rotation:[0,0,0],translation:[1,2,3]}]))}]);
  if (schema === 'openmvg') append('sfm_data.json',{views:['a','b'].map((name,index)=>({key:index,value:{ptr_wrapper:{data:{filename:name+'.png',local_path:'',id_pose:index,id_intrinsic:0}}}})),intrinsics:[{key:0,value:{polymorphic_name:'pinhole_radial_k3',ptr_wrapper:{data:{width:8,height:4,focal_length:5,principal_point:[4,2],disto_k3:[.01,.002,.0003]}}}}],extrinsics:[0,1].map(key=>({key,value:{rotation:[[1,0,0],[0,1,0],[0,0,1]],center:[1,2,3]}}))});
  if (schema === 'bundler') {
    append('list.txt','images/b.png\nimages/a.png\n',true);
    append('bundle.out','# Bundle file v0.3\n2 0\n5 .01 -.002\n1 0 0\n0 1 0\n0 0 1\n1 2 3\n5 0 0\n1 0 0\n0 1 0\n0 0 1\n0 0 0\n',true);
  }
  if (schema === 'gaussian-splatting') append('cameras.json',['a','b'].map((name,index)=>({id:index,img_name:name,width:8,height:4,fx:5,fy:6,position:[1,2,3],rotation:[[1,0,0],[0,1,0],[0,0,1]]})));
  if (schema === 'llff') {
    const pose=[0,1,0,1,4,1,0,0,2,8,0,0,-1,3,5,0,0];
    result.push({relativePath:'scene/poses_bounds.npy',name:'poses_bounds.npy',base64:Buffer.from(numpyFixture(2,17,[...pose,...pose])).toString('base64')});
  }
  if (schema === 'dtu') {
    const projection=[5,0,4,17,0,6,2,18,0,0,1,3];
    result.push({relativePath:'scene/cameras.npz',name:'cameras.npz',base64:Buffer.from(dtuFixture([projection,projection])).toString('base64')});
    for (const item of result) {
      if (item.relativePath.startsWith('scene/images/')) item.relativePath=item.relativePath.replace('scene/images/','scene/image/');
      if (item.relativePath==='scene/masks/one.png') {item.relativePath='scene/mask/a.png';item.name='a.png';}
      if (item.relativePath==='scene/masks/two.png') {item.relativePath='scene/mask/b.png';item.name='b.png';}
    }
  }
  return result;
}
export function fixtureZip(files: TestDatasetFileEntry[]): Buffer {
  return Buffer.from(zipSync(Object.fromEntries(files.map(file=>[file.relativePath,new Uint8Array(Buffer.from(file.base64,'base64'))])),{level:0}));
}
export function fixtureTar(files: TestDatasetFileEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const file of files) {
    const bytes = Buffer.from(file.base64,'base64'), header=Buffer.alloc(512);
    header.write(file.relativePath);header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
    header.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);header.write('00000000000\0',136);
    header.fill(32,148,156);header[156]=48;header.write('ustar\0',257);
    header.write(header.reduce((sum,byte)=>sum+byte,0).toString(8).padStart(6,'0')+'\0 ',148);
    blocks.push(header,bytes,Buffer.alloc((512-bytes.length%512)%512));
  }
  return Buffer.concat([...blocks,Buffer.alloc(1024)]);
}
