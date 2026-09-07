import { z } from 'zod';
import { sections, getPersistedProperties, getStoreKey } from '../config/registry';
import { generatePropertySchema } from '../config/registry/generators/schema';
import { getStoreConfigAdapter } from '../config/registry/generators/storeAdapters';
import { useUITheme } from '../theme/uiTheme';
import { useTransformStore } from '../store/stores/transformStore';
import { useReconstructionStore } from '../store/reconstructionStore';
import { canLoadDataset, datasetLoadInput, startDatasetLoad, useDatasetLoad } from './datasetLoad';
import { cameraFeatures } from './cameraControl';
import { viewerFeatures } from './viewerFeatures';

export interface FeatureContract {
  id: string;
  title: string;
  description: string;
  group: string;
  input: z.ZodType;
  read: () => unknown;
  apply: (input: unknown) => void;
  available: () => boolean;
  completion?: 'job_accepted';
  undoable?: boolean;
  defaultInput?: Record<string, unknown>;
}

const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-z])(\dD)/g, '$1 $2').replace(/^./, char => char.toUpperCase());

// Reuse the configuration registry's validation and coordinated setters. Transient
// requests (file pickers, pointer lock, animation triggers) aren't settings tools.
export const featureCatalog: readonly FeatureContract[] = [
  ...cameraFeatures,
  ...viewerFeatures,
  {
    id: 'dataset.loadUrl', title: 'Load dataset URL', group: 'dataset',
    description: 'Load an HTTP(S) manifest, ZIP, splat or COLMAP base URL using the human URL loader. Replaces current data and clears undo history. Returns job acceptance, not completion: poll values["dataset.loadUrl"] in read state until succeeded or failed. An accepted load continues after Stop/disconnect, cannot be cancelled or undone, and may change data even if loading fails. Local filesystem paths are unsupported; serve local data over HTTP.',
    input: datasetLoadInput, read: () => useDatasetLoad.getState().job,
    apply: startDatasetLoad, available: canLoadDataset, completion: 'job_accepted', undoable: false,
  },
  ...sections.flatMap(section => getPersistedProperties(section).map(prop => {
    const adapter = getStoreConfigAdapter(section.storeHook);
    const key = getStoreKey(prop);
    const input = z.strictObject({ value: generatePropertySchema(prop).nonoptional() });
    return {
      id: `settings.${section.key}.${prop.key}`,
      title: label(prop.key),
      description: prop.description ?? `Set ${label(prop.key)} in ${section.key}.`,
      group: section.key,
      input,
      read: () => {
        const value = adapter.read(key);
        return value === Infinity && prop.type === 'number' && prop.nullable ? null : value;
      },
      apply: (raw: unknown) => {
        const { value } = input.parse(raw);
        adapter.write(key, value === null && prop.type === 'number' && prop.nullable ? Infinity : value);
      },
      available: () => true,
    };
  })),
  {
    id: 'settings.ui.theme', title: 'Theme', group: 'ui',
    description: 'Interface color theme. Does not change the scene background.',
    input: z.strictObject({ value: z.enum(['dark', 'light', 'system']) }),
    read: () => useUITheme.getState().theme,
    apply: input => useUITheme.getState().setTheme(z.strictObject({ value: z.enum(['dark', 'light', 'system']) }).parse(input).value),
    available: () => true,
  },
  {
    id: 'scene.transform.preview', title: 'Transform preview', group: 'scene',
    description: 'Replace the reversible display transform: x_scene = scale * R_XYZ * x_dataset + translation. Rotation is XYZ Euler in radians; translation uses dataset units. Does not bake coordinates into the dataset.',
    input: z.strictObject({
      scale: z.number().positive().max(1e6),
      rotationX: z.number(), rotationY: z.number(), rotationZ: z.number(),
      translationX: z.number(), translationY: z.number(), translationZ: z.number(),
    }),
    read: () => useTransformStore.getState().transform,
    apply: input => useTransformStore.getState().setTransform(input as Parameters<ReturnType<typeof useTransformStore.getState>['setTransform']>[0]),
    available: () => useReconstructionStore.getState().reconstruction !== null,
  },
];

const byId = new Map(featureCatalog.map(feature => [feature.id, feature]));
if (byId.size !== featureCatalog.length) throw new Error('Duplicate feature contract ID');
export const getFeature = (id: string) => byId.get(id);

export function describeFeatures() {
  return featureCatalog.map(feature => ({
    id: feature.id, title: feature.title, description: feature.description,
    group: feature.group, available: feature.available(),
    inputSchema: z.toJSONSchema(feature.input),
    completion: feature.completion ?? 'state_applied',
    undoable: feature.undoable ?? true,
    humanInterface: 'Settings > Agent controls > Feature controls',
    agentInterface: 'colmap_execute',
  }));
}
