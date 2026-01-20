import { create } from 'zustand';
import type { Reconstruction, LoadedFiles } from '../types/colmap';
import type { WasmReconstructionWrapper } from '../wasm/reconstruction';

interface ReconstructionState {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
  loadedFiles: LoadedFiles | null;
  droppedFiles: Map<string, File> | null;
  loading: boolean;
  error: string | null;
  progress: number;

  setReconstruction: (rec: Reconstruction) => void;
  setWasmReconstruction: (wasm: WasmReconstructionWrapper | null) => void;
  setLoadedFiles: (files: LoadedFiles) => void;
  setDroppedFiles: (files: Map<string, File>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setProgress: (progress: number) => void;
  clear: () => void;
}

export const useReconstructionStore = create<ReconstructionState>((set, get) => ({
  reconstruction: null,
  wasmReconstruction: null,
  loadedFiles: null,
  droppedFiles: null,
  loading: false,
  error: null,
  progress: 0,

  setReconstruction: (reconstruction) => {
    // Note: wasmReconstruction is managed separately via setWasmReconstruction
    // The caller should call setWasmReconstruction BEFORE setReconstruction
    // to ensure the WASM wrapper is kept alive for the fast rendering path
    set({
      reconstruction,
      loading: false,
      progress: 100,
      error: null
    });
  },

  setWasmReconstruction: (wasmReconstruction) => {
    // Dispose old wrapper before setting new one
    const oldWasm = get().wasmReconstruction;
    if (oldWasm && oldWasm !== wasmReconstruction) {
      oldWasm.dispose();
    }
    set({ wasmReconstruction });
  },

  setLoadedFiles: (loadedFiles) => set({ loadedFiles }),

  setDroppedFiles: (droppedFiles) => set({ droppedFiles }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({
    error,
    loading: false
  }),

  setProgress: (progress) => set({ progress }),

  clear: () => {
    // Dispose WASM wrapper on clear
    const oldWasm = get().wasmReconstruction;
    if (oldWasm) {
      oldWasm.dispose();
    }
    set({
      reconstruction: null,
      wasmReconstruction: null,
      loadedFiles: null,
      droppedFiles: null,
      error: null,
      progress: 0,
      loading: false
    });
  },
}));

export const selectPointCount = (state: ReconstructionState) => {
  // Prefer WASM point count (always accurate), fall back to JS Map
  if (state.wasmReconstruction?.hasPoints()) {
    return state.wasmReconstruction.pointCount;
  }
  return state.reconstruction?.points3D?.size ?? 0;
};

export const selectImageCount = (state: ReconstructionState) =>
  state.reconstruction?.images.size ?? 0;

export const selectCameraCount = (state: ReconstructionState) =>
  state.reconstruction?.cameras.size ?? 0;
