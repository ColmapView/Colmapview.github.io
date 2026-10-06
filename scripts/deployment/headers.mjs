/** Keep HTML bytes intact while preserving normal handling of hashed JS/CSS/WASM assets. */
export function cloudflareStaticHeaders() {
  const htmlRoutes = ['/', '/index', '/index.html', '/about', '/about.html', '/privacy', '/privacy.html', '/terms', '/terms.html', '/hf-callback', '/hf-callback.html'];
  return [
    '/*\n  Cross-Origin-Opener-Policy: same-origin-allow-popups\n  Referrer-Policy: strict-origin',
    ...htmlRoutes.map(route => `${route}\n  Cache-Control: public, no-cache, no-transform`),
    '/deployment.json\n  Cache-Control: no-cache',
  ].join('\n\n') + '\n';
}
