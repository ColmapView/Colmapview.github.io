import type { Point3D, Point3DId } from '../types/colmap';

/**
 * Export 3D points as an ASCII PLY point cloud.
 * PLY is a common format supported by MeshLab, CloudCompare, and other 3D viewers.
 */
export function writePointsPLY(points3D: Map<Point3DId, Point3D>): string {
  const header = [
    'ply',
    'format ascii 1.0',
    `element vertex ${points3D.size}`,
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'end_header',
  ].join('\n') + '\n';

  const data: string[] = [];
  for (const pt of points3D.values()) {
    data.push(`${pt.xyz[0]} ${pt.xyz[1]} ${pt.xyz[2]} ${pt.rgb[0]} ${pt.rgb[1]} ${pt.rgb[2]}`);
  }

  return header + data.join('\n') + '\n';
}
