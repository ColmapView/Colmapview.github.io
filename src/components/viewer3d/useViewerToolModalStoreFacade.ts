import { useUIStore } from '../../store';
import type { ViewerToolModalsProps } from './ViewerToolModals';

export function useViewerToolModalStoreFacade(): ViewerToolModalsProps {
  const showFloorModal = useUIStore((s) => s.showFloorModal);
  const setShowFloorModal = useUIStore((s) => s.setShowFloorModal);
  const showDeletionModal = useUIStore((s) => s.showDeletionModal);
  const setShowDeletionModal = useUIStore((s) => s.setShowDeletionModal);
  const showConversionModal = useUIStore((s) => s.showConversionModal);
  const setShowConversionModal = useUIStore((s) => s.setShowConversionModal);
  const showAutoHideEditor = useUIStore((s) => s.showAutoHideEditor);
  const setShowAutoHideEditor = useUIStore((s) => s.setShowAutoHideEditor);

  return {
    showFloorModal,
    setShowFloorModal,
    showDeletionModal,
    setShowDeletionModal,
    showConversionModal,
    setShowConversionModal,
    showAutoHideEditor,
    setShowAutoHideEditor,
  };
}
