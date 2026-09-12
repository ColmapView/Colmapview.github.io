/** Capture listeners wake even when a scene control claims/stops the event. */
export function subscribeSceneInputFrames(canvas: HTMLCanvasElement, invalidate: () => void): () => void {
  const canvasEvents = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave',
    'wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel'] as const;
  const windowEvents = ['keydown', 'keyup', 'blur', 'focus', 'resize'] as const;
  const pointerOutsideCanvas = (event: PointerEvent) => {
    if (event.target !== canvas && (event.buttons !== 0 || document.pointerLockElement === canvas)) invalidate();
  };
  for (const event of canvasEvents) canvas.addEventListener(event, invalidate, { capture: true, passive: true });
  for (const event of windowEvents) window.addEventListener(event, invalidate, true);
  document.addEventListener('pointermove', pointerOutsideCanvas, true);
  document.addEventListener('pointerup', invalidate, true);
  document.addEventListener('pointerlockchange', invalidate, true);
  document.addEventListener('visibilitychange', invalidate, true);
  return () => {
    for (const event of canvasEvents) canvas.removeEventListener(event, invalidate, true);
    for (const event of windowEvents) window.removeEventListener(event, invalidate, true);
    document.removeEventListener('pointermove', pointerOutsideCanvas, true);
    document.removeEventListener('pointerup', invalidate, true);
    document.removeEventListener('pointerlockchange', invalidate, true);
    document.removeEventListener('visibilitychange', invalidate, true);
  };
}
