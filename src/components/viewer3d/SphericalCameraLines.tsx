import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ImageId } from '../../types/colmap';
import type { CameraFrustumItem, FrustumColorMode, FrustumPsnrMetricSource } from './cameraFrustumGeometry';
import { getFrustumBaseColor, getFrustumMetricColorScale } from './cameraFrustumGeometry';
import { buildSphereLineGeometryData, VERTS_PER_SPHERE, FLOATS_PER_SPHERE } from './sphericalCameraGeometry';
import {
  createFatLineSegmentsObject, disposeFatLineSegmentsObject,
  getFatLineColorArray, markFatLineColorsNeedUpdate,
} from './fatLineSegments';
import { syncMaterialLineWidth } from './threeMaterialMutations';

interface SphericalCameraLinesProps {
  frustums: CameraFrustumItem[];
  selectedImageId: ImageId | null;
  cameraScale: number;
  frustumColorMode: FrustumColorMode;
  frustumSingleColor: string;
  frustumLineWidth: number;
  selectionColor: string;
  imageFrameIndexMap: Map<ImageId, number>;
  splatPsnrByImage: FrustumPsnrMetricSource;
}

export function SphericalCameraLines({
  frustums, selectedImageId, cameraScale, frustumColorMode, frustumSingleColor,
  frustumLineWidth, selectionColor, imageFrameIndexMap, splatPsnrByImage,
}: SphericalCameraLinesProps) {
  const { positions, baseColors, baseAlphas } = useMemo(
    () => buildSphereLineGeometryData(frustums, cameraScale, { frustumColorMode, frustumSingleColor, imageFrameIndexMap, splatPsnrByImage }),
    [frustums, cameraScale, frustumColorMode, frustumSingleColor, imageFrameIndexMap, splatPsnrByImage]
  );

  const fatLines = useMemo(
    () => createFatLineSegmentsObject({
      positions, colors: new Float32Array(baseColors), alphas: new Float32Array(baseAlphas),
      lineWidth: 1, depthWrite: false, depthTest: true, polygonOffset: true,
      polygonOffsetFactor: 1, polygonOffsetUnits: 1, renderOrder: 2,
    }),
    [positions, baseColors, baseAlphas]
  );

  useLayoutEffect(() => { syncMaterialLineWidth(fatLines.material, frustumLineWidth); }, [fatLines, frustumLineWidth]);
  useEffect(() => () => disposeFatLineSegmentsObject(fatLines), [fatLines]);

  // Recolor selected sphere on selection change (no per-frame animation in v1).
  useEffect(() => {
    const colors = getFatLineColorArray(fatLines.geometry);
    if (!colors) return;
    const metricColorScale = getFrustumMetricColorScale(frustumColorMode, frustums.map((f) => f.image.imageId), splatPsnrByImage);
    const c = new THREE.Color();
    frustums.forEach((frustum, index) => {
      const isSelected = frustum.image.imageId === selectedImageId;
      c.set(isSelected ? selectionColor : getFrustumBaseColor(frustumColorMode, frustum.cameraIndex, frustum.image.imageId, imageFrameIndexMap, frustumSingleColor, splatPsnrByImage, metricColorScale));
      const base = index * FLOATS_PER_SPHERE;
      for (let v = 0; v < VERTS_PER_SPHERE; v++) {
        colors[base + v * 3] = c.r; colors[base + v * 3 + 1] = c.g; colors[base + v * 3 + 2] = c.b;
      }
    });
    markFatLineColorsNeedUpdate(fatLines.geometry);
  }, [fatLines, frustums, selectedImageId, selectionColor, frustumColorMode, frustumSingleColor, imageFrameIndexMap, splatPsnrByImage]);

  if (frustums.length === 0) return null;
  return <primitive object={fatLines.object} />;
}
