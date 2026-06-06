/**
 * Decode smallest-three quaternion from 32 bits (SPZ format).
 * Layout: 2 bits mode, 10+10+10 bits for 3 smallest components.
 * Returns [w, x, y, z].
 */
export declare function decodeSmallestThree32(packed: number): [number, number, number, number];
/**
 * Decode smallest-three quaternion from 3×8-bit RGB + 2-bit mode (SOG format).
 * Returns [w, x, y, z].
 */
export declare function decodeSmallestThree888(r: number, g: number, b: number, mode: number): [number, number, number, number];
/**
 * Decode 2-10-10-10 packed quaternion (compressed PLY format).
 * Bits [31:30] = mode (largest component), 3×10-bit smallest components.
 * Returns [w, x, y, z].
 */
export declare function unpackRot2_10_10_10(packed: number): [number, number, number, number];
/** Unpack unsigned normalized value: value / ((1 << bits) - 1) */
export declare function unpackUnorm(value: number, bits: number): number;
/**
 * Unpack 11-10-11 bit position/scale from uint32.
 * Returns [x, y, z] each in [0, 1].
 */
export declare function unpack111011(packed: number): [number, number, number];
/**
 * Unpack 8-8-8-8 bit RGBA from uint32.
 * Returns [r, g, b, a] each in [0, 1].
 */
export declare function unpack8888(packed: number): [number, number, number, number];
/** Convert float32 to float16 (as uint16) */
export declare function toHalf(f: number): number;
/** Convert float16 (uint16) to float32 */
export declare function fromHalf(h: number): number;
/** Decode SPZ log-encoded scale byte: exp(byte/255 * 16 - 10) */
export declare function decodeSPZLogScale(byte: number): number;
/** Decode generic log scale: exp(lerp(lnMin, lnMax, byte/255)) */
export declare function decodeLogScale(byte: number, lnMin: number, lnMax: number): number;
/** Decode SPZ SH coefficient byte: (byte/255 - 0.5) * 4 → range [-2, 2] */
export declare function decodeSPZColor(byte: number): number;
/** Decode SPZ sigmoid-encoded opacity byte */
export declare function decodeSPZSigmoidOpacity(byte: number): number;
/** Encode linear scale to SPZ log byte: round(clamp((ln(scale)+10)/16, 0, 1) * 255) */
export declare function encodeSPZLogScale(scale: number): number;
/** Encode SH coefficient to SPZ color byte: round(clamp(value/4 + 0.5, 0, 1) * 255) */
export declare function encodeSPZColor(sh: number): number;
/** Encode linear opacity [0,1] to SPZ sigmoid byte: round(clamp((logit(opacity)+5)/10, 0, 1) * 255) */
export declare function encodeSPZSigmoidOpacity(opacity: number): number;
/** Encode value to 24-bit signed fixed point (SPZ positions). Inverse of decodeFixed24. */
export declare function encodeFixed24(data: Uint8Array, offset: number, value: number, scale: number, bias: number): void;
/**
 * Encode quaternion (w,x,y,z) to smallest-three 32-bit (SPZ format).
 * Layout: 2 bits mode, 10+10+10 bits for 3 smallest components.
 * Inverse of decodeSmallestThree32.
 */
export declare function encodeSmallestThree32(w: number, x: number, y: number, z: number): number;
/**
 * Decode 24-bit signed fixed point (SPZ positions).
 * 3 bytes → signed value / (2^23 - 1) * scale + bias
 */
export declare function decodeFixed24(data: Uint8Array, offset: number, scale: number, bias: number): number;
/** Look up values from a codebook by uint8 indices */
export declare function codebookLookup(indices: Uint8Array | Uint8ClampedArray, codebook: number[], fallback?: number): Float32Array;
/** Decode compressed PLY SH byte: uint8 → float SH value */
export declare function decodeCompressedSH(byte: number): number;
/** Pack float [0,1] to unsigned normalized integer: round(clamp(value,0,1) * ((1<<bits)-1)) */
export declare function packUnorm(value: number, bits: number): number;
/**
 * Octahedral encode: unit vector → 2 bytes [u, v] in [0, 255].
 * Projects unit vector onto octahedron, folds negative hemisphere.
 */
export declare function octEncode(nx: number, ny: number, nz: number): [number, number];
/**
 * Octahedral decode: 2 bytes [u, v] → unit vector [nx, ny, nz].
 * Inverse of octEncode.
 */
export declare function octDecode(u: number, v: number): [number, number, number];
/** Encode linear scale to log-space uint8: round(clamp((ln(scale)-lnMin)/lnRange, 0, 1) * 255) */
export declare function encodeLogScale(scale: number, lnMin?: number, lnRange?: number): number;
/** Decode log-scale uint8 back to linear. Inverse of encodeLogScale. */
export declare function decodeLogScaleGeneric(byte: number, lnMin?: number, lnRange?: number): number;
/**
 * Encode quaternion (w,x,y,z) → 3 bytes [u, v, angleByte] via axis-angle + octahedral.
 * Returns [u, v, angleByte] all in [0, 255].
 */
export declare function encodeQuaternion(w: number, x: number, y: number, z: number): [number, number, number];
/**
 * Decode quaternion from 3 bytes [u, v, angleByte].
 * Returns [w, x, y, z] normalized quaternion.
 */
export declare function decodeQuaternion(u: number, v: number, angleByte: number): [number, number, number, number];
