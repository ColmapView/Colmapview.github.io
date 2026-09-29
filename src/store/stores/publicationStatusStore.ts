import { create } from 'zustand';
import type { PublicationPhase } from '../../features/datasetPublishing/types';

/** Lightweight toolbar status; the SDK and publication service load only on demand. */
export const usePublicationStatusStore = create<{ phase: PublicationPhase }>(() => ({ phase: 'idle' }));
