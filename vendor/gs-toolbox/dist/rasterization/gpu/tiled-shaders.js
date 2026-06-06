// Tiled Rasterization Shaders
// ============================
// WGSL compute shaders for tiled Gaussian splatting rasterization.
//
// Pipeline: Clear -> Intersect -> Sort -> OffsetEncode -> OffsetFix -> Rasterize -> Blit
//
// The screen is divided into 16x16 tiles. Each Gaussian is intersected with
// its overlapping tiles, producing (key, gaussianId) pairs. Keys are packed as
// (tile_id << 16) | depth_16bit so a single radix sort groups by tile with
// approximate depth ordering within each tile. Per-tile rasterization uses
// shared memory batching and early transmittance termination.
// =============================================
// Stage 0: Clear
// =============================================
/**
 * Clears intersection keys to 0xFFFFFFFF and tile offsets to 0xFFFFFFFF.
 *
 * Bindings:
 * - group(0) binding(0): isectKeys (storage rw, u32 array)
 * - group(0) binding(1): tileOffsets (storage rw, u32 array)
 * - group(0) binding(2): params (uniform, vec4<u32>: keysSize, offsetsSize, _, _)
 */
export const tileClearSource = /* wgsl */ `
struct ClearParams {
    keysSize: u32,
    offsetsSize: u32,
    _pad0: u32,
    _pad1: u32,
};

@group(0) @binding(0) var<storage, read_write> isectKeys: array<u32>;
@group(0) @binding(1) var<storage, read_write> tileOffsets: array<u32>;
@group(0) @binding(2) var<uniform> params: ClearParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx < params.keysSize) {
        isectKeys[idx] = 0xFFFFFFFFu;
    }
    if (idx < params.offsetsSize) {
        tileOffsets[idx] = 0xFFFFFFFFu;
    }
}
`;
// =============================================
// Stage 1: Tile Intersection
// =============================================
/**
 * Computes tile-Gaussian intersections and writes packed sort keys.
 *
 * For each Gaussian, reads precomputed SplatData (mean2d, radius, depth),
 * computes tile bounding box, and writes (tile_id<<16 | depth16, gaussianId)
 * pairs using atomic allocation.
 *
 * Bindings:
 * - group(0) binding(0): splatData (storage read, SplatData array)
 * - group(0) binding(1): isectKeys (storage rw, u32 array)
 * - group(0) binding(2): isectVals (storage rw, u32 array)
 * - group(0) binding(3): atomicCounter (storage rw, atomic<u32> array)
 * - group(0) binding(4): params (uniform)
 */
export const tileIntersectSource = /* wgsl */ `
struct SplatData {
    mean2d: vec2<f32>,
    depth: f32,
    radius: f32,
    conic: vec3<f32>,
    compensation: f32,
    color: vec4<f32>,
};

struct IntersectParams {
    numGaussians: u32,
    tileWidth: u32,
    tileHeight: u32,
    maxIsects: u32,
    farPlane: f32,
    tileSize: u32,
    _pad0: u32,
    _pad1: u32,
};

@group(0) @binding(0) var<storage, read> splatData: array<SplatData>;
@group(0) @binding(1) var<storage, read_write> isectKeys: array<u32>;
@group(0) @binding(2) var<storage, read_write> isectVals: array<u32>;
@group(0) @binding(3) var<storage, read_write> atomicCounter: array<atomic<u32>>;
@group(0) @binding(4) var<uniform> params: IntersectParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.numGaussians) { return; }

    let splat = splatData[idx];
    if (splat.radius <= 0.0) { return; }

    let mean = splat.mean2d;
    let r = splat.radius;
    let ts = f32(params.tileSize);

    // Compute tile bounding box (clamped to grid)
    let rawMinX = i32(floor((mean.x - r) / ts));
    let rawMinY = i32(floor((mean.y - r) / ts));
    let rawMaxX = i32(ceil((mean.x + r) / ts));
    let rawMaxY = i32(ceil((mean.y + r) / ts));

    let minTileX = u32(max(0, rawMinX));
    let minTileY = u32(max(0, rawMinY));
    let maxTileX = u32(min(i32(params.tileWidth), rawMaxX));
    let maxTileY = u32(min(i32(params.tileHeight), rawMaxY));

    if (maxTileX <= minTileX || maxTileY <= minTileY) { return; }

    let tileCount = (maxTileX - minTileX) * (maxTileY - minTileY);

    // Quantize depth to 16 bits
    let depth16 = u32(clamp(splat.depth / params.farPlane, 0.0, 1.0) * 65535.0);

    // Atomic allocation — one atomicAdd per Gaussian
    let writePos = atomicAdd(&atomicCounter[0], tileCount);

    var pos = writePos;
    for (var ty = minTileY; ty < maxTileY; ty++) {
        for (var tx = minTileX; tx < maxTileX; tx++) {
            if (pos >= params.maxIsects) { return; }
            let tileId = ty * params.tileWidth + tx;
            isectKeys[pos] = (tileId << 16u) | (depth16 & 0xFFFFu);
            isectVals[pos] = idx;
            pos++;
        }
    }
}
`;
// =============================================
// Stage 3a: Offset Encode
// =============================================
/**
 * Detects tile boundaries in sorted intersection keys.
 *
 * For each intersection, checks if its tile_id differs from the previous
 * entry. At boundaries, writes the start index into tileOffsets.
 *
 * Bindings:
 * - group(0) binding(0): isectKeys (storage read, sorted u32 array)
 * - group(0) binding(1): tileOffsets (storage rw, u32 array)
 * - group(0) binding(2): counter (storage read, u32 array — totalIsects)
 */
export const offsetEncodeSource = /* wgsl */ `
@group(0) @binding(0) var<storage, read> isectKeys: array<u32>;
@group(0) @binding(1) var<storage, read_write> tileOffsets: array<u32>;
@group(0) @binding(2) var<storage, read> counter: array<u32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    let totalIsects = counter[0];
    if (idx >= totalIsects) { return; }

    let key = isectKeys[idx];
    let tileId = key >> 16u;

    let isFirst = (idx == 0u) || ((isectKeys[idx - 1u] >> 16u) != tileId);
    if (isFirst) {
        tileOffsets[tileId] = idx;
    }
}
`;
// =============================================
// Stage 3b: Offset Fix
// =============================================
/**
 * Fills gaps in tile offsets for empty tiles using backward propagation.
 *
 * After offset encode, tiles with no intersections still have the sentinel
 * value 0xFFFFFFFF. This shader propagates backward: empty tiles get the
 * next valid tile's offset. Sets tileOffsets[numTiles] = totalIsects as
 * the end sentinel for the last tile.
 *
 * Uses a single workgroup with only thread 0 doing sequential work.
 * numTiles is typically <35K (4K resolution at 16x16 tiles), so this is fast.
 *
 * Bindings:
 * - group(0) binding(0): tileOffsets (storage rw, u32 array, numTiles+1 entries)
 * - group(0) binding(1): counter (storage read, u32 array — totalIsects)
 * - group(0) binding(2): params (uniform, vec4<u32>: numTiles, _, _, _)
 */
export const offsetFixSource = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> tileOffsets: array<u32>;
@group(0) @binding(1) var<storage, read> counter: array<u32>;
@group(0) @binding(2) var<uniform> params: vec4<u32>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) lidx: u32) {
    if (lidx != 0u) { return; }

    let numTiles = params.x;
    let totalIsects = counter[0];

    // Set end sentinel
    tileOffsets[numTiles] = totalIsects;

    // Backward propagation: empty tiles inherit next tile's start offset
    for (var i = i32(numTiles) - 1; i >= 0; i--) {
        if (tileOffsets[u32(i)] == 0xFFFFFFFFu) {
            tileOffsets[u32(i)] = tileOffsets[u32(i) + 1u];
        }
    }
}
`;
// =============================================
// Stage 4: Tiled Rasterization
// =============================================
/**
 * Per-tile alpha blending with shared memory batching and early termination.
 *
 * Each workgroup processes one 16x16 tile (256 threads, one per pixel).
 * Gaussians are loaded in batches of 256 into shared memory for cooperative
 * evaluation. Front-to-back alpha blending with transmittance tracking;
 * pixels terminate early when transmittance drops below 1e-4.
 *
 * Shared memory layout (per workgroup):
 *   s_mean2d: array<vec2<f32>, 256>  — 2048 bytes
 *   s_conic:  array<vec4<f32>, 256>  — 4096 bytes (xyz=conic, w=depth)
 *   s_color:  array<vec4<f32>, 256>  — 4096 bytes (rgb=color, a=opacity)
 *   Total: 10240 bytes (well within 16KB limit)
 *
 * Bindings:
 * - group(0) binding(0): uniforms (uniform buffer)
 * - group(0) binding(1): splatData (storage read, SplatData array)
 * - group(0) binding(2): isectVals (storage read, u32 array — gaussian indices)
 * - group(0) binding(3): tileOffsets (storage read, u32 array — CSR offsets)
 * - group(0) binding(4): outputColor (storage rw, vec4<f32> array — W*H pixels)
 */
export const tiledRasterSource = /* wgsl */ `
const TILE_SIZE = 16u;
const BATCH_SIZE = 256u;

const RENDER_MODE_RGB: u32 = 0u;
const RENDER_MODE_DEPTH: u32 = 1u;
const RENDER_MODE_RGBD: u32 = 2u;

struct SplatData {
    mean2d: vec2<f32>,
    depth: f32,
    radius: f32,
    conic: vec3<f32>,
    compensation: f32,
    color: vec4<f32>,
};

struct RasterUniforms {
    viewportWidth: u32,
    viewportHeight: u32,
    tileWidth: u32,
    tileHeight: u32,
    nearPlane: f32,
    farPlane: f32,
    antialiasing: u32,
    renderMode: u32,
    alphaThreshold: f32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

@group(0) @binding(0) var<uniform> uniforms: RasterUniforms;
@group(0) @binding(1) var<storage, read> splatData: array<SplatData>;
@group(0) @binding(2) var<storage, read> isectVals: array<u32>;
@group(0) @binding(3) var<storage, read> tileOffsets: array<u32>;
@group(0) @binding(4) var<storage, read_write> outputColor: array<vec4<f32>>;

var<workgroup> s_mean2d: array<vec2<f32>, BATCH_SIZE>;
var<workgroup> s_conic: array<vec4<f32>, BATCH_SIZE>;
var<workgroup> s_color: array<vec4<f32>, BATCH_SIZE>;

@compute @workgroup_size(16, 16)
fn main(
    @builtin(workgroup_id) wgid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(local_invocation_index) lidx: u32,
) {
    let tileX = wgid.x;
    let tileY = wgid.y;
    let tileId = tileY * uniforms.tileWidth + tileX;

    let pixelX = tileX * TILE_SIZE + lid.x;
    let pixelY = tileY * TILE_SIZE + lid.y;
    let px = f32(pixelX) + 0.5;
    let py = f32(pixelY) + 0.5;

    let inside = pixelX < uniforms.viewportWidth && pixelY < uniforms.viewportHeight;
    var done = !inside;

    // Tile's intersection range (CSR format)
    let rangeStart = tileOffsets[tileId];
    let rangeEnd = tileOffsets[tileId + 1u];
    let numInTile = rangeEnd - rangeStart;
    let numBatches = (numInTile + BATCH_SIZE - 1u) / BATCH_SIZE;

    // Accumulation state
    var T = 1.0f;
    var color = vec3<f32>(0.0, 0.0, 0.0);
    var accDepth = 0.0f;

    for (var b = 0u; b < numBatches; b++) {
        // Synchronize before loading new batch
        workgroupBarrier();

        // Collaborative load into shared memory
        let batchStart = rangeStart + b * BATCH_SIZE;
        let loadIdx = batchStart + lidx;
        if (loadIdx < rangeEnd) {
            let g = isectVals[loadIdx];
            let splat = splatData[g];
            s_mean2d[lidx] = splat.mean2d;
            // Pack depth into conic.w for depth/rgbd modes
            s_conic[lidx] = vec4<f32>(splat.conic, splat.depth);

            var opacity = splat.color.a;
            if (uniforms.antialiasing != 0u) {
                opacity *= splat.compensation;
            }
            s_color[lidx] = vec4<f32>(splat.color.rgb, opacity);
        }

        // Synchronize after load
        workgroupBarrier();

        // Process batch
        let batchSize = min(BATCH_SIZE, rangeEnd - batchStart);
        for (var t = 0u; t < batchSize; t++) {
            if (done) { break; }

            let mean = s_mean2d[t];
            let conic = s_conic[t].xyz;
            let splatDepth = s_conic[t].w;
            let rgba = s_color[t];

            let delta = mean - vec2<f32>(px, py);
            let sigma = 0.5 * (conic.x * delta.x * delta.x +
                               conic.z * delta.y * delta.y) +
                        conic.y * delta.x * delta.y;

            if (sigma < 0.0) { continue; }

            let alpha = min(0.99, rgba.a * exp(-sigma));
            if (alpha < uniforms.alphaThreshold) { continue; }

            let nextT = T * (1.0 - alpha);
            if (nextT < 1e-4) {
                done = true;
                break;
            }

            let weight = alpha * T;
            color += rgba.rgb * weight;

            if (uniforms.renderMode != RENDER_MODE_RGB) {
                accDepth += splatDepth * weight;
            }

            T = nextT;
        }
    }

    // Write output
    if (inside) {
        let pixelId = pixelY * uniforms.viewportWidth + pixelX;
        let rasterAlpha = 1.0 - T;

        if (uniforms.renderMode == RENDER_MODE_DEPTH) {
            let nearP = uniforms.nearPlane;
            let farP = uniforms.farPlane;
            let normDepth = clamp((accDepth - nearP * (1.0 - T)) / (farP - nearP), 0.0, 1.0);
            outputColor[pixelId] = vec4<f32>(vec3<f32>(normDepth) * rasterAlpha, rasterAlpha);
        } else if (uniforms.renderMode == RENDER_MODE_RGBD) {
            let nearP = uniforms.nearPlane;
            let farP = uniforms.farPlane;
            let normDepth = clamp((accDepth - nearP * (1.0 - T)) / (farP - nearP), 0.0, 1.0);
            outputColor[pixelId] = vec4<f32>(color, normDepth);
        } else {
            outputColor[pixelId] = vec4<f32>(color, rasterAlpha);
        }
    }
}
`;
// =============================================
// Stage 5: Blit (Copy Storage Buffer to Texture)
// =============================================
/**
 * Fullscreen triangle that reads from the output storage buffer and writes
 * to the color attachment texture. Avoids requiring STORAGE_BINDING on the
 * render target texture.
 *
 * Bindings:
 * - group(0) binding(0): outputColor (storage read, vec4<f32> array)
 * - group(0) binding(1): blitParams (uniform, vec2<u32>: width, height)
 *
 * Entry points:
 * - vs_blit: Generates fullscreen triangle (3 vertices, no vertex buffer)
 * - fs_blit: Reads pixel color from storage buffer by position
 */
export const blitSource = /* wgsl */ `
@group(0) @binding(0) var<storage, read> outputColor: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> blitParams: vec4<u32>;

@vertex
fn vs_blit(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
    // Fullscreen triangle: 3 vertices cover clip space
    let x = f32(i32(vid & 1u) * 4 - 1);
    let y = f32(i32(vid & 2u) * 2 - 1);
    return vec4<f32>(x, y, 0.0, 1.0);
}

@fragment
fn fs_blit(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let pixelX = u32(pos.x);
    let pixelY = u32(pos.y);
    let width = blitParams.x;
    let height = blitParams.y;
    if (pixelX >= width || pixelY >= height) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    let idx = pixelY * width + pixelX;
    return outputColor[idx];
}
`;
