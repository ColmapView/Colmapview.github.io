import { evalSH } from '../data/sh';
export function renderToTensors(options) {
    return rasterizationCPU(options);
}
export function rasterizationCPU(options) {
    const mode = options.renderMode ?? 'RGB';
    const projection = projectGaussians(options);
    const cameras = normalizeCameras(options.viewmats, options.Ks);
    const sourceChannels = getSourceChannelCount(options);
    const outputChannels = getOutputChannelCount(mode, sourceChannels);
    const pixelCount = projection.cameraCount * options.width * options.height;
    const renderColors = new Float32Array(pixelCount * outputChannels);
    const renderAlphas = new Float32Array(pixelCount);
    const accumDepth = usesDepth(mode) ? new Float32Array(pixelCount) : null;
    validatePositiveInteger(options.width, 'width');
    validatePositiveInteger(options.height, 'height');
    for (let cameraIndex = 0; cameraIndex < projection.cameraCount; cameraIndex++) {
        const order = sortedVisibleIndices(projection, cameraIndex);
        for (const gaussianIndex of order) {
            rasterizeGaussian(options, projection, cameras[cameraIndex], cameraIndex, gaussianIndex, sourceChannels, outputChannels, renderColors, renderAlphas, accumDepth);
        }
        applyBackground(options, cameraIndex, sourceChannels, outputChannels, renderColors, renderAlphas);
    }
    if (mode === 'ED' || mode === 'RGB+ED') {
        divideExpectedDepth(mode, sourceChannels, outputChannels, renderColors, renderAlphas);
    }
    const meta = {
        cameraCount: projection.cameraCount,
        gaussianCount: projection.gaussianCount,
        width: options.width,
        height: options.height,
        channels: outputChannels,
        sourceChannels,
        colorShape: [projection.cameraCount, options.height, options.width, outputChannels],
        alphaShape: [projection.cameraCount, options.height, options.width, 1],
        renderMode: mode,
        channelChunk: options.channelChunk ?? 32,
        radii: projection.radii,
        means2d: projection.means2d,
        depths: projection.depths,
        conics: projection.conics,
    };
    return {
        renderColors,
        renderAlphas,
        render_colors: renderColors,
        render_alphas: renderAlphas,
        meta,
    };
}
export function fullyFusedProjectionCPU(options) {
    const projected = projectGaussians(options);
    return {
        cameraCount: projected.cameraCount,
        gaussianCount: projected.gaussianCount,
        radii: projected.radii,
        means2d: projected.means2d,
        depths: projected.depths,
        conics: projected.conics,
    };
}
export function isectTilesCPU(projection, tileSize, tileWidth, tileHeight, sort = true) {
    validatePositiveInteger(tileSize, 'tileSize');
    validatePositiveInteger(tileWidth, 'tileWidth');
    validatePositiveInteger(tileHeight, 'tileHeight');
    const count = projection.gaussianCount;
    const tilesPerGaussian = new Uint32Array(projection.cameraCount * count);
    const pairs = [];
    for (let cameraIndex = 0; cameraIndex < projection.cameraCount; cameraIndex++) {
        for (let gaussianIndex = 0; gaussianIndex < count; gaussianIndex++) {
            const scalarOffset = cameraIndex * count + gaussianIndex;
            const vec2Offset = scalarOffset * 2;
            const radiusX = projection.radii[vec2Offset];
            const radiusY = projection.radii[vec2Offset + 1];
            if (radiusX <= 0 || radiusY <= 0)
                continue;
            const meanX = projection.means2d[vec2Offset];
            const meanY = projection.means2d[vec2Offset + 1];
            const minTileX = clampInt(Math.floor((meanX - radiusX) / tileSize), 0, tileWidth - 1);
            const maxTileX = clampInt(Math.floor((meanX + radiusX) / tileSize), 0, tileWidth - 1);
            const minTileY = clampInt(Math.floor((meanY - radiusY) / tileSize), 0, tileHeight - 1);
            const maxTileY = clampInt(Math.floor((meanY + radiusY) / tileSize), 0, tileHeight - 1);
            const depthKey = quantizeDepthForKey(projection.depths[scalarOffset]);
            for (let ty = minTileY; ty <= maxTileY; ty++) {
                for (let tx = minTileX; tx <= maxTileX; tx++) {
                    const tileId = cameraIndex * tileWidth * tileHeight + ty * tileWidth + tx;
                    const key = (BigInt(tileId) << 32n) | BigInt(depthKey);
                    pairs.push({ key, id: gaussianIndex });
                    tilesPerGaussian[scalarOffset]++;
                }
            }
        }
    }
    if (sort) {
        pairs.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : a.id - b.id);
    }
    const isectIds = new BigUint64Array(pairs.length);
    const flattenIds = new Uint32Array(pairs.length);
    for (let i = 0; i < pairs.length; i++) {
        isectIds[i] = pairs[i].key;
        flattenIds[i] = pairs[i].id;
    }
    return { tilesPerGaussian, isectIds, flattenIds };
}
export function isectOffsetEncodeCPU(isectIds, nImages, tileWidth, tileHeight) {
    validatePositiveInteger(nImages, 'nImages');
    validatePositiveInteger(tileWidth, 'tileWidth');
    validatePositiveInteger(tileHeight, 'tileHeight');
    const tileCount = nImages * tileWidth * tileHeight;
    const offsets = new Uint32Array(tileCount + 1);
    offsets.fill(isectIds.length);
    for (let i = 0; i < isectIds.length; i++) {
        const tileId = Number(isectIds[i] >> 32n);
        if (tileId >= 0 && tileId < tileCount && offsets[tileId] === isectIds.length) {
            offsets[tileId] = i;
        }
    }
    let next = isectIds.length;
    offsets[tileCount] = isectIds.length;
    for (let tile = tileCount - 1; tile >= 0; tile--) {
        if (offsets[tile] === isectIds.length) {
            offsets[tile] = next;
        }
        else {
            next = offsets[tile];
        }
    }
    return offsets;
}
export function rasterizeToPixelsCPU(projection, colors, opacities, width, height, options) {
    const count = projection.gaussianCount;
    const mode = options.renderMode ?? 'RGB';
    const outputChannels = getOutputChannelCount(mode, options.colorChannels);
    const pixelCount = projection.cameraCount * width * height;
    const renderColors = new Float32Array(pixelCount * outputChannels);
    const renderAlphas = new Float32Array(pixelCount);
    const sigmas = new Float32Array(projection.cameraCount * count * 2);
    for (let i = 0; i < projection.cameraCount * count; i++) {
        const conicBase = i * 3;
        const sigmaBase = i * 2;
        sigmas[sigmaBase] = projection.conics[conicBase] > 0 ? Math.sqrt(1 / projection.conics[conicBase]) : 0;
        sigmas[sigmaBase + 1] = projection.conics[conicBase + 2] > 0 ? Math.sqrt(1 / projection.conics[conicBase + 2]) : 0;
    }
    const prepared = {
        cameraCount: projection.cameraCount,
        gaussianCount: projection.gaussianCount,
        radii: projection.radii,
        means2d: projection.means2d,
        depths: projection.depths,
        conics: projection.conics,
        sigmas,
    };
    const cloud = {
        count,
        positions: new Float32Array(count * 3),
        scales: new Float32Array(count * 3).fill(1),
        rotations: new Float32Array(count * 4),
        opacities,
        sh0: new Float32Array(count * 3),
        shDegree: 0,
    };
    const rasterOptions = {
        cloud,
        viewmats: repeatedMatrices(identity4(), projection.cameraCount),
        Ks: repeatedMatrices(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), projection.cameraCount),
        width,
        height,
        colors,
        colorChannels: options.colorChannels,
        backgrounds: options.backgrounds,
        renderMode: mode,
        channelChunk: options.channelChunk,
    };
    const cameras = normalizeCameras(rasterOptions.viewmats, rasterOptions.Ks);
    for (let cameraIndex = 0; cameraIndex < projection.cameraCount; cameraIndex++) {
        const order = sortedVisibleIndices(prepared, cameraIndex);
        for (const gaussianIndex of order) {
            rasterizeGaussian(rasterOptions, prepared, cameras[cameraIndex], cameraIndex, gaussianIndex, options.colorChannels, outputChannels, renderColors, renderAlphas, null);
        }
        applyBackground(rasterOptions, cameraIndex, options.colorChannels, outputChannels, renderColors, renderAlphas);
    }
    if (mode === 'ED' || mode === 'RGB+ED') {
        divideExpectedDepth(mode, options.colorChannels, outputChannels, renderColors, renderAlphas);
    }
    const meta = {
        cameraCount: projection.cameraCount,
        gaussianCount: projection.gaussianCount,
        width,
        height,
        channels: outputChannels,
        sourceChannels: options.colorChannels,
        colorShape: [projection.cameraCount, height, width, outputChannels],
        alphaShape: [projection.cameraCount, height, width, 1],
        renderMode: mode,
        channelChunk: options.channelChunk ?? 32,
        radii: projection.radii,
        means2d: projection.means2d,
        depths: projection.depths,
        conics: projection.conics,
    };
    return {
        renderColors,
        renderAlphas,
        render_colors: renderColors,
        render_alphas: renderAlphas,
        meta,
    };
}
function projectGaussians(options) {
    validatePositiveInteger(options.width, 'width');
    validatePositiveInteger(options.height, 'height');
    const cameras = normalizeCameras(options.viewmats, options.Ks);
    const count = options.cloud.count;
    const cameraCount = cameras.length;
    const radii = new Float32Array(cameraCount * count * 2);
    const means2d = new Float32Array(cameraCount * count * 2);
    const depths = new Float32Array(cameraCount * count);
    const conics = new Float32Array(cameraCount * count * 3);
    const sigmas = new Float32Array(cameraCount * count * 2);
    const near = options.nearPlane ?? 0.01;
    const far = options.farPlane ?? 1e10;
    const radiusClip = options.radiusClip ?? 0;
    const eps2d = options.eps2d ?? 0.3;
    const opacityThreshold = options.opacityThreshold ?? 0;
    for (let c = 0; c < cameraCount; c++) {
        const camera = cameras[c];
        const fx = camera.K[0];
        const fy = camera.K[4];
        const cx = camera.K[2];
        const cy = camera.K[5];
        for (let i = 0; i < count; i++) {
            const p = transformPoint(camera.view, options.cloud.positions[i * 3], options.cloud.positions[i * 3 + 1], options.cloud.positions[i * 3 + 2]);
            const depth = -p[2];
            const scalarOffset = c * count + i;
            depths[scalarOffset] = depth;
            if (depth <= near || depth >= far || options.cloud.opacities[i] < opacityThreshold) {
                continue;
            }
            let x;
            let y;
            let sigmaX;
            let sigmaY;
            const scaleX = Math.max(1e-6, options.cloud.scales[i * 3]);
            const scaleY = Math.max(1e-6, options.cloud.scales[i * 3 + 1]);
            const scaleZ = Math.max(1e-6, options.cloud.scales[i * 3 + 2]);
            const scale = Math.max(scaleX, scaleY, scaleZ);
            if ((options.cameraModel ?? 'pinhole') === 'ortho') {
                x = p[0] * fx + cx;
                y = cy - p[1] * fy;
                sigmaX = Math.max(eps2d, Math.abs(scale * fx));
                sigmaY = Math.max(eps2d, Math.abs(scale * fy));
            }
            else {
                x = p[0] * fx / depth + cx;
                y = cy - p[1] * fy / depth;
                sigmaX = Math.max(eps2d, Math.abs(scale * fx / depth));
                sigmaY = Math.max(eps2d, Math.abs(scale * fy / depth));
            }
            const radiusX = Math.ceil(3 * sigmaX);
            const radiusY = Math.ceil(3 * sigmaY);
            if (Math.max(radiusX, radiusY) <= radiusClip) {
                continue;
            }
            const vec2Offset = scalarOffset * 2;
            const conicOffset = scalarOffset * 3;
            means2d[vec2Offset] = x;
            means2d[vec2Offset + 1] = y;
            radii[vec2Offset] = radiusX;
            radii[vec2Offset + 1] = radiusY;
            sigmas[vec2Offset] = sigmaX;
            sigmas[vec2Offset + 1] = sigmaY;
            conics[conicOffset] = 1 / (sigmaX * sigmaX);
            conics[conicOffset + 1] = 0;
            conics[conicOffset + 2] = 1 / (sigmaY * sigmaY);
        }
    }
    return { cameraCount, gaussianCount: count, radii, means2d, depths, conics, sigmas };
}
function rasterizeGaussian(options, projection, camera, cameraIndex, gaussianIndex, sourceChannels, outputChannels, renderColors, renderAlphas, accumDepth) {
    const mode = options.renderMode ?? 'RGB';
    const scalarOffset = cameraIndex * projection.gaussianCount + gaussianIndex;
    const vec2Offset = scalarOffset * 2;
    const radiusX = projection.radii[vec2Offset];
    const radiusY = projection.radii[vec2Offset + 1];
    if (radiusX <= 0 || radiusY <= 0)
        return;
    const meanX = projection.means2d[vec2Offset];
    const meanY = projection.means2d[vec2Offset + 1];
    const sigmaX = projection.sigmas[vec2Offset];
    const sigmaY = projection.sigmas[vec2Offset + 1];
    const opacity = options.cloud.opacities[gaussianIndex];
    const depth = projection.depths[scalarOffset];
    const features = getGaussianFeatures(options, camera, gaussianIndex, sourceChannels);
    const minX = Math.max(0, Math.floor(meanX - radiusX));
    const maxX = Math.min(options.width - 1, Math.ceil(meanX + radiusX));
    const minY = Math.max(0, Math.floor(meanY - radiusY));
    const maxY = Math.min(options.height - 1, Math.ceil(meanY + radiusY));
    for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
            const dx = px + 0.5 - meanX;
            const dy = py + 0.5 - meanY;
            const power = -0.5 * ((dx * dx) / (sigmaX * sigmaX) + (dy * dy) / (sigmaY * sigmaY));
            if (power > 0)
                continue;
            const alpha = Math.min(0.99, opacity * Math.exp(power));
            if (alpha < (options.opacityThreshold ?? 0))
                continue;
            const pixel = (cameraIndex * options.height + py) * options.width + px;
            const previousAlpha = renderAlphas[pixel];
            const transmittance = 1 - previousAlpha;
            if (transmittance <= 1e-4)
                continue;
            const weight = alpha * transmittance;
            renderAlphas[pixel] = previousAlpha + weight;
            const colorBase = pixel * outputChannels;
            if (mode === 'D' || mode === 'ED') {
                renderColors[colorBase] += depth * weight;
            }
            else {
                for (let channel = 0; channel < sourceChannels; channel++) {
                    renderColors[colorBase + channel] += features[channel] * weight;
                }
                if (mode === 'RGB+D' || mode === 'RGB+ED') {
                    renderColors[colorBase + sourceChannels] += depth * weight;
                }
            }
            if (accumDepth)
                accumDepth[pixel] += depth * weight;
        }
    }
}
function getGaussianFeatures(options, camera, gaussianIndex, channels) {
    if (options.colors) {
        const offset = gaussianIndex * channels;
        return options.colors.subarray(offset, offset + channels);
    }
    const cloud = options.cloud;
    const sh0 = [
        cloud.sh0[gaussianIndex * 3],
        cloud.sh0[gaussianIndex * 3 + 1],
        cloud.sh0[gaussianIndex * 3 + 2],
    ];
    const numCoeffs = cloud.shDegree > 0 ? (cloud.shDegree + 1) * (cloud.shDegree + 1) - 1 : 0;
    const shN = cloud.shN && numCoeffs > 0
        ? cloud.shN.subarray(gaussianIndex * numCoeffs * 3, (gaussianIndex + 1) * numCoeffs * 3)
        : null;
    const px = cloud.positions[gaussianIndex * 3];
    const py = cloud.positions[gaussianIndex * 3 + 1];
    const pz = cloud.positions[gaussianIndex * 3 + 2];
    let dx = px - camera.position[0];
    let dy = py - camera.position[1];
    let dz = pz - camera.position[2];
    const len = Math.hypot(dx, dy, dz);
    if (len > 0) {
        dx /= len;
        dy /= len;
        dz /= len;
    }
    return new Float32Array(evalSH(sh0, shN, cloud.shDegree, dx, dy, dz));
}
function applyBackground(options, cameraIndex, sourceChannels, outputChannels, renderColors, renderAlphas) {
    const mode = options.renderMode ?? 'RGB';
    if (!options.backgrounds || mode === 'D' || mode === 'ED')
        return;
    for (let py = 0; py < options.height; py++) {
        for (let px = 0; px < options.width; px++) {
            const pixel = (cameraIndex * options.height + py) * options.width + px;
            const transmittance = 1 - renderAlphas[pixel];
            if (transmittance <= 0)
                continue;
            const base = pixel * outputChannels;
            for (let channel = 0; channel < sourceChannels; channel++) {
                const bg = backgroundValue(options.backgrounds, cameraIndex, sourceChannels, channel);
                renderColors[base + channel] += bg * transmittance;
            }
        }
    }
}
function divideExpectedDepth(mode, sourceChannels, outputChannels, renderColors, renderAlphas) {
    const depthChannel = mode === 'ED' ? 0 : sourceChannels;
    const pixelCount = renderAlphas.length;
    for (let pixel = 0; pixel < pixelCount; pixel++) {
        const alpha = Math.max(renderAlphas[pixel], 1e-10);
        renderColors[pixel * outputChannels + depthChannel] /= alpha;
    }
}
function sortedVisibleIndices(projection, cameraIndex) {
    const start = cameraIndex * projection.gaussianCount;
    const indices = [];
    for (let i = 0; i < projection.gaussianCount; i++) {
        if (projection.radii[(start + i) * 2] > 0 && projection.radii[(start + i) * 2 + 1] > 0) {
            indices.push(i);
        }
    }
    indices.sort((a, b) => projection.depths[start + a] - projection.depths[start + b]);
    return indices;
}
function getSourceChannelCount(options) {
    if (options.colors) {
        const channels = options.colorChannels ?? Math.floor(options.colors.length / options.cloud.count);
        validatePositiveInteger(channels, 'colorChannels');
        if (options.colors.length !== options.cloud.count * channels) {
            throw new Error('colors length must equal cloud.count * colorChannels');
        }
        return channels;
    }
    return 3;
}
function getOutputChannelCount(mode, sourceChannels) {
    if (mode === 'D' || mode === 'ED')
        return 1;
    if (mode === 'RGB+D' || mode === 'RGB+ED')
        return sourceChannels + 1;
    return sourceChannels;
}
function usesDepth(mode) {
    return mode === 'D' || mode === 'ED' || mode === 'RGB+D' || mode === 'RGB+ED';
}
function normalizeCameras(viewmats, Ks) {
    const views = splitMatrices(viewmats, 16, 'viewmats');
    const intrinsics = splitMatrices(Ks, 9, 'Ks');
    if (views.length !== intrinsics.length) {
        throw new Error('viewmats and Ks must contain the same number of cameras');
    }
    return views.map((view, index) => ({
        view,
        K: intrinsics[index],
        position: cameraPositionFromView(view),
    }));
}
function splitMatrices(value, size, name) {
    if (Array.isArray(value)) {
        for (const matrix of value) {
            if (matrix.length !== size)
                throw new Error(`${name} matrices must have ${size} values`);
        }
        return value;
    }
    if (value.length % size !== 0)
        throw new Error(`${name} length must be a multiple of ${size}`);
    const matrices = [];
    for (let offset = 0; offset < value.length; offset += size) {
        matrices.push(value.subarray(offset, offset + size));
    }
    return matrices;
}
function transformPoint(m, x, y, z) {
    return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
}
function cameraPositionFromView(view) {
    const tx = view[12];
    const ty = view[13];
    const tz = view[14];
    return [
        -(view[0] * tx + view[1] * ty + view[2] * tz),
        -(view[4] * tx + view[5] * ty + view[6] * tz),
        -(view[8] * tx + view[9] * ty + view[10] * tz),
    ];
}
function backgroundValue(backgrounds, cameraIndex, channels, channel) {
    if (backgrounds.length === channels)
        return backgrounds[channel] ?? 0;
    return backgrounds[cameraIndex * channels + channel] ?? 0;
}
function validatePositiveInteger(value, name) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }
}
function clampInt(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function quantizeDepthForKey(depth) {
    if (!Number.isFinite(depth))
        return 0xffffffff;
    const clamped = Math.max(0, Math.min(1, depth / 1e6));
    return Math.floor(clamped * 0xffffffff) >>> 0;
}
function identity4() {
    return new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
    ]);
}
function repeatedMatrices(matrix, count) {
    return Array.from({ length: count }, () => matrix);
}
