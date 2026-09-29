import { dump, load, JSON_SCHEMA } from 'js-yaml';
import { z } from 'zod';
import { sections, getPersistedProperties, getStoreKey } from '../config/registry';
import { generatePropertySchema } from '../config/registry/generators/schema';
import { camelToSnake, snakeToCamel, toSnakeCase } from '../config/configuration/converter';
import {
  MAX_VIEWER_STATE_BYTES, PublishedViewerStateSchema, SHARED_CONFIG_SECTIONS, Sim3dEulerSchema,
  parsePublishedViewerState, type PublishedViewerState,
} from './publishedViewerState';
import type { ShareConfig } from './shareDataCodec';

export const DATASET_VIEWER_SETTINGS_FILE = 'colmapview.yaml';

export function isDatasetViewerSettingsPath(path: string): boolean {
  return path.replace(/\\/g, '/').split('/').pop()?.toLowerCase() === DATASET_VIEWER_SETTINGS_FILE;
}

/** Prefer the project root, including archives wrapped in a top-level directory. */
export function findDatasetViewerSettingsEntry<T>(files: ReadonlyMap<string, T>): [string, T] | undefined {
  return [...files].filter(([path]) => isDatasetViewerSettingsPath(path)).sort(([a], [b]) =>
    a.split(/[/\\]/).length - b.split(/[/\\]/).length || a.localeCompare(b))[0];
}

/** Resolve project-relative splat paths without confusing equal basenames in other folders. */
export function resolveDatasetSplatSourceId(sourceId: string, settingsPath: string, paths: Iterable<string>): string {
  const normalize = (path: string) => path.replace(/\\/g, '/').replace(/^\.\//, '');
  const root = normalize(settingsPath).split('/').slice(0, -1).join('/');
  const target = root ? `${root}/${normalize(sourceId)}` : normalize(sourceId);
  return [...paths].find(path => normalize(path) === target) ?? sourceId;
}

const transformSchema = z.object(Object.fromEntries(
  Object.entries(Sim3dEulerSchema.shape).map(([key, schema]) => [toSnakeCase(key), schema]),
));
const fields: Record<string, z.ZodType> = {
  version: z.literal(1).default(1),
  viewer_version: PublishedViewerStateSchema.shape.viewerVersion.optional(),
  view_state: PublishedViewerStateSchema.shape.viewState.default(null),
  transform: transformSchema.optional(),
  splat: z.object({ active_source_id: z.string().max(4096).optional(), transform: transformSchema.optional() }).optional(),
};
// An invalid or outdated display value drops only itself (and never retains an aliased object);
// structure, view state and alignment above stay strict.
const lenient = (schema: z.ZodType) => schema.catch(undefined);
for (const key of SHARED_CONFIG_SECTIONS) {
  const section = sections.find(section => section.key === key)!;
  const properties = Object.fromEntries(getPersistedProperties(section).map(property =>
    [toSnakeCase(property.key), lenient(generatePropertySchema(property))]));
  if (key === 'camera') properties.selected_image_id = lenient(z.number().int().nonnegative().nullable().optional());
  fields[toSnakeCase(key)] = z.object(properties).optional();
}
const settingsSchema = z.object(fields);

/** Accept the existing configuration YAML names, plus saved view/alignment metadata. */
export function parseDatasetViewerSettings(text: string): PublishedViewerState {
  if (new TextEncoder().encode(text).length > MAX_VIEWER_STATE_BYTES) throw new Error('Viewer settings exceed the supported size.');
  // Validate the shallow, allowlisted structure before recursively converting keys.
  // Unknown fields and YAML alias cycles cannot become store values or actions.
  const validated = settingsSchema.parse(load(text, { schema: JSON_SCHEMA }));
  const document = snakeToCamel(validated) as Record<string, unknown>;
  const config: ShareConfig = {};
  for (const key of SHARED_CONFIG_SECTIONS) {
    const values = document[key] as Record<string, unknown> | undefined;
    if (!values) continue;
    const section = sections.find(section => section.key === key)!;
    const target: Record<string, unknown> = {};
    for (const property of getPersistedProperties(section)) {
      if (values[property.key] !== undefined) target[getStoreKey(property)] = values[property.key];
    }
    if (key === 'camera' && values.selectedImageId !== undefined) target.selectedImageId = values.selectedImageId;
    config[key] = target;
  }
  return parsePublishedViewerState({ version: document.version, viewerVersion: document.viewerVersion ?? 'unspecified',
    viewState: document.viewState, config: { ...config, transform: document.transform, splat: document.splat } });
}

/** Snapshot values come from the reviewed publication, never from mutable live stores. */
export function serializeDatasetViewerSettings(input: PublishedViewerState): string {
  const state = parsePublishedViewerState(input);
  const document: Record<string, unknown> = { version: state.version, viewerVersion: state.viewerVersion, viewState: state.viewState };
  for (const key of SHARED_CONFIG_SECTIONS) {
    const values = state.config[key];
    if (!values) continue;
    const section = sections.find(section => section.key === key)!;
    const target: Record<string, unknown> = {};
    for (const property of getPersistedProperties(section)) {
      const value = values[getStoreKey(property)];
      if (value !== undefined) target[property.key] = value;
    }
    if (key === 'camera' && values.selectedImageId !== undefined) target.selectedImageId = values.selectedImageId;
    document[key] = target;
  }
  if (state.config.transform) document.transform = state.config.transform;
  if (state.config.splat) document.splat = state.config.splat;
  const yaml = '# ColmapView dataset settings\n' + dump(camelToSnake(document), { noRefs: true, lineWidth: 120 });
  if (new TextEncoder().encode(yaml).length > MAX_VIEWER_STATE_BYTES) throw new Error('Viewer settings exceed the supported size.');
  return yaml;
}
