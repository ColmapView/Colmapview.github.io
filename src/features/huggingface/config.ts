export interface HfConfig { clientId: string; redirectUri: string; readOnly?: boolean }

export type HfConfiguration =
  | { status: 'disabled' }
  | { status: 'unavailable'; message: string; viewerUrl?: string }
  | { status: 'ready'; config: HfConfig };

export function resolveHfConfiguration(env: Record<string, unknown>, origin: string): HfConfiguration {
  if (env.VITE_HF_PUBLISH_ENABLED !== 'true') return { status: 'disabled' };
  return resolveOAuthConfiguration(env, origin);
}

/** Private viewing can be enabled without enabling publication. */
export function resolveHfAccountConfiguration(env: Record<string, unknown>, origin: string): HfConfiguration {
  if (env.VITE_HF_PUBLISH_ENABLED === 'true') return resolveOAuthConfiguration(env, origin);
  if (env.VITE_HF_AUTH_ENABLED !== 'true') return { status: 'disabled' };
  return resolveOAuthConfiguration(env, origin, true);
}

function resolveOAuthConfiguration(env: Record<string, unknown>, origin: string, readOnly = false): HfConfiguration {
  const unavailable: HfConfiguration = {
    status: 'unavailable',
    message: 'Hugging Face sign-in has not been set up correctly for this viewer. Contact the site administrator.',
  };
  if (typeof env.VITE_HF_OAUTH_CLIENT_ID !== 'string' || !env.VITE_HF_OAUTH_CLIENT_ID.trim()
    || typeof env.VITE_HF_OAUTH_REDIRECT_URI !== 'string') return unavailable;
  try {
    const url = new URL(env.VITE_HF_OAUTH_REDIRECT_URI);
    // Cloudflare Pages redirects .html routes; the registered custom callback must use its canonical path.
    const validCallbackPath = url.origin === 'https://colmapview.opsiclear.com'
      ? url.pathname === '/hf-callback'
      : url.pathname.endsWith('/hf-callback.html');
    if (url.username || url.password || url.search || url.hash
      || !validCallbackPath) return unavailable;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return unavailable;
    if (url.origin !== origin) return {
      status: 'unavailable',
      message: `Hugging Face sign-in is configured for ${url.origin}. Open that viewer to sign in.`,
      viewerUrl: new URL('.', url).href,
    };
    return { status: 'ready', config: { clientId: env.VITE_HF_OAUTH_CLIENT_ID.trim(), redirectUri: url.href,
      ...(readOnly ? { readOnly: true } : {}) } };
  } catch { return unavailable; }
}

export function resolveHfConfig(env: Record<string, unknown>, origin: string): HfConfig | null {
  const configuration = resolveHfConfiguration(env, origin);
  return configuration.status === 'ready' ? configuration.config : null;
}

export function getHfConfiguration(): HfConfiguration {
  return resolveHfConfiguration(import.meta.env, window.location.origin);
}

export function getHfAccountConfiguration(): HfConfiguration {
  return resolveHfAccountConfiguration(import.meta.env, window.location.origin);
}
