export type ImageGalleryKeyboardActionType = 'select' | 'navigate';
export type GalleryNavigationKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';
export type GalleryKeyboardViewMode = 'gallery' | 'list';

interface GalleryKeyboardImage {
  imageId: number;
}

interface ImageGalleryKeyboardNavigationActionInput {
  key: string;
  target: EventTarget | null;
  shiftKey: boolean;
  images: GalleryKeyboardImage[];
  selectedImageId: number | null;
  viewMode: GalleryKeyboardViewMode;
  galleryColumns: number;
}

export interface ImageGalleryKeyboardNavigationAction {
  type: ImageGalleryKeyboardActionType;
  imageId: number;
}

interface GalleryKeyboardNavigationImageInput {
  key: string;
  target: EventTarget | null;
  images: GalleryKeyboardImage[];
  selectedImageId: number | null;
  viewMode: GalleryKeyboardViewMode;
  galleryColumns: number;
}

const GALLERY_NAVIGATION_KEYS = new Set<string>([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
]);

export function isGalleryNavigationKey(key: string): key is GalleryNavigationKey {
  return GALLERY_NAVIGATION_KEYS.has(key);
}

export function isGalleryKeyboardTextTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export function getGalleryKeyboardNavigationImageId({
  key,
  target,
  images,
  selectedImageId,
  viewMode,
  galleryColumns,
}: GalleryKeyboardNavigationImageInput): number | null {
  if (isGalleryKeyboardTextTarget(target) || images.length === 0 || !isGalleryNavigationKey(key)) {
    return null;
  }

  const currentIndex = selectedImageId !== null
    ? images.findIndex((img) => img.imageId === selectedImageId)
    : -1;

  let nextIndex: number;

  if (viewMode === 'gallery') {
    switch (key) {
      case 'ArrowLeft':
        nextIndex = currentIndex <= 0 ? images.length - 1 : currentIndex - 1;
        break;
      case 'ArrowRight':
        nextIndex = currentIndex >= images.length - 1 ? 0 : currentIndex + 1;
        break;
      case 'ArrowUp':
        nextIndex = currentIndex - galleryColumns;
        if (nextIndex < 0) nextIndex = currentIndex;
        break;
      case 'ArrowDown':
        nextIndex = currentIndex + galleryColumns;
        if (nextIndex >= images.length) nextIndex = currentIndex;
        break;
    }
  } else {
    switch (key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = currentIndex <= 0 ? images.length - 1 : currentIndex - 1;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = currentIndex >= images.length - 1 ? 0 : currentIndex + 1;
        break;
    }
  }

  if (currentIndex === -1) {
    nextIndex = key === 'ArrowLeft' || key === 'ArrowUp' ? images.length - 1 : 0;
  }

  return images[nextIndex]?.imageId ?? null;
}

export function getImageGalleryKeyboardNavigationAction({
  key,
  target,
  shiftKey,
  images,
  selectedImageId,
  viewMode,
  galleryColumns,
}: ImageGalleryKeyboardNavigationActionInput): ImageGalleryKeyboardNavigationAction | null {
  const imageId = getGalleryKeyboardNavigationImageId({
    key,
    target,
    images,
    selectedImageId,
    viewMode,
    galleryColumns,
  });

  if (imageId === null) return null;

  return {
    type: shiftKey ? 'navigate' : 'select',
    imageId,
  };
}
