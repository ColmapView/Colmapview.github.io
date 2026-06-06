import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { resolveViteLocalAliasPolicy } from '../../viteLocalAliasPolicy';

const rootDir = path.resolve('/repo/colmap-webview');

function makePathExists(existingPaths: string[]) {
  const normalized = new Set(existingPaths.map((targetPath) => path.normalize(targetPath)));
  return (targetPath: string) => normalized.has(path.normalize(targetPath));
}

function makePolicy({
  command = 'build',
  mode = 'production',
  env = {},
  localRendererExists = true,
  localToolboxExists = true,
}: {
  command?: string;
  mode?: string;
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
    command,
    mode,
    env,
    rootDir,
    pathExists: makePathExists(existingPaths),
  });
}

function slashPath(targetPath: string): string {
  return targetPath.replaceAll('\\', '/');
}

describe('Vite local alias policy', () => {
  it('does not enable sibling gsplat aliases for release builds by default', () => {
    const policy = makePolicy({ command: 'build', mode: 'production' });

    expect(policy.localGsplatWebGpuEnabled).toBe(false);
    expect(slashPath(policy.localGsplatWebGpuAlias))
      .toContain('/src/splat/webgpu/localGsplatRendererUnavailable.ts');
    expect(policy.aliases).not.toHaveProperty('gs-toolbox');
  });

  it('does not enable sibling gsplat aliases for dev or test modes without explicit opt-in', () => {
    for (const [command, mode] of [
      ['serve', 'development'],
      ['build', 'test'],
    ] as const) {
      const policy = makePolicy({ command, mode });

      expect(policy.localGsplatWebGpuEnabled).toBe(false);
      expect(policy.aliases).not.toHaveProperty('gs-toolbox');
    }
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
