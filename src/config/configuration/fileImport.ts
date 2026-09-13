import { parseConfigYaml } from './serializer';
import { applyConfigurationToStores } from './storeAdapter';
import type { ConfigValidationError, PartialAppConfiguration } from './types';

export interface ConfigFileLike {
  name: string;
  text: () => Promise<string>;
}

export interface ImportConfigFileOptions {
  signal?: AbortSignal;
  parse?: (content: string) => {
    valid: boolean;
    errors: ConfigValidationError[];
    config: PartialAppConfiguration | null;
  };
  apply?: (config: PartialAppConfiguration) => void;
  logger?: Pick<Console, 'log' | 'error'>;
  logErrors?: boolean;
}

export interface ImportConfigFileResult {
  applied: boolean;
  errorMessage?: string;
}

export function formatConfigValidationErrors(errors: ConfigValidationError[]): string {
  return errors.map((error) => (
    error.path ? `${error.path}: ${error.message}` : error.message
  )).join(', ');
}

export async function importConfigFile(
  file: ConfigFileLike,
  options: ImportConfigFileOptions = {}
): Promise<ImportConfigFileResult> {
  const parse = options.parse ?? parseConfigYaml;
  const apply = options.apply ?? applyConfigurationToStores;
  const logger = options.logger ?? console;

  try {
    if (options.signal?.aborted) return { applied: false };
    const content = await file.text();
    if (options.signal?.aborted) return { applied: false };
    const result = parse(content);

    if (result.valid && result.config) {
      if (options.signal?.aborted) return { applied: false };
      apply(result.config);
      logger.log(`[Config] Applied settings from ${file.name}`);
      return { applied: true };
    }

    const errorMessages = formatConfigValidationErrors(result.errors);
    if (options.logErrors) {
      logger.error(`[Config] Invalid configuration: ${errorMessages}`);
    }
    return { applied: false, errorMessage: `Config error: ${errorMessages}` };
  } catch (err) {
    if (options.signal?.aborted) return { applied: false };
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (options.logErrors) {
      logger.error('[Config] Failed to load config file:', err);
    }
    return { applied: false, errorMessage: `Config error: ${message}` };
  }
}
