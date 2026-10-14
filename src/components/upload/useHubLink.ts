import { useEffect, useSyncExternalStore } from 'react';
import { hubPublications } from '../../features/colmapviewHub/publication';

/** One provider's Hub link for an upload dialog. Whether the dialog is open decides if a finished link shows a toast. */
export function useHubLink(provider: keyof typeof hubPublications, dialogOpen: boolean) {
  const controller = hubPublications[provider];
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    controller.setDialogOpen(dialogOpen);
    return () => controller.setDialogOpen(false);
  }, [controller, dialogOpen]);
  return { state, enabled: controller.isEnabled(), busy: controller.isBusy(), retry: controller.retry, markDeleteLinkSeen: controller.markDeleteLinkSeen };
}
export type HubLink = ReturnType<typeof useHubLink>;
