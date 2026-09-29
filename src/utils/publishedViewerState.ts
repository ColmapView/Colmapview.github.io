import { z } from 'zod';
import { sections, getPersistedProperties, getStoreKey } from '../config/registry';
import { generatePropertySchema } from '../config/registry/generators/schema';
import type { ShareConfig } from './shareDataCodec';

export const MAX_VIEWER_STATE_BYTES = 256 * 1024;
export const Sim3dEulerSchema = z.object({
  scale: z.number().positive(),
  rotationX: z.number(), rotationY: z.number(), rotationZ: z.number(),
  translationX: z.number(), translationY: z.number(), translationZ: z.number(),
});

/** Registry sections carried by share links and colmapview.yaml. */
export const SHARED_CONFIG_SECTIONS = ['pointCloud', 'ui', 'camera', 'rig'] as const;
type SectionKey = typeof SHARED_CONFIG_SECTIONS[number];
const isSharedSection = (key: string): key is SectionKey => (SHARED_CONFIG_SECTIONS as readonly string[]).includes(key);
const sectionFields: Partial<Record<SectionKey, Record<string, z.ZodType>>> = {};
const configSections: Record<string, z.ZodType> = {};
for (const section of sections) {
  if (!isSharedSection(section.key)) continue;
  const fields: Record<string, z.ZodType> = {};
  for (const property of getPersistedProperties(section)) {
    fields[getStoreKey(property)] = generatePropertySchema(property);
  }
  if (section.key === 'camera') fields.selectedImageId = z.number().int().nonnegative().nullable().optional();
  sectionFields[section.key] = fields;
  configSections[section.key] = z.object(fields).optional();
}
const SplatSourceIdSchema = z.string().max(4096);

export const SharedConfigSchema = z.object({
  ...configSections,
  transform: Sim3dEulerSchema.optional(),
  splat: z.object({ activeSourceId: SplatSourceIdSchema.optional(), transform: Sim3dEulerSchema.optional() }).optional(),
});

export const PublishedViewerStateSchema = z.object({
  version: z.literal(1),
  viewerVersion: z.string().min(1).max(100),
  viewState: z.object({
    position: z.tuple([z.number(), z.number(), z.number()]),
    quaternion: z.tuple([z.number(), z.number(), z.number(), z.number()])
      .refine(value => value.some(component => component !== 0), 'Invalid camera quaternion'),
    target: z.tuple([z.number(), z.number(), z.number()]),
    distance: z.number().nonnegative(),
  }).nullable(),
  config: SharedConfigSchema,
});

export type PublishedViewerState = Omit<z.infer<typeof PublishedViewerStateSchema>, 'config'> & { config: ShareConfig };

const PublishedDocumentSchema = PublishedViewerStateSchema.extend({ config: z.record(z.string(), z.unknown()) });
const AlignmentSchema = z.object({
  transform: Sim3dEulerSchema.optional(),
  splat: z.object({ transform: Sim3dEulerSchema.optional() }).optional(),
});

export function parsePublishedViewerState(value: unknown): PublishedViewerState {
  const state = PublishedDocumentSchema.parse(value);
  // Alignment must be exact: a malformed transform rejects the document rather than misaligning splats.
  AlignmentSchema.parse(state.config);
  // Display settings are independent: an outdated or invalid value drops only itself.
  return { ...state, config: sanitizeShareConfig(state.config as ShareConfig) };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const validOrUndefined = <T>(schema: z.ZodType<T>, value: unknown): T | undefined => {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
};

/**
 * URL links and dataset documents must never replace store actions with input data.
 * Fields are checked one by one so a single stale or invalid value cannot discard
 * the remaining settings and alignment.
 */
export function sanitizeShareConfig(config: ShareConfig): ShareConfig {
  const result: ShareConfig = {};
  if (!isRecord(config)) return result;
  for (const [key, fields] of Object.entries(sectionFields) as Array<[SectionKey, Record<string, z.ZodType>]>) {
    const values: unknown = Object.hasOwn(config, key) ? config[key] : undefined;
    if (!isRecord(values)) continue;
    const kept: Record<string, unknown> = {};
    for (const [field, schema] of Object.entries(fields)) {
      const value = Object.hasOwn(values, field) ? validOrUndefined(schema, values[field]) : undefined;
      if (value !== undefined) kept[field] = value;
    }
    result[key] = kept;
  }
  const transform = validOrUndefined(Sim3dEulerSchema, config.transform);
  if (transform) result.transform = transform;
  if (isRecord(config.splat)) {
    const activeSourceId = validOrUndefined(SplatSourceIdSchema, config.splat.activeSourceId);
    const splatTransform = validOrUndefined(Sim3dEulerSchema, config.splat.transform);
    if (activeSourceId !== undefined || splatTransform) {
      result.splat = { ...(activeSourceId !== undefined ? { activeSourceId } : {}), ...(splatTransform ? { transform: splatTransform } : {}) };
    }
  }
  return result;
}

export async function readBoundedResponse(response: Response, maxBytes: number): Promise<Blob> {
  if (!response.ok) throw new Error(`File request failed (${response.status})`);
  const declared = Number(response.headers.get('content-length'));
  if (declared > maxBytes) {
    await response.body?.cancel();
    throw new Error('File exceeds the supported size.');
  }
  if (!response.body) {
    const blob = await response.blob();
    if (blob.size > maxBytes) throw new Error('File exceeds the supported size.');
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('File exceeds the supported size.');
      chunks.push(new Uint8Array(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  return new Blob(chunks);
}
