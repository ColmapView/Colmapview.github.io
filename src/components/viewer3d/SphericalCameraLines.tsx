import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ImageId } from '../../types/colmap';
import type { CameraFrustumItem, FrustumColorMode, FrustumPsnrMetricSource } from './cameraFrustumGeometry';
import { getFrustumBaseColor, getFrustumMetricColorScale } from './cameraFrustumGeometry';
import { buildSphereLineGeometryData, writeSphereLineAlphas, VERTS_PER_SPHERE, FLOATS_PER_SPHERE } from './sphericalCameraGeometry';
import {
  createFatLineSegmentsObject, disposeFatLineSegmentsObject,
  getFatLineAlphaArray, getFatLineColorArray,
  markFatLineAlphasNeedUpdate, markFatLineColorsNeedUpdate,
} from './fatLineSegments';
import { syncMaterialLineWidth } from './threeMaterialMutations';

interface SphericalCameraLinesProps {
  frustums: CameraFrustumItem[];
  selectedImageId: ImageId | null;
  cameraScale: number;
  frustumColorMode: FrustumColorMode;
  frustumSingleColor: string;
  frustumLineWidth: number;
  frustumStandbyOpacity: number;
  selectionColor: string;
  unselectedCameraOpacity: number;
  imageFrameIndexMap: Map<ImageId, number>;
  splatPsnrByImage: FrustumPsnrMetricSource;
}

export function SphericalCameraLines({
  frustums, selectedImageId, cameraScale, frustumColorMode, frustumSingleColor,
  frustumLineWidth, frustumStandbyOpacity, selectionColor, unselectedCameraOpacity,
  imageFrameIndexMap, splatPsnrByImage,
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

  // Recolor + re-alpha spheres on selection / opacity change (no per-frame animation in v1).
  // Alpha mirrors the pinhole line semantics (standby / unselected / selected) so that in a
  // mixed dataset the grid spheres dim in lockstep with the pinhole frustums.
  useEffect(() => {
    const colors = getFatLineColorArray(fatLines.geometry);
    const alphas = getFatLineAlphaArray(fatLines.geometry);
    if (!colors || !alphas) return;
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
    writeSphereLineAlphas(alphas, frustums, selectedImageId, frustumStandbyOpacity, unselectedCameraOpacity);
    markFatLineColorsNeedUpdate(fatLines.geometry);
    markFatLineAlphasNeedUpdate(fatLines.geometry);
  }, [fatLines, frustums, selectedImageId, selectionColor, frustumColorMode, frustumSingleColor, imageFrameIndexMap, splatPsnrByImage, frustumStandbyOpacity, unselectedCameraOpacity]);

  if (frustums.length === 0) return null;
  return <primitive object={fatLines.object} />;
}
