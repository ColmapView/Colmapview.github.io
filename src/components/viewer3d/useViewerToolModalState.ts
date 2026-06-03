import type { ViewerToolModalsProps } from './ViewerToolModals';
import { useViewerToolModalStoreFacade } from './useViewerToolModalStoreFacade';

export function useViewerToolModalState(): ViewerToolModalsProps {
  return useViewerToolModalStoreFacade();
}
