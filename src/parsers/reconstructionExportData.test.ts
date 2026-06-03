import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPoint3D, buildReconstruction } from '../test/builders';
import { getPoints3DForExport, type ExportPointSource } from './reconstructionExportData';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getPoints3DForExport', () => {
  it('uses existing non-empty reconstruction points without touching WASM', () => {
    const point = buildPoint3D({ point3DId: 7n });
    const reconstruction = buildReconstruction({ points3D: [point] });
    const wasm = {
      hasPoints: vi.fn(() => true),
      buildPoints3DMap: vi.fn(() => new Map([[8n, buildPoint3D({ point3DId: 8n })]])),
    } satisfies ExportPointSource;

    const points = getPoints3DForExport(reconstruction, wasm);

    expect(points).toBe(reconstruction.points3D);
    expect(wasm.hasPoints).not.toHaveBeenCalled();
    expect(wasm.buildPoints3DMap).not.toHaveBeenCalled();
  });

  it('builds points from WASM when JS points are absent', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const wasmPoints = new Map([[9n, buildPoint3D({ point3DId: 9n })]]);
    const reconstruction = buildReconstruction();
    const wasm = {
      hasPoints: vi.fn(() => true),
      buildPoints3DMap: vi.fn(() => wasmPoints),
    } satisfies ExportPointSource;

    const points = getPoints3DForExport(reconstruction, wasm);

    expect(points).toBe(wasmPoints);
    expect(wasm.hasPoints).toHaveBeenCalledOnce();
    expect(wasm.buildPoints3DMap).toHaveBeenCalledOnce();
    expect(consoleLogSpy).toHaveBeenCalledWith('[Export] Building points3D Map on-demand from WASM...');
  });

  it('treats an empty JS points map as unavailable and falls back to WASM', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const wasmPoints = new Map([[10n, buildPoint3D({ point3DId: 10n })]]);
    const reconstruction = {
      ...buildReconstruction(),
      points3D: new Map(),
    };
    const wasm = {
      hasPoints: vi.fn(() => true),
      buildPoints3DMap: vi.fn(() => wasmPoints),
    } satisfies ExportPointSource;

    expect(getPoints3DForExport(reconstruction, wasm)).toBe(wasmPoints);
  });

  it('returns an empty map and warns when no point source is available', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reconstruction = buildReconstruction();

    const points = getPoints3DForExport(reconstruction, null);

    expect(points.size).toBe(0);
    expect(consoleWarnSpy).toHaveBeenCalledWith('[Export] No points3D data available for export');
  });
});
