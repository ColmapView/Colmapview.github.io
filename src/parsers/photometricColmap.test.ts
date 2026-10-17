import { expect, it } from 'vitest';
import { parseImagesText } from './images';
import { parsePoints3DText } from './points3d';
import { isPhotometricImagesText } from './photometricColmap';
const images = '# Image list with two lines of data per image:\n# IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, SX, SY, SZ, CAMERA_ID, NAME, SCALE, BIAS\n# POINTS2D[] as (X, Y, INTENSITY, POINT3D_ID)\n0 1 0 0 0 -31.5 -17.1 1468.89 0.548 -0.001 -0.836 0 FC21B0039691.FIT 0.9019 0.0027\n50.5 50.5 0.03766 7 51.5 52.5 0.05 -1\n';
it('reads the declared PhoMo geometry and four-column observations without shifting IDs', () => {
  const image = parseImagesText(images).get(0)!;
  expect(image).toMatchObject({ cameraId: 0, name: 'FC21B0039691.FIT', qvec: [1,0,0,0], tvec: [-31.5,-17.1,1468.89] });
  expect(image.points2D).toEqual([{ xy: [50.5,50.5], point3DId: 7n }, { xy: [51.5,52.5], point3DId: -1n }]);
  expect(parseImagesText(images, true).get(0)?.points2D).toEqual([]);
});
it('reads normal/albedo point columns only with the exact declared schema', () => {
  const header = '# POINT3D_ID, X, Y, Z, NX, NY, NZ, ALBEDO, R, G, B, ERROR, TRACK[] as (IMAGE_ID, POINT2D_IDX)\n';
  const row = '7 53.83 17.38 -4.12 0.214 -0.264 0.94 1.095 94 95 96 0.25 0 0\n';
  expect(parsePoints3DText(header+row).get(7n)).toEqual({ point3DId:7n,xyz:[53.83,17.38,-4.12],rgb:[94,95,96],error:0.25,track:[{imageId:0,point2DIdx:0}] });
  expect(parsePoints3DText(row).size).toBe(0);
  expect(isPhotometricImagesText(images.replace('INTENSITY', 'OTHER'))).toBe(false);
});
it('retains ordinary COLMAP names with spaces and their standard observation triplets', () => {
  const image = parseImagesText('7 1 0 0 0 1 2 3 9 camera one/photo two.png\n1 2 3\n').get(7)!;
  expect(image.name).toBe('camera one/photo two.png');
  expect(image.points2D).toEqual([{xy:[1,2],point3DId:3n}]);
});
it('rejects unknown declared columns rather than interpreting them as camera IDs or colors',()=>{
  expect(()=>parseImagesText(images.replace('INTENSITY','UNKNOWN'))).toThrow('Unsupported images.txt column layout');
  expect(()=>parsePoints3DText('# POINT3D_ID, X, Y, Z, NX, NY, NZ, R, G, B, ERROR\n7 1 2 3 0 0 0 94 94 94 0\n')).toThrow('Unsupported points3D.txt column layout');
});
it('continues to accept standard points whose optional track column is omitted from the comment',()=>{
  const points=parsePoints3DText('# POINT3D_ID, X, Y, Z, R, G, B, ERROR\n7 1 2 3 10 20 30 0.25\n');
  expect(points.get(7n)).toMatchObject({xyz:[1,2,3],rgb:[10,20,30],error:0.25,track:[]});
});
it.each(['TRACK[]', 'TRACK[] as (IMAGE_ID, POINT2D_IDX)'])('retains the standard points header with %s',track=>{
  const points=parsePoints3DText('# POINT3D_ID, X, Y, Z, R, G, B, ERROR, '+track+'\n7 1 2 3 10 20 30 0.25 2 4\n');
  expect(points.get(7n)?.track).toEqual([{imageId:2,point2DIdx:4}]);
});
it.each(['EXPOSURE, GAIN', 'TRACK[] as (OTHER_ID, OTHER_INDEX)'])('rejects unknown fields after standard points columns: %s',columns=>{
  expect(()=>parsePoints3DText('# POINT3D_ID, X, Y, Z, R, G, B, ERROR, '+columns+'\n7 1 2 3 10 20 30 0.25 2 4\n')).toThrow('Unsupported points3D.txt column layout');
});
