import { describe, expect, it, vi } from 'vitest';
import { importConfigFile, formatConfigValidationErrors, type ConfigFileLike } from './fileImport';
import type { PartialAppConfiguration } from './types';

function configFile(name: string, content: string): ConfigFileLike {
  return {
    name,
    text: vi.fn().mockResolvedValue(content),
  };
}

describe('config file import helpers', () => {
  it('applies valid configuration files and logs the source filename', async () => {
    const parsedConfig: PartialAppConfiguration = {
      pointCloud: { pointSize: 4 },
    };
    const apply = vi.fn();
    const logger = { log: vi.fn(), error: vi.fn() };

    const result = await importConfigFile(configFile('viewer.yaml', 'point_cloud:'), {
      parse: vi.fn().mockReturnValue({ valid: true, errors: [], config: parsedConfig }),
      apply,
      logger,
    });

    expect(result).toEqual({ applied: true });
    expect(apply).toHaveBeenCalledWith(parsedConfig);
    expect(logger.log).toHaveBeenCalledWith('[Config] Applied settings from viewer.yaml');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('formats validation errors and returns a user-facing config error', async () => {
    const logger = { log: vi.fn(), error: vi.fn() };

    expect(formatConfigValidationErrors([
      { path: 'pointCloud.pointSize', message: 'Too small' },
      { path: '', message: 'Configuration must be an object' },
    ])).toBe('pointCloud.pointSize: Too small, Configuration must be an object');

    const result = await importConfigFile(configFile('bad.yaml', 'bad:'), {
      parse: vi.fn().mockReturnValue({
        valid: false,
        errors: [
          { path: 'pointCloud.pointSize', message: 'Too small' },
          { path: '', message: 'Configuration must be an object' },
        ],
        config: null,
      }),
      apply: vi.fn(),
      logger,
      logErrors: true,
    });

    expect(result).toEqual({
      applied: false,
      errorMessage: 'Config error: pointCloud.pointSize: Too small, Configuration must be an object',
    });
    expect(logger.error).toHaveBeenCalledWith(
      '[Config] Invalid configuration: pointCloud.pointSize: Too small, Configuration must be an object'
    );
  });

  it('returns a config error when reading the file fails', async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const error = new Error('permission denied');
    const file: ConfigFileLike = {
      name: 'settings.yaml',
      text: vi.fn().mockRejectedValue(error),
    };

    const result = await importConfigFile(file, {
      apply: vi.fn(),
      logger,
      logErrors: true,
    });

    expect(result).toEqual({
      applied: false,
      errorMessage: 'Config error: permission denied',
    });
    expect(logger.error).toHaveBeenCalledWith('[Config] Failed to load config file:', error);
  });
});
