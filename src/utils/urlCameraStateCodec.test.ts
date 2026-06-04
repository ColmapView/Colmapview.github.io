import { describe, expect, it } from 'vitest';
import type { CameraViewState } from '../store/types';
import {
  decodeCameraFromBytes,
  decodeCameraStateBinary,
  decodeCameraStateLegacy,
  encodeCameraState,
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

describe('URL camera state codec', () => {
  it('round-trips camera state through binary Base64URL format', () => {
    const encoded = encodeCameraState(viewState);
    const data = new URLSearchParams(encoded).get('c');

    expect(data).toBeTruthy();

    const decoded = decodeCameraStateBinary(data!);

    expect(decoded?.position).toEqual(viewState.position);
    expect(decoded?.target).toEqual(viewState.target);
    expect(decoded?.quaternion[0]).toBeCloseTo(0);
    expect(decoded?.quaternion[1]).toBeCloseTo(Math.SQRT1_2);
    expect(decoded?.quaternion[2]).toBeCloseTo(0);
    expect(decoded?.quaternion[3]).toBeCloseTo(Math.SQRT1_2);
    expect(decoded?.distance).toBe(5);
  });

  it('normalizes negative-w camera quaternions to the equivalent positive-w form', () => {
    const negativeWState: CameraViewState = {
      ...viewState,
      quaternion: [0.25, 0.25, 0.25, -0.9013878188659973],
    };

    const decoded = decodeCameraFromBytes(encodeCameraStateBinary(negativeWState));

    expect(decoded?.quaternion[0]).toBeCloseTo(-0.25);
    expect(decoded?.quaternion[1]).toBeCloseTo(-0.25);
    expect(decoded?.quaternion[2]).toBeCloseTo(-0.25);
    expect(decoded?.quaternion[3]).toBeCloseTo(0.9013878188659973);
  });

  it('decodes legacy camera state and rejects malformed inputs', () => {
    const legacy = '1,2,5,1,-1,1,0,0.7071067811865476,0,0.7071067811865476';

    expect(decodeCameraStateLegacy(legacy)?.distance).toBe(5);
    expect(decodeCameraStateLegacy('1,2,3')).toBeNull();
    expect(decodeCameraStateLegacy('1px,2,5,1,-1,1,0,0.7071067811865476,0,0.7071067811865476')).toBeNull();
    expect(decodeCameraStateLegacy('1,2,5,1,-1,1,2,0,0,0')).toBeNull();
    expect(decodeCameraStateBinary('not valid base64')).toBeNull();
  });

  it('converts bytes to URL-safe Base64 without padding', () => {
    const bytes = new Uint8Array([251, 255, 255]);
    const encoded = toBase64Url(bytes);

    expect(encoded).toBe('-___');
    expect(fromBase64Url(encoded)).toEqual(bytes);
  });

  it('encodes large byte arrays without overflowing the call stack', () => {
    const bytes = new Uint8Array(100_000);
    bytes.fill(65);

    const decoded = fromBase64Url(toBase64Url(bytes));

    expect(decoded).toEqual(bytes);
  });
});
