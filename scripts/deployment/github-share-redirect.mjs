/** Root dataset queries stay on Pages; recognized share IDs use the fixed Hub host. */
export function githubRootTarget({ pathname, search = '', hash = '' }) {
  return pathname === '/' ? `/latest/${search}${hash}` : null;
}

export function githubShareTarget(pathname) {
  const match = /^\/s\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  let id;
  try { id = decodeURIComponent(match[1]); } catch { return null; }
  if (!/^[A-Z][a-z]{2,13}[A-Z][a-z]{2,13}(?:-(?:L)?[A-Za-z0-9_-]{16})?$/i.test(id)) return null;
  return `https://colmapview.opsiclear.com/s/${encodeURIComponent(id)}`;
}

if (typeof window !== 'undefined') {
  const target = githubRootTarget(window.location) ?? githubShareTarget(window.location.pathname);
  if (target) window.location.replace(target);
}
