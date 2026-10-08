import { vi } from 'vitest';

/** Serve the viewer from `origin` with Drive explicitly enabled for the hosted custom domain only. */
export function stubGoogleDriveHost(origin: string, { production = false } = {}): void {
  if (production) { vi.stubEnv('PROD', true); vi.stubEnv('DEV', false); }
  vi.stubGlobal('location', { origin });
  vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
  vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', 'https://colmapview.opsiclear.com');
}
