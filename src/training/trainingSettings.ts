import type {
  TrainingConfig,
  TrainingSettingField,
  TrainingSettingValue,
  TrainingSettings,
} from './types';

const SETTING_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const MAX_SETTING_FIELDS = 64;

export function isTrainingSettingValue(value: unknown): value is TrainingSettingValue {
  return value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value));
}

/** Validate persisted state before it can become an API request. */
export function sanitizeTrainingSettings(value: unknown): TrainingSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value).slice(0, MAX_SETTING_FIELDS).filter(
    ([key, item]) => SETTING_KEY.test(key) && isTrainingSettingValue(item),
  );
  return Object.fromEntries(entries);
}

function conditionsMet(field: TrainingSettingField, effective: TrainingSettings): boolean {
  return (field.enabled_when ?? []).every((condition) => Object.is(effective[condition.key], condition.equals));
}

function effectiveSetting(
  fields: Map<string, TrainingSettingField>,
  settings: TrainingSettings,
  key: string,
): TrainingSettingValue | undefined {
  return Object.hasOwn(settings, key) ? settings[key] : fields.get(key)?.default;
}

/**
 * Turn off directory-mask work when the loaded reconstruction contains no masks.
 * Alpha and automatic sources are left alone because their masks may live inside
 * the image bytes. Partial directory-mask sets also stay enabled; snapshot
 * preparation supplies full-foreground fallbacks only for their missing views.
 */
export function skipUnavailableDirectoryMasks(
  config: TrainingConfig,
  settings: TrainingSettings,
  hasDirectoryMasks: boolean,
): TrainingSettings {
  if (hasDirectoryMasks) return settings;
  const fields = new Map((config.editable_settings?.fields ?? []).map((field) => [field.key, field]));
  if (!fields.has('use_masks')) return settings;
  const useMasks = effectiveSetting(fields, settings, 'use_masks')
    ?? config.input_requirements.mask_source !== 'none';
  const maskSource = effectiveSetting(fields, settings, 'mask_source')
    ?? config.input_requirements.mask_source;
  if (useMasks !== true || maskSource !== 'directory') return settings;

  const next: TrainingSettings = { ...settings, use_masks: false };
  const effective = Object.fromEntries([...fields.values()].map((field) => [field.key, field.default]));
  Object.assign(effective, next);
  for (const key of Object.keys(next)) {
    const field = fields.get(key);
    if (field && !conditionsMet(field, effective)) delete next[key];
  }
  return next;
}

function valueError(field: TrainingSettingField, value: TrainingSettingValue): string | null {
  if (value === null) return field.nullable ? null : `${field.label} cannot be automatic or empty.`;
  if (field.value_type === 'boolean' && typeof value !== 'boolean') return `${field.label} must be on or off.`;
  if (field.value_type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
    return `${field.label} must be a whole number.`;
  }
  if (field.value_type === 'number' && typeof value !== 'number') return `${field.label} must be a number.`;
  if (field.value_type === 'enum') {
    if (!(field.choices ?? []).some((choice) => Object.is(choice.value, value))) {
      return `${field.label} has an unsupported value.`;
    }
  }
  if (typeof value === 'number') {
    if (field.minimum != null && value < field.minimum) return `${field.label} must be at least ${field.minimum}.`;
    if (field.maximum != null && value > field.maximum) return `${field.label} must be at most ${field.maximum}.`;
  }
  return null;
}

/** Fast UI feedback only. The service remains authoritative for cross-field validation. */
export function validateTrainingSettings(config: TrainingConfig, settings: TrainingSettings): Record<string, string> {
  const fields = config.editable_settings?.fields ?? [];
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const errors: Record<string, string> = {};
  const effective = Object.fromEntries(fields.map((field) => [field.key, field.default])) as TrainingSettings;
  Object.assign(effective, settings);

  for (const [key, value] of Object.entries(settings)) {
    const field = byKey.get(key);
    if (!field) {
      errors[key] = `The server does not allow the ${key} setting.`;
      continue;
    }
    const error = valueError(field, value);
    if (error) errors[key] = error;
    else if (!conditionsMet(field, effective)) errors[key] = `${field.label} is not available with the current settings.`;
  }
  return errors;
}

export function trainingSettingsDraftKey(serverUrl: string, config: TrainingConfig): string {
  let endpoint = serverUrl.trim().replace(/\/+$/, '');
  try { endpoint = new URL(endpoint).origin.toLowerCase(); } catch { /* Keep invalid text isolated to this draft. */ }
  const schemaVersion = config.editable_settings?.schema_version ?? 0;
  return [endpoint, config.backend.backend_id, config.backend.version, config.recipe_id, schemaVersion].join('|');
}

export function isLoopbackTrainingUrl(serverUrl: string): boolean {
  try {
    const hostname = new URL(serverUrl).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  } catch {
    return false;
  }
}
