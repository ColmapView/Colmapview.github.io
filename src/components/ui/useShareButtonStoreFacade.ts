import {
  useCameraStore,
  useReconstructionStore,
  useUIStore,
} from '../../store';
import type { CameraViewState } from '../../store/types';
import type { ReconstructionSourceType } from '../../store/reconstructionStore';
import type { Reconstruction } from '../../types/colmap';
import type { ColmapManifest } from '../../types/manifest';

interface ShareButtonDataFacade {
  sourceType: ReconstructionSourceType;
  sourceUrl: string | null;
  sourceManifest: ColmapManifest | null;
  reconstruction: Reconstruction | null;
  currentViewState: CameraViewState | null;
  embedMode: boolean;
}

export interface ShareButtonStoreFacade {
  data: ShareButtonDataFacade;
}

export function useShareButtonStoreFacade(): ShareButtonStoreFacade {
  const sourceType = useReconstructionStore((s) => s.sourceType);
  const sourceUrl = useReconstructionStore((s) => s.sourceUrl);
  const sourceManifest = useReconstructionStore((s) => s.sourceManifest);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const currentViewState = useCameraStore((s) => s.currentViewState);
  const embedMode = useUIStore((s) => s.embedMode);

  return {
    data: {
      sourceType,
      sourceUrl,
      sourceManifest,
      reconstruction,
      currentViewState,
      embedMode,
    },
  };
}
