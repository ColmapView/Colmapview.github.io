import { useEffect, useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { subscribeFrustumTextureCacheChanges } from '../../hooks/useFrustumTexture';
import { subscribeSceneRenderInvalidation } from '../../utils/sceneRenderInvalidation';
import { subscribeSceneInputFrames } from './sceneInputFrameEvents';
import { subscribeSceneRenderStores, useSceneRenderStoreFacade } from './useSceneRenderStoreFacade';

/** Bridges imperative inputs and stores to Fiber; React prop commits invalidate themselves. */
export function SceneRenderWakeups() {
  const { frameloop: requestedFrameloop } = useSceneRenderStoreFacade();
  const { gl, invalidate, camera, size, viewport, frameloop, setFrameloop } = useThree();

  // Activity changes stay inside the canvas instead of triggering its async
  // configure/render path. Observe the live mode too: an unrelated Canvas
  // reconfiguration can restore its static demand prop while activity persists.
  useLayoutEffect(() => {
    if (frameloop === requestedFrameloop) return;
    setFrameloop(requestedFrameloop);
    invalidate();
  }, [frameloop, requestedFrameloop, setFrameloop, invalidate]);

  useEffect(() => {
    const wake = () => invalidate();
    const subscriptions = [
      subscribeSceneInputFrames(gl.domElement, wake),
      subscribeSceneRenderInvalidation(wake),
      subscribeFrustumTextureCacheChanges(wake),
      subscribeSceneRenderStores(wake),
    ];
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [gl, invalidate]);

  // Camera replacement, Fiber resize and DPR changes also wake uniforms/billboards.
  useEffect(() => { invalidate(); }, [invalidate, camera, size.width, size.height, viewport.dpr]);
  return null;
}
