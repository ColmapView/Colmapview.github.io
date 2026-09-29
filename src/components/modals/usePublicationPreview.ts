import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPublicationPreview } from '../../features/datasetPublishing/publicationPreview';
import { useFileUrl } from '../../hooks/useFileUrl';
import type { ScreenshotCallback } from '../../store/stores/exportStore';

export function usePublicationPreview(sourceKey: string, enabled: boolean, getScreenshot: ScreenshotCallback | null) {
  const [resource] = useState(() => createPublicationPreview());
  const snapshot = useSyncExternalStore(resource.subscribe, resource.getSnapshot);
  const file = snapshot.sourceKey === sourceKey ? snapshot.file : null;
  const url = useFileUrl(file);

  useEffect(() => {
    resource.syncSource(sourceKey);
    if (enabled && sourceKey && getScreenshot && resource.getSnapshot().kind === 'view') {
      void resource.capture(getScreenshot);
    }
    return resource.cancel;
  }, [enabled, getScreenshot, resource, sourceKey]);

  return {
    ...snapshot, file, url,
    replace: (image: File) => { void resource.replace(image); },
  };
}
