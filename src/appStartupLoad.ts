import type { ColmapManifest } from './types/manifest';
import { abandonUrlAutoLoadRequest, useCameraStore } from './store';
import { applyShareConfig } from './hooks/useUrlState';
import { runGuardedUrlLoad } from './appUrlLoadGuard';
import { APP_SHARED_CONFIG_LOG_MESSAGE, type AppStartupLoadPlan } from './appStartupPolicy';
import { offerStartupLinkRetry } from './appStartupRetry';
import { appLogger } from './utils/logger';

export interface StartupLoaders {
  loadFromUrl: (url: string) => Promise<boolean>;
  loadFromManifest: (manifest: ColmapManifest) => Promise<boolean>;
}

/** Runs a startup or shared link. A failed one stays retryable in this tab, since a reload drops a Hugging Face sign-in. */
export async function runStartupLoadPlan(plan: AppStartupLoadPlan, loaders: StartupLoaders): Promise<void> {
  // Applied before loading so display settings and the requested splat take effect during the load.
  if (plan.config) {
    appLogger.info(APP_SHARED_CONFIG_LOG_MESSAGE);
    applyShareConfig(plan.config);
  }
  if (plan.kind === 'none') return;
  appLogger.info(plan.logMessage);
  // The loader re-applies the URL's settings after the load (applyUrlOverrides).
  const loaded = plan.kind === 'inline-manifest'
    ? await loaders.loadFromManifest(plan.manifest)
    : await runGuardedUrlLoad({ manifestUrl: plan.manifestUrl, loadFromUrl: loaders.loadFromUrl, onDeclined: abandonUrlAutoLoadRequest });
  if (loaded && plan.selectedImageId !== null) useCameraStore.getState().setSelectedImageId(plan.selectedImageId);
  if (!loaded) offerStartupLinkRetry(() => runStartupLoadPlan(plan, loaders));
}
