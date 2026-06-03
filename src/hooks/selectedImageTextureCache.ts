import * as THREE from 'three';

export interface SelectedImageTextureCacheEntry {
  name: string;
  texture: THREE.Texture;
}

let selectedImageTexture: SelectedImageTextureCacheEntry | null = null;
const selectedImageTextureBitmaps = new WeakMap<THREE.Texture, ImageBitmap>();

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
  const bitmap = selectedImageTextureBitmaps.get(texture);
  if (bitmap) {
    bitmap.close();
    selectedImageTextureBitmaps.delete(texture);
  }
  texture.image = null;
  texture.needsUpdate = false;
  texture.dispose();
}
