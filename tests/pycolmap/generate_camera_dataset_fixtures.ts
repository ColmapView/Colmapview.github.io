import { File as NodeFile } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareLocalCameraDataset } from '../../src/dataset/importers/prepareCameraDataset';
import { parseCamerasBinary } from '../../src/parsers/cameras';
import { parseImagesBinary } from '../../src/parsers/images';
import { writeCamerasText, writeImagesText, writePoints3DText } from '../../src/parsers/colmapTextWriters';
import { pngHeader } from '../../src/test/imageHeaders';
import { numpyFixture, dtuFixture } from '../../src/test/numpyCameraFixtures';

globalThis.File = NodeFile as unknown as typeof File;
const out = resolve('.tmp/camera-dataset-pycolmap');
const rotation = [[0,-1,0],[1,0,0],[0,0,1]], center=[1,2,3], translation=[1,2,3];
const matrix = [...rotation.map((row,index)=>[...row,center[index]]),[0,0,0,1]];
const frames = [{file_path:'images/a.png',transform_matrix:matrix}];
const cases: Record<string,{path:string;data:unknown;raw?:boolean;list?:string;binary?:Uint8Array<ArrayBuffer>}> = {
  'nerf-blender':{path:'transforms_train.json',data:{camera_angle_x:Math.PI/2,frames}},
  nerfstudio:{path:'transforms.json',data:{camera_model:'OPENCV',w:32,h:24,fl_x:20,fl_y:22,cx:0,cy:11,k1:.1,k2:-.02,p1:.003,p2:-.004,frames}},
  'instant-ngp':{path:'transforms.json',data:{w:32,h:24,fl_x:20,fl_y:22,cx:0,cy:11,k1:.1,k2:-.02,p1:.003,p2:-.004,frames}},
  fisheye:{path:'transforms.json',data:{camera_model:'OPENCV_FISHEYE',w:32,h:24,fl_x:20,fl_y:22,cx:0,cy:11,k1:.1,k2:-.02,k3:.003,k4:-.0004,frames}},
  opensfm:{path:'reconstruction.json',data:[{cameras:{c:{projection_type:'perspective',width:32,height:24,focal:.75,k1:.1,k2:-.02}},shots:{'a.png':{camera:'c',rotation:[0,0,Math.PI/2],translation}}}]},
  openmvg:{path:'sfm_data.json',data:{views:[{key:4,value:{ptr_wrapper:{data:{filename:'a.png',id_intrinsic:8,id_pose:3}}}}],intrinsics:[{key:8,value:{polymorphic_name:'pinhole_radial_k3',ptr_wrapper:{data:{width:32,height:24,focal_length:20,principal_point:[0,11],disto_k3:[.1,-.02,.003]}}}}],extrinsics:[{key:3,value:{rotation,center}}]}},
  bundler:{path:'bundle.out',data:'# Bundle file v0.3\n1 0\n20 .1 -.02\n0 -1 0\n1 0 0\n0 0 1\n1 2 3\n',raw:true,list:'images/a.png\n'},
  'gaussian-splatting':{path:'cameras.json',data:[{id:7,img_name:'a',width:32,height:24,fx:20,fy:22,position:center,rotation}]},
  // LLFF stores down/right/back, followed by the original h/w/f column.
  llff:{path:'poses_bounds.npy',data:null,binary:numpyFixture(1,17,[-1,0,0,1,24,0,1,0,2,32,0,0,-1,3,20,0,0])},
  // Nontrivial normalization: P = K[R|t], then scale_mat is applied once.
  dtu:{path:'cameras.npz',data:null,binary:dtuFixture([[0,-20,0,20,22,0,11,77,0,0,1,3]],
    [[2,0,0,4,0,2,0,5,0,0,2,6,0,0,0,1]]),list:'images/a.png\n'},
};
for (const [name,fixture] of Object.entries(cases)) {
  const text=fixture.raw ? fixture.data as string : JSON.stringify(fixture.data);
  const files = new Map<string,File>([[fixture.path,new File([fixture.binary ?? text],fixture.path)],['images/a.png',new File([pngHeader(32,24)],'a.png')]]);
  if(fixture.list) files.set('list.txt',new File([fixture.list],'list.txt'));
  const prepared=(await prepareLocalCameraDataset(files))!;
  const cameras=parseCamerasBinary(await prepared.files.get('sparse/0/cameras.bin')!.arrayBuffer());
  const images=parseImagesBinary(await prepared.files.get('sparse/0/images.bin')!.arrayBuffer());
  for(const format of ['binary','text']) {
    const dir=resolve(out,name,format);mkdirSync(dir,{recursive:true});
    if(format==='binary') for(const [path,file] of prepared.files) {
      if(path.startsWith('sparse/0/')) writeFileSync(resolve(dir,file.name),new Uint8Array(await file.arrayBuffer()));
    }
    else {
      writeFileSync(resolve(dir,'cameras.txt'),writeCamerasText(cameras));
      writeFileSync(resolve(dir,'images.txt'),writeImagesText(images));
      writeFileSync(resolve(dir,'points3D.txt'),writePoints3DText(new Map()));
    }
  }
}
writeFileSync(resolve(out,'source.json'),JSON.stringify({rotation,center,translation,cases},null,2));
console.log(`Generated ${Object.keys(cases).length} original-source adapter fixtures in both COLMAP formats.`);
