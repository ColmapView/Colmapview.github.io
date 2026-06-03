import type { CameraViewState } from '../store/types';
import { decodeShareData } from '../utils/shareDataCodec';
import {
  decodeCameraStateBinary,
  decodeCameraStateLegacy,
} from '../utils/urlCameraStateCodec';

export const URL_UPDATE_DEBOUNCE_MS = 500;

export interface CameraHashUpdateOptions {
  href: string;
  encodedState: string;
  lastEncodedState: string;
}

export interface CameraHashUpdate {
  encodedState: string;
  url: string;
}

export function getNextCameraHashUpdate({
  href,
  encodedState,
  lastEncodedState,
}: CameraHashUpdateOptions): CameraHashUpdate | null {
  if (encodedState === lastEncodedState) return null;

  const url = new URL(href);
  url.hash = encodedState;

  return {
    encodedState,
    url: url.toString(),
  };
}

export async function decodeCameraStateFromHash(hash: string): Promise<CameraViewState | null> {
  const hashContent = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(hashContent);

  const combinedParam = params.get('d');
  if (combinedParam) {
    const shareData = await decodeShareData(hash);
    return shareData?.viewState ?? null;
  }

  const binaryParam = params.get('c');
  if (binaryParam) {
    return decodeCameraStateBinary(binaryParam);
  }

  const legacyParam = params.get('camera');
  if (legacyParam) {
    return decodeCameraStateLegacy(legacyParam);
  }

  return null;
}
