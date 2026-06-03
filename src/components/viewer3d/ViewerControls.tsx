import { ViewerControlsToolbar } from './ViewerControlsToolbar';
import { ViewerToolModals } from './ViewerToolModals';
import { useViewerControlsController } from './useViewerControlsController';

export function ViewerControls() {
  const controller = useViewerControlsController();

  return (
    <>
      <ViewerControlsToolbar controller={controller} />
      <ViewerToolModals {...controller.modals} />
    </>
  );
}
