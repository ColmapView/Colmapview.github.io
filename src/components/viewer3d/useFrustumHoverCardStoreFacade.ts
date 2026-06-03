import { selectCameraCount, useReconstructionStore } from '../../store';

export interface FrustumHoverCardStoreFacade {
  multiCamera: boolean;
}

export function useFrustumHoverCardStoreFacade(): FrustumHoverCardStoreFacade {
  const cameraCount = useReconstructionStore(selectCameraCount);

  return {
    multiCamera: cameraCount > 1,
  };
}
