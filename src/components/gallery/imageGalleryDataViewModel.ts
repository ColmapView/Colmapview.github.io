import type { Camera, Reconstruction } from '../../types/colmap';
import type {
  GalleryBorderColorMode,
  GalleryCameraFilter as CameraFilter,
  GallerySortDirection as SortDirection,
  GallerySortField as SortField,
  GalleryThumbnailDisplayMode,
  GalleryViewMode as ViewMode,
} from '../../types/gallery';

export {
  buildMatchedImageIds,
  getLastNavigationToImageId,
} from '../../utils/imageNavigationPolicy';

export type {
  CameraFilter,
  GalleryBorderColorMode,
  GalleryThumbnailDisplayMode,
  SortDirection,
  SortField,
  ViewMode,
};

export interface ImageData {
  imageId: number;
  name: string;
  file?: File;
  maskFile?: File;
  numPoints2D: number;
  numPoints3D: number;
  cameraId: number;
  cameraColorIndex: number;
  cameraWidth: number;
  cameraHeight: number;
  covisibleCount: number;
  avgError: number;
  splatPsnr?: number;
  splatSsim?: number;
}

interface GalleryImageSource {
  getImageSync: (imageName: string) => File | undefined;
  getMaskSync?: (imageName: string) => File | undefined;
}

interface BuildGalleryImagesOptions {
  reconstruction: Reconstruction | null;
  imageSource: GalleryImageSource;
  splatPsnrByImage?: ReadonlyMap<number, { psnr: number; ssim?: number }>;
  cameraFilter: CameraFilter;
  sortField: SortField;
  sortDirection: SortDirection;
}

export function buildImageRows<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

export function buildListRows<T>(items: T[]): T[][] {
  return items.map(item => [item]);
}

export function buildGalleryCameras(reconstruction: Reconstruction | null): Camera[] {
  if (!reconstruction) return [];
  return Array.from(reconstruction.cameras.values()).sort((a, b) => a.cameraId - b.cameraId);
}

export function buildGalleryImages({
  reconstruction,
  imageSource,
  splatPsnrByImage,
  cameraFilter,
  sortField,
  sortDirection,
}: BuildGalleryImagesOptions): ImageData[] {
  if (!reconstruction) return [];

  const cameraColorIndexById = new Map(
    Array.from(reconstruction.cameras.keys())
      .sort((a, b) => a - b)
      .map((cameraId, index) => [cameraId, index])
  );
  const mapped = Array.from(reconstruction.images.values())
    .filter((img) => cameraFilter === 'all' || img.cameraId === cameraFilter)
    .map((img) => {
      const stats = reconstruction.imageStats.get(img.imageId);
      const camera = reconstruction.cameras.get(img.cameraId);

      return {
        imageId: img.imageId,
        name: img.name,
        file: imageSource.getImageSync(img.name),
        maskFile: imageSource.getMaskSync?.(img.name),
        numPoints2D: img.numPoints2D ?? img.points2D.length,
        numPoints3D: stats?.numPoints3D ?? 0,
        cameraId: img.cameraId,
        cameraColorIndex: cameraColorIndexById.get(img.cameraId) ?? 0,
        cameraWidth: camera?.width ?? 0,
        cameraHeight: camera?.height ?? 0,
        covisibleCount: stats?.covisibleCount ?? 0,
        avgError: stats?.avgError ?? 0,
        splatPsnr: splatPsnrByImage?.get(img.imageId)?.psnr,
        splatSsim: splatPsnrByImage?.get(img.imageId)?.ssim,
      };
    });

  const sortMultiplier = sortDirection === 'asc' ? 1 : -1;
  mapped.sort((a, b) => {
    if (sortField === 'name') {
      return sortMultiplier * a.name.localeCompare(b.name);
    }
    if (sortField === 'splatPsnr' || sortField === 'splatSsim') {
      const aMetric = a[sortField];
      const bMetric = b[sortField];
      if (aMetric === undefined && bMetric === undefined) return 0;
      if (aMetric === undefined) return 1;
      if (bMetric === undefined) return -1;
    }
    const aValue = a[sortField];
    const bValue = b[sortField];
    if (typeof aValue !== 'number' || typeof bValue !== 'number') return 0;
    return sortMultiplier * (aValue - bValue);
  });

  return mapped;
}
