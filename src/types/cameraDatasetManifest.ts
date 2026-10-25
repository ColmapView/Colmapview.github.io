import { z } from 'zod';

const resourceUrl = z.string().url().refine(value => /^https?:\/\//i.test(value));

/** Explicit source metadata and scene-local geometry; cameras retain the metadata's world frame. */
const cameraDatasetShape = {
  format: z.literal('colmapview-camera-dataset'),
  metadataUrl: resourceUrl,
  /** Explicit NeRF frame subset, e.g. all views at one time in a deforming scene. */
  frameIndices: z.array(z.number().int().nonnegative()).min(1).max(100_000).refine(values => new Set(values).size === values.length).optional(),
  pointCloud: z.object({
    url: resourceUrl,
    format: z.enum(['ply', 'npz']).default('ply'),
    array: z.string().regex(/^[A-Za-z0-9_]+$/).optional(),
    frame: z.number().int().nonnegative().optional(),
    /** Row-major source-cloud to metadata-world similarity. Never reapplied to the cameras. */
    transform: z.array(z.number().finite()).length(16).optional(),
  }).strict().superRefine((cloud, context) => {
    if (cloud.format === 'npz' ? !cloud.array || cloud.frame === undefined : cloud.array !== undefined || cloud.frame !== undefined) {
      context.addIssue({ code: 'custom', message: 'NPZ vertices require an array and frame; PLY does not use them.' });
    }
  }).optional(),
  tracksUrl: resourceUrl.optional(),
};

const splatUrl = resourceUrl.refine(value => {
  const url = new URL(value);
  return !url.username && !url.password && !url.hash;
}, 'Gaussian sources must be credential-free URLs without fragments.');
const viewerStatePath = z.string().min(1).max(4096).refine(value => !value.startsWith('/') && !value.includes('\\')
  && !/^[a-z]+:/i.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..'));

/** Version 2 binds Gaussian sources separately from sparse points and preserves their saved alignment. */
export const CameraDatasetManifestSchema = z.discriminatedUnion('version', [
  z.object({ ...cameraDatasetShape, version: z.literal(1) }).strict(),
  z.object({ ...cameraDatasetShape, version: z.literal(2),
    splats: z.array(splatUrl).min(1).max(1024).refine(values => new Set(values).size === values.length),
    viewerStatePath: viewerStatePath.optional(),
  }).strict(),
]);

export type CameraDatasetManifest = z.infer<typeof CameraDatasetManifestSchema>;
export type ExplicitCameraPointCloud = NonNullable<CameraDatasetManifest['pointCloud']>;
