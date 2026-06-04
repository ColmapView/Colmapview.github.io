import { describe, expect, it } from 'vitest';
import { validateConfiguration } from './schema';
import type { PartialAppConfiguration } from './types';

describe('configuration schema validation', () => {
  it('returns parsed partial configuration data for valid config objects', () => {
    const result = validateConfiguration({
      version: 1,
      pointCloud: {
        pointSize: 5,
        colorMode: 'splatPoints',
        maxReprojectionError: null,
      },
      camera: {
        autoRotateMode: 'cw',
      },
    });

    expect(result).toEqual({
      valid: true,
      errors: [],
      config: {
        version: 1,
        pointCloud: {
          pointSize: 5,
          colorMode: 'splatPoints',
          maxReprojectionError: null,
        },
        camera: {
          autoRotateMode: 'cw',
        },
      } satisfies PartialAppConfiguration,
    });
  });

  it('returns validation errors and no config for invalid config objects', () => {
    const result = validateConfiguration({
      pointCloud: {
        pointSize: -1,
      },
      rig: {
        rigLineColor: '#fff',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.config).toBeNull();
    expect(result.errors).toEqual([
      expect.objectContaining({ path: 'pointCloud.pointSize' }),
      expect.objectContaining({ path: 'rig.rigLineColor' }),
    ]);
  });
});
