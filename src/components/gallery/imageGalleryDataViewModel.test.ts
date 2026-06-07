import { describe, expect, it } from 'vitest';
import {
  buildCamera,
  buildFile,
  buildImage,
  buildImageStats,
  buildReconstruction,
} from '../../test/builders';
import {
  buildGalleryCameras,
  buildGalleryImages,
  buildImageRows,
  buildListRows,
} from './imageGalleryDataViewModel';

describe('image gallery data view-model', () => {
  it('builds grid and list rows for virtualized rendering', () => {
    expect(buildImageRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(buildImageRows([1, 2, 3], 4)).toEqual([[1, 2, 3]]);
    expect(buildListRows(['a', 'b'])).toEqual([['a'], ['b']]);
  });

  it('builds filtered and sorted image rows with cached files and stats', () => {
    const camera2 = buildCamera({ cameraId: 2, width: 800, height: 600 });
    const camera1 = buildCamera({ cameraId: 1, width: 640, height: 480 });
    const frameB = buildImage({
      imageId: 20,
      cameraId: camera2.cameraId,
      name: 'b.jpg',
      numPoints2D: 8,
    });
    const frameA = buildImage({
      imageId: 10,
      cameraId: camera1.cameraId,
      name: 'a.jpg',
      numPoints2D: 12,
    });
    const cachedFile = buildFile('a.jpg');
    const reconstruction = buildReconstruction({
      cameras: [camera2, camera1],
      images: [frameB, frameA],
      imageStats: new Map([
        [frameA.imageId, buildImageStats({ numPoints3D: 4, covisibleCount: 9, avgError: 0.5 })],
        [frameB.imageId, buildImageStats({ numPoints3D: 2, covisibleCount: 3, avgError: 1.5 })],
      ]),
    });

    const images = buildGalleryImages({
      reconstruction,
      imageSource: {
        getImageSync: (name) => name === cachedFile.name ? cachedFile : undefined,
      },
      splatPsnrByImage: new Map([[frameA.imageId, { psnr: 31.2, ssim: 0.943 }]]),
      cameraFilter: 'all',
      sortField: 'numPoints3D',
      sortDirection: 'desc',
    });

    expect(images.map(image => image.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(images[0]).toMatchObject({
      file: cachedFile,
      numPoints2D: 12,
      numPoints3D: 4,
      cameraWidth: 640,
      cameraHeight: 480,
      covisibleCount: 9,
      avgError: 0.5,
      splatPsnr: 31.2,
      splatSsim: 0.943,
    });

    const camera2Only = buildGalleryImages({
      reconstruction,
      imageSource: { getImageSync: () => undefined },
      cameraFilter: camera2.cameraId,
      sortField: 'name',
      sortDirection: 'asc',
    });
    expect(camera2Only.map(image => image.imageId)).toEqual([frameB.imageId]);
  });

  it('sorts PSNR values with missing metrics last', () => {
    const camera = buildCamera();
    const sharp = buildImage({ imageId: 1, cameraId: camera.cameraId, name: 'sharp.jpg' });
    const soft = buildImage({ imageId: 2, cameraId: camera.cameraId, name: 'soft.jpg' });
    const missing = buildImage({ imageId: 3, cameraId: camera.cameraId, name: 'missing.jpg' });
    const reconstruction = buildReconstruction({
      cameras: [camera],
      images: [missing, soft, sharp],
    });

    const images = buildGalleryImages({
      reconstruction,
      imageSource: { getImageSync: () => undefined },
      splatPsnrByImage: new Map([
        [sharp.imageId, { psnr: 32 }],
        [soft.imageId, { psnr: 18 }],
      ]),
      cameraFilter: 'all',
      sortField: 'splatPsnr',
      sortDirection: 'desc',
    });

    expect(images.map(image => image.name)).toEqual(['sharp.jpg', 'soft.jpg', 'missing.jpg']);
  });

  it('sorts SSIM values with missing metrics last', () => {
    const camera = buildCamera();
    const best = buildImage({ imageId: 1, cameraId: camera.cameraId, name: 'best.jpg' });
    const ok = buildImage({ imageId: 2, cameraId: camera.cameraId, name: 'ok.jpg' });
    const missing = buildImage({ imageId: 3, cameraId: camera.cameraId, name: 'missing.jpg' });
    const reconstruction = buildReconstruction({
      cameras: [camera],
      images: [missing, ok, best],
    });

    const images = buildGalleryImages({
      reconstruction,
      imageSource: { getImageSync: () => undefined },
      splatPsnrByImage: new Map([
        [best.imageId, { psnr: 30, ssim: 0.96 }],
        [ok.imageId, { psnr: 31, ssim: 0.84 }],
      ]),
      cameraFilter: 'all',
      sortField: 'splatSsim',
      sortDirection: 'desc',
    });

    expect(images.map(image => image.name)).toEqual(['best.jpg', 'ok.jpg', 'missing.jpg']);
  });

  it('derives camera options sorted by camera ID', () => {
    const camera2 = buildCamera({ cameraId: 2 });
    const camera1 = buildCamera({ cameraId: 1 });
    const reconstruction = buildReconstruction({
      cameras: [camera2, camera1],
    });

    expect(buildGalleryCameras(reconstruction).map(camera => camera.cameraId)).toEqual([1, 2]);
  });
});
