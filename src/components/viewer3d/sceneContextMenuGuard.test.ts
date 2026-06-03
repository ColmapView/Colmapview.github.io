import { describe, expect, it } from 'vitest';
import {
  markSceneContextMenuHandled,
  markSceneContextMenuHandledForSecondaryButton,
  resetSceneContextMenuGuard,
  wasSceneContextMenuHandledRecently,
} from './sceneContextMenuGuard';

describe('scene context menu guard', () => {
  it('suppresses the scene fallback shortly after a widget handles right-click', () => {
    resetSceneContextMenuGuard();

    expect(wasSceneContextMenuHandledRecently(1_000)).toBe(false);

    markSceneContextMenuHandled(1_000);

    expect(wasSceneContextMenuHandledRecently(1_050)).toBe(true);
    expect(wasSceneContextMenuHandledRecently(1_250)).toBe(false);
  });

  it('only claims secondary-button pointer downs', () => {
    resetSceneContextMenuGuard();

    expect(markSceneContextMenuHandledForSecondaryButton(0, 1_000)).toBe(false);
    expect(wasSceneContextMenuHandledRecently(1_050)).toBe(false);

    expect(markSceneContextMenuHandledForSecondaryButton(2, 1_000)).toBe(true);
    expect(wasSceneContextMenuHandledRecently(1_050)).toBe(true);
  });
});
