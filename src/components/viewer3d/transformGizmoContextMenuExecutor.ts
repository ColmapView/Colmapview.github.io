type MaybePromise<T> = T | Promise<T>;

export type TransformGizmoContextMenuAction = 'reset' | 'reload' | 'apply' | 'off';

export interface TransformGizmoContextMenuExecutorDeps {
  resetTransform: () => void;
  applyTransformToData: () => void;
  setShowGizmo: (visible: boolean) => void;
  droppedFiles: Map<string, File> | null;
  confirmReload: () => MaybePromise<boolean>;
  processFiles: (files: Map<string, File>) => void;
  closeContextMenu: () => void;
}

export async function executeTransformGizmoContextMenuAction(
  action: TransformGizmoContextMenuAction,
  deps: TransformGizmoContextMenuExecutorDeps
): Promise<void> {
  switch (action) {
    case 'reset':
      deps.resetTransform();
      break;
    case 'reload':
      if (deps.droppedFiles && await deps.confirmReload()) {
        deps.resetTransform();
        deps.processFiles(deps.droppedFiles);
      }
      break;
    case 'apply':
      deps.applyTransformToData();
      break;
    case 'off':
      deps.setShowGizmo(false);
      break;
  }

  deps.closeContextMenu();
}
