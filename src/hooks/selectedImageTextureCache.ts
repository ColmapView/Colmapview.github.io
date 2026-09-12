import * as THREE from 'three';

export interface SelectedImageTextureCacheEntry {
  name: string;
  texture: THREE.Texture;
}

let selectedImageTexture: SelectedImageTextureCacheEntry | null = null;
const selectedImageTextureBitmaps = new WeakMap<THREE.Texture, ImageBitmap>();
const textureLeases = new Map<THREE.Texture, number>();
const retiredTextures = new Map<THREE.Texture, SelectedImageTextureCacheEntry>();

export function retainSelectedImageTexture(texture: THREE.Texture): () => void {
  textureLeases.set(texture, (textureLeases.get(texture) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (textureLeases.get(texture) ?? 1) - 1;
    if (remaining > 0) { textureLeases.set(texture, remaining); return; }
    textureLeases.delete(texture);
    const retired = retiredTextures.get(texture);
    if (retired) {
      retiredTextures.delete(texture);
      disposeSelectedImageTextureEntry(retired);
    }
  };
}

export function createSelectedImageTextureFromBitmap(bitmap: ImageBitmap): THREE.Texture {
  const texture = new THREE.Texture(bitmap);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  selectedImageTextureBitmaps.set(texture, bitmap);
  return texture;
}

export function getSelectedImageTexture(imageName: string): THREE.Texture | null {
  return selectedImageTexture?.name === imageName ? selectedImageTexture.texture : null;
}

export function replaceSelectedImageTexture(imageName: string, texture: THREE.Texture): THREE.Texture {
  if (selectedImageTexture?.texture !== texture) {
    disposeSelectedImageTextureEntry(selectedImageTexture);
  }
  selectedImageTexture = { name: imageName, texture };
  return texture;
}

export function clearSelectedImageTextureCache(): void {
  disposeSelectedImageTextureEntry(selectedImageTexture);
  selectedImageTexture = null;
}

export function disposeSelectedImageTextureEntry(entry: SelectedImageTextureCacheEntry | null): void {
  if (!entry) return;

  const { texture } = entry;
  if ((textureLeases.get(texture) ?? 0) > 0) {
    retiredTextures.set(texture, entry);
    return;
  }
  texture.needsUpdate = false;
  texture.dispose();

  const bitmap = selectedImageTextureBitmaps.get(texture);
  if (bitmap) {
    bitmap.close();
    selectedImageTextureBitmaps.delete(texture);
  }
}
