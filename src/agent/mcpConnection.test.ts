import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { connectMcp, disconnectMcp, useMcpConnection } from './mcpConnection';
import { disposeCommands, useCommandState } from '../commands/runtime';
import { useUITheme } from '../theme/uiTheme';
import { useCameraStore } from '../store/stores/cameraStore';
import { useReconstructionStore } from '../store/reconstructionStore';
import { createEmptyReconstruction } from '../utils/fileClassification';
import { useTransformStore } from '../store/stores/transformStore';
import { registerDatasetLoader, useDatasetLoad } from '../features/datasetLoad';
import * as THREE from 'three';
import { registerCameraController } from '../features/cameraControl';
import { createTrackballCommandController } from '../components/viewer3d/trackballCommandController';
import { buildImage, buildReconstruction } from '../test/builders';

let client: Client;
beforeEach(async () => {
  // A real WebSocket with the same Origin header a browser sends. Application
  // operations below use ONLY MCP tools; no DOM/click/evaluate automation.
  vi.stubGlobal('WebSocket', class extends WebSocket {
    constructor(url: string) { super(url, { origin: 'http://localhost:5173' }); }
  });
  useUITheme.getState().setTheme('dark');
  client = new Client({ name: 'colmap-integration-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: ['scripts/mcp/server.mjs'], env: { COLMAP_MCP_PORT: '0' }, stderr: 'pipe' }));
});
afterEach(async () => { disconnectMcp(); disposeCommands(); await client?.close(); vi.unstubAllGlobals(); });

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0].text;
  if (result.isError) throw new Error(text);
  return JSON.parse(text);
}
async function pair() {
  const pairing = await call('colmap_pair');
  connectMcp(pairing.pairingCode, pairing.port);
  await vi.waitFor(() => expect(useMcpConnection.getState().status).toBe('connected'));
  await vi.waitFor(async () => expect((await call('colmap_status')).connected).toBe(true));
  return pairing;
}

describe('real stdio MCP → local relay → application command contracts', () => {
  it('discovers, changes appearance, spins and undoes through MCP', async () => {
    expect((await client.listTools()).tools.map(tool => tool.name)).toContain('colmap_set_feature');
    await pair();
    expect((await call('colmap_list_features')).features).toHaveLength(81);
    const first = await call('colmap_set_feature', { requestId: 'theme', feature: 'settings.ui.theme', input: { value: 'light' } });
    expect(first.status).toBe('succeeded');
    expect(useUITheme.getState().theme).toBe('light');
    expect(await call('colmap_set_feature', { requestId: 'theme', feature: 'settings.ui.theme', input: { value: 'light' } })).toEqual(first);
    await call('colmap_undo', { requestId: 'undo-theme' });
    expect(useUITheme.getState().theme).toBe('dark');
    await call('colmap_set_feature', { requestId: 'spin', feature: 'settings.camera.autoRotateMode', input: { value: 'cw' } });
    expect(useCameraStore.getState().autoRotateMode).toBe('cw');
    expect((await call('colmap_read_state')).values['settings.camera.autoRotateMode']).toBe('cw');
    await call('colmap_undo', { requestId: 'undo-spin' });
  });
  it('previews transforms without editing data, and rejects invalid schemas and reused IDs', async () => {
    useReconstructionStore.setState({ reconstruction: createEmptyReconstruction() });
    await pair();
    const input = { ...useTransformStore.getState().transform, scale: 2, rotationZ: Math.PI / 2 };
    await call('colmap_set_feature', { requestId: 'preview', feature: 'scene.transform.preview', input });
    expect(useTransformStore.getState().transform.scale).toBe(2);
    await expect(call('colmap_set_feature', { requestId: 'preview', feature: 'scene.transform.preview', input: { ...input, scale: 3 } })).rejects.toThrow('different arguments');
    await call('colmap_undo', { requestId: 'undo-preview' });
    expect(useTransformStore.getState().transform.scale).toBe(1);
    await expect(call('colmap_set_feature', { requestId: 'invalid', feature: 'settings.ui.theme', input: { value: 'purple' } })).rejects.toThrow('INVALID_INPUT');
  });
  it('accepts a URL load once, exposes completion, then orbits through MCP', async () => {
    useReconstructionStore.setState({ loading: false, urlLoading: false, urlLoadActive: false });
    useDatasetLoad.setState({ job: null });
    let finish!: (success: boolean) => void;
    const loader = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const unregister = registerDatasetLoader(loader);
    try {
      await pair();
      const features = (await call('colmap_list_features')).features;
      expect(features.find((feature: { id: string }) => feature.id === 'dataset.loadUrl').completion).toBe('job_accepted');
      const args = { requestId: 'load-garden', feature: 'dataset.loadUrl', input: { url: 'http://127.0.0.1:5176/manifest.json' } };
      const accepted = await call('colmap_set_feature', args);
      expect(accepted.output.status).toBe('running');
      expect(await call('colmap_set_feature', args)).toEqual(accepted);
      expect(loader).toHaveBeenCalledTimes(1);
      await expect(call('colmap_set_feature', { ...args, requestId: 'concurrent-load' })).rejects.toThrow('NOT_AVAILABLE');
      finish(true);
      await vi.waitFor(async () => expect((await call('colmap_read_state')).values['dataset.loadUrl'].status).toBe('succeeded'));
      await call('colmap_set_feature', { requestId: 'orbit-after-load', feature: 'settings.camera.autoRotateMode', input: { value: 'cw' } });
      expect((await call('colmap_read_state')).values['settings.camera.autoRotateMode']).toBe('cw');
      await call('colmap_set_feature', { requestId: 'stop-after-load', feature: 'settings.camera.autoRotateMode', input: { value: 'off' } });
    } finally { unregister(); }
  });
  it('controls a real Three.js camera and queries/selects images through MCP', async () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 5);
    const unregister = registerCameraController(createTrackballCommandController({
      camera, target: [0, 0, 0], radius: 2, pivot: { current: new THREE.Vector3() },
      quaternion: { current: new THREE.Quaternion() }, distance: { current: 5 }, targetDistance: { current: 5 }, orthoZoom: { current: 1 },
      angularVelocity: { current: { x: 0, y: 0 } }, smoothedVelocity: { current: { x: 0, y: 0 } },
      flyVelocity: { current: new THREE.Vector3() }, keys: { current: new Set() }, animation: { current: null },
      worldUp: { current: new THREE.Vector3(0, 1, 0) }, rotate: () => {}, update: () => {}, imagePose: () => null,
    }));
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ images: [buildImage({ imageId: 42 })] }), loading: false, urlLoading: false, urlLoadActive: false });
    try {
      await pair();
      expect((await call('colmap_query_images', { limit: 1 })).items[0].id).toBe(42);
      await call('colmap_set_feature', { requestId: 'select-42', feature: 'selection.image', input: { imageId: 42 } });
      expect(useCameraStore.getState().selectedImageId).toBe(42);
      await call('colmap_set_feature', { requestId: 'pose', feature: 'camera.lookAt', input: { x: 5, y: 0, z: 0, targetX: 0, targetY: 0, targetZ: 0 } });
      expect(camera.position.toArray()).toEqual([5, 0, 0]);
      await call('colmap_set_feature', { requestId: 'zoom', feature: 'camera.zoom', input: { factor: 0.5 } });
      expect((await call('colmap_read_state')).camera.distance).toBeCloseTo(2.5);
      expect(camera.position.x).toBeCloseTo(2.5);
      await call('colmap_set_feature', { requestId: 'stop', feature: 'camera.stop', input: {} });
      expect((await call('colmap_read_state')).camera.animating).toBe(false);
      await expect(call('colmap_set_feature', { requestId: 'invalid-zoom', feature: 'camera.zoom', input: { factor: 0 } })).rejects.toThrow('INVALID_INPUT');
    } finally { unregister(); }
  });
  it('revokes MCP when the human stops the app session', async () => {
    await pair();
    useCommandState.setState({ sessionId: null });
    await vi.waitFor(() => expect(useMcpConnection.getState().status).toBe('disconnected'));
    await vi.waitFor(async () => expect((await call('colmap_status')).connected).toBe(false));
    await expect(call('colmap_read_state')).rejects.toThrow('No paired tab');
  });
  it('rejects reused pairing codes and does not enable control on failed pairing', async () => {
    const pairing = await pair();
    disconnectMcp();
    await vi.waitFor(async () => expect((await call('colmap_status')).connected).toBe(false));
    connectMcp(pairing.pairingCode, pairing.port);
    await vi.waitFor(() => expect(useMcpConnection.getState().status).toBe('disconnected'));
    expect(useCommandState.getState().sessionId).toBeNull();
  });
  it('serializes concurrent commands and revokes the app on bridge shutdown', async () => {
    await pair();
    const results = await Promise.all(['light', 'system', 'dark'].map(value => call('colmap_set_feature', { requestId: value, feature: 'settings.ui.theme', input: { value } })));
    expect(results.every(result => result.status === 'succeeded')).toBe(true);
    await client.close();
    await vi.waitFor(() => expect(useCommandState.getState().sessionId).toBeNull());
  });
});
