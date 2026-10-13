import { useState, useSyncExternalStore } from 'react';
import { hubPublications, type HubPublicationOptions } from '../../features/colmapviewHub/publication';

export function useHubLink(provider: keyof typeof hubPublications, sourceKey: string) {
  const controller = hubPublications[provider];
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [selection, setSelection] = useState({ sourceKey, listed: false });
  const listed = selection.sourceKey === sourceKey && selection.listed;
  const setListed = (value: boolean) => setSelection({ sourceKey, listed: value });
  return { listed, setListed, state, controller,
    options: (preview: File | null): [HubPublicationOptions] => [{ listed, ...(preview ? { preview } : {}) }] };
}
export type HubLink = ReturnType<typeof useHubLink>;
