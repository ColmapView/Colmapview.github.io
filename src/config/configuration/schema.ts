import { z } from 'zod';
import type { ConfigValidationResult, PartialAppConfiguration } from './types';
import { CONFIG_VERSION } from './types';

// Enum schemas matching store/types.ts
const colorModeSchema = z.enum(['rgb', 'error', 'trackLength']);
const cameraModeSchema = z.enum(['orbit', 'fly']);
const cameraProjectionSchema = z.enum(['perspective', 'orthographic']);
const cameraDisplayModeSchema = z.enum(['off', 'frustum', 'arrow', 'imageplane']);
const frustumColorModeSchema = z.enum(['single', 'byCamera']);
const selectionColorModeSchema = z.enum(['off', 'static', 'blink', 'rainbow']);
const matchesDisplayModeSchema = z.enum(['off', 'on', 'blink']);
const axesDisplayModeSchema = z.enum(['off', 'axes', 'grid', 'both']);
const axesCoordinateSystemSchema = z.enum([
  'colmap', 'opencv', 'threejs', 'opengl', 'vulkan', 'blender', 'houdini', 'unity', 'unreal'
]);
const imageLoadModeSchema = z.enum(['prefetch', 'lazy', 'skip']);
const gizmoModeSchema = z.enum(['off', 'local', 'global']);
const screenshotSizeSchema = z.enum([
  'current', '1920x1080', '1280x720', '3840x2160', '1024x1024', '512x512', '2048x2048'
]);
const screenshotFormatSchema = z.enum(['jpeg', 'png', 'webp']);
const exportFormatSchema = z.enum(['text', 'binary', 'ply']);

// Hex color validator
const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format');

// Domain schemas (all fields optional for partial config support)
const pointCloudConfigSchema = z.object({
  pointSize: z.number().min(0.1).max(50).optional(),
  colorMode: colorModeSchema.optional(),
  minTrackLength: z.number().int().min(1).optional(),
  maxReprojectionError: z.number().positive().nullable().optional(),
}).optional();

const cameraConfigSchema = z.object({
  displayMode: cameraDisplayModeSchema.optional(),
  scale: z.number().min(0.01).max(10).optional(),
  frustumColorMode: frustumColorModeSchema.optional(),
  unselectedOpacity: z.number().min(0).max(1).optional(),
  mode: cameraModeSchema.optional(),
  projection: cameraProjectionSchema.optional(),
  fov: z.number().min(10).max(120).optional(),
  horizonLock: z.boolean().optional(),
  flySpeed: z.number().min(0.1).max(50).optional(),
  pointerLock: z.boolean().optional(),
  selectionColorMode: selectionColorModeSchema.optional(),
  selectionAnimationSpeed: z.number().min(0.1).max(10).optional(),
  imagePlaneOpacity: z.number().min(0).max(1).optional(),
}).optional();

const uiConfigSchema = z.object({
  showPoints2D: z.boolean().optional(),
  showPoints3D: z.boolean().optional(),
  backgroundColor: hexColorSchema.optional(),
  autoRotate: z.boolean().optional(),
  matchesDisplayMode: matchesDisplayModeSchema.optional(),
  matchesOpacity: z.number().min(0).max(1).optional(),
  maskOverlay: z.boolean().optional(),
  maskOpacity: z.number().min(0).max(1).optional(),
  axesDisplayMode: axesDisplayModeSchema.optional(),
  axesCoordinateSystem: axesCoordinateSystemSchema.optional(),
  axesScale: z.number().min(0.1).max(100).optional(),
  imageLoadMode: imageLoadModeSchema.optional(),
  gizmoMode: gizmoModeSchema.optional(),
}).optional();

const exportConfigSchema = z.object({
  screenshotSize: screenshotSizeSchema.optional(),
  screenshotFormat: screenshotFormatSchema.optional(),
  screenshotHideLogo: z.boolean().optional(),
  modelFormat: exportFormatSchema.optional(),
}).optional();

// Full config schema
export const appConfigurationSchema = z.object({
  version: z.number().int().min(1).max(CONFIG_VERSION).optional(),
  pointCloud: pointCloudConfigSchema,
  camera: cameraConfigSchema,
  ui: uiConfigSchema,
  export: exportConfigSchema,
});

export function validateConfiguration(config: unknown): ConfigValidationResult {
  const result = appConfigurationSchema.safeParse(config);

  if (result.success) {
    return {
      valid: true,
      errors: [],
      config: result.data as PartialAppConfiguration,
    };
  }

  const errors = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    value: undefined,
  }));

  return {
    valid: false,
    errors,
    config: null,
  };
}
