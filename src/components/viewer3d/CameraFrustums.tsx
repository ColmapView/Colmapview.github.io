import { useMemo, useState, useRef, memo, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, extend } from '@react-three/fiber';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

// Extend R3F to recognize Line2 components
extend({ LineSegments2, LineSegmentsGeometry, LineMaterial });
import { Html } from '@react-three/drei';
import { useReconstructionStore, useCameraStore, useUIStore } from '../../store';
import type { SelectionColorMode } from '../../store/types';
import type { Camera, Image } from '../../types/colmap';
import { getImageFile } from '../../utils/imageFileUtils';
import { getImageWorldPosition, getImageWorldQuaternion } from '../../utils/colmapTransforms';
import { useFrustumTexture, useSelectedImageTexture, prioritizeFrustumTexture, pauseFrustumTextureCache, resumeFrustumTextureCache } from '../../hooks/useFrustumTexture';
import { VIZ_COLORS, RAINBOW, OPACITY, TIMING, hoverCardStyles, ICON_SIZES, getCameraColor, contextMenuStyles } from '../../theme';
import { rainbowColor } from '../../utils/colorUtils';

// Shared temp objects for color calculations
const tempColor = new THREE.Color();

// Temp objects for image plane culling (angle check)
const tempForward = new THREE.Vector3();
const tempViewDir = new THREE.Vector3();
const tempWorldPos = new THREE.Vector3();
const tempWorldQuat = new THREE.Quaternion();

// Temp objects for view frustum culling
const viewFrustum = new THREE.Frustum();
const projScreenMatrix = new THREE.Matrix4();

// Cosine thresholds for angle-based texture culling
const COS_45_DEG = Math.cos(Math.PI / 4); // ≈ 0.707 (for frustum mode with image planes)
const COS_90_DEG = Math.cos(Math.PI / 2); // = 0 (for imageplane mode - only cull when facing away)

// Custom shader material for lines with per-vertex alpha
const lineVertexShader = `
  attribute float alpha;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vColor = color;
    vAlpha = alpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const lineFragmentShader = `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

// Batched arrow rendering using instanced meshes (cylinder + cone)
interface BatchedArrowMeshesProps {
  frustums: {
    image: Image;
    camera: Camera;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    cameraIndex: number;
  }[];
  cameraScale: number;
  selectedImageId: number | null;
  hoveredImageId: number | null;
  matchedImageIds: Set<number>;
  matchesOpacity: number;
  matchesDisplayMode: 'off' | 'on' | 'blink';
  matchesColor: string;
  frustumColorMode: 'single' | 'byCamera';
  selectionColorMode: SelectionColorMode;
  selectionColor: string;
  selectionAnimationSpeed: number;
  unselectedCameraOpacity: number;
}

// Temp objects for instanced mesh updates
const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3(1, 1, 1);
const tempEuler = new THREE.Euler();

function BatchedArrowMeshes({
  frustums,
  cameraScale,
  selectedImageId,
  hoveredImageId,
  matchedImageIds,
  matchesOpacity: _matchesOpacity,
  matchesDisplayMode,
  matchesColor,
  frustumColorMode,
  selectionColorMode,
  selectionColor,
  selectionAnimationSpeed,
  unselectedCameraOpacity,
}: BatchedArrowMeshesProps) {
  const shaftRef = useRef<THREE.InstancedMesh>(null);
  const coneRef = useRef<THREE.InstancedMesh>(null);
  const rainbowHueRef = useRef(0);
  const matchesBlinkPhaseRef = useRef(0);

  // Arrow proportions (relative to cameraScale)
  const shaftLength = cameraScale * 0.8;
  const shaftRadius = cameraScale * 0.04;
  const coneLength = cameraScale * 0.2;
  const coneRadius = cameraScale * 0.08;

  // Create geometries once
  const shaftGeometry = useMemo(() => new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 8), [shaftRadius, shaftLength]);
  const coneGeometry = useMemo(() => new THREE.ConeGeometry(coneRadius, coneLength, 12), [coneRadius, coneLength]);

  // Create materials
  const shaftMaterial = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), []);
  const coneMaterial = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), []);

  // Update instance matrices and colors
  useFrame((state, delta) => {
    if (!shaftRef.current || !coneRef.current) return;
    const shaft = shaftRef.current;
    const cone = coneRef.current;

    // Check if animation is needed
    const isSelectionAnimated = (selectionColorMode === 'blink' || selectionColorMode === 'rainbow') && selectedImageId !== null;
    const isMatchesAnimated = matchesDisplayMode === 'blink' && matchedImageIds.size > 0;

    // Update animation phases
    if (isSelectionAnimated) {
      if (selectionColorMode === 'rainbow') {
        rainbowHueRef.current = (rainbowHueRef.current + delta * selectionAnimationSpeed * RAINBOW.speedMultiplier) % 1;
      }
      // blink uses clock.elapsedTime directly for sync across components
    }
    if (isMatchesAnimated) {
      matchesBlinkPhaseRef.current = (matchesBlinkPhaseRef.current + delta) % 2; // 2 second cycle synced with match lines
    }
    // Use clock time for blink to stay in sync across all components
    const blinkPhase = state.clock.elapsedTime * selectionAnimationSpeed * 2;

    frustums.forEach((f, i) => {
      const isSelected = f.image.imageId === selectedImageId;
      const isHovered = f.image.imageId === hoveredImageId;
      const isMatched = matchedImageIds.has(f.image.imageId);
      const isDimmed = selectedImageId !== null && !isSelected && !isMatched;

      // Hide selected arrow (will show image plane instead)
      if (isSelected) {
        tempScale.set(0, 0, 0);
      } else {
        tempScale.set(1, 1, 1);
      }

      // Determine color
      if (isHovered) {
        tempColor.set(VIZ_COLORS.frustum.hover);
      } else if (isSelected) {
        if (selectionColorMode === 'rainbow') {
          const hue = rainbowHueRef.current;
          const c = RAINBOW.chroma;
          const x = c * (1 - Math.abs((hue * 6) % 2 - 1));
          const m = RAINBOW.lightness - c / 2;
          let r = 0, g = 0, b = 0;
          const { hueSegments } = RAINBOW;
          if (hue < hueSegments.redToYellow) { r = c; g = x; }
          else if (hue < hueSegments.yellowToGreen) { r = x; g = c; }
          else if (hue < hueSegments.greenToCyan) { g = c; b = x; }
          else if (hue < hueSegments.cyanToBlue) { g = x; b = c; }
          else if (hue < hueSegments.blueToMagenta) { r = x; b = c; }
          else { r = c; b = x; }
          tempColor.setRGB(r + m, g + m, b + m);
        } else if (selectionColorMode === 'blink') {
          // Blink uses slight dimming (0.5-1.0) since we can't do true transparency per-instance
          const blinkFactor = (Math.sin(blinkPhase) + 1) / 2;
          const intensity = 0.5 + 0.5 * blinkFactor;
          tempColor.set(selectionColor);
          tempColor.multiplyScalar(intensity);
        } else {
          // static mode
          tempColor.set(selectionColor);
        }
      } else if (isMatched) {
        // Matched cameras use matchesColor
        if (matchesDisplayMode === 'blink') {
          // Use slight dimming (0.5-1.0) since we can't do true transparency per-instance
          const t = matchesBlinkPhaseRef.current;
          let blinkFactor: number;
          if (t < 0.3) {
            blinkFactor = t / 0.3;
          } else if (t < 0.6) {
            blinkFactor = 1;
          } else if (t < 1.0) {
            blinkFactor = 1 - (t - 0.6) / 0.4;
          } else {
            blinkFactor = 0;
          }
          const intensity = 0.5 + 0.5 * blinkFactor;
          tempColor.set(matchesColor);
          tempColor.multiplyScalar(intensity);
        } else {
          tempColor.set(matchesColor);
        }
      } else {
        const baseColor = frustumColorMode === 'byCamera'
          ? getCameraColor(f.cameraIndex)
          : VIZ_COLORS.frustum.default;
        tempColor.set(baseColor);
      }

      // Apply dimming
      if (isDimmed && !isHovered) {
        tempColor.multiplyScalar(OPACITY.dimmed);
      }

      // Calculate shaft transform - cylinder is Y-aligned, we need to rotate to face camera direction (Z)
      // Camera looks along local +Z, so we rotate from Y to Z
      tempEuler.set(Math.PI / 2, 0, 0); // Rotate 90° around X to align Y with Z
      tempQuaternion.setFromEuler(tempEuler);
      tempQuaternion.premultiply(f.quaternion); // Apply camera orientation

      // Shaft position: centered along the arrow direction
      tempPosition.set(0, 0, shaftLength / 2);
      tempPosition.applyQuaternion(f.quaternion);
      tempPosition.add(f.position);

      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      shaft.setMatrixAt(i, tempMatrix);
      shaft.setColorAt(i, tempColor);

      // Cone position: at the tip of the shaft
      tempPosition.set(0, 0, shaftLength + coneLength / 2);
      tempPosition.applyQuaternion(f.quaternion);
      tempPosition.add(f.position);

      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      cone.setMatrixAt(i, tempMatrix);
      cone.setColorAt(i, tempColor);
    });

    shaft.instanceMatrix.needsUpdate = true;
    cone.instanceMatrix.needsUpdate = true;
    if (shaft.instanceColor) shaft.instanceColor.needsUpdate = true;
    if (cone.instanceColor) cone.instanceColor.needsUpdate = true;
  });

  // Update material opacity - 0.9 when no selection, otherwise use unselectedCameraOpacity
  useEffect(() => {
    const opacity = selectedImageId === null ? 0.9 : unselectedCameraOpacity;
    shaftMaterial.opacity = opacity;
    coneMaterial.opacity = opacity;
  }, [unselectedCameraOpacity, shaftMaterial, coneMaterial, selectedImageId]);

  if (frustums.length === 0) return null;

  return (
    <>
      <instancedMesh ref={shaftRef} args={[shaftGeometry, shaftMaterial, frustums.length]} />
      <instancedMesh ref={coneRef} args={[coneGeometry, coneMaterial, frustums.length]} />
    </>
  );
}

// Batched frustum wireframe rendering (8 segments per frustum)
interface BatchedFrustumLinesProps {
  frustums: {
    image: Image;
    camera: Camera;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    cameraIndex: number;
  }[];
  cameraScale: number;
  selectedImageId: number | null;
  hoveredImageId: number | null;
  matchedImageIds: Set<number>;
  matchesOpacity: number;
  matchesDisplayMode: 'off' | 'on' | 'blink';
  matchesColor: string;
  frustumColorMode: 'single' | 'byCamera';
  selectionColorMode: SelectionColorMode;
  selectionColor: string;
  selectionAnimationSpeed: number;
  unselectedCameraOpacity: number;
  showImagePlanes: boolean;
}

function BatchedFrustumLines({
  frustums,
  cameraScale,
  selectedImageId,
  hoveredImageId,
  matchedImageIds,
  matchesOpacity,
  matchesDisplayMode,
  matchesColor,
  frustumColorMode,
  selectionColorMode,
  selectionColor,
  selectionAnimationSpeed,
  unselectedCameraOpacity,
  showImagePlanes,
}: BatchedFrustumLinesProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const rainbowHueRef = useRef(0);
  const matchesBlinkPhaseRef = useRef(0);
  // Track previous state to avoid unnecessary GPU uploads
  const prevStateRef = useRef<{
    selectedImageId: number | null;
    hoveredImageId: number | null;
    matchedImageIds: Set<number>;
    unselectedCameraOpacity: number;
    matchesOpacity: number;
    showImagePlanes: boolean;
  } | null>(null);

  // Build geometry with all frustums (8 segments per frustum = 16 vertices)
  const { positions, baseColors, baseAlphas } = useMemo(() => {
    // 8 segments * 2 vertices * 3 components = 48 floats per frustum
    const positions = new Float32Array(frustums.length * 48);
    const baseColors = new Float32Array(frustums.length * 48);
    // 8 segments * 2 vertices = 16 alphas per frustum
    const baseAlphas = new Float32Array(frustums.length * 16);

    frustums.forEach((f, i) => {
      const offset = i * 48;
      const alphaOffset = i * 16;

      // Compute frustum geometry in local space
      const aspectRatio = f.camera.width / f.camera.height;
      const focalLength = f.camera.params[0] || 1;
      const halfWidth = cameraScale * f.camera.width / (2 * focalLength);
      const halfHeight = halfWidth / aspectRatio;
      const depth = cameraScale;

      // Local space vertices
      const apex = new THREE.Vector3(0, 0, 0);
      const bl = new THREE.Vector3(-halfWidth, -halfHeight, depth);
      const br = new THREE.Vector3(halfWidth, -halfHeight, depth);
      const tr = new THREE.Vector3(halfWidth, halfHeight, depth);
      const tl = new THREE.Vector3(-halfWidth, halfHeight, depth);

      // Transform to world space
      apex.applyQuaternion(f.quaternion).add(f.position);
      bl.applyQuaternion(f.quaternion).add(f.position);
      br.applyQuaternion(f.quaternion).add(f.position);
      tr.applyQuaternion(f.quaternion).add(f.position);
      tl.applyQuaternion(f.quaternion).add(f.position);

      // 8 segments (16 vertices):
      // Segment 0: apex to bl
      positions[offset + 0] = apex.x; positions[offset + 1] = apex.y; positions[offset + 2] = apex.z;
      positions[offset + 3] = bl.x; positions[offset + 4] = bl.y; positions[offset + 5] = bl.z;
      // Segment 1: apex to br
      positions[offset + 6] = apex.x; positions[offset + 7] = apex.y; positions[offset + 8] = apex.z;
      positions[offset + 9] = br.x; positions[offset + 10] = br.y; positions[offset + 11] = br.z;
      // Segment 2: apex to tr
      positions[offset + 12] = apex.x; positions[offset + 13] = apex.y; positions[offset + 14] = apex.z;
      positions[offset + 15] = tr.x; positions[offset + 16] = tr.y; positions[offset + 17] = tr.z;
      // Segment 3: apex to tl
      positions[offset + 18] = apex.x; positions[offset + 19] = apex.y; positions[offset + 20] = apex.z;
      positions[offset + 21] = tl.x; positions[offset + 22] = tl.y; positions[offset + 23] = tl.z;
      // Segment 4: bl to br
      positions[offset + 24] = bl.x; positions[offset + 25] = bl.y; positions[offset + 26] = bl.z;
      positions[offset + 27] = br.x; positions[offset + 28] = br.y; positions[offset + 29] = br.z;
      // Segment 5: br to tr
      positions[offset + 30] = br.x; positions[offset + 31] = br.y; positions[offset + 32] = br.z;
      positions[offset + 33] = tr.x; positions[offset + 34] = tr.y; positions[offset + 35] = tr.z;
      // Segment 6: tr to tl
      positions[offset + 36] = tr.x; positions[offset + 37] = tr.y; positions[offset + 38] = tr.z;
      positions[offset + 39] = tl.x; positions[offset + 40] = tl.y; positions[offset + 41] = tl.z;
      // Segment 7: tl to bl
      positions[offset + 42] = tl.x; positions[offset + 43] = tl.y; positions[offset + 44] = tl.z;
      positions[offset + 45] = bl.x; positions[offset + 46] = bl.y; positions[offset + 47] = bl.z;

      // Base color for this camera
      const color = frustumColorMode === 'byCamera'
        ? getCameraColor(f.cameraIndex)
        : VIZ_COLORS.frustum.default;
      tempColor.set(color);

      // Set color and alpha for all 16 vertices
      for (let v = 0; v < 16; v++) {
        baseColors[offset + v * 3 + 0] = tempColor.r;
        baseColors[offset + v * 3 + 1] = tempColor.g;
        baseColors[offset + v * 3 + 2] = tempColor.b;
        baseAlphas[alphaOffset + v] = 1.0;
      }
    });

    return { positions, baseColors, baseAlphas };
  }, [frustums, cameraScale, frustumColorMode]);

  // Update colors and alphas based on selection, hover, selection color mode, opacity
  useFrame((state, delta) => {
    if (!geometryRef.current) return;

    const colorAttr = geometryRef.current.getAttribute('color') as THREE.BufferAttribute;
    const alphaAttr = geometryRef.current.getAttribute('alpha') as THREE.BufferAttribute;
    if (!colorAttr || !alphaAttr) return;

    // Check if animation is needed
    const isSelectionAnimated = (selectionColorMode === 'blink' || selectionColorMode === 'rainbow') && selectedImageId !== null;
    const isMatchesAnimated = matchesDisplayMode === 'blink' && matchedImageIds.size > 0;
    const isAnimated = isSelectionAnimated || isMatchesAnimated;

    // Check if state changed - skip update if static and unchanged
    const prev = prevStateRef.current;
    const stateChanged = !prev ||
      prev.selectedImageId !== selectedImageId ||
      prev.hoveredImageId !== hoveredImageId ||
      prev.matchedImageIds !== matchedImageIds ||
      prev.unselectedCameraOpacity !== unselectedCameraOpacity ||
      prev.matchesOpacity !== matchesOpacity ||
      prev.showImagePlanes !== showImagePlanes;

    // Skip GPU update if nothing changed and no animation is running
    if (!isAnimated && !stateChanged) return;

    // Update tracked state
    prevStateRef.current = { selectedImageId, hoveredImageId, matchedImageIds, unselectedCameraOpacity, matchesOpacity, showImagePlanes };

    const colors = colorAttr.array as Float32Array;
    const alphas = alphaAttr.array as Float32Array;

    // Update animation phases based on mode
    if (isSelectionAnimated) {
      if (selectionColorMode === 'rainbow') {
        rainbowHueRef.current = (rainbowHueRef.current + delta * selectionAnimationSpeed * RAINBOW.speedMultiplier) % 1;
      }
      // blink uses clock.elapsedTime directly for sync across components
    }
    if (isMatchesAnimated) {
      matchesBlinkPhaseRef.current = (matchesBlinkPhaseRef.current + delta) % 2; // 2 second cycle synced with match lines
    }
    // Use clock time for blink to stay in sync across all components
    const blinkPhase = state.clock.elapsedTime * selectionAnimationSpeed * 2;

    frustums.forEach((f, i) => {
      const offset = i * 48;
      const alphaOffset = i * 16;
      const isSelected = f.image.imageId === selectedImageId;
      const isHovered = f.image.imageId === hoveredImageId;
      const isMatched = matchedImageIds.has(f.image.imageId);
      const isDimmed = selectedImageId !== null && !isSelected && !isMatched;

      // Determine color
      if (isHovered) {
        tempColor.set(VIZ_COLORS.frustum.hover);
      } else if (isSelected) {
        if (selectionColorMode === 'rainbow') {
          // Rainbow color calculation
          const hue = rainbowHueRef.current;
          const c = RAINBOW.chroma;
          const x = c * (1 - Math.abs((hue * 6) % 2 - 1));
          const m = RAINBOW.lightness - c / 2;
          let r = 0, g = 0, b = 0;
          const { hueSegments } = RAINBOW;
          if (hue < hueSegments.redToYellow) { r = c; g = x; }
          else if (hue < hueSegments.yellowToGreen) { r = x; g = c; }
          else if (hue < hueSegments.greenToCyan) { g = c; b = x; }
          else if (hue < hueSegments.cyanToBlue) { g = x; b = c; }
          else if (hue < hueSegments.blueToMagenta) { r = x; b = c; }
          else { r = c; b = x; }
          tempColor.setRGB(r + m, g + m, b + m);
        } else if (selectionColorMode === 'blink') {
          // Blink: keep color at full brightness, will use opacity for blink effect
          tempColor.set(selectionColor);
        } else {
          // off or static: solid selected color
          tempColor.set(selectionColor);
        }
      } else if (isMatched) {
        // Matched cameras use matchesColor
        tempColor.set(matchesColor);
      } else {
        // Use base color
        tempColor.setRGB(baseColors[offset], baseColors[offset + 1], baseColors[offset + 2]);
      }

      // Calculate opacity (true alpha, not color darkening)
      // When no camera is selected, use 0.9 opacity for all
      let opacity = selectedImageId === null ? 0.9 : 1;
      if (selectedImageId !== null && !isSelected && !isHovered) opacity *= unselectedCameraOpacity;
      if (isDimmed && !isHovered) opacity *= OPACITY.dimmed;

      // Apply blink effect via opacity for selected camera
      if (isSelected && selectionColorMode === 'blink') {
        const blinkFactor = (Math.sin(blinkPhase) + 1) / 2;
        opacity *= 0.1 + 0.9 * blinkFactor;
      }

      // Apply blink effect via opacity for matched cameras
      if (isMatched) {
        if (matchesDisplayMode === 'blink') {
          const t = matchesBlinkPhaseRef.current;
          let blinkFactor: number;
          if (t < 0.3) {
            blinkFactor = t / 0.3;
          } else if (t < 0.6) {
            blinkFactor = 1;
          } else if (t < 1.0) {
            blinkFactor = 1 - (t - 0.6) / 0.4;
          } else {
            blinkFactor = 0;
          }
          opacity *= 0.1 + 0.9 * blinkFactor;
        } else {
          opacity *= matchesOpacity;
        }
      }

      // Hide wireframe when image plane is showing for this frustum
      // In frustum mode: selected frustum shows image plane, so hide its wireframe
      const hasImagePlane = isSelected || (showImagePlanes && selectedImageId === null);
      if (hasImagePlane) opacity = 0;

      // Set color and alpha for all 16 vertices
      for (let v = 0; v < 16; v++) {
        colors[offset + v * 3 + 0] = tempColor.r;
        colors[offset + v * 3 + 1] = tempColor.g;
        colors[offset + v * 3 + 2] = tempColor.b;
        alphas[alphaOffset + v] = opacity;
      }
    });

    colorAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  });

  // Initial colors array (full brightness, alpha handles opacity)
  const initialColors = useMemo(() => {
    return new Float32Array(baseColors);
  }, [baseColors]);

  // Initial alphas array - 0.9 when no selection, otherwise use unselectedCameraOpacity
  const initialAlphas = useMemo(() => {
    const alphas = new Float32Array(baseAlphas.length);
    const opacity = selectedImageId === null ? 0.9 : unselectedCameraOpacity;
    for (let i = 0; i < baseAlphas.length; i++) {
      alphas[i] = opacity;
    }
    return alphas;
  }, [baseAlphas.length, unselectedCameraOpacity, selectedImageId]);

  // Create shader material
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: lineVertexShader,
      fragmentShader: lineFragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
  }, []);

  if (frustums.length === 0) return null;

  return (
    <lineSegments material={shaderMaterial}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[initialColors, 3]}
        />
        <bufferAttribute
          attach="attributes-alpha"
          args={[initialAlphas, 1]}
        />
      </bufferGeometry>
    </lineSegments>
  );
}

// FOV adjustment constants
const FOV_MIN = 10;
const FOV_MAX = 120;
const FOV_STEP = 2;

// Frustum plane with texture and interaction (per-frustum component)
interface FrustumPlaneProps {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  camera: Camera;
  image: Image;
  scale: number;
  imageFile?: File;
  showImagePlane: boolean;
  isSelected: boolean;
  isMatched?: boolean;
  imagePlaneOpacity: number;
  color: string;
  cullAngleThreshold?: number; // Cosine of angle threshold for culling (default: COS_45_DEG)
  onHover: (id: number | null) => void;
  onClick: (imageId: number) => void;
  onDoubleClick: (imageId: number) => void;
  onContextMenu: (imageId: number) => void;
}

const FrustumPlane = memo(function FrustumPlane({
  position,
  quaternion,
  camera,
  image,
  scale,
  imageFile,
  showImagePlane,
  isSelected,
  isMatched = false,
  imagePlaneOpacity,
  color,
  cullAngleThreshold = COS_45_DEG,
  onHover,
  onClick,
  onDoubleClick,
  onContextMenu,
}: FrustumPlaneProps) {
  const [hovered, setHovered] = useState(false);
  const [viewAngleOk, setViewAngleOk] = useState(true);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { camera: threeCamera, controls } = useThree() as any;
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);

  // FOV adjustment state
  const cameraProjection = useCameraStore((s) => s.cameraProjection);
  const cameraFov = useCameraStore((s) => s.cameraFov);
  const setCameraFov = useCameraStore((s) => s.setCameraFov);

  // Selection color animation state (synced with point cloud)
  const selectionColorMode = useCameraStore((s) => s.selectionColorMode);
  const selectionAnimationSpeed = useCameraStore((s) => s.selectionAnimationSpeed);
  const rainbowHueRef = useRef(0);

  // Handle wheel to adjust FOV when hovering selected image in perspective mode
  useEffect(() => {
    if (!isSelected || !hovered || cameraProjection !== 'perspective') return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Signal to TrackballControls that we handled this wheel event
      if (controls?.wheelHandled) {
        controls.wheelHandled.current = true;
      }
      const delta = e.deltaY > 0 ? FOV_STEP : -FOV_STEP;
      const newFov = Math.max(FOV_MIN, Math.min(FOV_MAX, cameraFov + delta));
      setCameraFov(newFov);
    };

    // Use capture phase to intercept before controls
    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, [isSelected, hovered, cameraProjection, cameraFov, setCameraFov, controls]);

  // Check if camera controls are dragging (orbit/pan in progress)
  const isDragging = () => controls?.dragging?.current ?? false;

  // Load low-res texture for non-selected images (128px)
  const lowResTexture = useFrustumTexture(imageFile, image.name, showImagePlane && !isSelected);

  // Load high-res texture for selected image (original resolution)
  const highResTexture = useSelectedImageTexture(imageFile, image.name, isSelected && showImagePlane);

  // Use high-res when selected, fall back to low-res
  const texture = isSelected ? (highResTexture ?? lowResTexture) : lowResTexture;

  // Keep last valid texture to prevent flashing during camera movement
  // When texture loading is paused, we continue showing the previous texture
  const lastTextureRef = useRef<THREE.Texture | null>(null);
  if (texture) {
    lastTextureRef.current = texture;
  }
  const displayTexture = texture ?? lastTextureRef.current;

  // Show texture when available and viewing angle is good
  const shouldShowTexture = showImagePlane && displayTexture && viewAngleOk;

  // Update material properties when texture state changes (avoids material recreation)
  const prevTextureRef = useRef<THREE.Texture | null>(null);
  if (materialRef.current && prevTextureRef.current !== (shouldShowTexture ? displayTexture : null)) {
    materialRef.current.map = shouldShowTexture ? displayTexture : null;
    materialRef.current.needsUpdate = true;
    prevTextureRef.current = shouldShowTexture ? displayTexture : null;
  }

  // Compute plane size
  const planeSize = useMemo(() => {
    const aspectRatio = camera.width / camera.height;
    const focalLength = camera.params[0] || 1;
    const halfWidth = scale * camera.width / (2 * focalLength);
    const halfHeight = halfWidth / aspectRatio;
    return { width: halfWidth * 2, height: halfHeight * 2, depth: scale };
  }, [camera, scale]);

  // Border line for selected image (rectangle around the plane)
  const borderLine = useMemo(() => {
    const hw = planeSize.width / 2;
    const hh = planeSize.height / 2;
    const points = [
      new THREE.Vector3(-hw, -hh, 0),
      new THREE.Vector3(hw, -hh, 0),
      new THREE.Vector3(hw, hh, 0),
      new THREE.Vector3(-hw, hh, 0),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: VIZ_COLORS.frustum.selected, transparent: true });
    const line = new THREE.LineLoop(geometry, material);
    line.position.z = planeSize.depth;
    return line;
  }, [planeSize.width, planeSize.height, planeSize.depth]);

  // Viewing angle based texture culling and border color animation
  // Uses world coordinates to account for active transform
  useFrame((state, delta) => {
    // Animate border color when selected (synced with point cloud)
    if (isSelected && borderLine) {
      const mat = borderLine.material as THREE.LineBasicMaterial;
      if (selectionColorMode === 'rainbow') {
        rainbowHueRef.current = (rainbowHueRef.current + delta * selectionAnimationSpeed * RAINBOW.speedMultiplier) % 1;
        mat.color.copy(rainbowColor(rainbowHueRef.current));
      } else if (selectionColorMode === 'blink') {
        // Use clock time for blink to stay in sync across all components
        const blinkPhase = state.clock.elapsedTime * selectionAnimationSpeed * 2;
        const blinkFactor = (Math.sin(blinkPhase) + 1) / 2;
        // Use opacity variation instead of color darkening
        mat.opacity = 0.3 + 0.7 * blinkFactor;
        mat.color.set(color);
      } else {
        // static or off: solid color at full opacity
        mat.opacity = 1;
        mat.color.set(color);
      }
    }

    if (showImagePlane && groupRef.current) {
      // Never cull the selected camera
      if (isSelected) {
        if (!viewAngleOk) setViewAngleOk(true);
        return;
      }

      // Get world position and quaternion (includes parent transform)
      groupRef.current.getWorldPosition(tempWorldPos);
      groupRef.current.getWorldQuaternion(tempWorldQuat);

      const distanceToCamera = tempWorldPos.distanceTo(threeCamera.position);

      // Skip angle culling when viewer is close (within 3x the frustum scale)
      const isClose = distanceToCamera < scale * 3;
      if (isClose) {
        if (!viewAngleOk) setViewAngleOk(true);
        return;
      }

      // Frustum forward is +Z in world space (after transform)
      tempForward.set(0, 0, 1).applyQuaternion(tempWorldQuat);
      tempViewDir.copy(threeCamera.position).sub(tempWorldPos).normalize();
      // Dot product: positive means viewport camera is in front of the image plane
      const dotProduct = -tempForward.dot(tempViewDir);
      const angleOk = dotProduct >= cullAngleThreshold;
      if (viewAngleOk !== angleOk) setViewAngleOk(angleOk);
    }
  });

  const numPoints = image.points2D.filter(p => p.point3DId !== BigInt(-1)).length;
  const displayColor = hovered ? VIZ_COLORS.frustum.hover : color;

  return (
    <group ref={groupRef} position={position} quaternion={quaternion}>
      <mesh
        position={[0, 0, planeSize.depth]}
        onClick={(e) => { e.stopPropagation(); onClick(image.imageId); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(image.imageId); }}
        onContextMenu={(e) => { e.stopPropagation(); onContextMenu(image.imageId); }}
        onPointerOver={(e) => {
          // Ignore hover during camera orbit/pan
          if (isDragging()) return;
          e.stopPropagation();
          setHovered(true);
          setMousePos({ x: e.clientX, y: e.clientY });
          onHover(image.imageId);
          document.body.style.cursor = 'pointer';
        }}
        onPointerMove={(e) => {
          // Clear hover state if dragging started while hovering
          if (isDragging()) {
            if (hovered) {
              setHovered(false);
              setMousePos(null);
              onHover(null);
              document.body.style.cursor = 'auto';
            }
            return;
          }
          if (hovered) {
            setMousePos({ x: e.clientX, y: e.clientY });
          }
        }}
        onPointerOut={() => {
          setHovered(false);
          setMousePos(null);
          onHover(null);
          document.body.style.cursor = 'auto';
        }}
      >
        <planeGeometry args={[planeSize.width, planeSize.height]} />
        <meshBasicMaterial
          ref={materialRef}
          map={shouldShowTexture ? displayTexture : null}
          color={shouldShowTexture ? 0xffffff : displayColor}
          side={THREE.DoubleSide}
          transparent
          depthWrite={false}
          opacity={hovered
            ? (shouldShowTexture ? OPACITY.frustum.default : OPACITY.frustum.hoveredNoTexture)
            : (shouldShowTexture ? imagePlaneOpacity : imagePlaneOpacity * 0.2)}
        />
      </mesh>
      {isSelected && <primitive object={borderLine} />}
      {hovered && mousePos && (
        <Html
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
            pointerEvents: 'none',
            transform: 'none',
          }}
          calculatePosition={() => [0, 0]}
        >
          <div className={hoverCardStyles.container}>
            <div className={hoverCardStyles.title}>{image.name}</div>
            <div className={hoverCardStyles.subtitle}>#{image.imageId}</div>
            <div className={hoverCardStyles.subtitle}>{numPoints} points</div>
            <div className={hoverCardStyles.hint}>
              {isSelected && cameraProjection === 'perspective' && (
                <div className={hoverCardStyles.hintRow}>
                  <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="6" y="2" width="12" height="20" rx="6"/>
                    <path d="M12 6v4M12 14v4M9 8l3-3 3 3M9 16l3 3 3-3"/>
                  </svg>
                  Scroll: FOV
                </div>
              )}
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                {isSelected ? 'Left: info' : 'Left: select'}
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                {isMatched ? 'Right: matches' : 'Right: goto'}
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
});

// Invisible hit targets for arrow mode interactions
interface ArrowHitTargetProps {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  camera: Camera;
  image: Image;
  scale: number;
  isMatched?: boolean;
  onHover: (id: number | null) => void;
  onClick: (imageId: number) => void;
  onDoubleClick: (imageId: number) => void;
  onContextMenu: (imageId: number) => void;
}

const ArrowHitTarget = memo(function ArrowHitTarget({
  position,
  quaternion,
  camera: _camera,
  image,
  scale,
  isMatched = false,
  onHover,
  onClick,
  onDoubleClick,
  onContextMenu,
}: ArrowHitTargetProps) {
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { controls } = useThree() as any;

  // Check if camera controls are dragging (orbit/pan in progress)
  const isDragging = () => controls?.dragging?.current ?? false;

  const depth = scale;

  const numPoints = image.points2D.filter(p => p.point3DId !== BigInt(-1)).length;

  return (
    <group position={position} quaternion={quaternion}>
      <mesh
        position={[0, 0, depth / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onClick(image.imageId); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(image.imageId); }}
        onContextMenu={(e) => { e.stopPropagation(); onContextMenu(image.imageId); }}
        onPointerOver={(e) => {
          // Ignore hover during camera orbit/pan
          if (isDragging()) return;
          e.stopPropagation();
          setHovered(true);
          setMousePos({ x: e.clientX, y: e.clientY });
          onHover(image.imageId);
          document.body.style.cursor = 'pointer';
        }}
        onPointerMove={(e) => {
          // Clear hover state if dragging started while hovering
          if (isDragging()) {
            if (hovered) {
              setHovered(false);
              setMousePos(null);
              onHover(null);
              document.body.style.cursor = 'auto';
            }
            return;
          }
          if (hovered) {
            setMousePos({ x: e.clientX, y: e.clientY });
          }
        }}
        onPointerOut={() => {
          setHovered(false);
          setMousePos(null);
          onHover(null);
          document.body.style.cursor = 'auto';
        }}
      >
        <cylinderGeometry args={[0.025 * scale, 0.025 * scale, depth, 8]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {hovered && mousePos && (
        <Html
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
            pointerEvents: 'none',
            transform: 'none',
          }}
          calculatePosition={() => [0, 0]}
        >
          <div className={hoverCardStyles.container}>
            <div className={hoverCardStyles.title}>{image.name}</div>
            <div className={hoverCardStyles.subtitle}>#{image.imageId}</div>
            <div className={hoverCardStyles.subtitle}>{numPoints} points</div>
            <div className={hoverCardStyles.hint}>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Left: select
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                  <text x="18" y="18" fontSize="8" fill="currentColor" stroke="none">2</text>
                </svg>
                2xLeft: info
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                {isMatched ? 'Right: matches' : 'Right: goto'}
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
});

// Context menu for frustum right-click
interface FrustumContextMenuProps {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  planeDepth: number;
  planeWidth: number;
  planeHeight: number;
  onSelect: () => void;
  onGoto: () => void;
  onInfo: () => void;
  onClose: () => void;
}

const FrustumContextMenu = memo(function FrustumContextMenu({
  position,
  quaternion,
  planeDepth,
  planeWidth,
  planeHeight,
  onSelect,
  onGoto,
  onInfo,
  onClose,
}: FrustumContextMenuProps) {
  return (
    <group position={position} quaternion={quaternion}>
      <Html
        position={[planeWidth / 2, planeHeight / 2, planeDepth]}
        style={{ pointerEvents: 'auto' }}
      >
        <div
          className={contextMenuStyles.container}
          onMouseLeave={onClose}
        >
          <button className={contextMenuStyles.button} onClick={onSelect}>
            <svg className={contextMenuStyles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3" fill="currentColor"/>
            </svg>
            Select
          </button>
          <button className={contextMenuStyles.button} onClick={onGoto}>
            <svg className={contextMenuStyles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            Go to
          </button>
          <button className={contextMenuStyles.button} onClick={onInfo}>
            <svg className={contextMenuStyles.icon} viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2.5"/>
              <rect x="9.5" y="10" width="5" height="12" rx="1"/>
            </svg>
            Info
          </button>
        </div>
      </Html>
    </group>
  );
});

// Context menu state type
interface ContextMenuState {
  imageId: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  planeDepth: number;
  planeWidth: number;
  planeHeight: number;
}

export function CameraFrustums() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const cameraDisplayMode = useCameraStore((s) => s.cameraDisplayMode);
  const cameraScale = useCameraStore((s) => s.cameraScale);
  const selectedImageId = useCameraStore((s) => s.selectedImageId);
  const setSelectedImageId = useCameraStore((s) => s.setSelectedImageId);
  const imagePlaneOpacity = useCameraStore((s) => s.imagePlaneOpacity);

  // Image planes are shown in 'imageplane' mode
  const showImagePlanes = cameraDisplayMode === 'imageplane';
  const openImageDetail = useUIStore((s) => s.openImageDetail);
  const setMatchedImageId = useUIStore((s) => s.setMatchedImageId);
  const setShowMatchesInModal = useUIStore((s) => s.setShowMatchesInModal);
  const flyToImage = useCameraStore((s) => s.flyToImage);
  const selectionColorMode = useCameraStore((s) => s.selectionColorMode);
  const selectionColor = useCameraStore((s) => s.selectionColor);
  const selectionAnimationSpeed = useCameraStore((s) => s.selectionAnimationSpeed);
  const imageLoadMode = useUIStore((s) => s.imageLoadMode);
  const frustumColorMode = useCameraStore((s) => s.frustumColorMode);
  const unselectedCameraOpacity = useCameraStore((s) => s.unselectedCameraOpacity);
  const matchesDisplayMode = useUIStore((s) => s.matchesDisplayMode);
  const matchesOpacity = useUIStore((s) => s.matchesOpacity);
  const matchesColor = useUIStore((s) => s.matchesColor);

  // Hovered image ID for arrow mode (batched rendering needs this at parent level)
  const [hoveredImageId, setHoveredImageId] = useState<number | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Camera movement detection - pauses texture loading during orbit/pan
  const { camera: threeCamera } = useThree();
  const lastCameraPosRef = useRef(new THREE.Vector3());
  const lastCameraQuatRef = useRef(new THREE.Quaternion());
  const lastMoveTimeRef = useRef(0);
  const isCameraMovingRef = useRef(false);

  // Detect camera movement and debounce texture loading (no setTimeout, pure frame-based)
  useFrame(() => {
    const posMoved = lastCameraPosRef.current.distanceToSquared(threeCamera.position) > 0.0001;
    const quatMoved = lastCameraQuatRef.current.angleTo(threeCamera.quaternion) > 0.001;
    const now = performance.now();

    if (posMoved || quatMoved) {
      lastCameraPosRef.current.copy(threeCamera.position);
      lastCameraQuatRef.current.copy(threeCamera.quaternion);
      lastMoveTimeRef.current = now;
      if (!isCameraMovingRef.current) {
        isCameraMovingRef.current = true;
        pauseFrustumTextureCache();
      }
    } else if (isCameraMovingRef.current && now - lastMoveTimeRef.current > TIMING.transitionBase) {
      isCameraMovingRef.current = false;
      resumeFrustumTextureCache();
      visibilityNeedsUpdate.current = true; // Trigger view frustum culling update
    }
  });

  // View frustum culling state - only render frustums visible in the camera's view
  const [visibleFrustumIds, setVisibleFrustumIds] = useState<Set<number>>(() => new Set());
  const visibilityNeedsUpdate = useRef(true);

  // Extract imageFiles to avoid recalculating when other loadedFiles properties change
  const imageFiles = loadedFiles?.imageFiles;

  // Build a map from cameraId to index for consistent coloring
  const cameraIdToIndex = useMemo(() => {
    if (!reconstruction) return new Map<number, number>();
    const map = new Map<number, number>();
    let index = 0;
    for (const cameraId of reconstruction.cameras.keys()) {
      map.set(cameraId, index++);
    }
    return map;
  }, [reconstruction]);

  // Compute matched image IDs when matches are shown
  const matchedImageIds = useMemo(() => {
    if (!reconstruction || selectedImageId === null || matchesDisplayMode === 'off') {
      return new Set<number>();
    }
    const selectedImage = reconstruction.images.get(selectedImageId);
    if (!selectedImage) return new Set<number>();

    const matched = new Set<number>();
    for (const point2D of selectedImage.points2D) {
      if (point2D.point3DId === BigInt(-1)) continue;
      const point3D = reconstruction.points3D.get(point2D.point3DId);
      if (!point3D) continue;
      for (const trackElem of point3D.track) {
        if (trackElem.imageId !== selectedImageId) {
          matched.add(trackElem.imageId);
        }
      }
    }
    return matched;
  }, [reconstruction, selectedImageId, matchesDisplayMode]);

  // Trigger visibility update when matched images change
  useEffect(() => {
    visibilityNeedsUpdate.current = true;
  }, [matchedImageIds]);

  const frustums = useMemo(() => {
    if (!reconstruction || cameraDisplayMode === 'off') return [];

    const result: {
      image: Image;
      camera: Camera;
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      imageFile?: File;
      cameraIndex: number;
    }[] = [];

    for (const image of reconstruction.images.values()) {
      const camera = reconstruction.cameras.get(image.cameraId);
      if (!camera) continue;

      result.push({
        image,
        camera,
        position: getImageWorldPosition(image),
        quaternion: getImageWorldQuaternion(image),
        imageFile: getImageFile(imageFiles, image.name),
        cameraIndex: cameraIdToIndex.get(image.cameraId) ?? 0,
      });
    }

    return result;
  }, [reconstruction, cameraDisplayMode, imageFiles, cameraIdToIndex]);

  // Compute visible frustums using view frustum culling
  // Updates when camera stops moving to avoid per-frame computation
  useFrame(({ camera }) => {
    // Only update when camera has stopped moving and update is needed
    if (isCameraMovingRef.current || !visibilityNeedsUpdate.current) return;
    if (frustums.length === 0) return;

    visibilityNeedsUpdate.current = false;

    // Build the view frustum from the camera
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    viewFrustum.setFromProjectionMatrix(projScreenMatrix);

    // Check each frustum position against the view frustum
    const newVisible = new Set<number>();
    for (const f of frustums) {
      const imageId = f.image.imageId;
      // Always include selected, hovered, and matched
      if (imageId === selectedImageId || imageId === hoveredImageId || matchedImageIds.has(imageId)) {
        newVisible.add(imageId);
        continue;
      }
      // Check if position is within view frustum
      if (viewFrustum.containsPoint(f.position)) {
        newVisible.add(imageId);
      }
    }

    // Only update state if the set changed
    if (newVisible.size !== visibleFrustumIds.size ||
        [...newVisible].some(id => !visibleFrustumIds.has(id))) {
      setVisibleFrustumIds(newVisible);
    }
  });

  // Filter frustums based on view frustum culling
  // Show all if visibility hasn't been computed yet, otherwise only show visible ones
  // Always include: selected, hovered, and matched images
  const visibleFrustums = useMemo(() => {
    if (visibleFrustumIds.size === 0) return frustums; // Show all until first computation
    return frustums.filter(f =>
      visibleFrustumIds.has(f.image.imageId) ||
      f.image.imageId === selectedImageId ||
      f.image.imageId === hoveredImageId ||
      matchedImageIds.has(f.image.imageId)
    );
  }, [frustums, visibleFrustumIds, selectedImageId, hoveredImageId, matchedImageIds]);

  // Callbacks for arrow hit targets - use stable references to avoid breaking memo
  const handleArrowClick = useCallback((imageId: number) => {
    setContextMenu(null); // Close context menu on click
    if (imageId === selectedImageId) {
      // Clicking already selected image opens info panel
      openImageDetail(imageId);
    } else {
      // Clicking unselected image selects it
      setSelectedImageId(imageId);
    }
  }, [selectedImageId, setSelectedImageId, openImageDetail]);

  const handleArrowDoubleClick = useCallback((imageId: number) => {
    setContextMenu(null);
    openImageDetail(imageId);
  }, [openImageDetail]);

  // Right-click callback - if matched camera, show matches; otherwise select and go to the image
  const handleArrowContextMenu = useCallback((imageId: number) => {
    const frustum = frustums.find(f => f.image.imageId === imageId);
    if (!frustum) return;

    // Check if this is a matched camera (shares points with the selected camera)
    if (selectedImageId !== null && matchedImageIds.has(imageId)) {
      // Open image detail for the selected camera with this as the matched image
      setShowMatchesInModal(true);
      setMatchedImageId(imageId);
      openImageDetail(selectedImageId);
      // Need to set matchedImageId after openImageDetail since it resets it
      setTimeout(() => setMatchedImageId(imageId), 0);
      return;
    }

    // Prioritize texture loading, select, and fly to the image
    if (frustum.imageFile) {
      prioritizeFrustumTexture(frustum.imageFile, frustum.image.name);
    }
    setSelectedImageId(imageId);
    flyToImage(imageId);
  }, [frustums, flyToImage, setSelectedImageId, selectedImageId, matchedImageIds, openImageDetail, setMatchedImageId, setShowMatchesInModal]);

  // Helper to prioritize texture loading for an image
  const prioritizeTextureForImage = useCallback((imageId: number) => {
    const frustum = frustums.find(f => f.image.imageId === imageId);
    if (frustum?.imageFile) {
      prioritizeFrustumTexture(frustum.imageFile, frustum.image.name);
    }
  }, [frustums]);

  // Context menu action handlers
  const handleContextMenuSelect = useCallback(() => {
    if (contextMenu) {
      prioritizeTextureForImage(contextMenu.imageId);
      setSelectedImageId(contextMenu.imageId);
      setContextMenu(null);
    }
  }, [contextMenu, setSelectedImageId, prioritizeTextureForImage]);

  const handleContextMenuGoto = useCallback(() => {
    if (contextMenu) {
      prioritizeTextureForImage(contextMenu.imageId);
      flyToImage(contextMenu.imageId);
      setContextMenu(null);
    }
  }, [contextMenu, flyToImage, prioritizeTextureForImage]);

  const handleContextMenuInfo = useCallback(() => {
    if (contextMenu) {
      openImageDetail(contextMenu.imageId);
      setContextMenu(null);
    }
  }, [contextMenu, openImageDetail]);

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  if (cameraDisplayMode === 'off' || frustums.length === 0) return null;

  // Arrow mode: use batched rendering for efficiency
  if (cameraDisplayMode === 'arrow') {
    // Find selected frustum for image plane display
    const selectedFrustum = selectedImageId !== null
      ? frustums.find(f => f.image.imageId === selectedImageId)
      : null;

    return (
      <group>
        {/* Instanced meshes for all cone arrows */}
        <BatchedArrowMeshes
          frustums={frustums}
          cameraScale={cameraScale}
          selectedImageId={selectedImageId}
          hoveredImageId={hoveredImageId}
          matchedImageIds={matchedImageIds}
          matchesOpacity={matchesOpacity}
          matchesDisplayMode={matchesDisplayMode}
          matchesColor={matchesColor}
          frustumColorMode={frustumColorMode}
          selectionColorMode={selectionColorMode}
          selectionColor={selectionColor}
          selectionAnimationSpeed={selectionAnimationSpeed}
          unselectedCameraOpacity={unselectedCameraOpacity}
        />
        {/* Image plane for selected camera (replaces arrow) */}
        {selectedFrustum && imageLoadMode !== 'skip' && (
          <FrustumPlane
            position={selectedFrustum.position}
            quaternion={selectedFrustum.quaternion}
            camera={selectedFrustum.camera}
            image={selectedFrustum.image}
            scale={cameraScale}
            imageFile={selectedFrustum.imageFile}
            showImagePlane={true}
            isSelected={true}
            imagePlaneOpacity={0.8}
            color={selectionColorMode === 'rainbow' ? VIZ_COLORS.frustum.selected : selectionColor}
            onHover={setHoveredImageId}
            onClick={handleArrowClick}
            onDoubleClick={handleArrowDoubleClick}
            onContextMenu={handleArrowContextMenu}
          />
        )}
        {/* Individual invisible hit targets for interactions (view frustum culled) */}
        {/* Skip selected image - it uses FrustumPlane for interaction instead */}
        {visibleFrustums
          .filter(f => f.image.imageId !== selectedImageId)
          .map((f) => (
            <ArrowHitTarget
              key={f.image.imageId}
              position={f.position}
              quaternion={f.quaternion}
              camera={f.camera}
              image={f.image}
              scale={cameraScale}
              isMatched={matchedImageIds.has(f.image.imageId)}
              onHover={setHoveredImageId}
              onClick={handleArrowClick}
              onDoubleClick={handleArrowDoubleClick}
              onContextMenu={handleArrowContextMenu}
            />
          ))}
        {/* Context menu */}
        {contextMenu && (
          <FrustumContextMenu
            position={contextMenu.position}
            quaternion={contextMenu.quaternion}
            planeDepth={contextMenu.planeDepth}
            planeWidth={contextMenu.planeWidth}
            planeHeight={contextMenu.planeHeight}
            onSelect={handleContextMenuSelect}
            onGoto={handleContextMenuGoto}
            onInfo={handleContextMenuInfo}
            onClose={handleContextMenuClose}
          />
        )}
      </group>
    );
  }

  // Image plane mode: only image planes, no wireframes
  if (cameraDisplayMode === 'imageplane') {
    return (
      <group>
        {/* Per-frustum planes for texture + interaction (view frustum culled) */}
        {visibleFrustums.map((f) => {
          const isSelected = f.image.imageId === selectedImageId;
          const isMatched = matchedImageIds.has(f.image.imageId);
          let frustumColor: string;
          if (isSelected) {
            frustumColor = selectionColorMode === 'rainbow' ? VIZ_COLORS.frustum.selected : selectionColor;
          } else if (isMatched) {
            frustumColor = matchesColor;
          } else if (frustumColorMode === 'byCamera') {
            frustumColor = getCameraColor(f.cameraIndex);
          } else {
            frustumColor = VIZ_COLORS.frustum.default;
          }
          // When no camera is selected, use 0.9 opacity for all
          const planeOpacity = selectedImageId === null ? 0.9 : imagePlaneOpacity;
          return (
            <FrustumPlane
              key={f.image.imageId}
              position={f.position}
              quaternion={f.quaternion}
              camera={f.camera}
              image={f.image}
              scale={cameraScale}
              imageFile={f.imageFile}
              showImagePlane={imageLoadMode !== 'skip' && (selectedImageId === null || isSelected)}
              isSelected={isSelected}
              isMatched={isMatched}
              imagePlaneOpacity={planeOpacity}
              color={frustumColor}
              cullAngleThreshold={COS_90_DEG}
              onHover={setHoveredImageId}
              onClick={handleArrowClick}
              onDoubleClick={handleArrowDoubleClick}
              onContextMenu={handleArrowContextMenu}
            />
          );
        })}
        {/* Context menu */}
        {contextMenu && (
          <FrustumContextMenu
            position={contextMenu.position}
            quaternion={contextMenu.quaternion}
            planeDepth={contextMenu.planeDepth}
            planeWidth={contextMenu.planeWidth}
            planeHeight={contextMenu.planeHeight}
            onSelect={handleContextMenuSelect}
            onGoto={handleContextMenuGoto}
            onInfo={handleContextMenuInfo}
            onClose={handleContextMenuClose}
          />
        )}
      </group>
    );
  }

  // Frustum mode: use batched lines + individual planes for textures
  return (
    <group>
      {/* Single batched geometry for all frustum wireframes */}
      <BatchedFrustumLines
        frustums={frustums}
        cameraScale={cameraScale}
        selectedImageId={selectedImageId}
        hoveredImageId={hoveredImageId}
        matchedImageIds={matchedImageIds}
        matchesOpacity={matchesOpacity}
        matchesDisplayMode={matchesDisplayMode}
        matchesColor={matchesColor}
        frustumColorMode={frustumColorMode}
        selectionColorMode={selectionColorMode}
        selectionColor={selectionColor}
        selectionAnimationSpeed={selectionAnimationSpeed}
        unselectedCameraOpacity={unselectedCameraOpacity}
        showImagePlanes={showImagePlanes}
      />
      {/* Per-frustum planes for texture + interaction (view frustum culled) */}
      {visibleFrustums.map((f) => {
          // Determine frustum color based on mode (for plane fallback color)
          const isSelected = f.image.imageId === selectedImageId;
          const isMatched = matchedImageIds.has(f.image.imageId);
          const isDimmed = selectedImageId !== null && !isSelected && !isMatched;
          let frustumColor: string;
          if (isSelected) {
            frustumColor = selectionColorMode === 'rainbow' ? VIZ_COLORS.frustum.selected : selectionColor;
          } else if (isMatched) {
            frustumColor = matchesColor;
          } else if (frustumColorMode === 'byCamera') {
            frustumColor = getCameraColor(f.cameraIndex);
          } else {
            frustumColor = VIZ_COLORS.frustum.default;
          }
          // Compute plane opacity - selected image uses fixed 0.8, others use unselectedCameraOpacity
          let planeOpacity = isSelected ? 0.8 : imagePlaneOpacity * unselectedCameraOpacity;
          if (isDimmed) planeOpacity *= OPACITY.dimmed;
          if (isMatched) planeOpacity *= matchesOpacity;
          return (
            <FrustumPlane
              key={f.image.imageId}
              position={f.position}
              quaternion={f.quaternion}
              camera={f.camera}
              image={f.image}
              scale={cameraScale}
              imageFile={f.imageFile}
              showImagePlane={imageLoadMode !== 'skip' && isSelected}
              isSelected={isSelected}
              isMatched={isMatched}
              imagePlaneOpacity={planeOpacity}
              color={frustumColor}
              onHover={setHoveredImageId}
              onClick={handleArrowClick}
              onDoubleClick={handleArrowDoubleClick}
              onContextMenu={handleArrowContextMenu}
            />
          );
        })}
      {/* Context menu */}
      {contextMenu && (
        <FrustumContextMenu
          position={contextMenu.position}
          quaternion={contextMenu.quaternion}
          planeDepth={contextMenu.planeDepth}
          planeWidth={contextMenu.planeWidth}
          planeHeight={contextMenu.planeHeight}
          onSelect={handleContextMenuSelect}
          onGoto={handleContextMenuGoto}
          onInfo={handleContextMenuInfo}
          onClose={handleContextMenuClose}
        />
      )}
    </group>
  );
}

export function CameraMatches() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const selectedImageId = useCameraStore((s) => s.selectedImageId);
  const cameraDisplayMode = useCameraStore((s) => s.cameraDisplayMode);
  const matchesDisplayMode = useUIStore((s) => s.matchesDisplayMode);
  const matchesOpacity = useUIStore((s) => s.matchesOpacity);
  const matchesColor = useUIStore((s) => s.matchesColor);
  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const blinkPhaseRef = useRef(0);

  // Animate blink effect
  useFrame((_, delta) => {
    if (matchesDisplayMode === 'blink' && materialRef.current) {
      // Blink: quick flash on, longer off
      blinkPhaseRef.current = (blinkPhaseRef.current + delta) % 2; // 2 second cycle
      const t = blinkPhaseRef.current;
      let blinkFactor: number;
      if (t < 0.3) {
        // Fade in (0 to 0.3s)
        blinkFactor = t / 0.3;
      } else if (t < 0.6) {
        // Hold bright (0.3 to 0.6s)
        blinkFactor = 1;
      } else if (t < 1.0) {
        // Fade out (0.6 to 1.0s)
        blinkFactor = 1 - (t - 0.6) / 0.4;
      } else {
        // Stay off (1.0 to 3.0s)
        blinkFactor = 0;
      }
      materialRef.current.opacity = matchesOpacity * (0.1 + 0.9 * blinkFactor);
    }
  });

  // Build geometry with all line segments in a single buffer
  const geometry = useMemo(() => {
    // Hide match lines when cameras are hidden or in imageplane mode
    if (!reconstruction || selectedImageId === null || matchesDisplayMode === 'off' || cameraDisplayMode === 'off' || cameraDisplayMode === 'imageplane') return null;

    const selectedImage = reconstruction.images.get(selectedImageId);
    if (!selectedImage) return null;

    const selectedPos = getImageWorldPosition(selectedImage);
    const matchedImageIds = new Set<number>();

    for (const point2D of selectedImage.points2D) {
      if (point2D.point3DId === BigInt(-1)) continue;

      const point3D = reconstruction.points3D.get(point2D.point3DId);
      if (!point3D) continue;

      for (const trackElem of point3D.track) {
        if (trackElem.imageId !== selectedImageId) {
          matchedImageIds.add(trackElem.imageId);
        }
      }
    }

    if (matchedImageIds.size === 0) return null;

    // Build flat array of positions: [start1, end1, start2, end2, ...]
    const positions: number[] = [];

    for (const matchedId of matchedImageIds) {
      const matchedImage = reconstruction.images.get(matchedId);
      if (!matchedImage) continue;

      const matchedPos = getImageWorldPosition(matchedImage);
      // Start point
      positions.push(selectedPos.x, selectedPos.y, selectedPos.z);
      // End point
      positions.push(matchedPos.x, matchedPos.y, matchedPos.z);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [reconstruction, selectedImageId, matchesDisplayMode, cameraDisplayMode]);

  if (matchesDisplayMode === 'off' || cameraDisplayMode === 'off' || cameraDisplayMode === 'imageplane' || !geometry) return null;

  return (
    <lineSegments geometry={geometry} renderOrder={999}>
      <lineBasicMaterial
        ref={materialRef}
        color={matchesColor}
        transparent
        opacity={matchesOpacity}
        depthTest={false}
      />
    </lineSegments>
  );
}
