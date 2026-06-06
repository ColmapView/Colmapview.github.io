// Bit-level encoding/decoding primitives
// --- Quaternion codecs ---
/**
 * Decode smallest-three quaternion from 32 bits (SPZ format).
 * Layout: 2 bits mode, 10+10+10 bits for 3 smallest components.
 * Returns [w, x, y, z].
 */
export function decodeSmallestThree32(packed) {
    const mode = packed & 0x3;
    const a10 = (packed >> 2) & 0x3FF;
    const b10 = (packed >> 12) & 0x3FF;
    const c10 = (packed >> 22) & 0x3FF;
    const scale = 1 / 511.5;
    const SQRT1_2 = 0.7071067811865475;
    const a = (a10 - 511.5) * scale * SQRT1_2;
    const b = (b10 - 511.5) * scale * SQRT1_2;
    const c = (c10 - 511.5) * scale * SQRT1_2;
    const sumSq = a * a + b * b + c * c;
    const largest = Math.sqrt(Math.max(0, 1 - sumSq));
    switch (mode) {
        case 0: return [largest, a, b, c]; // w largest
        case 1: return [a, largest, b, c]; // x largest
        case 2: return [a, b, largest, c]; // y largest
        case 3: return [a, b, c, largest]; // z largest
        default: return [1, 0, 0, 0];
    }
}
/**
 * Decode smallest-three quaternion from 3×8-bit RGB + 2-bit mode (SOG format).
 * Returns [w, x, y, z].
 */
export function decodeSmallestThree888(r, g, b, mode) {
    const scale = 1 / 127.5;
    const SQRT1_2 = 0.7071067811865475;
    const a = (r - 127.5) * scale * SQRT1_2;
    const c = (g - 127.5) * scale * SQRT1_2;
    const d = (b - 127.5) * scale * SQRT1_2;
    const sumSq = a * a + c * c + d * d;
    const largest = Math.sqrt(Math.max(0, 1 - sumSq));
    switch (mode) {
        case 0: return [largest, a, c, d]; // w largest
        case 1: return [a, largest, c, d]; // x largest
        case 2: return [a, c, largest, d]; // y largest
        case 3: return [a, c, d, largest]; // z largest
        default: return [1, 0, 0, 0];
    }
}
/**
 * Decode 2-10-10-10 packed quaternion (compressed PLY format).
 * Bits [31:30] = mode (largest component), 3×10-bit smallest components.
 * Returns [w, x, y, z].
 */
export function unpackRot2_10_10_10(packed) {
    const iLargest = packed >>> 30;
    const norm = 1.0 / (Math.sqrt(2) * 0.5);
    const a = (unpackUnorm((packed >>> 20) & 0x3FF, 10) - 0.5) * norm;
    const b = (unpackUnorm((packed >>> 10) & 0x3FF, 10) - 0.5) * norm;
    const c = (unpackUnorm(packed & 0x3FF, 10) - 0.5) * norm;
    const m = Math.sqrt(Math.max(0, 1.0 - (a * a + b * b + c * c)));
    switch (iLargest) {
        case 0: return [m, a, b, c]; // w largest
        case 1: return [a, m, b, c]; // x largest
        case 2: return [a, b, m, c]; // y largest
        case 3: return [a, b, c, m]; // z largest
        default: return [1, 0, 0, 0];
    }
}
// --- Bit packing ---
/** Unpack unsigned normalized value: value / ((1 << bits) - 1) */
export function unpackUnorm(value, bits) {
    const t = (1 << bits) - 1;
    return (value & t) / t;
}
/**
 * Unpack 11-10-11 bit position/scale from uint32.
 * Returns [x, y, z] each in [0, 1].
 */
export function unpack111011(packed) {
    const x = unpackUnorm(packed >>> 21, 11);
    const y = unpackUnorm((packed >>> 11) & 0x3FF, 10);
    const z = unpackUnorm(packed & 0x7FF, 11);
    return [x, y, z];
}
/**
 * Unpack 8-8-8-8 bit RGBA from uint32.
 * Returns [r, g, b, a] each in [0, 1].
 */
export function unpack8888(packed) {
    const r = unpackUnorm(packed >>> 24, 8);
    const g = unpackUnorm((packed >>> 16) & 0xFF, 8);
    const b = unpackUnorm((packed >>> 8) & 0xFF, 8);
    const a = unpackUnorm(packed & 0xFF, 8);
    return [r, g, b, a];
}
// --- Half-float ---
/** Convert float32 to float16 (as uint16) */
export function toHalf(f) {
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setFloat32(0, f, true);
    const bits = view.getUint32(0, true);
    const sign = (bits >>> 31) & 1;
    let exp = (bits >>> 23) & 0xFF;
    let mantissa = bits & 0x7FFFFF;
    if (exp === 0xFF) {
        // Inf/NaN
        return (sign << 15) | 0x7C00 | (mantissa ? 0x200 : 0);
    }
    if (exp === 0) {
        // Zero/denorm
        return sign << 15;
    }
    exp = exp - 127 + 15;
    if (exp >= 31)
        return (sign << 15) | 0x7C00; // Overflow → Inf
    if (exp <= 0) {
        // Underflow to denorm or zero
        if (exp < -10)
            return sign << 15;
        mantissa = (mantissa | 0x800000) >> (1 - exp);
        return (sign << 15) | (mantissa >> 13);
    }
    return (sign << 15) | (exp << 10) | (mantissa >> 13);
}
/** Convert float16 (uint16) to float32 */
export function fromHalf(h) {
    const sign = (h >>> 15) & 1;
    const exp = (h >>> 10) & 0x1F;
    const mantissa = h & 0x3FF;
    if (exp === 0) {
        if (mantissa === 0)
            return sign ? -0 : 0;
        // Denorm
        let m = mantissa;
        let e = -14;
        while ((m & 0x400) === 0) {
            m <<= 1;
            e--;
        }
        m &= 0x3FF;
        const f32Bits = (sign << 31) | ((e + 127) << 23) | (m << 13);
        const buf = new ArrayBuffer(4);
        const view = new DataView(buf);
        view.setUint32(0, f32Bits, true);
        return view.getFloat32(0, true);
    }
    if (exp === 31) {
        return mantissa ? NaN : (sign ? -Infinity : Infinity);
    }
    const f32Bits = (sign << 31) | ((exp - 15 + 127) << 23) | (mantissa << 13);
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setUint32(0, f32Bits, true);
    return view.getFloat32(0, true);
}
// --- Scale codecs ---
/** Decode SPZ log-encoded scale byte: exp(byte/255 * 16 - 10) */
export function decodeSPZLogScale(byte) {
    return Math.exp((byte / 255) * 16 - 10);
}
/** Decode generic log scale: exp(lerp(lnMin, lnMax, byte/255)) */
export function decodeLogScale(byte, lnMin, lnMax) {
    return Math.exp(lnMin + (byte / 255) * (lnMax - lnMin));
}
// --- SPZ color ---
/** Decode SPZ SH coefficient byte: (byte/255 - 0.5) * 4 → range [-2, 2] */
export function decodeSPZColor(byte) {
    return (byte / 255 - 0.5) * 4;
}
/** Decode SPZ sigmoid-encoded opacity byte */
export function decodeSPZSigmoidOpacity(byte) {
    const x = (byte / 255) * 10 - 5;
    return 1 / (1 + Math.exp(-x));
}
// --- SPZ encoding (inverse of decode) ---
/** Encode linear scale to SPZ log byte: round(clamp((ln(scale)+10)/16, 0, 1) * 255) */
export function encodeSPZLogScale(scale) {
    const t = (Math.log(Math.max(scale, 1e-20)) + 10) / 16;
    return Math.round(Math.max(0, Math.min(1, t)) * 255);
}
/** Encode SH coefficient to SPZ color byte: round(clamp(value/4 + 0.5, 0, 1) * 255) */
export function encodeSPZColor(sh) {
    const t = sh / 4 + 0.5;
    return Math.round(Math.max(0, Math.min(1, t)) * 255);
}
/** Encode linear opacity [0,1] to SPZ sigmoid byte: round(clamp((logit(opacity)+5)/10, 0, 1) * 255) */
export function encodeSPZSigmoidOpacity(opacity) {
    const clamped = Math.max(1e-6, Math.min(1 - 1e-6, opacity));
    const logit = -Math.log(1 / clamped - 1);
    const t = (logit + 5) / 10;
    return Math.round(Math.max(0, Math.min(1, t)) * 255);
}
/** Encode value to 24-bit signed fixed point (SPZ positions). Inverse of decodeFixed24. */
export function encodeFixed24(data, offset, value, scale, bias) {
    let fixed = Math.round(((value - bias) / scale) * 8388607); // 2^23 - 1
    fixed = Math.max(-8388608, Math.min(8388607, fixed));
    if (fixed < 0)
        fixed += 0x1000000; // unsigned representation
    data[offset] = fixed & 0xFF;
    data[offset + 1] = (fixed >> 8) & 0xFF;
    data[offset + 2] = (fixed >> 16) & 0xFF;
}
/**
 * Encode quaternion (w,x,y,z) to smallest-three 32-bit (SPZ format).
 * Layout: 2 bits mode, 10+10+10 bits for 3 smallest components.
 * Inverse of decodeSmallestThree32.
 */
export function encodeSmallestThree32(w, x, y, z) {
    // Normalize
    const len = Math.sqrt(w * w + x * x + y * y + z * z);
    if (len < 1e-10)
        return 0; // identity fallback (mode=0, all zeros → w=1)
    w /= len;
    x /= len;
    y /= len;
    z /= len;
    // Find largest component
    const abs = [Math.abs(w), Math.abs(x), Math.abs(y), Math.abs(z)];
    let mode = 0;
    if (abs[1] > abs[mode])
        mode = 1;
    if (abs[2] > abs[mode])
        mode = 2;
    if (abs[3] > abs[mode])
        mode = 3;
    // Ensure largest component is positive
    const components = [w, x, y, z];
    if (components[mode] < 0) {
        w = -w;
        x = -x;
        y = -y;
        z = -z;
    }
    // Extract 3 smallest components (in order)
    const SQRT1_2 = 0.7071067811865475;
    const scale = 511.5 / SQRT1_2;
    let a, b, c;
    switch (mode) {
        case 0:
            a = x;
            b = y;
            c = z;
            break;
        case 1:
            a = w;
            b = y;
            c = z;
            break;
        case 2:
            a = w;
            b = x;
            c = z;
            break;
        default:
            a = w;
            b = x;
            c = y;
            break;
    }
    const a10 = Math.round(Math.max(0, Math.min(1023, a * scale + 511.5)));
    const b10 = Math.round(Math.max(0, Math.min(1023, b * scale + 511.5)));
    const c10 = Math.round(Math.max(0, Math.min(1023, c * scale + 511.5)));
    return mode | (a10 << 2) | (b10 << 12) | (c10 << 22);
}
// --- Fixed point ---
/**
 * Decode 24-bit signed fixed point (SPZ positions).
 * 3 bytes → signed value / (2^23 - 1) * scale + bias
 */
export function decodeFixed24(data, offset, scale, bias) {
    let value = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
    if (value & 0x800000)
        value = value - 0x1000000; // sign extend
    return value / 8388607 * scale + bias; // 2^23 - 1
}
// --- Codebook ---
/** Look up values from a codebook by uint8 indices */
export function codebookLookup(indices, codebook, fallback = 0) {
    const out = new Float32Array(indices.length);
    for (let i = 0; i < indices.length; i++) {
        out[i] = codebook[indices[i]] ?? fallback;
    }
    return out;
}
// --- Compressed PLY SH ---
/** Decode compressed PLY SH byte: uint8 → float SH value */
export function decodeCompressedSH(byte) {
    return (byte * (8 / 255) - 4);
}
// --- Encoding primitives (for GPU packing) ---
/** Pack float [0,1] to unsigned normalized integer: round(clamp(value,0,1) * ((1<<bits)-1)) */
export function packUnorm(value, bits) {
    const t = (1 << bits) - 1;
    return Math.round(Math.max(0, Math.min(1, value)) * t);
}
/**
 * Octahedral encode: unit vector → 2 bytes [u, v] in [0, 255].
 * Projects unit vector onto octahedron, folds negative hemisphere.
 */
export function octEncode(nx, ny, nz) {
    // Project onto octahedron
    const l1 = Math.abs(nx) + Math.abs(ny) + Math.abs(nz);
    if (l1 < 1e-10)
        return [128, 128]; // zero vector → center
    const invL1 = 1.0 / l1;
    let ox = nx * invL1;
    let oy = ny * invL1;
    // Fold negative hemisphere
    if (nz < 0) {
        const tmpX = ox;
        ox = (1 - Math.abs(oy)) * (tmpX >= 0 ? 1 : -1);
        oy = (1 - Math.abs(tmpX)) * (oy >= 0 ? 1 : -1);
    }
    // Map [-1,1] → [0,255]
    const u = Math.round(Math.max(0, Math.min(255, (ox * 0.5 + 0.5) * 255)));
    const v = Math.round(Math.max(0, Math.min(255, (oy * 0.5 + 0.5) * 255)));
    return [u, v];
}
/**
 * Octahedral decode: 2 bytes [u, v] → unit vector [nx, ny, nz].
 * Inverse of octEncode.
 */
export function octDecode(u, v) {
    // Map [0,255] → [-1,1]
    let ox = u / 255 * 2 - 1;
    let oy = v / 255 * 2 - 1;
    // Unfold negative hemisphere
    const nz = 1 - Math.abs(ox) - Math.abs(oy);
    if (nz < 0) {
        const tmpX = ox;
        ox = (1 - Math.abs(oy)) * (tmpX >= 0 ? 1 : -1);
        oy = (1 - Math.abs(tmpX)) * (oy >= 0 ? 1 : -1);
    }
    // Normalize
    const len = Math.sqrt(ox * ox + oy * oy + nz * nz);
    return [ox / len, oy / len, nz / len];
}
/** Encode linear scale to log-space uint8: round(clamp((ln(scale)-lnMin)/lnRange, 0, 1) * 255) */
export function encodeLogScale(scale, lnMin = -12, lnRange = 21) {
    const t = (Math.log(Math.max(scale, 1e-20)) - lnMin) / lnRange;
    return Math.round(Math.max(0, Math.min(1, t)) * 255);
}
/** Decode log-scale uint8 back to linear. Inverse of encodeLogScale. */
export function decodeLogScaleGeneric(byte, lnMin = -12, lnRange = 21) {
    return decodeLogScale(byte, lnMin, lnMin + lnRange);
}
/**
 * Encode quaternion (w,x,y,z) → 3 bytes [u, v, angleByte] via axis-angle + octahedral.
 * Returns [u, v, angleByte] all in [0, 255].
 */
export function encodeQuaternion(w, x, y, z) {
    // Normalize
    const len = Math.sqrt(w * w + x * x + y * y + z * z);
    if (len < 1e-10)
        return [128, 128, 0]; // identity fallback
    w /= len;
    x /= len;
    y /= len;
    z /= len;
    // Ensure w >= 0 (canonical form)
    if (w < 0) {
        w = -w;
        x = -x;
        y = -y;
        z = -z;
    }
    // Quaternion → axis-angle
    const sinHalf = Math.sqrt(x * x + y * y + z * z);
    const angle = 2 * Math.atan2(sinHalf, w); // [0, π]
    let ax, ay, az;
    if (sinHalf < 1e-8) {
        // Near-identity: arbitrary axis
        ax = 0;
        ay = 0;
        az = 1;
    }
    else {
        const invSin = 1 / sinHalf;
        ax = x * invSin;
        ay = y * invSin;
        az = z * invSin;
    }
    const [u, v] = octEncode(ax, ay, az);
    const angleByte = Math.round(Math.max(0, Math.min(255, (angle / Math.PI) * 255)));
    return [u, v, angleByte];
}
/**
 * Decode quaternion from 3 bytes [u, v, angleByte].
 * Returns [w, x, y, z] normalized quaternion.
 */
export function decodeQuaternion(u, v, angleByte) {
    const angle = (angleByte / 255) * Math.PI; // [0, π]
    if (angle < 1e-8)
        return [1, 0, 0, 0]; // identity
    const [ax, ay, az] = octDecode(u, v);
    const halfAngle = angle / 2;
    const sinHalf = Math.sin(halfAngle);
    const cosHalf = Math.cos(halfAngle);
    return [cosHalf, ax * sinHalf, ay * sinHalf, az * sinHalf];
}
