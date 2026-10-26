/** Root dataset queries stay on Pages; Hub and share entry points use the fixed Hub host. */
export function githubRootTarget({ pathname, search = '', hash = '' }) {
  return pathname === '/' ? `/latest/${search}${hash}` : null;
}

export function githubHubTarget({ pathname, search = '' }) {
  if (!/^\/hub(?:\/datasets)?(?:\/|\/index\.html)?$/.test(pathname)) return null;
  const target = new URL('https://colmapview.opsiclear.com/hub/datasets/');
  const params = new URLSearchParams(search);
  for (const key of ['q', 'dataset', 'licenseCategory', 'sort', 'kind', 'provider', 'license', 'status',
    'data', 'photos', 'delivery', 'viewer', 'seed', 'page']) {
    const value = params.get(key);
    if (value) target.searchParams.set(key, value);
  }
  target.searchParams.set('viewerHost', 'github');
  return target.href;
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
  const target = githubRootTarget(window.location) ?? githubHubTarget(window.location) ?? githubShareTarget(window.location.pathname);
  if (target) window.location.replace(target);
}
