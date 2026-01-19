import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import {
  undistortionVertexShader,
  undistortionFragmentShader,
  fullFrameVertexShader,
  fullFrameFragmentShader,
} from '../../shaders/undistortion';
import { getCameraIntrinsics, type Camera } from '../../types/colmap';
import { getMaterialTransparency, isMaterialVisible } from '../../theme/materials';
import type { UndistortionMode } from '../../store/types';

interface UndistortedImageMaterialProps {
  map: THREE.Texture | null;
  camera: Camera;
  undistortionEnabled: boolean;
  undistortionMode: UndistortionMode;
  planeWidth?: number;  // Required for fullFrame mode
  planeHeight?: number; // Required for fullFrame mode
  opacity: number;
  color: number;
  side: THREE.Side;
  visible?: boolean;
  depthTest?: boolean;  // Whether to test against depth buffer (default: true)
  forceTransparent?: boolean;  // Force into transparent render pass (default: false)
  forceDepthWrite?: boolean;  // Override depthWrite (default: undefined, uses opacity-based logic)
}

/**
 * Custom shader material for real-time image undistortion.
 * Uses GLSL shaders to undistort images based on COLMAP camera models.
 *
 * Two modes:
 * - 'cropped': Perspective projection with rectangular output. Samples distorted
 *   image to fill a flat plane. Edges outside the source image are transparent.
 * - 'fullFrame': Shows entire undistorted image with curved borders. Requires
 *   tessellated geometry (many vertices) as the vertex shader moves vertices.
 */
export function UndistortedImageMaterial({
  map,
  camera,
  undistortionEnabled,
  undistortionMode,
  planeWidth = 1,
  planeHeight = 1,
  opacity,
  color,
  side,
  visible = true,
  depthTest = true,
  forceTransparent = false,
  forceDepthWrite,
}: UndistortedImageMaterialProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Extract camera intrinsics
  const intrinsics = useMemo(() => getCameraIntrinsics(camera), [camera]);

  // Select shaders based on mode
  const isFullFrame = undistortionMode === 'fullFrame';

  // Create shader material
  const shaderMaterial = useMemo(() => {
    const colorVec = new THREE.Color(color);

    // Common uniforms for both modes
    const uniforms: Record<string, { value: unknown }> = {
      map: { value: map },
      opacity: { value: opacity },
      color: { value: new THREE.Vector3(colorVec.r, colorVec.g, colorVec.b) },
      modelId: { value: camera.modelId },
      imageWidth: { value: camera.width },
      imageHeight: { value: camera.height },
      fx: { value: intrinsics.fx },
      fy: { value: intrinsics.fy },
      cx: { value: intrinsics.cx },
      cy: { value: intrinsics.cy },
      k1: { value: intrinsics.k1 },
      k2: { value: intrinsics.k2 },
      k3: { value: intrinsics.k3 },
      k4: { value: intrinsics.k4 },
      k5: { value: intrinsics.k5 },
      k6: { value: intrinsics.k6 },
      p1: { value: intrinsics.p1 },
      p2: { value: intrinsics.p2 },
      omega: { value: intrinsics.omega },
      sx1: { value: intrinsics.sx1 },
      sy1: { value: intrinsics.sy1 },
    };

    // Mode-specific uniforms
    if (isFullFrame) {
      // FullFrame mode needs plane dimensions for vertex shader
      uniforms.planeWidth = { value: planeWidth };
      uniforms.planeHeight = { value: planeHeight };
    } else {
      // Cropped mode needs the undistortionEnabled flag
      uniforms.undistortionEnabled = { value: undistortionEnabled };
    }

    const { transparent, depthWrite } = getMaterialTransparency(opacity);
    return new THREE.ShaderMaterial({
      vertexShader: isFullFrame ? fullFrameVertexShader : undistortionVertexShader,
      fragmentShader: isFullFrame ? fullFrameFragmentShader : undistortionFragmentShader,
      uniforms,
      side,
      // Use centralized transparency logic, but allow override for selected planes
      transparent: forceTransparent || transparent,
      depthWrite: forceDepthWrite !== undefined ? forceDepthWrite : depthWrite,
      // Control depth testing (selected images skip depth test to render on top of wireframes)
      depthTest,
      // Match MeshBasicMaterial blending behavior
      blending: THREE.NormalBlending,
      // Disable tone mapping to match MeshBasicMaterial (which is unlit and not tone mapped)
      toneMapped: false,
      // Control visibility - hide when opacity is effectively 0
      visible: isMaterialVisible(opacity, visible),
    });
  }, [camera, intrinsics, side, visible, opacity, isFullFrame, undistortionEnabled, planeWidth, planeHeight, depthTest, forceTransparent, forceDepthWrite, color, map]);

  // Update uniforms when props change (without recreating material)
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;

    // Update texture and visual props
    mat.uniforms.map.value = map;
    mat.uniforms.opacity.value = opacity;
    const colorVec = new THREE.Color(color);
    mat.uniforms.color.value.set(colorVec.r, colorVec.g, colorVec.b);

    // Mode-specific uniforms
    if (isFullFrame) {
      if (mat.uniforms.planeWidth) mat.uniforms.planeWidth.value = planeWidth;
      if (mat.uniforms.planeHeight) mat.uniforms.planeHeight.value = planeHeight;
    } else {
      if (mat.uniforms.undistortionEnabled) {
        mat.uniforms.undistortionEnabled.value = undistortionEnabled;
      }
    }

    // Update camera intrinsics
    mat.uniforms.modelId.value = camera.modelId;
    mat.uniforms.imageWidth.value = camera.width;
    mat.uniforms.imageHeight.value = camera.height;
    mat.uniforms.fx.value = intrinsics.fx;
    mat.uniforms.fy.value = intrinsics.fy;
    mat.uniforms.cx.value = intrinsics.cx;
    mat.uniforms.cy.value = intrinsics.cy;
    mat.uniforms.k1.value = intrinsics.k1;
    mat.uniforms.k2.value = intrinsics.k2;
    mat.uniforms.k3.value = intrinsics.k3;
    mat.uniforms.k4.value = intrinsics.k4;
    mat.uniforms.k5.value = intrinsics.k5;
    mat.uniforms.k6.value = intrinsics.k6;
    mat.uniforms.p1.value = intrinsics.p1;
    mat.uniforms.p2.value = intrinsics.p2;
    mat.uniforms.omega.value = intrinsics.omega;
    mat.uniforms.sx1.value = intrinsics.sx1;
    mat.uniforms.sy1.value = intrinsics.sy1;

    // Update material properties using centralized transparency logic, with overrides
    const { transparent, depthWrite } = getMaterialTransparency(opacity);
    mat.visible = isMaterialVisible(opacity, visible);
    mat.transparent = forceTransparent || transparent;
    mat.depthWrite = forceDepthWrite !== undefined ? forceDepthWrite : depthWrite;
    mat.depthTest = depthTest;
    mat.needsUpdate = true;
  }, [map, opacity, color, undistortionEnabled, visible, camera, intrinsics, isFullFrame, planeWidth, planeHeight, depthTest, forceTransparent, forceDepthWrite]);

  return <primitive ref={materialRef} object={shaderMaterial} attach="material" />;
}
