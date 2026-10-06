/** Drive credentials are public browser configuration; this is a deployment capability boundary. */
export const GOOGLE_DRIVE_ENABLED_ORIGIN = 'https://colmapview.opsiclear.com';
export const GOOGLE_DRIVE_DISABLED_MESSAGE = `Google Drive is available at ${GOOGLE_DRIVE_ENABLED_ORIGIN}. Open this dataset there to use Google Drive.`;

interface GoogleDriveEnv {
  VITE_GOOGLE_DRIVE_ENABLED?: string;
  VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN?: string;
  VITE_GOOGLE_DRIVE_API_KEY?: string;
  VITE_GOOGLE_DRIVE_CLIENT_ID?: string;
  VITE_GOOGLE_DRIVE_APP_ID?: string;
}

export interface GoogleDriveHostingConfig {
  enabled: boolean;
  hostAllowed: boolean;
  /** A trusted destination for hosted viewers that do not offer Drive. */
  allowedOrigin: string;
  reason: 'enabled' | 'disabled' | 'unsupported-host' | 'missing-config';
}

function parseOrigin(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    // Accept origins only, without paths, user information, query strings, or fragments.
    if (url.origin !== value || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch { return null; }
}

function isLoopback(url: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

export function validateGoogleDriveApiKey(value: string | undefined): string | null {
  const key = value?.trim();
  return key && /^[A-Za-z0-9_-]{1,256}$/.test(key) ? key : null;
}

export function validateGoogleDriveClientId(value: string | undefined): string | null {
  const id = value?.trim();
  return id && /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(id) ? id : null;
}

export function validateGoogleDriveAppId(value: string | undefined): string | null {
  const id = value?.trim();
  return id && /^[1-9]\d{0,29}$/.test(id) ? id : null;
}

/** Pure policy resolver, also used to verify production artifacts without real credentials. */
export function resolveGoogleDriveHostingConfig(options: {
  origin: string;
  development: boolean;
  env: GoogleDriveEnv;
}): GoogleDriveHostingConfig {
  const { env, development } = options;
  const current = parseOrigin(options.origin);
  const flag = env.VITE_GOOGLE_DRIVE_ENABLED?.trim();
  const configuredOrigin = env.VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN?.trim();
  const allowed = parseOrigin(configuredOrigin);
  const local = Boolean(development && current && isLoopback(current));
  const localAllowed = Boolean(local && (!configuredOrigin || allowed?.origin === current?.origin));
  const hostedAllowed = Boolean(current?.origin === GOOGLE_DRIVE_ENABLED_ORIGIN
    && allowed?.origin === GOOGLE_DRIVE_ENABLED_ORIGIN && flag === 'true');
  const hostAllowed = flag !== 'false' && (flag === undefined || flag === 'true')
    && (localAllowed || hostedAllowed);
  const configured = Boolean(validateGoogleDriveApiKey(env.VITE_GOOGLE_DRIVE_API_KEY)
    || validateGoogleDriveClientId(env.VITE_GOOGLE_DRIVE_CLIENT_ID));
  return {
    hostAllowed,
    enabled: hostAllowed && configured,
    // Never send visitors from a hosted viewer to a developer's loopback address.
    allowedOrigin: localAllowed && allowed ? allowed.origin : GOOGLE_DRIVE_ENABLED_ORIGIN,
    reason: !hostAllowed ? (flag === 'false' ? 'disabled' : 'unsupported-host')
      : configured ? 'enabled' : 'missing-config',
  };
}

export function getGoogleDriveHostingConfig(): GoogleDriveHostingConfig {
  return resolveGoogleDriveHostingConfig({
    origin: typeof window === 'undefined' ? '' : window.location.origin,
    development: import.meta.env.DEV,
    env: import.meta.env,
  });
}

export function isGoogleDriveEnabled(): boolean {
  return getGoogleDriveHostingConfig().enabled;
}

export function assertGoogleDriveHostAllowed(): void {
  if (!getGoogleDriveHostingConfig().hostAllowed) throw new Error(GOOGLE_DRIVE_DISABLED_MESSAGE);
}

export function getGoogleDriveConfiguration(): {
  hosting: GoogleDriveHostingConfig;
  apiKey: string | null;
  clientId: string | null;
  appId: string | null;
} {
  const hosting = getGoogleDriveHostingConfig();
  return {
    hosting,
    apiKey: hosting.hostAllowed ? validateGoogleDriveApiKey(import.meta.env.VITE_GOOGLE_DRIVE_API_KEY) : null,
    clientId: hosting.hostAllowed ? validateGoogleDriveClientId(import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID) : null,
    appId: hosting.hostAllowed ? validateGoogleDriveAppId(import.meta.env.VITE_GOOGLE_DRIVE_APP_ID) : null,
  };
}
