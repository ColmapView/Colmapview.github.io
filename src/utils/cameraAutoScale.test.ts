import { describe, expect, it } from 'vitest';
import { CAMERA } from '../theme/timing';
import { getAutoCameraScale } from './cameraAutoScale';

function ring(count: number, radius: number): [number, number, number][] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
  });
}

function effective({ factor, scale }: { factor: string; scale: number }): number {
  return Number(factor) * scale;
}

describe('getAutoCameraScale', () => {
  it('keeps the classic default for a metre-scale orbit', () => {
    const result = getAutoCameraScale(ring(200, 4));
    expect(result).not.toBeNull();
    expect(effective(result!)).toBeGreaterThan(0.1);
    expect(effective(result!)).toBeLessThanOrEqual(0.25);
  });

  it('shrinks frustums for a tiny normalized reconstruction', () => {
    // GLOMAP example: 104 cameras inside a 0.03-unit box, about 0.001 apart.
    const result = getAutoCameraScale(ring(104, 0.015));

    expect(result!.factor).toBe('0.01');
    expect(effective(result!)).toBeLessThanOrEqual(0.005 + 1e-9);
  });

  it('keeps the selected photo beyond the near clipping plane', () => {
    const result = getAutoCameraScale(ring(104, 0.001));

    expect(effective(result!)).toBeGreaterThanOrEqual(CAMERA.nearPlane * 5 - 1e-9);
  });

  it('keeps neighbouring frames apart along a long walk-through', () => {
    const walk = Array.from({ length: 1000 }, (_, i): [number, number, number] => [i * 0.05, 0, 0]);
    const result = getAutoCameraScale(walk);

    expect(effective(result!)).toBeLessThanOrEqual(0.075 + 1e-9);
  });

  it('grows frustums for a kilometre-scale aerial survey', () => {
    const grid = Array.from({ length: 400 }, (_, i): [number, number, number] => [(i % 20) * 50, 100, Math.floor(i / 20) * 50]);
    const result = getAutoCameraScale(grid);

    expect(['10', '100']).toContain(result!.factor);
    expect(effective(result!)).toBeGreaterThan(5);
  });

  it('snaps the slider value to its 0.05 step within range', () => {
    const result = getAutoCameraScale(ring(104, 0.015))!;

    expect(result.scale).toBeGreaterThanOrEqual(0.05);
    expect(result.scale).toBeLessThanOrEqual(1);
    expect(Math.round(result.scale / 0.05) * 0.05).toBeCloseTo(result.scale, 10);
  });

  it('leaves the size alone without enough distinct cameras', () => {
    expect(getAutoCameraScale([])).toBeNull();
    expect(getAutoCameraScale([[1, 2, 3]])).toBeNull();
    expect(getAutoCameraScale([[1, 2, 3], [1, 2, 3]])).toBeNull();
  });
});
