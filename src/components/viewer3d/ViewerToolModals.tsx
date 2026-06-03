import { AutoHideModal } from '../modals/AutoHideModal';
import { CameraConversionModal } from '../modals/CameraConversionModal';
import { DeletionModal } from '../modals/DeletionModal';
import { FloorDetectionModal } from '../modals/FloorDetectionModal';

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
      <FloorDetectionModal
        isOpen={showFloorModal}
        onClose={() => setShowFloorModal(false)}
      />
      <DeletionModal
        isOpen={showDeletionModal}
        onClose={() => setShowDeletionModal(false)}
      />
      <CameraConversionModal
        isOpen={showConversionModal}
        onClose={() => setShowConversionModal(false)}
      />
      <AutoHideModal
        isOpen={showAutoHideEditor}
        onClose={() => setShowAutoHideEditor(false)}
      />
    </>
  );
}
