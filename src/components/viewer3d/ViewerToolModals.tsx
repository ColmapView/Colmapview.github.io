import { LazyToolModal } from './LazyToolModal';

const loadAutoHide = () => import('../modals/AutoHideModal').then(module => ({ default: module.AutoHideModal }));
const loadConversion = () => import('../modals/CameraConversionModal').then(module => ({ default: module.CameraConversionModal }));
const loadDeletion = () => import('../modals/DeletionModal').then(module => ({ default: module.DeletionModal }));
const loadFloor = () => import('../modals/FloorDetectionModal').then(module => ({ default: module.FloorDetectionModal }));

export interface ViewerToolModalsProps {
  showFloorModal: boolean;
  setShowFloorModal: (show: boolean) => void;
  showDeletionModal: boolean;
  setShowDeletionModal: (show: boolean) => void;
  showConversionModal: boolean;
  setShowConversionModal: (show: boolean) => void;
  showAutoHideEditor: boolean;
  setShowAutoHideEditor: (show: boolean) => void;
}

export function ViewerToolModals({
  showFloorModal,
  setShowFloorModal,
  showDeletionModal,
  setShowDeletionModal,
  showConversionModal,
  setShowConversionModal,
  showAutoHideEditor,
  setShowAutoHideEditor,
}: ViewerToolModalsProps) {
  return (
    <>
      <LazyToolModal
        title="Floor detection"
        load={loadFloor}
        isOpen={showFloorModal}
        onClose={() => setShowFloorModal(false)}
      />
      <LazyToolModal
        title="Deletion"
        load={loadDeletion}
        isOpen={showDeletionModal}
        onClose={() => setShowDeletionModal(false)}
      />
      <LazyToolModal
        title="Camera conversion"
        load={loadConversion}
        isOpen={showConversionModal}
        onClose={() => setShowConversionModal(false)}
      />
      <LazyToolModal
        title="Auto hide"
        load={loadAutoHide}
        isOpen={showAutoHideEditor}
        onClose={() => setShowAutoHideEditor(false)}
      />
    </>
  );
}
