import { Suspense, useMemo, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PointCloud } from './PointCloud';
import { CameraFrustums, CameraMatches } from './CameraFrustums';
import { ViewerControls } from './ViewerControls';
import { useReconstructionStore, useViewerStore } from '../../store';
import { getImageWorldPosition, getImageWorldPose } from '../../utils/colmapTransforms';
import { CAMERA, CONTROLS, VIZ_COLORS, OPACITY, SIZE, ICON_SIZES, footerStyles } from '../../theme';

interface TrackballControlsProps {
  target: [number, number, number];
  radius: number;
  resetTrigger: number;
}

function TrackballControls({ target, radius, resetTrigger }: TrackballControlsProps) {
  const { camera, gl } = useThree();
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const flyToImageId = useViewerStore((s) => s.flyToImageId);
  const clearFlyTo = useViewerStore((s) => s.clearFlyTo);
  const cameraMode = useViewerStore((s) => s.cameraMode);
  const flySpeed = useViewerStore((s) => s.flySpeed);

  const isDragging = useRef(false);
  const isPanning = useRef(false);
  const targetVec = useRef(new THREE.Vector3(...target));
  const cameraQuat = useRef(new THREE.Quaternion());
  const distance = useRef(5);
  const targetDistance = useRef(5);
  const lastResetTrigger = useRef(resetTrigger);
  const angularVelocity = useRef({ x: 0, y: 0 });
  const lastMouse = useRef({ x: 0, y: 0 });
  const lastTime = useRef(performance.now());
  const quatX = useRef(new THREE.Quaternion());
  const quatY = useRef(new THREE.Quaternion());

  // Fly mode state
  const keysPressed = useRef<Set<string>>(new Set());
  const flyVelocity = useRef(new THREE.Vector3());

  const rotateSpeed = CONTROLS.rotateSpeed;
  const panSpeed = CONTROLS.panSpeed;
  const zoomSpeed = CONTROLS.zoomSpeed;
  const damping = CONTROLS.damping;
  const minVelocity = CONTROLS.minVelocity;
  const flyDamping = CONTROLS.flyDamping;

  const applyRotation = (deltaX: number, deltaY: number) => {
    if (Math.abs(deltaX) < 1e-10 && Math.abs(deltaY) < 1e-10) return;

    const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuat.current);
    const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuat.current);

    quatY.current.setFromAxisAngle(localY, -deltaX);
    quatX.current.setFromAxisAngle(localX, -deltaY);

    cameraQuat.current.premultiply(quatX.current);
    cameraQuat.current.premultiply(quatY.current);
    cameraQuat.current.normalize();
  };

  const updateCamera = () => {
    if (cameraMode === 'orbit') {
      const offset = new THREE.Vector3(0, 0, distance.current);
      offset.applyQuaternion(cameraQuat.current);

      camera.position.copy(targetVec.current).add(offset);
      camera.quaternion.copy(cameraQuat.current);
    } else {
      // Fly mode: camera position is independent, just update quaternion
      camera.quaternion.copy(cameraQuat.current);
    }
  };

  const updateKeyboardMovement = () => {
    // Shift = speed boost
    const shiftMultiplier = keysPressed.current.has('shift') ? CONTROLS.shiftSpeedBoost : 1;
    const moveSpeed = radius * CONTROLS.moveSpeedMultiplier * flySpeed * shiftMultiplier;
    const acceleration = new THREE.Vector3();

    // Get camera direction vectors
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuat.current);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuat.current);
    const up = new THREE.Vector3(0, 1, 0);

    // WASD movement
    if (keysPressed.current.has('w') || keysPressed.current.has('arrowup')) {
      acceleration.add(forward.clone().multiplyScalar(moveSpeed));
    }
    if (keysPressed.current.has('s') || keysPressed.current.has('arrowdown')) {
      acceleration.add(forward.clone().multiplyScalar(-moveSpeed));
    }
    if (keysPressed.current.has('a') || keysPressed.current.has('arrowleft')) {
      acceleration.add(right.clone().multiplyScalar(-moveSpeed));
    }
    if (keysPressed.current.has('d') || keysPressed.current.has('arrowright')) {
      acceleration.add(right.clone().multiplyScalar(moveSpeed));
    }
    // Q/E for down/up, Space also for up
    if (keysPressed.current.has('e') || keysPressed.current.has(' ')) {
      acceleration.add(up.clone().multiplyScalar(moveSpeed));
    }
    if (keysPressed.current.has('q')) {
      acceleration.add(up.clone().multiplyScalar(-moveSpeed));
    }

    // Apply acceleration and damping
    flyVelocity.current.add(acceleration);
    flyVelocity.current.multiplyScalar(flyDamping);

    // Update based on mode
    if (flyVelocity.current.length() > 0.0001) {
      if (cameraMode === 'fly') {
        // Fly mode: move camera position directly
        camera.position.add(flyVelocity.current);
      } else {
        // Orbit mode: move target (and camera follows)
        targetVec.current.add(flyVelocity.current);
      }
      return true;
    }
    return false;
  };

  useFrame(() => {
    let needsUpdate = false;

    if (cameraMode === 'orbit') {
      // Smooth zoom transition
      if (Math.abs(targetDistance.current - distance.current) > 0.0001) {
        distance.current += (targetDistance.current - distance.current) * CAMERA.zoomTransitionFactor;
        needsUpdate = true;
      }

      // Apply rotation inertia
      if (!isDragging.current) {
        const vx = angularVelocity.current.x;
        const vy = angularVelocity.current.y;

        if (Math.abs(vx) > minVelocity || Math.abs(vy) > minVelocity) {
          applyRotation(vx, vy);
          needsUpdate = true;

          angularVelocity.current.x *= damping;
          angularVelocity.current.y *= damping;
        }
      }

      // Handle keyboard movement (pans target in orbit mode)
      const keyboardMoved = updateKeyboardMovement();
      if (keyboardMoved) {
        needsUpdate = true;
      }

      if (needsUpdate) {
        updateCamera();
      }
    } else {
      // Fly mode
      let needsQuatUpdate = false;

      // Apply rotation inertia
      if (!isDragging.current) {
        const vx = angularVelocity.current.x;
        const vy = angularVelocity.current.y;

        if (Math.abs(vx) > minVelocity || Math.abs(vy) > minVelocity) {
          applyRotation(vx, vy);
          needsQuatUpdate = true;

          angularVelocity.current.x *= damping;
          angularVelocity.current.y *= damping;
        }
      }

      // Update position from keyboard/scroll movement
      updateKeyboardMovement();

      // Only update quaternion once if needed
      if (needsQuatUpdate) {
        camera.quaternion.copy(cameraQuat.current);
      }
    }
  });

  useEffect(() => {
    targetVec.current.set(...target);
    const isReset = resetTrigger !== lastResetTrigger.current;
    lastResetTrigger.current = resetTrigger;

    if (isReset || distance.current === 5) {
      distance.current = Math.max(CONTROLS.minDistance, radius * CAMERA.initialDistanceMultiplier);
      targetDistance.current = distance.current;

      const sqrt2_2 = Math.SQRT1_2;
      const camOffset = new THREE.Vector3(-0.5, -sqrt2_2, -0.5).normalize()
        .multiplyScalar(distance.current);
      const camPos = targetVec.current.clone().add(camOffset);
      const upDir = new THREE.Vector3(0.5, -sqrt2_2, 0.5).normalize();
      const lookMatrix = new THREE.Matrix4();
      lookMatrix.lookAt(camPos, targetVec.current, upDir);
      cameraQuat.current.setFromRotationMatrix(lookMatrix);

      // Reset camera position and quaternion directly for both modes
      camera.position.copy(camPos);
      camera.quaternion.copy(cameraQuat.current);

      // Clear any movement velocities
      angularVelocity.current.x = 0;
      angularVelocity.current.y = 0;
      flyVelocity.current.set(0, 0, 0);
    }
  }, [target[0], target[1], target[2], radius, resetTrigger, camera]);

  useEffect(() => {
    if (flyToImageId === null || !reconstruction) return;

    const image = reconstruction.images.get(flyToImageId);
    if (!image) {
      clearFlyTo();
      return;
    }

    const { position: camPos, quaternion: worldFromCamQuat } = getImageWorldPose(image);

    const flipRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    const threeJsCamQuat = worldFromCamQuat.clone().multiply(flipRotation);

    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(threeJsCamQuat);
    const newTarget = camPos.clone().add(lookDir.multiplyScalar(distance.current));

    targetVec.current.copy(newTarget);
    cameraQuat.current.copy(threeJsCamQuat);
    angularVelocity.current.x = 0;
    angularVelocity.current.y = 0;
    flyVelocity.current.set(0, 0, 0);
    targetDistance.current = distance.current;

    // Set camera position and quaternion directly for both modes
    camera.position.copy(camPos);
    camera.quaternion.copy(threeJsCamQuat);

    clearFlyTo();
  }, [flyToImageId, reconstruction, clearFlyTo, camera]);

  // Handle mode switching
  useEffect(() => {
    if (cameraMode === 'fly') {
      // Switching to fly mode: sync camera quaternion from current state
      cameraQuat.current.copy(camera.quaternion);
      flyVelocity.current.set(0, 0, 0);
      keysPressed.current.clear();
    } else {
      // Switching to orbit mode: calculate target position and distance from current camera
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      distance.current = Math.max(CONTROLS.minDistance, distance.current);
      targetDistance.current = distance.current;
      targetVec.current.copy(camera.position).add(forward.multiplyScalar(distance.current));
      cameraQuat.current.copy(camera.quaternion);
    }
    angularVelocity.current.x = 0;
    angularVelocity.current.y = 0;
  }, [cameraMode, camera]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onMouseDown = (e: MouseEvent) => {
      if (cameraMode === 'fly') {
        // In fly mode, left click rotates the view
        if (e.button === 0) {
          isDragging.current = true;
          angularVelocity.current.x = 0;
          angularVelocity.current.y = 0;
        }
      } else {
        // Orbit mode
        if (e.button === 0) {
          isDragging.current = true;
          angularVelocity.current.x = 0;
          angularVelocity.current.y = 0;
        } else if (e.button === 2 || e.button === 1) {
          isPanning.current = true;
        }
      }
      lastMouse.current = { x: e.clientX, y: e.clientY };
      lastTime.current = performance.now();
    };

    const onMouseUp = () => {
      isDragging.current = false;
      isPanning.current = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      const now = performance.now();
      const dt = Math.max(1, now - lastTime.current);
      const deltaX = e.clientX - lastMouse.current.x;
      const deltaY = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      lastTime.current = now;

      if (isDragging.current) {
        const rotX = deltaX * rotateSpeed;
        const rotY = deltaY * rotateSpeed;
        applyRotation(rotX, rotY);
        updateCamera();

        const velocitySmoothing = CAMERA.velocitySmoothingFactor;
        angularVelocity.current.x = velocitySmoothing * angularVelocity.current.x +
          (1 - velocitySmoothing) * (rotX / dt) * CAMERA.frameTimeMs;
        angularVelocity.current.y = velocitySmoothing * angularVelocity.current.y +
          (1 - velocitySmoothing) * (rotY / dt) * CAMERA.frameTimeMs;
      }

      if (isPanning.current && cameraMode === 'orbit') {
        const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuat.current);
        const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuat.current);

        const panMultiplier = distance.current * panSpeed;

        const panOffset = new THREE.Vector3()
          .addScaledVector(cameraRight, -deltaX * panMultiplier)
          .addScaledVector(cameraUp, deltaY * panMultiplier);

        targetVec.current.add(panOffset);
        updateCamera();
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (cameraMode === 'fly') {
        // In fly mode, wheel moves camera forward/backward
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuat.current);
        const moveAmount = -e.deltaY * radius * CONTROLS.wheelMoveMultiplier * flySpeed;
        camera.position.add(forward.multiplyScalar(moveAmount));
      } else {
        const zoomFactor = 1 + e.deltaY * zoomSpeed;
        targetDistance.current = Math.max(CONTROLS.minDistance, targetDistance.current * zoomFactor);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Keyboard event handlers for both modes
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      // Only capture movement keys, ignore when typing in inputs
      if (['w', 'a', 's', 'd', 'q', 'e', ' ', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        if ((e.target as HTMLElement)?.tagName !== 'INPUT' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          keysPressed.current.add(key);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysPressed.current.delete(key);
    };

    const onBlur = () => {
      keysPressed.current.clear();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [camera, gl, cameraMode, flySpeed, radius]);

  return null;
}

function OriginAxes({ size, opacity }: { size: number; opacity: number }) {
  const axisLength = size * 0.5;
  const axisRadius = size * 0.005;

  return (
    <group>
      <mesh position={[axisLength / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[axisRadius, axisRadius, axisLength, 8]} />
        <meshBasicMaterial color={VIZ_COLORS.axis.x} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, axisLength / 2, 0]}>
        <cylinderGeometry args={[axisRadius, axisRadius, axisLength, 8]} />
        <meshBasicMaterial color={VIZ_COLORS.axis.y} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, 0, axisLength / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[axisRadius, axisRadius, axisLength, 8]} />
        <meshBasicMaterial color={VIZ_COLORS.axis.z} transparent opacity={opacity} />
      </mesh>
    </group>
  );
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - idx) + sorted[upper] * (idx - lower);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return percentile(sorted, 50);
}

function SceneContent() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);

  const bounds = useMemo(() => {
    if (!reconstruction) {
      return { center: [0, 0, 0] as [number, number, number], radius: 5 };
    }

    const images = Array.from(reconstruction.images.values());

    if (images.length > 0) {
      const xCoords: number[] = [];
      const yCoords: number[] = [];
      const zCoords: number[] = [];

      for (const image of images) {
        const pos = getImageWorldPosition(image);
        xCoords.push(pos.x);
        yCoords.push(pos.y);
        zCoords.push(pos.z);
      }

      const center: [number, number, number] = [
        median(xCoords),
        median(yCoords),
        median(zCoords),
      ];

      const sortedX = [...xCoords].sort((a, b) => a - b);
      const sortedY = [...yCoords].sort((a, b) => a - b);
      const sortedZ = [...zCoords].sort((a, b) => a - b);

      const rangeX = percentile(sortedX, 95) - percentile(sortedX, 5);
      const rangeY = percentile(sortedY, 95) - percentile(sortedY, 5);
      const rangeZ = percentile(sortedZ, 95) - percentile(sortedZ, 5);

      const radius = Math.max(rangeX, rangeY, rangeZ, 0.001) / 2;

      return { center, radius };
    }

    if (reconstruction.points3D.size > 0) {
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      for (const point of reconstruction.points3D.values()) {
        minX = Math.min(minX, point.xyz[0]);
        maxX = Math.max(maxX, point.xyz[0]);
        minY = Math.min(minY, point.xyz[1]);
        maxY = Math.max(maxY, point.xyz[1]);
        minZ = Math.min(minZ, point.xyz[2]);
        maxZ = Math.max(maxZ, point.xyz[2]);
      }

      const center: [number, number, number] = [
        (minX + maxX) / 2,
        (minY + maxY) / 2,
        (minZ + maxZ) / 2,
      ];

      const radius = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2;

      return { center, radius };
    }

    return { center: [0, 0, 0] as [number, number, number], radius: 5 };
  }, [reconstruction]);

  const showAxes = useViewerStore((s) => s.showAxes);
  const axesOpacity = useViewerStore((s) => s.axesOpacity);
  const viewResetTrigger = useViewerStore((s) => s.viewResetTrigger);

  return (
    <>
      <ambientLight intensity={OPACITY.light.ambient} />
      <directionalLight position={[10, 10, 5]} intensity={OPACITY.light.directional} />

      <PointCloud />
      <CameraFrustums />
      <CameraMatches />

      {showAxes && <OriginAxes size={bounds.radius} opacity={axesOpacity} />}

      <TrackballControls target={bounds.center} radius={bounds.radius} resetTrigger={viewResetTrigger} />
    </>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={VIZ_COLORS.wireframe} wireframe />
    </mesh>
  );
}

function BackgroundColor({ color }: { color: string }) {
  const { scene } = useThree();

  useEffect(() => {
    scene.background = new THREE.Color(color);
  }, [scene, color]);

  return null;
}

export function Scene3D() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const backgroundColor = useViewerStore((s) => s.backgroundColor);
  const setSelectedImageId = useViewerStore((s) => s.setSelectedImageId);

  const cameraPosition = useMemo(() => {
    if (!reconstruction || reconstruction.points3D.size === 0) {
      return [0, 0, 5] as [number, number, number];
    }

    let maxDist = 0;
    for (const point of reconstruction.points3D.values()) {
      const dist = Math.sqrt(
        point.xyz[0] ** 2 + point.xyz[1] ** 2 + point.xyz[2] ** 2
      );
      maxDist = Math.max(maxDist, dist);
    }

    return [0, 0, maxDist * 2] as [number, number, number];
  }, [reconstruction]);

  return (
    <div className="w-full h-full relative" style={{ backgroundColor }}>
      <Canvas
        camera={{
          position: cameraPosition,
          fov: CAMERA.fov,
          near: CAMERA.nearPlane,
          far: CAMERA.farPlane,
        }}
        gl={{ antialias: true }}
        onPointerMissed={(e) => {
          // Right-click on empty space deselects
          if (e.button === 2) {
            setSelectedImageId(null);
          }
        }}
      >
        <BackgroundColor color={backgroundColor} />
        <Suspense fallback={<LoadingFallback />}>
          <SceneContent />
        </Suspense>
      </Canvas>
      <ViewerControls />
      <a
        href="https://opsiclear.com"
        target="_blank"
        rel="noopener noreferrer"
        className={footerStyles.logo}
      >
        <img src="/LOGO.png" alt="Opsiclear" className="opacity-70 hover-opacity-100 transition-opacity" style={{ height: SIZE.logoHeight }} />
      </a>
      <div className={footerStyles.socialContainer}>
        <a
          href="https://x.com/OpsiClear"
          target="_blank"
          rel="noopener noreferrer"
          className={footerStyles.socialLink}
        >
          <svg className={ICON_SIZES.socialSm} viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </a>
        <a
          href="https://www.linkedin.com/company/opsiclear"
          target="_blank"
          rel="noopener noreferrer"
          className={footerStyles.socialLink}
        >
          <svg className={ICON_SIZES.social} viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
        </a>
        <a
          href="https://github.com/ColmapView/colmapview.github.io"
          target="_blank"
          rel="noopener noreferrer"
          className={footerStyles.socialLink}
        >
          <svg className={ICON_SIZES.social} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        </a>
      </div>
    </div>
  );
}
