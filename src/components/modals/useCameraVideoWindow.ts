import { useEffect, useLayoutEffect, useMemo } from 'react';
import { createCameraVideoCache } from '../../dataset/video/cameraVideoCache';
import type { CameraVideoSource } from '../../dataset/video/types';

/** Keep navigation state and cached recordings scoped to this open scene's video mode. */
export function useCameraVideoWindow(enabled: boolean, source: CameraVideoSource | undefined,
  previous: CameraVideoSource | undefined, next: CameraVideoSource | undefined) {
  const lifetime = source?.signal;
  const cache = useMemo(() => createCameraVideoCache(undefined, lifetime), [lifetime]);
  useLayoutEffect(() => {
    const update = () => {
      if (enabled && source) cache.setWindow(source, [next, previous].filter(value => value !== undefined), !document.hidden);
      else void cache.clear();
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [cache, enabled, source, previous, next]);
  useEffect(() => {
    const clear = () => { void cache.clear(); };
    lifetime?.addEventListener('abort', clear, { once: true });
    return () => { lifetime?.removeEventListener('abort', clear); clear(); };
  }, [cache, lifetime]);
  return cache;
}
