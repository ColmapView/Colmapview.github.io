import { useEffect, useRef } from 'react';
import type { NotificationState } from '../../store';
import type {
  SplatBackendPreference,
  SplatBackendResolution,
} from '../../utils/splatBackendPolicy';
import { getWebGpuSplatBackendNotice } from './splatBackendNoticePolicy';

export function SplatBackendStatusNotifier({
  addNotification,
  requestedBackend,
  splatBackendResolution,
  splatFile,
  webGpuSplatCanvasMounted,
}: {
  addNotification: NotificationState['addNotification'];
  requestedBackend: SplatBackendPreference;
  splatBackendResolution: SplatBackendResolution;
  splatFile?: File;
  webGpuSplatCanvasMounted: boolean;
}) {
  const lastNoticeKeyRef = useRef('');

  useEffect(() => {
    const notice = getWebGpuSplatBackendNotice({
      requestedBackend,
      splatBackendResolution,
      splatFile,
      webGpuSplatCanvasMounted,
    });

    if (!notice || lastNoticeKeyRef.current === notice.key) {
      return;
    }

    lastNoticeKeyRef.current = notice.key;
    addNotification('warning', notice.message);
  }, [
    addNotification,
    requestedBackend,
    splatBackendResolution,
    splatFile,
    webGpuSplatCanvasMounted,
  ]);

  return null;
}
