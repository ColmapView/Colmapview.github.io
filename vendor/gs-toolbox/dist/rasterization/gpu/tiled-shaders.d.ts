/**
 * Clears intersection keys to 0xFFFFFFFF and tile offsets to 0xFFFFFFFF.
 *
 * Bindings:
 * - group(0) binding(0): isectKeys (storage rw, u32 array)
 * - group(0) binding(1): tileOffsets (storage rw, u32 array)
 * - group(0) binding(2): params (uniform, vec4<u32>: keysSize, offsetsSize, _, _)
 */
export declare const tileClearSource = "\nstruct ClearParams {\n    keysSize: u32,\n    offsetsSize: u32,\n    _pad0: u32,\n    _pad1: u32,\n};\n\n@group(0) @binding(0) var<storage, read_write> isectKeys: array<u32>;\n@group(0) @binding(1) var<storage, read_write> tileOffsets: array<u32>;\n@group(0) @binding(2) var<uniform> params: ClearParams;\n\n@compute @workgroup_size(256)\nfn main(@builtin(global_invocation_id) gid: vec3<u32>) {\n    let idx = gid.x;\n    if (idx < params.keysSize) {\n        isectKeys[idx] = 0xFFFFFFFFu;\n    }\n    if (idx < params.offsetsSize) {\n        tileOffsets[idx] = 0xFFFFFFFFu;\n    }\n}\n";
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
export declare const tileIntersectSource = "\nstruct SplatData {\n    mean2d: vec2<f32>,\n    depth: f32,\n    radius: f32,\n    conic: vec3<f32>,\n    compensation: f32,\n    color: vec4<f32>,\n};\n\nstruct IntersectParams {\n    numGaussians: u32,\n    tileWidth: u32,\n    tileHeight: u32,\n    maxIsects: u32,\n    farPlane: f32,\n    tileSize: u32,\n    _pad0: u32,\n    _pad1: u32,\n};\n\n@group(0) @binding(0) var<storage, read> splatData: array<SplatData>;\n@group(0) @binding(1) var<storage, read_write> isectKeys: array<u32>;\n@group(0) @binding(2) var<storage, read_write> isectVals: array<u32>;\n@group(0) @binding(3) var<storage, read_write> atomicCounter: array<atomic<u32>>;\n@group(0) @binding(4) var<uniform> params: IntersectParams;\n\n@compute @workgroup_size(256)\nfn main(@builtin(global_invocation_id) gid: vec3<u32>) {\n    let idx = gid.x;\n    if (idx >= params.numGaussians) { return; }\n\n    let splat = splatData[idx];\n    if (splat.radius <= 0.0) { return; }\n\n    let mean = splat.mean2d;\n    let r = splat.radius;\n    let ts = f32(params.tileSize);\n\n    // Compute tile bounding box (clamped to grid)\n    let rawMinX = i32(floor((mean.x - r) / ts));\n    let rawMinY = i32(floor((mean.y - r) / ts));\n    let rawMaxX = i32(ceil((mean.x + r) / ts));\n    let rawMaxY = i32(ceil((mean.y + r) / ts));\n\n    let minTileX = u32(max(0, rawMinX));\n    let minTileY = u32(max(0, rawMinY));\n    let maxTileX = u32(min(i32(params.tileWidth), rawMaxX));\n    let maxTileY = u32(min(i32(params.tileHeight), rawMaxY));\n\n    if (maxTileX <= minTileX || maxTileY <= minTileY) { return; }\n\n    let tileCount = (maxTileX - minTileX) * (maxTileY - minTileY);\n\n    // Quantize depth to 16 bits\n    let depth16 = u32(clamp(splat.depth / params.farPlane, 0.0, 1.0) * 65535.0);\n\n    // Atomic allocation \u2014 one atomicAdd per Gaussian\n    let writePos = atomicAdd(&atomicCounter[0], tileCount);\n\n    var pos = writePos;\n    for (var ty = minTileY; ty < maxTileY; ty++) {\n        for (var tx = minTileX; tx < maxTileX; tx++) {\n            if (pos >= params.maxIsects) { return; }\n            let tileId = ty * params.tileWidth + tx;\n            isectKeys[pos] = (tileId << 16u) | (depth16 & 0xFFFFu);\n            isectVals[pos] = idx;\n            pos++;\n        }\n    }\n}\n";
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
export declare const offsetEncodeSource = "\n@group(0) @binding(0) var<storage, read> isectKeys: array<u32>;\n@group(0) @binding(1) var<storage, read_write> tileOffsets: array<u32>;\n@group(0) @binding(2) var<storage, read> counter: array<u32>;\n\n@compute @workgroup_size(256)\nfn main(@builtin(global_invocation_id) gid: vec3<u32>) {\n    let idx = gid.x;\n    let totalIsects = counter[0];\n    if (idx >= totalIsects) { return; }\n\n    let key = isectKeys[idx];\n    let tileId = key >> 16u;\n\n    let isFirst = (idx == 0u) || ((isectKeys[idx - 1u] >> 16u) != tileId);\n    if (isFirst) {\n        tileOffsets[tileId] = idx;\n    }\n}\n";
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
export declare const offsetFixSource = "\n@group(0) @binding(0) var<storage, read_write> tileOffsets: array<u32>;\n@group(0) @binding(1) var<storage, read> counter: array<u32>;\n@group(0) @binding(2) var<uniform> params: vec4<u32>;\n\n@compute @workgroup_size(256)\nfn main(@builtin(local_invocation_index) lidx: u32) {\n    if (lidx != 0u) { return; }\n\n    let numTiles = params.x;\n    let totalIsects = counter[0];\n\n    // Set end sentinel\n    tileOffsets[numTiles] = totalIsects;\n\n    // Backward propagation: empty tiles inherit next tile's start offset\n    for (var i = i32(numTiles) - 1; i >= 0; i--) {\n        if (tileOffsets[u32(i)] == 0xFFFFFFFFu) {\n            tileOffsets[u32(i)] = tileOffsets[u32(i) + 1u];\n        }\n    }\n}\n";
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
export declare const tiledRasterSource = "\nconst TILE_SIZE = 16u;\nconst BATCH_SIZE = 256u;\n\nconst RENDER_MODE_RGB: u32 = 0u;\nconst RENDER_MODE_DEPTH: u32 = 1u;\nconst RENDER_MODE_RGBD: u32 = 2u;\n\nstruct SplatData {\n    mean2d: vec2<f32>,\n    depth: f32,\n    radius: f32,\n    conic: vec3<f32>,\n    compensation: f32,\n    color: vec4<f32>,\n};\n\nstruct RasterUniforms {\n    viewportWidth: u32,\n    viewportHeight: u32,\n    tileWidth: u32,\n    tileHeight: u32,\n    nearPlane: f32,\n    farPlane: f32,\n    antialiasing: u32,\n    renderMode: u32,\n    alphaThreshold: f32,\n    _pad0: u32,\n    _pad1: u32,\n    _pad2: u32,\n};\n\n@group(0) @binding(0) var<uniform> uniforms: RasterUniforms;\n@group(0) @binding(1) var<storage, read> splatData: array<SplatData>;\n@group(0) @binding(2) var<storage, read> isectVals: array<u32>;\n@group(0) @binding(3) var<storage, read> tileOffsets: array<u32>;\n@group(0) @binding(4) var<storage, read_write> outputColor: array<vec4<f32>>;\n\nvar<workgroup> s_mean2d: array<vec2<f32>, BATCH_SIZE>;\nvar<workgroup> s_conic: array<vec4<f32>, BATCH_SIZE>;\nvar<workgroup> s_color: array<vec4<f32>, BATCH_SIZE>;\n\n@compute @workgroup_size(16, 16)\nfn main(\n    @builtin(workgroup_id) wgid: vec3<u32>,\n    @builtin(local_invocation_id) lid: vec3<u32>,\n    @builtin(local_invocation_index) lidx: u32,\n) {\n    let tileX = wgid.x;\n    let tileY = wgid.y;\n    let tileId = tileY * uniforms.tileWidth + tileX;\n\n    let pixelX = tileX * TILE_SIZE + lid.x;\n    let pixelY = tileY * TILE_SIZE + lid.y;\n    let px = f32(pixelX) + 0.5;\n    let py = f32(pixelY) + 0.5;\n\n    let inside = pixelX < uniforms.viewportWidth && pixelY < uniforms.viewportHeight;\n    var done = !inside;\n\n    // Tile's intersection range (CSR format)\n    let rangeStart = tileOffsets[tileId];\n    let rangeEnd = tileOffsets[tileId + 1u];\n    let numInTile = rangeEnd - rangeStart;\n    let numBatches = (numInTile + BATCH_SIZE - 1u) / BATCH_SIZE;\n\n    // Accumulation state\n    var T = 1.0f;\n    var color = vec3<f32>(0.0, 0.0, 0.0);\n    var accDepth = 0.0f;\n\n    for (var b = 0u; b < numBatches; b++) {\n        // Synchronize before loading new batch\n        workgroupBarrier();\n\n        // Collaborative load into shared memory\n        let batchStart = rangeStart + b * BATCH_SIZE;\n        let loadIdx = batchStart + lidx;\n        if (loadIdx < rangeEnd) {\n            let g = isectVals[loadIdx];\n            let splat = splatData[g];\n            s_mean2d[lidx] = splat.mean2d;\n            // Pack depth into conic.w for depth/rgbd modes\n            s_conic[lidx] = vec4<f32>(splat.conic, splat.depth);\n\n            var opacity = splat.color.a;\n            if (uniforms.antialiasing != 0u) {\n                opacity *= splat.compensation;\n            }\n            s_color[lidx] = vec4<f32>(splat.color.rgb, opacity);\n        }\n\n        // Synchronize after load\n        workgroupBarrier();\n\n        // Process batch\n        let batchSize = min(BATCH_SIZE, rangeEnd - batchStart);\n        for (var t = 0u; t < batchSize; t++) {\n            if (done) { break; }\n\n            let mean = s_mean2d[t];\n            let conic = s_conic[t].xyz;\n            let splatDepth = s_conic[t].w;\n            let rgba = s_color[t];\n\n            let delta = mean - vec2<f32>(px, py);\n            let sigma = 0.5 * (conic.x * delta.x * delta.x +\n                               conic.z * delta.y * delta.y) +\n                        conic.y * delta.x * delta.y;\n\n            if (sigma < 0.0) { continue; }\n\n            let alpha = min(0.99, rgba.a * exp(-sigma));\n            if (alpha < uniforms.alphaThreshold) { continue; }\n\n            let nextT = T * (1.0 - alpha);\n            if (nextT < 1e-4) {\n                done = true;\n                break;\n            }\n\n            let weight = alpha * T;\n            color += rgba.rgb * weight;\n\n            if (uniforms.renderMode != RENDER_MODE_RGB) {\n                accDepth += splatDepth * weight;\n            }\n\n            T = nextT;\n        }\n    }\n\n    // Write output\n    if (inside) {\n        let pixelId = pixelY * uniforms.viewportWidth + pixelX;\n        let rasterAlpha = 1.0 - T;\n\n        if (uniforms.renderMode == RENDER_MODE_DEPTH) {\n            let nearP = uniforms.nearPlane;\n            let farP = uniforms.farPlane;\n            let normDepth = clamp((accDepth - nearP * (1.0 - T)) / (farP - nearP), 0.0, 1.0);\n            outputColor[pixelId] = vec4<f32>(vec3<f32>(normDepth) * rasterAlpha, rasterAlpha);\n        } else if (uniforms.renderMode == RENDER_MODE_RGBD) {\n            let nearP = uniforms.nearPlane;\n            let farP = uniforms.farPlane;\n            let normDepth = clamp((accDepth - nearP * (1.0 - T)) / (farP - nearP), 0.0, 1.0);\n            outputColor[pixelId] = vec4<f32>(color, normDepth);\n        } else {\n            outputColor[pixelId] = vec4<f32>(color, rasterAlpha);\n        }\n    }\n}\n";
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
export declare const blitSource = "\n@group(0) @binding(0) var<storage, read> outputColor: array<vec4<f32>>;\n@group(0) @binding(1) var<uniform> blitParams: vec4<u32>;\n\n@vertex\nfn vs_blit(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {\n    // Fullscreen triangle: 3 vertices cover clip space\n    let x = f32(i32(vid & 1u) * 4 - 1);\n    let y = f32(i32(vid & 2u) * 2 - 1);\n    return vec4<f32>(x, y, 0.0, 1.0);\n}\n\n@fragment\nfn fs_blit(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {\n    let pixelX = u32(pos.x);\n    let pixelY = u32(pos.y);\n    let width = blitParams.x;\n    let height = blitParams.y;\n    if (pixelX >= width || pixelY >= height) {\n        return vec4<f32>(0.0, 0.0, 0.0, 0.0);\n    }\n    let idx = pixelY * width + pixelX;\n    return outputColor[idx];\n}\n";
