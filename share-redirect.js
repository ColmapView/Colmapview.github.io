/** GitHub Pages' root 404 handler recognizes only share IDs, never an arbitrary redirect URL. */
export function githubShareTarget(pathname) {
  const match = /^\/s\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  let id;
  try { id = decodeURIComponent(match[1]); } catch { return null; }
  if (!/^[A-Z][a-z]{2,13}[A-Z][a-z]{2,13}(?:-(?:L)?[A-Za-z0-9_-]{16})?$/i.test(id)) return null;
  return `https://colmapview.opsiclear.com/s/${encodeURIComponent(id)}`;
}

if (typeof window !== 'undefined') {
  const target = githubShareTarget(window.location.pathname);
  if (target) window.location.replace(target);
}
