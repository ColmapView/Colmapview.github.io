import { describe,expect,it } from 'vitest';
import { Matrix4,Quaternion,Vector3 } from 'three';
import { nerfCameraToColmap,bundlerCameraToColmap,worldToCameraFromCenter } from './cameraMath';

const translated=[[1,0,0,1.7],[0,1,0,-.4],[0,0,1,2.1],[0,0,0,1]];
describe('camera import pose conventions',() => {
  it('rejects pose arithmetic overflow even when all source coordinates are finite',()=>{
    const c=Math.SQRT1_2;
    const matrix=[[c,-c,0,1.5e308],[c,c,0,1.5e308],[0,0,1,0],[0,0,0,1]];
    expect(()=>nerfCameraToColmap(matrix)).toThrow(/nonfinite/);
  });
  it.each([0,90,179.999,180,180.001])('preserves independent source rays through a %s degree C2W rotation',degrees => {
    const source=new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromAxisAngle(new Vector3(1,2,3).normalize(),degrees*Math.PI/180));
    source.setPosition(1.7,-.4,2.1);
    const e=source.elements;
    const rows=[[e[0],e[4],e[8],e[12]],[e[1],e[5],e[9],e[13]],[e[2],e[6],e[10],e[14]],[0,0,0,1]];
    const pose=nerfCameraToColmap(rows);
    const [w,x,y,z]=pose.qvec;
    const q=new Quaternion(x,y,z,w);
    expect(q.length()).toBeCloseTo(1,12);
    const localGl=new Vector3(.17,-.21,-2);
    const world=localGl.clone().applyMatrix4(source);
    const actual=world.applyQuaternion(q).add(new Vector3(...pose.tvec));
    expect(actual.distanceTo(new Vector3(.17,.21,2))).toBeLessThan(1e-10);
    const center=new Vector3(...pose.tvec).negate().applyQuaternion(q.clone().invert());
    expect(center.distanceTo(new Vector3(1.7,-.4,2.1))).toBeLessThan(1e-10);
  });
  it('changes Bundler world-to-camera axes on the left',() => {
    const pose=bundlerCameraToColmap([[1,0,0],[0,1,0],[0,0,1]],[1,2,3],'camera');
    expect(pose.tvec).toEqual([1,-2,-3]);
  });
  it('computes OpenMVG translation from the supplied world center',() => {
    expect(worldToCameraFromCenter([[1,0,0],[0,1,0],[0,0,1]],[1,2,3]).tvec).toEqual([-1,-2,-3]);
  });
  it.each(['scale','reflection','shear','non-affine','nonfinite'])('rejects %s instead of repairing it',kind => {
    const m=translated.map(row => [...row]);
    if (kind==='scale') m[0][0]=1.2;
    if (kind==='reflection') m[0][0]=-1;
    if (kind==='shear') m[0][1]=.1;
    if (kind==='non-affine') m[3][0]=.1;
    if (kind==='nonfinite') m[1][2]=Infinity;
    expect(() => nerfCameraToColmap(m)).toThrow();
  });
  it('normalizes rounded quaternions before deriving translation',() => {
    const m=translated.map(row => [...row]);m[0][0]+=1e-7;
    const pose=nerfCameraToColmap(m);
    const [w,x,y,z]=pose.qvec;
    const center=new Vector3(...pose.tvec).negate().applyQuaternion(new Quaternion(x,y,z,w).invert());
    expect(center.distanceTo(new Vector3(1.7,-.4,2.1))).toBeLessThan(1e-10);
  });
});
