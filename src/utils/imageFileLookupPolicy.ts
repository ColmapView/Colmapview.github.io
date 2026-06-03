const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'];

export interface UrlCandidate {
  url: string;
  filename: string;
}

export function normalizeImagePath(path: string): string {
  return path.replace(/\\/g, '/');
}

export function isImageFile(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lowerPath.endsWith(ext));
}

export function getPathSuffixes(path: string): string[] {
  const parts = normalizeImagePath(path).split('/');
  const suffixes: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    suffixes.push(parts.slice(i).join('/'));
  }

  return suffixes;
}

export function getImageLookupKeys(path: string): string[] {
  const keys: string[] = [];

  for (const suffix of getPathSuffixes(path)) {
    keys.push(suffix);

    const lowerSuffix = suffix.toLowerCase();
    if (lowerSuffix !== suffix) {
      keys.push(lowerSuffix);
    }
  }

  return keys;
}

export function buildImageUrl(imageUrlBase: string, imageName: string): UrlCandidate {
  let normalizedName = normalizeImagePath(imageName);

  const urlBaseLower = imageUrlBase.toLowerCase();
  const nameLower = normalizedName.toLowerCase();
  if (urlBaseLower.endsWith('/images/') && nameLower.startsWith('images/')) {
    normalizedName = normalizedName.slice(7);
  }

  const url = imageUrlBase.endsWith('/')
    ? `${imageUrlBase}${normalizedName}`
    : `${imageUrlBase}/${normalizedName}`;
  const filename = normalizedName.split('/').pop() || normalizedName;

  return { url, filename };
}

export function getMaskLookupPaths(imageName: string): string[] {
  const normalized = normalizeImagePath(imageName);
  const replaced = normalized.replace(/\/images\//i, '/masks/').replace(/^images\//i, 'masks/');
  const hasImagesInPath = replaced !== normalized;
  const stripped = normalized.replace(/^images\//i, '');
  const maskPath = `masks/${stripped}`;
  const filename = normalized.split('/').pop() || '';
  const maskByFilename = `masks/${filename}`;
  const tryPaths: string[] = [];

  if (hasImagesInPath) {
    tryPaths.push(replaced, `${replaced}.png`);
  }

  tryPaths.push(maskPath, `${maskPath}.png`);

  if (maskByFilename !== maskPath) {
    tryPaths.push(maskByFilename, `${maskByFilename}.png`);
  }

  return tryPaths;
}

export function getMaskPathVariants(imageName: string): string[] {
  const normalized = normalizeImagePath(imageName);
  const basePath = normalized.toLowerCase().startsWith('images/')
    ? normalized.slice(7)
    : normalized;
  const filename = basePath.split('/').pop() || basePath;

  return [
    `masks/${basePath}`,
    `masks/${basePath}.png`,
    `masks/${filename}`,
    `masks/${filename}.png`,
  ];
}

export function buildMaskUrlCandidates(maskUrlBase: string, imageName: string): UrlCandidate[] {
  let normalizedName = normalizeImagePath(imageName);

  const urlBaseLower = maskUrlBase.toLowerCase();
  const nameLower = normalizedName.toLowerCase();
  if (urlBaseLower.endsWith('/masks/') && nameLower.startsWith('masks/')) {
    normalizedName = normalizedName.slice(6);
  }

  if (normalizedName.toLowerCase().startsWith('images/')) {
    normalizedName = normalizedName.slice(7);
  }

  const baseUrl = maskUrlBase.endsWith('/') ? maskUrlBase : `${maskUrlBase}/`;
  const maskNames = [normalizedName, `${normalizedName}.png`];

  return maskNames.map((maskName) => ({
    url: `${baseUrl}${maskName}`,
    filename: maskName.split('/').pop() || maskName,
  }));
}
