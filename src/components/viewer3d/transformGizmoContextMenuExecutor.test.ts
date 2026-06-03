import { describe, expect, it, vi } from 'vitest';
import {
  executeTransformGizmoContextMenuAction,
  type TransformGizmoContextMenuExecutorDeps,
} from './transformGizmoContextMenuExecutor';

function createDeps(
  overrides: Partial<TransformGizmoContextMenuExecutorDeps> = {}
): TransformGizmoContextMenuExecutorDeps {
  return {
    resetTransform: vi.fn(),
    applyTransformToData: vi.fn(),
    setShowGizmo: vi.fn(),
    droppedFiles: null,
    confirmReload: vi.fn(() => true),
    processFiles: vi.fn(),
    closeContextMenu: vi.fn(),
    ...overrides,
  };
}

describe('transform gizmo context menu executor', () => {
  it('resets the transform and closes the menu', async () => {
    const deps = createDeps();

    await executeTransformGizmoContextMenuAction('reset', deps);

    expect(deps.resetTransform).toHaveBeenCalledTimes(1);
    expect(deps.closeContextMenu).toHaveBeenCalledTimes(1);
  });

  it('reloads dropped files only after confirmation and closes the menu', async () => {
    const files = new Map<string, File>([['images/a.jpg', new File(['a'], 'a.jpg')]]);
    const deps = createDeps({
      droppedFiles: files,
      confirmReload: vi.fn(async () => true),
    });

    await executeTransformGizmoContextMenuAction('reload', deps);

    expect(deps.confirmReload).toHaveBeenCalledTimes(1);
    expect(deps.resetTransform).toHaveBeenCalledTimes(1);
    expect(deps.processFiles).toHaveBeenCalledWith(files);
    expect(deps.closeContextMenu).toHaveBeenCalledTimes(1);
  });

  it('skips reload work without dropped files or denied confirmation', async () => {
    const files = new Map<string, File>([['images/a.jpg', new File(['a'], 'a.jpg')]]);
    const noFilesDeps = createDeps();
    const deniedDeps = createDeps({
      droppedFiles: files,
      confirmReload: vi.fn(() => false),
    });

    await executeTransformGizmoContextMenuAction('reload', noFilesDeps);
    await executeTransformGizmoContextMenuAction('reload', deniedDeps);

    expect(noFilesDeps.confirmReload).not.toHaveBeenCalled();
    expect(noFilesDeps.resetTransform).not.toHaveBeenCalled();
    expect(noFilesDeps.processFiles).not.toHaveBeenCalled();
    expect(noFilesDeps.closeContextMenu).toHaveBeenCalledTimes(1);

    expect(deniedDeps.confirmReload).toHaveBeenCalledTimes(1);
    expect(deniedDeps.resetTransform).not.toHaveBeenCalled();
    expect(deniedDeps.processFiles).not.toHaveBeenCalled();
    expect(deniedDeps.closeContextMenu).toHaveBeenCalledTimes(1);
  });

  it('applies transforms or hides the gizmo and closes the menu', async () => {
    const applyDeps = createDeps();
    const offDeps = createDeps();

    await executeTransformGizmoContextMenuAction('apply', applyDeps);
    await executeTransformGizmoContextMenuAction('off', offDeps);

    expect(applyDeps.applyTransformToData).toHaveBeenCalledTimes(1);
    expect(applyDeps.closeContextMenu).toHaveBeenCalledTimes(1);
    expect(offDeps.setShowGizmo).toHaveBeenCalledWith(false);
    expect(offDeps.closeContextMenu).toHaveBeenCalledTimes(1);
  });
});
