import { trainingConfigSchema } from './trainingClient';
import {
  isLoopbackTrainingUrl,
  sanitizeTrainingSettings,
  skipUnavailableDirectoryMasks,
  trainingSettingsDraftKey,
  validateTrainingSettings,
} from './trainingSettings';

const config = trainingConfigSchema.parse({
  api_version: '1.0',
  backend: {
    backend_id: 'fake', version: '1', display_name: 'Fake', available: true,
    input_formats: ['colmap'], preview_formats: [], artifact_formats: ['ply'], progress_units: [],
  },
  recipe_id: 'base', recipe_summary: {}, input_requirements: { mask_source: 'none' }, limits: {},
  editable_settings: {
    schema_version: 1,
    fields: [
      { key: 'batch_size', label: 'Batch size', description: '', group: 'performance', value_type: 'integer', default: 4, minimum: 1, maximum: 16 },
      { key: 'use_masks', label: 'Use masks', description: '', group: 'masks', value_type: 'boolean', default: false },
      { key: 'mask_source', label: 'Mask source', description: '', group: 'masks', value_type: 'enum', default: 'auto', choices: [{ value: 'auto', label: 'Auto' }, { value: 'directory', label: 'Directory' }], enabled_when: [{ key: 'use_masks', equals: true }] },
      { key: 'foreground_margin', label: 'Foreground margin', description: '', group: 'foreground', value_type: 'number', default: 0.1, enabled_when: [{ key: 'use_masks', equals: true }] },
      { key: 'target_image_exposures', label: 'Image exposures', description: '', group: 'training', value_type: 'integer', default: null, nullable: true, minimum: 1 },
      { key: 'max_cap', label: 'Maximum splats', description: '', group: 'performance', value_type: 'integer', default: 0, minimum: 0, zero_label: 'Uncapped' },
    ],
  },
});

describe('training settings policy', () => {
  it('keeps a sparse, bounded, JSON-safe persisted draft', () => {
    expect(sanitizeTrainingSettings({ batch_size: 5, automatic: null, bad: Infinity, nested: {} })).toEqual({
      batch_size: 5, automatic: null,
    });
  });

  it('validates strict types, bounds, choices, and enabled conditions', () => {
    expect(validateTrainingSettings(config, { batch_size: 0, use_masks: false, mask_source: 'directory' })).toEqual({
      batch_size: 'Batch size must be at least 1.',
      mask_source: 'Mask source is not available with the current settings.',
    });
    expect(validateTrainingSettings(config, { use_masks: true, mask_source: 'directory', target_image_exposures: null, max_cap: 0 })).toEqual({});
  });

  it('keys drafts to the normalized endpoint and advertised recipe schema', () => {
    expect(trainingSettingsDraftKey('HTTP://LOCALHOST:8787/', config)).toBe('http://localhost:8787|fake|1|base|1');
  });

  it('recognizes only literal loopback training URLs', () => {
    expect(isLoopbackTrainingUrl('http://127.0.0.1:8787')).toBe(true);
    expect(isLoopbackTrainingUrl('http://[::1]:8787')).toBe(true);
    expect(isLoopbackTrainingUrl('https://training.example.com')).toBe(false);
    expect(isLoopbackTrainingUrl('http://localhost.example.com')).toBe(false);
  });

  it('disables directory masking and foreground crops when no masks exist', () => {
    const directoryConfig = trainingConfigSchema.parse({
      ...config,
      input_requirements: { mask_source: 'directory', missing_mask_policy: 'full_foreground' },
      editable_settings: {
        ...config.editable_settings,
        fields: config.editable_settings!.fields.map(field => field.key === 'mask_source'
          ? { ...field, default: 'directory' }
          : field.key === 'use_masks' ? { ...field, default: true } : field),
      },
    });
    expect(skipUnavailableDirectoryMasks(directoryConfig, {
      batch_size: 2, mask_source: 'directory', foreground_margin: 0.2,
    }, false)).toEqual({ batch_size: 2, use_masks: false });
  });

  it('preserves partial mask sets and image-embedded mask sources', () => {
    const directoryConfig = trainingConfigSchema.parse({
      ...config,
      input_requirements: { mask_source: 'directory' },
      editable_settings: {
        ...config.editable_settings,
        fields: config.editable_settings!.fields.map(field => field.key === 'mask_source'
          ? { ...field, default: 'directory' }
          : field.key === 'use_masks' ? { ...field, default: true } : field),
      },
    });
    const settings = { batch_size: 2 };
    expect(skipUnavailableDirectoryMasks(directoryConfig, settings, true)).toBe(settings);
    expect(skipUnavailableDirectoryMasks(config, settings, false)).toBe(settings);
  });

});
