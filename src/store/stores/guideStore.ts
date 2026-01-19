import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import { useNotificationStore } from './notificationStore';

export interface GuideState {
  // Persisted: count of times each tip has been shown
  tipShownCounts: Record<string, number>;

  // Actions
  showTip: (tipId: string, message: string, maxShows?: number) => boolean;
  getTipShownCount: (tipId: string) => number;
  resetGuide: () => void;
}

export const useGuideStore = create<GuideState>()(
  persist(
    (set, get) => ({
      tipShownCounts: {},

      showTip: (tipId, message, maxShows = 1) => {
        const count = get().tipShownCounts[tipId] || 0;
        if (count >= maxShows) return false;

        // Show notification
        useNotificationStore.getState().addNotification('info', message, 5000);

        // Increment count
        set((state) => ({
          tipShownCounts: {
            ...state.tipShownCounts,
            [tipId]: count + 1,
          },
        }));
        return true;
      },

      getTipShownCount: (tipId) => get().tipShownCounts[tipId] || 0,

      resetGuide: () => set({ tipShownCounts: {} }),
    }),
    {
      name: STORAGE_KEYS.guide,
      version: 0,
    }
  )
);
