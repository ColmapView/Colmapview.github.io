import { appLogger } from '../utils/logger';

export interface UrlLoadGuard {
  finish: () => void;
  isActive: () => boolean;
  tryStart: () => boolean;
}

export const URL_LOAD_GUARD_MESSAGE = '[URL Loader] Already loading (sync guard), ignoring duplicate request';

export function createUrlLoadGuard(log: (message: string) => void = appLogger.info): UrlLoadGuard {
  let isLoadInProgress = false;

  return {
    tryStart() {
      if (isLoadInProgress) {
        log(URL_LOAD_GUARD_MESSAGE);
        return false;
      }
      isLoadInProgress = true;
      return true;
    },
    finish() {
      isLoadInProgress = false;
    },
    isActive() {
      return isLoadInProgress;
    },
  };
}
