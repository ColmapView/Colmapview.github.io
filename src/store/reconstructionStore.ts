import { create } from 'zustand';
import type { Reconstruction, LoadedFiles } from '../types/colmap';

interface ReconstructionState {
  reconstruction: Reconstruction | null;
  loadedFiles: LoadedFiles | null;
  droppedFiles: Map<string, File> | null;
  loading: boolean;
  error: string | null;
  progress: number;

  setReconstruction: (rec: Reconstruction) => void;
  setLoadedFiles: (files: LoadedFiles) => void;
  setDroppedFiles: (files: Map<string, File>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setProgress: (progress: number) => void;
  clear: () => void;
}

export const useReconstructionStore = create<ReconstructionState>((set) => ({
  reconstruction: null,
  loadedFiles: null,
  droppedFiles: null,
  loading: false,
  error: null,
  progress: 0,

  setReconstruction: (reconstruction) => set({
    reconstruction,
    loading: false,
    progress: 100,
    error: null
  }),

  setLoadedFiles: (loadedFiles) => set({ loadedFiles }),

  setDroppedFiles: (droppedFiles) => set({ droppedFiles }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({
    error,
    loading: false
  }),

  setProgress: (progress) => set({ progress }),

  clear: () => set({
    reconstruction: null,
    loadedFiles: null,
    droppedFiles: null,
    error: null,
    progress: 0,
    loading: false
  }),
}));

export const selectPointCount = (state: ReconstructionState) =>
  state.reconstruction?.points3D.size ?? 0;

export const selectImageCount = (state: ReconstructionState) =>
  state.reconstruction?.images.size ?? 0;

export const selectCameraCount = (state: ReconstructionState) =>
  state.reconstruction?.cameras.size ?? 0;
