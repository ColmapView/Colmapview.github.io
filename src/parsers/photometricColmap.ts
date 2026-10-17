// PhoMo's public text extension keeps COLMAP geometry but adds illumination and reflectance fields.
// Match the declared schema exactly; arbitrary extra columns are never treated as COLMAP.
const imagesHeader = 'IMAGE_ID,QW,QX,QY,QZ,TX,TY,TZ,SX,SY,SZ,CAMERA_ID,NAME,SCALE,BIAS';
const pointsHeader = 'POINT3D_ID,X,Y,Z,NX,NY,NZ,ALBEDO,R,G,B,ERROR,TRACK[]as(IMAGE_ID,POINT2D_IDX)';
const standardImagesHeader = 'IMAGE_ID,QW,QX,QY,QZ,TX,TY,TZ,CAMERA_ID,NAME';
const standardPointsHeader = 'POINT3D_ID,X,Y,Z,R,G,B,ERROR';
function hasHeader(text: string, expected: string): boolean {
  return text.slice(0, 8192).split(/\r?\n/).some(line => line.startsWith('#') && line.slice(1).replace(/\s/g, '') === expected);
}
export const isPhotometricImagesText = (text: string): boolean => hasHeader(text, imagesHeader)
  && hasHeader(text, 'POINTS2D[]as(X,Y,INTENSITY,POINT3D_ID)');
export const isPhotometricPointsText = (text: string): boolean => hasHeader(text, pointsHeader);
export function assertDeclaredColmapTextSchema(text: string, kind: 'images' | 'points3D'): void {
  const prefix = kind === 'images' ? 'IMAGE_ID,' : 'POINT3D_ID,';
  const declared = text.slice(0, 8192).split(/\r?\n/).filter(line => line.startsWith('#'))
    .map(line => line.slice(1).replace(/\s/g, '')).find(line => line.startsWith(prefix));
  if (!declared) return;
  const supported = kind === 'images' ? declared === standardImagesHeader || isPhotometricImagesText(text)
    : declared === standardPointsHeader || declared === standardPointsHeader + ',TRACK[]'
      || declared === standardPointsHeader + ',TRACK[]as(IMAGE_ID,POINT2D_IDX)' || isPhotometricPointsText(text);
  if (!supported) throw new Error(`Unsupported ${kind}.txt column layout. Convert the declared custom schema to COLMAP first.`);
}
export const PHOTOMETRIC_COLMAP_WARNING = 'Loaded PhoMo COLMAP geometry. Sun directions, intensity, reflectance, scale and bias are omitted from native COLMAP exports. PNG previews are used when available.';
