const SCENE_CONTEXT_MENU_GUARD_MS = 200;

let handledContextMenuAt = Number.NEGATIVE_INFINITY;

export function markSceneContextMenuHandled(now = Date.now()): void {
  handledContextMenuAt = now;
}

export function markSceneContextMenuHandledForSecondaryButton(
  button: number | undefined,
  now = Date.now()
): boolean {
  if (button !== 2) {
    return false;
  }

  markSceneContextMenuHandled(now);
  return true;
}

export function wasSceneContextMenuHandledRecently(now = Date.now()): boolean {
  return now - handledContextMenuAt < SCENE_CONTEXT_MENU_GUARD_MS;
}

export function resetSceneContextMenuGuard(): void {
  handledContextMenuAt = Number.NEGATIVE_INFINITY;
}
