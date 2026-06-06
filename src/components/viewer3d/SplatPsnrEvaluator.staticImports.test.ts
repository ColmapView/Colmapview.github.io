import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const forbiddenStaticImports = [
  'gs-toolbox',
  'gaussianRenderer',
  'psnrSplatSession',
  'splatPsnrMetric',
  'three',
];
const evaluatorFacingRuntimeFiles = [
  'SplatPsnrEvaluator.tsx',
  'splatPsnrRuntime.ts',
];
const forbiddenFullFrameReadbackTokens = [
  'getImageData',
  'readPixels',
  'WebGLRenderer',
  'document.createElement',
  'OffscreenCanvas',
];

function getStaticImports(source: string): string[] {
  const imports: string[] = [];
  const staticImportPattern = /^\s*import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm;
  let match: RegExpExecArray | null;
  while ((match = staticImportPattern.exec(source)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

describe('SplatPsnrEvaluator static imports', () => {
  it('keeps heavy WebGPU PSNR renderer modules out of the eager evaluator bundle', () => {
    const staticImports = evaluatorFacingRuntimeFiles.flatMap((fileName) => {
      const source = readFileSync(resolve(__dirname, fileName), 'utf8');
      return getStaticImports(source);
    });

    for (const forbiddenImport of forbiddenStaticImports) {
      expect(staticImports, `Unexpected static import containing ${forbiddenImport}`)
        .not.toContainEqual(expect.stringContaining(forbiddenImport));
    }
  });

  it('keeps evaluator-facing runtime free of CPU/full-frame readback paths', () => {
    for (const fileName of evaluatorFacingRuntimeFiles) {
      const source = readFileSync(resolve(__dirname, fileName), 'utf8');
      for (const forbiddenToken of forbiddenFullFrameReadbackTokens) {
        expect(source, `${fileName} should not contain ${forbiddenToken}`)
          .not.toContain(forbiddenToken);
      }
    }
  });
});
