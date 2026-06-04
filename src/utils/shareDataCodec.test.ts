import { describe, expect, it } from 'vitest';
import type { CameraViewState } from '../store/types';
import type { ColmapManifest } from '../types/manifest';
import {
  decodeShareData,
  encodeShareData,
  loadShareDataCompression,
  type ShareConfig,
} from './shareDataCodec';
import {
  encodeCameraStateBinary,
  fromBase64Url,
  toBase64Url,
} from './urlCameraStateCodec';

const viewState: CameraViewState = {
  position: [1, 2, 5],
  target: [1, -1, 1],
  quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
  distance: 5,
};

const manifest: ColmapManifest = {
  version: 1,
  name: 'Example',
  baseUrl: 'https://example.com/data/',
  files: {
    cameras: 'sparse/0/cameras.bin',
    images: 'sparse/0/images.bin',
    points3D: 'sparse/0/points3D.bin',
  },
  imagesPath: 'images/',
};

function encodeInlineShareDataWithRawConfig(
  inlineManifest: ColmapManifest,
  cameraState: CameraViewState,
  config: unknown,
): string {
  const manifestBytes = new TextEncoder().encode(JSON.stringify(inlineManifest));
  const cameraBytes = encodeCameraStateBinary(cameraState);
  const configBytes = new TextEncoder().encode(JSON.stringify(config));
  const payloadLength = 2 + manifestBytes.length + cameraBytes.length + 2 + configBytes.length;
  const payloadBuffer = new ArrayBuffer(payloadLength);
  const payloadView = new DataView(payloadBuffer);
  const payloadBytes = new Uint8Array(payloadBuffer);
  let offset = 0;

  payloadView.setUint16(offset, manifestBytes.length, true);
  offset += 2;
  payloadBytes.set(manifestBytes, offset);
  offset += manifestBytes.length;
  payloadBytes.set(cameraBytes, offset);
  offset += cameraBytes.length;
  payloadView.setUint16(offset, configBytes.length, true);
  offset += 2;
  payloadBytes.set(configBytes, offset);

  const result = new Uint8Array(1 + payloadBytes.length);
  result[0] = 1 | 2 | 4;
  result.set(payloadBytes, 1);

  return `d=${toBase64Url(result)}`;
}

function encodeInlineShareDataWithRawManifest(inlineManifest: unknown): string {
  const manifestBytes = new TextEncoder().encode(JSON.stringify(inlineManifest));
  const payloadLength = 2 + manifestBytes.length;
  const payloadBuffer = new ArrayBuffer(payloadLength);
  const payloadView = new DataView(payloadBuffer);
  const payloadBytes = new Uint8Array(payloadBuffer);

  payloadView.setUint16(0, manifestBytes.length, true);
  payloadBytes.set(manifestBytes, 2);

  const result = new Uint8Array(1 + payloadBytes.length);
  result[0] = 4;
  result.set(payloadBytes, 1);

  return `d=${toBase64Url(result)}`;
}

describe('share data codec', () => {
  it('round-trips manifest URLs with camera state and config', async () => {
    const config: ShareConfig = {
      ui: { backgroundColor: '#101010' },
      camera: { selectedImageId: 42 },
      pointCloud: { pointSize: 3 },
    };

    const decoded = await decodeShareData(`#${encodeShareData('https://example.com/manifest.json', viewState, config)}`);

    expect(decoded?.manifestUrl).toBe('https://example.com/manifest.json');
    expect(decoded?.manifest).toBeNull();
    expect(decoded?.config).toEqual(config);
    expect(decoded?.viewState?.position).toEqual(viewState.position);
    expect(decoded?.viewState?.target).toEqual(viewState.target);
    expect(decoded?.viewState?.quaternion[1]).toBeCloseTo(Math.SQRT1_2);
    expect(decoded?.viewState?.quaternion[3]).toBeCloseTo(Math.SQRT1_2);
  });

  it('round-trips inline manifests without camera state', async () => {
    const decoded = await decodeShareData(encodeShareData(manifest, null, null));

    expect(decoded).toEqual({
      manifestUrl: null,
      manifest,
      viewState: null,
      config: null,
    });
  });

  it('decodes compressed share payloads after compression support is loaded', async () => {
    await loadShareDataCompression();

    const config: ShareConfig = {
      ui: { repeated: 'same-value-'.repeat(2_000) },
      pointCloud: { colorMode: 'trackLength', repeated: 'same-value-'.repeat(2_000) },
    };
    const encoded = encodeShareData(manifest, viewState, config);
    const encodedBytes = fromBase64Url(new URLSearchParams(encoded).get('d')!);

    expect(encodedBytes?.[0] && encodedBytes[0] & 8).toBe(8);

    const decoded = await decodeShareData(`#${encoded}`);
    expect(decoded?.manifest).toEqual(manifest);
    expect(decoded?.config).toEqual(config);
    expect(decoded?.viewState?.distance).toBe(5);
  });

  it('round-trips inline manifests that require wide length fields', async () => {
    const largeManifest: ColmapManifest = {
      ...manifest,
      name: 'large-manifest',
      images: Array.from({ length: 4500 }, (_, index) => `images/camera-${index.toString().padStart(5, '0')}.jpg`),
    };
    const encoded = encodeShareData(largeManifest, viewState, null);
    const encodedBytes = fromBase64Url(new URLSearchParams(encoded).get('d')!);

    expect(encodedBytes?.[0] && encodedBytes[0] & 16).toBe(16);

    const decoded = await decodeShareData(`#${encoded}`);
    expect(decoded?.manifest).toEqual(largeManifest);
    expect(decoded?.viewState?.distance).toBe(5);
  });

  it('rejects malformed or truncated payloads', async () => {
    const invalidInlineJson = new Uint8Array([4, 1, 0, '{'.charCodeAt(0)]);

    expect(await decodeShareData('')).toBeNull();
    expect(await decodeShareData('d=not-valid-base64')).toBeNull();
    expect(await decodeShareData(`d=${toBase64Url(new Uint8Array([0, 10, 0]))}`)).toBeNull();
    expect(await decodeShareData(`d=${toBase64Url(invalidInlineJson)}`)).toBeNull();
  });

  it('rejects inline manifests that do not match the manifest schema', async () => {
    const decoded = await decodeShareData(encodeInlineShareDataWithRawManifest({
      version: 1,
      name: 'Invalid Manifest',
      baseUrl: 'not-a-url',
      files: {
        cameras: '',
        images: 'sparse/0/images.bin',
        points3D: 'sparse/0/points3D.bin',
      },
    }));

    expect(decoded).toBeNull();
  });

  it('ignores malformed config while preserving valid manifest and camera payloads', async () => {
    const decoded = await decodeShareData(encodeInlineShareDataWithRawConfig(manifest, viewState, 5));

    expect(decoded?.manifest).toEqual(manifest);
    expect(decoded?.viewState?.position).toEqual(viewState.position);
    expect(decoded?.config).toBeNull();
  });
});
