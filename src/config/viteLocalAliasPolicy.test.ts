import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { resolveViteLocalAliasPolicy } from '../../viteLocalAliasPolicy';

const rootDir = path.resolve('/repo/colmap-webview');

function makePathExists(existingPaths: string[]) {
  const normalized = new Set(existingPaths.map((targetPath) => path.normalize(targetPath)));
  return (targetPath: string) => normalized.has(path.normalize(targetPath));
}

function makePolicy({
  env = {},
  localRendererExists = true,
  localToolboxExists = true,
}: {
  env?: Record<string, string | undefined>;
  localRendererExists?: boolean;
  localToolboxExists?: boolean;
} = {}) {
  const localRendererPath = path.resolve(rootDir, '../../gsplat/webgpu/src');
  const localToolboxPath = path.resolve(rootDir, '../../gsplat/packages/gs-toolbox/ts/src/index.ts');
  const existingPaths = [
    localRendererExists ? localRendererPath : null,
    localToolboxExists ? localToolboxPath : null,
  ].filter((targetPath): targetPath is string => Boolean(targetPath));

  return resolveViteLocalAliasPolicy({
    env,
    rootDir,
    pathExists: makePathExists(existingPaths),
  });
}

function slashPath(targetPath: string): string {
  return targetPath.replaceAll('\\', '/');
}

describe('Vite local alias policy', () => {
  it('keeps installed dependencies without explicit local opt-in, even when checkouts exist', () => {
    const policy = makePolicy();

    expect(policy.localGsplatWebGpuEnabled).toBe(false);
    expect(slashPath(policy.localGsplatWebGpuAlias))
      .toContain('/src/splat/webgpu/localGsplatRendererUnavailable.ts');
    expect(policy.aliases).not.toHaveProperty('gs-toolbox');
  });

  it('keeps the installed toolbox when requested local source is absent', () => {
    const policy = makePolicy({
      env: { VITE_USE_LOCAL_GS_TOOLBOX_SOURCE: '1' },
      localToolboxExists: false,
    });
    expect(policy.localGsplatWebGpuEnabled).toBe(false);
    expect(policy.aliases).not.toHaveProperty('gs-toolbox');
  });

  it('enables the local demo renderer only when explicitly requested and present', () => {
    const policy = makePolicy({
      env: { VITE_ENABLE_LOCAL_GSPLAT_WEBGPU: '1' },
    });

    expect(policy.localGsplatWebGpuEnabled).toBe(true);
    expect(slashPath(policy.localGsplatWebGpuAlias)).toContain('/gsplat/webgpu/src/renderer.ts');
    expect(slashPath(policy.aliases['gs-toolbox'])).toContain('/gsplat/packages/gs-toolbox/ts/src/index.ts');
  });

  it('falls back to the unavailable renderer when explicit local WebGPU opt-in is missing its checkout', () => {
    const policy = makePolicy({
      env: { VITE_ENABLE_LOCAL_GSPLAT_WEBGPU: '1' },
      localRendererExists: false,
    });

    expect(policy.localGsplatWebGpuEnabled).toBe(false);
    expect(slashPath(policy.localGsplatWebGpuAlias))
      .toContain('/src/splat/webgpu/localGsplatRendererUnavailable.ts');
  });

  it('can explicitly use local gs-toolbox source without enabling the demo renderer', () => {
    const policy = makePolicy({
      env: { VITE_USE_LOCAL_GS_TOOLBOX_SOURCE: '1' },
    });

    expect(policy.localGsplatWebGpuEnabled).toBe(false);
    expect(slashPath(policy.aliases['gs-toolbox'])).toContain('/gsplat/packages/gs-toolbox/ts/src/index.ts');
  });
});
