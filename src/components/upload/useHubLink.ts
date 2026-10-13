import { useSyncExternalStore } from 'react';
import { hubPublications, type HubPublicationOptions } from '../../features/colmapviewHub/publication';

export function useHubLink(provider: keyof typeof hubPublications) {
  const controller = hubPublications[provider];
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { state, controller,
    options: (preview: File): [HubPublicationOptions] => [{ listed: false, preview }] };
}
export type HubLink = ReturnType<typeof useHubLink>;
