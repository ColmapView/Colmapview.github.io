export interface HfConfig { clientId: string; redirectUri: string }

export type HfConfiguration =
  | { status: 'disabled' }
  | { status: 'unavailable'; message: string; viewerUrl?: string }
  | { status: 'ready'; config: HfConfig };

export function resolveHfConfiguration(env: Record<string, unknown>, origin: string): HfConfiguration {
  if (env.VITE_HF_PUBLISH_ENABLED !== 'true') return { status: 'disabled' };
  const unavailable: HfConfiguration = {
    status: 'unavailable',
    message: 'Hugging Face publishing has not been set up correctly for this viewer. Contact the site administrator.',
  };
  if (typeof env.VITE_HF_OAUTH_CLIENT_ID !== 'string' || !env.VITE_HF_OAUTH_CLIENT_ID.trim()
    || typeof env.VITE_HF_OAUTH_REDIRECT_URI !== 'string') return unavailable;
  try {
    const url = new URL(env.VITE_HF_OAUTH_REDIRECT_URI);
    if (url.username || url.password || url.search || url.hash
      || !url.pathname.endsWith('/hf-callback.html')) return unavailable;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return unavailable;
    if (url.origin !== origin) return {
      status: 'unavailable',
      message: `Hugging Face sign-in is configured for ${url.origin}. Open that viewer and load your dataset there to publish.`,
      viewerUrl: new URL('.', url).href,
    };
    return { status: 'ready', config: { clientId: env.VITE_HF_OAUTH_CLIENT_ID.trim(), redirectUri: url.href } };
  } catch { return unavailable; }
}

export function resolveHfConfig(env: Record<string, unknown>, origin: string): HfConfig | null {
  const configuration = resolveHfConfiguration(env, origin);
  return configuration.status === 'ready' ? configuration.config : null;
}

export function getHfConfiguration(): HfConfiguration {
  return resolveHfConfiguration(import.meta.env, window.location.origin);
}
