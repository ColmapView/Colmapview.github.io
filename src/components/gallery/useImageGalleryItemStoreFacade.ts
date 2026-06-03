import { selectCameraCount, useReconstructionStore } from '../../store';

export interface ImageGalleryItemStoreFacade {
  multiCamera: boolean;
}

export function useImageGalleryItemStoreFacade(): ImageGalleryItemStoreFacade {
  const cameraCount = useReconstructionStore(selectCameraCount);

  return {
    multiCamera: cameraCount > 1,
  };
}
