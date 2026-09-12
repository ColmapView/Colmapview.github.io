import { beforeEach, describe, expect, it } from 'vitest';
import { trainingConfigSchema } from '../../training/trainingClient';
import type { TrainingResolvedRecipe } from '../../training/types';
import wire from '../../training/fixtures/wire-v1.json';
import { STORAGE_KEYS } from '../migration';
import { useTrainingStore } from './trainingStore';

const editableConfig = trainingConfigSchema.parse({
  ...wire.config,
  editable_settings: {
    schema_version: 3,
    fields: [{
      key: 'batch_size', label: 'Batch size', description: 'Views per step.', group: 'Training',
      value_type: 'integer', default: 4, minimum: 1, maximum: 8,
    }],
  },
});

const recipe: TrainingResolvedRecipe = {
  base_recipe_id: editableConfig.recipe_id,
  recipe_id: 'resolved_recipe',
  settings_schema_version: 3,
  settings: { batch_size: 2 },
  effective_settings: { batch_size: 2 },
  recipe_summary: { batch_size: 2 },
  input_requirements: { mask_source: 'none' },
};

describe('training store persistence boundaries', () => {
  beforeEach(() => {
    localStorage.clear();
    useTrainingStore.setState(useTrainingStore.getInitialState(), true);
  });

  it('clears credentials, discovery state, and endpoint-scoped drafts when the URL changes', () => {
    useTrainingStore.getState().setConfig(editableConfig);
    useTrainingStore.getState().setSettingsDraft({ batch_size: 2 });
    useTrainingStore.getState().setToken('session-secret');
    useTrainingStore.getState().setAuthentication('bearer', true);

    useTrainingStore.getState().setServerUrl('https://training.example.test');

    expect(useTrainingStore.getState()).toMatchObject({
      serverUrl: 'https://training.example.test', token: '', authenticationMode: 'unknown',
      tokenRequired: false, config: null, settingsDraft: {}, settingsDraftKey: null,
    });
  });

  it('retains a sparse draft only while the endpoint and recipe schema key match', () => {
    useTrainingStore.getState().setConfig(editableConfig);
    const key = useTrainingStore.getState().settingsDraftKey;
    useTrainingStore.getState().setSettingsDraft({ batch_size: 2 });

    useTrainingStore.getState().setConfig(editableConfig);
    expect(useTrainingStore.getState()).toMatchObject({ settingsDraftKey: key, settingsDraft: { batch_size: 2 } });

    useTrainingStore.getState().setConfig({ ...editableConfig, recipe_id: 'new_base_recipe' });
    expect(useTrainingStore.getState()).toMatchObject({ settingsDraft: {}, settingsErrors: {} });
    expect(useTrainingStore.getState().settingsDraftKey).not.toBe(key);
  });

  it('persists the immutable recipe and sparse draft but never the bearer token', () => {
    useTrainingStore.getState().setConfig(editableConfig);
    useTrainingStore.getState().setSettingsDraft({ batch_size: 2 });
    useTrainingStore.getState().setAttemptRecipe(recipe);
    useTrainingStore.getState().setToken('session-secret');

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.training)!).state;
    expect(stored).toMatchObject({ settingsDraft: { batch_size: 2 }, attemptRecipe: recipe });
    expect(stored).not.toHaveProperty('token');
    expect(stored).not.toHaveProperty('authenticationMode');
  });

  it('marks an interrupted version-zero attempt as legacy instead of inventing a recipe', async () => {
    localStorage.setItem(STORAGE_KEYS.training, JSON.stringify({
      version: 0,
      state: {
        serverUrl: 'http://127.0.0.1:8787', datasetId: 'old-dataset', attemptSnapshotId: 'old-snapshot',
        submissionKey: 'old-key', admissionPending: false, previewEnabled: true,
      },
    }));

    await useTrainingStore.persist.rehydrate();

    expect(useTrainingStore.getState()).toMatchObject({
      datasetId: 'old-dataset', attemptSnapshotId: 'old-snapshot', attemptRecipe: null, legacyAttempt: true,
      token: '', authenticationMode: 'unknown',
    });
  });
});
