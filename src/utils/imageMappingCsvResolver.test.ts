import { describe, it, expect } from 'vitest';
import { imageMappingCsvStrategy, parseImageMappingCsv } from './imageMappingCsvResolver';
import { resolveImageSource } from './imageSourceResolution';
import { IMAGE_SOURCE_STRATEGIES } from './imageSourceStrategies';

describe('parseImageMappingCsv', () => {
  it('maps colmap_image -> raw_path by header (paths with spaces)', () => {
    const csv =
      'colmap_id,colmap_image,raw_path\n' +
      '0,0.jpg,raw/10.07.25 LHS/G0019585.JPG\n' +
      '1,1.jpg,raw/10.07.25 RHS/G0019586.JPG\n';
    expect(parseImageMappingCsv(csv)).toEqual({
      '0.jpg': 'raw/10.07.25 LHS/G0019585.JPG',
      '1.jpg': 'raw/10.07.25 RHS/G0019586.JPG',
    });
  });

  it('keeps a quoted comma inside the raw_path column', () => {
    expect(parseImageMappingCsv('colmap_id,colmap_image,raw_path\n0,0.jpg,"raw/a,b/x.jpg"\n')).toEqual({
      '0.jpg': 'raw/a,b/x.jpg',
    });
  });

  it('resolves columns by header regardless of order', () => {
    expect(parseImageMappingCsv('raw_path,colmap_image\nraw/x.jpg,5.jpg\n')).toEqual({
      '5.jpg': 'raw/x.jpg',
    });
  });

  it('strips a UTF-8 BOM and unwraps quoted fields', () => {
    const csv = '﻿colmap_id,colmap_image,raw_path\n0,"0.jpg","raw/q ad/x.jpg"\n';
    expect(parseImageMappingCsv(csv)).toEqual({ '0.jpg': 'raw/q ad/x.jpg' });
  });

  it('returns an empty map when required headers are missing or there are no rows', () => {
    expect(parseImageMappingCsv('a,b\n1,2\n')).toEqual({});
    expect(parseImageMappingCsv('colmap_id,colmap_image,raw_path\n')).toEqual({});
    expect(parseImageMappingCsv('')).toEqual({});
  });
});

describe('parseImageMappingCsv (RFC-4180 / quote-aware)', () => {
  it('keeps a quoted comma in a NON-last column (order-independent)', () => {
    expect(
      parseImageMappingCsv('colmap_image,raw_path,note\n0.jpg,"raw/a,b/x.jpg",hello\n')
    ).toEqual({ '0.jpg': 'raw/a,b/x.jpg' });
  });

  it('resolves a quoted comma when the path column is reordered before the name', () => {
    expect(parseImageMappingCsv('raw_path,colmap_image\n"raw/a,b.jpg",5.jpg\n')).toEqual({
      '5.jpg': 'raw/a,b.jpg',
    });
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    expect(parseImageMappingCsv('colmap_image,raw_path\n0.jpg,"raw/a""b.jpg"\n')).toEqual({
      '0.jpg': 'raw/a"b.jpg',
    });
  });

  it('preserves a newline embedded in a quoted field', () => {
    expect(parseImageMappingCsv('colmap_image,raw_path\n0.jpg,"raw/a\nb.jpg"\n')).toEqual({
      '0.jpg': 'raw/a\nb.jpg',
    });
  });

  it('handles lone-CR (old Mac) line endings', () => {
    expect(parseImageMappingCsv('colmap_image,raw_path\r0.jpg,raw/x.jpg\r')).toEqual({
      '0.jpg': 'raw/x.jpg',
    });
  });
});

describe('imageMappingCsvStrategy (add-on)', () => {
  const filePaths = ['colmap/cameras.bin', 'colmap/image_mapping.csv', 'raw/LHS/G0019585.JPG'];
  const csv = 'colmap_id,colmap_image,raw_path\n0,0.jpg,raw/LHS/G0019585.JPG\n';

  it('returns a per-image contribution from a model-dir mapping CSV', async () => {
    const fetchText = async (p: string) => (p === 'colmap/image_mapping.csv' ? csv : null);
    expect(await imageMappingCsvStrategy.resolve({ filePaths, modelDir: 'colmap', fetchText })).toEqual({
      kind: 'per-image',
      imageNameToPath: { '0.jpg': 'raw/LHS/G0019585.JPG' },
    });
  });

  it('declines when no mapping CSV is present', async () => {
    expect(
      await imageMappingCsvStrategy.resolve({
        filePaths: ['colmap/cameras.bin'],
        modelDir: 'colmap',
        fetchText: async () => null,
      })
    ).toBeNull();
  });

  it('declines when no fetchText is available', async () => {
    expect(await imageMappingCsvStrategy.resolve({ filePaths, modelDir: 'colmap' })).toBeNull();
  });
});

describe('IMAGE_SOURCE_STRATEGIES (override + fallback)', () => {
  it('overrides per image via the CSV while keeping the base dir as fallback', async () => {
    const filePaths = [
      'colmap/cameras.bin',
      'colmap/image_mapping.csv',
      'raw/LHS/G0019585.JPG',
      'raw/RHS/G0019586.JPG',
    ];
    // Mapping only covers 0.jpg; 1.jpg must still fall back to the base dir.
    const fetchText = async (p: string) =>
      p.endsWith('image_mapping.csv') ? 'colmap_id,colmap_image,raw_path\n0,0.jpg,raw/LHS/G0019585.JPG\n' : null;

    const result = await resolveImageSource({ filePaths, modelDir: 'colmap', fetchText }, IMAGE_SOURCE_STRATEGIES);

    expect(result?.imageNameToPath?.['0.jpg']).toBe('raw/LHS/G0019585.JPG');
    expect(result?.imagesDir).toBeDefined(); // base-dir fallback retained for 1.jpg
  });
});
