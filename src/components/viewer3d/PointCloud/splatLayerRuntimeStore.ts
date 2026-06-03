import { create } from 'zustand';

interface SplatLayerRuntimeState {
  readySplatFile: File | null;
  setReadySplatFile: (file: File | null) => void;
}

export const useSplatLayerRuntimeStore = create<SplatLayerRuntimeState>()((set) => ({
  readySplatFile: null,
  setReadySplatFile: (readySplatFile) => set({ readySplatFile }),
}));
