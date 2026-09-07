import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createTrackballCommandController } from './trackballCommandController';
import { useCameraStore } from '../../store/stores/cameraStore';

function fixture(camera: THREE.Camera = new THREE.PerspectiveCamera()) {
  camera.position.set(0, 0, 5);
  const options = {
    camera, target: [0, 0, 0] as [number, number, number], radius: 2,
    pivot: { current: new THREE.Vector3() }, quaternion: { current: new THREE.Quaternion() },
    distance: { current: 5 }, targetDistance: { current: 8 }, orthoZoom: { current: 1 },
    angularVelocity: { current: { x: 1, y: 2 } }, smoothedVelocity: { current: { x: 2, y: 1 } },
    flyVelocity: { current: new THREE.Vector3(1, 1, 1) }, keys: { current: new Set(['w']) },
    animation: { current: null }, worldUp: { current: new THREE.Vector3(0, 1, 0) },
    rotate: vi.fn(), update: vi.fn(), imagePose: vi.fn(() => null),
  };
  return { options, controller: createTrackballCommandController(options) };
}
describe('trackball command controller', () => {
  it('applies a real camera pose and preserves position/pivot consistency through pan and zoom', () => {
    const { controller, options } = fixture();
    controller.execute('lookAt', { x: 5, y: 0, z: 0, targetX: 0, targetY: 0, targetZ: 0, upX: 0, upY: 1, upZ: 0 });
    expect(options.camera.getWorldDirection(new THREE.Vector3()).x).toBeCloseTo(-1);
    controller.execute('pan', { right: 0, up: 2, forward: 0 });
    expect(controller.read().position[1]).toBeCloseTo(2);
    expect(controller.read().target).toEqual([0, 2, 0]);
    controller.execute('zoom', { factor: 0.5 });
    expect(controller.read().distance).toBeCloseTo(2.5);
    expect(options.camera.position.distanceTo(options.pivot.current)).toBeCloseTo(2.5);
    expect(options.targetDistance.current).toBe(2.5);
  });
  it('rejects degenerate poses before stopping existing motion', () => {
    const { controller } = fixture();
    useCameraStore.getState().setAutoRotateMode('cw');
    const before = controller.read();
    expect(() => controller.execute('lookAt', { x: 0, y: 0, z: 0, targetX: 0, targetY: 0, targetZ: 0, upX: 0, upY: 1, upZ: 0 })).toThrow('distinct');
    expect(controller.read()).toEqual(before);
    expect(useCameraStore.getState().autoRotateMode).toBe('cw');
  });
  it('stops velocities, keys, orbit and pending fly commands', () => {
    const { controller, options } = fixture();
    useCameraStore.getState().setAutoRotateMode('cw');
    useCameraStore.getState().flyToImage(3);
    controller.execute('stop', {});
    expect(useCameraStore.getState().autoRotateMode).toBe('off');
    expect(useCameraStore.getState().flyToImageId).toBeNull();
    expect(options.angularVelocity.current).toEqual({ x: 0, y: 0 });
    expect(options.flyVelocity.current.length()).toBe(0);
    expect(options.keys.current.size).toBe(0);
    expect(options.targetDistance.current).toBe(options.distance.current);
  });
  it('uses the pointer rotation handler, preserving its horizon constraints', () => {
    const { controller, options } = fixture();
    controller.execute('orbit', { yaw: 0.2, pitch: -0.1 });
    expect(options.rotate).toHaveBeenCalledWith(0.2, -0.1);
    expect(options.update).toHaveBeenCalledOnce();
  });
  it('changes orthographic zoom instead of moving the camera', () => {
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5);
    const { controller, options } = fixture(camera);
    controller.execute('zoom', { factor: 0.5 });
    expect(camera.zoom).toBe(2);
    expect(options.orthoZoom.current).toBe(2);
    expect(controller.read().position).toEqual([0, 0, 5]);
  });
  it('uses the scene center and radius for fitted presets', () => {
    useCameraStore.getState().setHorizonLock('off');
    const { controller } = fixture();
    controller.execute('preset', { direction: 'x' });
    expect(controller.read().position[0]).toBeGreaterThan(0);
    expect(controller.read().position[1]).toBe(0);
    expect(controller.read().position[2]).toBe(0);
  });
  it('does not change a view for an unknown image', () => {
    const { controller } = fixture();
    const before = controller.read();
    expect(() => controller.execute('image', { imageId: 99 })).toThrow('Unknown image');
    expect(controller.read()).toEqual(before);
  });
  it('retains the human preset fallback for a parallel world-up axis', () => {
    const { controller, options } = fixture();
    useCameraStore.getState().setHorizonLock('on');
    options.worldUp.current.set(0, 0, 1);
    expect(() => controller.execute('preset', { direction: 'y' })).not.toThrow();
    expect(controller.read().quaternion.every(Number.isFinite)).toBe(true);
    useCameraStore.getState().setHorizonLock('off');
  });
});
