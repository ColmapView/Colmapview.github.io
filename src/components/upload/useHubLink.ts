import { useSyncExternalStore } from 'react';
import { hubPublications } from '../../features/colmapviewHub/publication';

export function useHubLink(provider: keyof typeof hubPublications) {
  const controller = hubPublications[provider];
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { state, controller };
}
export type HubLink = ReturnType<typeof useHubLink>;
