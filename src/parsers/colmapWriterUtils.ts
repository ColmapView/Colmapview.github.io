import { UNMATCHED_POINT3D_ID, type Point3DId } from '../types/colmap';

/**
 * COLMAP's invalid point3D ID is UINT64_MAX (std::numeric_limits<uint64_t>::max()).
 * The web project uses BigInt(-1), which has the same bit pattern via two's complement.
 */
export const COLMAP_INVALID_POINT3D_ID = BigInt('18446744073709551615');

/**
 * Format number with 17 significant digits (matches COLMAP's stream.precision(17)).
 */
export function formatDouble(value: number): string {
  return value.toPrecision(17).replace(/\.?0+$/, '');
}

/**
 * Sort map keys numerically. COLMAP sorts entries by ID before writing.
 */
export function sortedKeys<K extends number | bigint>(map: Map<K, unknown>): K[] {
  return Array.from(map.keys()).sort((a, b) => {
    if (typeof a === 'bigint' && typeof b === 'bigint') {
      return a < b ? -1 : a > b ? 1 : 0;
    }
    return Number(a) - Number(b);
  });
}

export function toBinaryPoint3DId(id: Point3DId): bigint {
  return id === UNMATCHED_POINT3D_ID ? COLMAP_INVALID_POINT3D_ID : id;
}

export function toTextPoint3DId(id: Point3DId): string {
  return id === UNMATCHED_POINT3D_ID ? '-1' : id.toString();
}
