import { create } from 'zustand';
import type { Reconstruction, LoadedFiles } from '../types/colmap';

interface ReconstructionState {
  // Parsed reconstruction data
  reconstruction: Reconstruction | null;

  // Raw loaded files
  loadedFiles: LoadedFiles | null;

  // Loading state
  loading: boolean;
  error: string | null;
  progress: number;

  // Actions
  setReconstruction: (rec: Reconstruction) => void;
  setLoadedFiles: (files: LoadedFiles) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setProgress: (progress: number) => void;
  clear: () => void;
}

export const useReconstructionStore = create<ReconstructionState>((set) => ({
  reconstruction: null,
  loadedFiles: null,
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

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({
    error,
    loading: false
  }),

  setProgress: (progress) => set({ progress }),

  clear: () => set({
    reconstruction: null,
    loadedFiles: null,
    error: null,
    progress: 0,
    loading: false
  }),
}));

// Selector helpers
export const selectPointCount = (state: ReconstructionState) =>
  state.reconstruction?.points3D.size ?? 0;

export const selectImageCount = (state: ReconstructionState) =>
  state.reconstruction?.images.size ?? 0;

export const selectCameraCount = (state: ReconstructionState) =>
  state.reconstruction?.cameras.size ?? 0;
