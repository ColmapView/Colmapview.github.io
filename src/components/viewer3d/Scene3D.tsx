import { Suspense, useMemo, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PointCloud } from './PointCloud';
import { CameraFrustums, CameraMatches } from './CameraFrustums';
import { ViewerControls } from './ViewerControls';
import { useReconstructionStore, useViewerStore } from '../../store';

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

  const rotateSpeed = 0.003;
  const panSpeed = 0.002;
  const zoomSpeed = 0.0005;
  const damping = 0.92;
  const minVelocity = 0.0001;

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
    const offset = new THREE.Vector3(0, 0, distance.current);
    offset.applyQuaternion(cameraQuat.current);

    camera.position.copy(targetVec.current).add(offset);
    camera.quaternion.copy(cameraQuat.current);
  };

  useFrame(() => {
    let needsUpdate = false;

    if (Math.abs(targetDistance.current - distance.current) > 0.0001) {
      distance.current += (targetDistance.current - distance.current) * 0.2;
      needsUpdate = true;
    }

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

    if (needsUpdate) {
      updateCamera();
    }
  });

  useEffect(() => {
    targetVec.current.set(...target);
    const isReset = resetTrigger !== lastResetTrigger.current;
    lastResetTrigger.current = resetTrigger;

    if (isReset || distance.current === 5) {
      distance.current = Math.max(0.1, radius * 2.5);
      targetDistance.current = distance.current;

      const sqrt2_2 = Math.SQRT1_2;
      const camOffset = new THREE.Vector3(-0.5, -sqrt2_2, -0.5).normalize()
        .multiplyScalar(distance.current);
      const camPos = targetVec.current.clone().add(camOffset);
      const upDir = new THREE.Vector3(0.5, -sqrt2_2, 0.5).normalize();
      const lookMatrix = new THREE.Matrix4();
      lookMatrix.lookAt(camPos, targetVec.current, upDir);
      cameraQuat.current.setFromRotationMatrix(lookMatrix);
      updateCamera();
    }
  }, [target[0], target[1], target[2], radius, resetTrigger]);

  useEffect(() => {
    if (flyToImageId === null || !reconstruction) return;

    const image = reconstruction.images.get(flyToImageId);
    if (!image) {
      clearFlyTo();
      return;
    }

    const quat = new THREE.Quaternion(image.qvec[1], image.qvec[2], image.qvec[3], image.qvec[0]);
    const worldFromCamQuat = quat.clone().invert();
    const t = new THREE.Vector3(image.tvec[0], image.tvec[1], image.tvec[2]);
    const camPos = t.negate().applyQuaternion(worldFromCamQuat);

    const flipRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    const threeJsCamQuat = worldFromCamQuat.clone().multiply(flipRotation);

    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(threeJsCamQuat);
    const newTarget = camPos.clone().add(lookDir.multiplyScalar(distance.current));

    targetVec.current.copy(newTarget);
    cameraQuat.current.copy(threeJsCamQuat);
    angularVelocity.current.x = 0;
    angularVelocity.current.y = 0;
    targetDistance.current = distance.current;
    updateCamera();
    clearFlyTo();
  }, [flyToImageId, reconstruction, clearFlyTo]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isDragging.current = true;
        angularVelocity.current.x = 0;
        angularVelocity.current.y = 0;
      } else if (e.button === 2 || e.button === 1) {
        isPanning.current = true;
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

        const velocitySmoothing = 0.5;
        angularVelocity.current.x = velocitySmoothing * angularVelocity.current.x +
          (1 - velocitySmoothing) * (rotX / dt) * 16;
        angularVelocity.current.y = velocitySmoothing * angularVelocity.current.y +
          (1 - velocitySmoothing) * (rotY / dt) * 16;
      }

      if (isPanning.current) {
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

      const zoomFactor = 1 + e.deltaY * zoomSpeed;
      targetDistance.current = Math.max(0.1, targetDistance.current * zoomFactor);
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, [camera, gl]);

  return null;
}

function OriginAxes({ size, opacity }: { size: number; opacity: number }) {
  const axisLength = size * 0.5;
  const axisRadius = size * 0.005;

  return (
    <group>
      <mesh position={[axisLength / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[axisRadius, axisRadius, axisLength, 8]} />
        <meshBasicMaterial color={0xe60000} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, axisLength / 2, 0]}>
        <cylinderGeometry args={[axisRadius, axisRadius, axisLength, 8]} />
        <meshBasicMaterial color={0x00e600} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, 0, axisLength / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[axisRadius, axisRadius, axisLength, 8]} />
        <meshBasicMaterial color={0x0000e6} transparent opacity={opacity} />
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
        const quat = new THREE.Quaternion(
          image.qvec[1], image.qvec[2], image.qvec[3], image.qvec[0]
        ).invert();
        const t = new THREE.Vector3(image.tvec[0], image.tvec[1], image.tvec[2]);
        const pos = t.negate().applyQuaternion(quat);
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
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={0.5} />

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
      <meshBasicMaterial color="#333" wireframe />
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
          fov: 60,
          near: 0.001,
          far: 10000,
        }}
        gl={{ antialias: true }}
      >
        <BackgroundColor color={backgroundColor} />
        <Suspense fallback={<LoadingFallback />}>
          <SceneContent />
        </Suspense>
      </Canvas>
      <ViewerControls />
    </div>
  );
}
