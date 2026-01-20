/**
 * Helper for resolving public asset paths with the correct base URL.
 * This ensures assets work correctly when deployed to versioned paths
 * (e.g., /v0.3.2/, /latest/, /dev/).
 *
 * @param path - Asset path relative to public folder (e.g., "LOGO.png" or "/LOGO.png")
 * @returns Full path with base URL prefix
 */
export const publicAsset = (path: string): string =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
