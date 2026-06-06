// PLY format writer — standard binary little-endian
/**
 * Write a GaussianCloud to standard PLY binary format (little-endian).
 *
 * Outputs in the canonical PLY format used by 3DGS training tools:
 * - Positions: x, y, z (float32)
 * - Normals: nx, ny, nz (float32, zeros)
 * - SH DC: f_dc_0, f_dc_1, f_dc_2 (float32, raw SH coefficients)
 * - SH rest: f_rest_0..N (float32, channel-first: all R, then G, then B)
 * - Opacity: opacity (float32, logit space)
 * - Scales: scale_0, scale_1, scale_2 (float32, log space)
 * - Rotations: rot_0, rot_1, rot_2, rot_3 (float32, wxyz)
 */
export function savePLY(cloud) {
    const { count, shDegree } = cloud;
    const numSHRest = shDegree > 0 ? ((shDegree + 1) * (shDegree + 1) - 1) * 3 : 0;
    if (shDegree > 0 && !cloud.shN) {
        throw new Error(`savePLY: shDegree=${shDegree} but shN is undefined`);
    }
    // Build header
    const propLines = [
        'property float x',
        'property float y',
        'property float z',
        'property float nx',
        'property float ny',
        'property float nz',
        'property float f_dc_0',
        'property float f_dc_1',
        'property float f_dc_2',
    ];
    for (let i = 0; i < numSHRest; i++) {
        propLines.push(`property float f_rest_${i}`);
    }
    propLines.push('property float opacity', 'property float scale_0', 'property float scale_1', 'property float scale_2', 'property float rot_0', 'property float rot_1', 'property float rot_2', 'property float rot_3');
    const header = [
        'ply',
        'format binary_little_endian 1.0',
        `element vertex ${count}`,
        ...propLines,
        'end_header',
        '',
    ].join('\n');
    const headerBytes = new TextEncoder().encode(header);
    // floats per vertex: 3 pos + 3 normal + 3 dc + numSHRest + 1 opacity + 3 scale + 4 rotation
    const floatsPerVertex = 3 + 3 + 3 + numSHRest + 1 + 3 + 4;
    const bodySize = count * floatsPerVertex * 4;
    const totalSize = headerBytes.length + bodySize;
    const buffer = new ArrayBuffer(totalSize);
    const headerDst = new Uint8Array(buffer);
    headerDst.set(headerBytes);
    const dataView = new DataView(buffer, headerBytes.length);
    const numCoeffs = shDegree > 0 ? (shDegree + 1) * (shDegree + 1) - 1 : 0;
    for (let i = 0; i < count; i++) {
        let offset = i * floatsPerVertex * 4;
        // Position (x, y, z)
        dataView.setFloat32(offset, cloud.positions[i * 3], true);
        offset += 4;
        dataView.setFloat32(offset, cloud.positions[i * 3 + 1], true);
        offset += 4;
        dataView.setFloat32(offset, cloud.positions[i * 3 + 2], true);
        offset += 4;
        // Normals (zeros)
        dataView.setFloat32(offset, 0, true);
        offset += 4;
        dataView.setFloat32(offset, 0, true);
        offset += 4;
        dataView.setFloat32(offset, 0, true);
        offset += 4;
        // SH DC (raw coefficients, same as stored)
        dataView.setFloat32(offset, cloud.sh0[i * 3], true);
        offset += 4;
        dataView.setFloat32(offset, cloud.sh0[i * 3 + 1], true);
        offset += 4;
        dataView.setFloat32(offset, cloud.sh0[i * 3 + 2], true);
        offset += 4;
        // SH rest — convert from interleaved to channel-first (PLY format)
        // Interleaved: [coeff0_R, coeff0_G, coeff0_B, coeff1_R, coeff1_G, coeff1_B, ...]
        // Channel-first: [coeff0_R, coeff1_R, ..., coeff0_G, coeff1_G, ..., coeff0_B, coeff1_B, ...]
        if (numCoeffs > 0 && cloud.shN) {
            const srcBase = i * numCoeffs * 3;
            // R channel
            for (let j = 0; j < numCoeffs; j++) {
                dataView.setFloat32(offset, cloud.shN[srcBase + j * 3], true);
                offset += 4;
            }
            // G channel
            for (let j = 0; j < numCoeffs; j++) {
                dataView.setFloat32(offset, cloud.shN[srcBase + j * 3 + 1], true);
                offset += 4;
            }
            // B channel
            for (let j = 0; j < numCoeffs; j++) {
                dataView.setFloat32(offset, cloud.shN[srcBase + j * 3 + 2], true);
                offset += 4;
            }
        }
        // Opacity (logit space: -ln(1/x - 1))
        const opClamped = Math.max(1e-6, Math.min(1 - 1e-6, cloud.opacities[i]));
        dataView.setFloat32(offset, -Math.log(1 / opClamped - 1), true);
        offset += 4;
        // Scales (log space: ln(scale))
        dataView.setFloat32(offset, Math.log(Math.max(cloud.scales[i * 3], 1e-20)), true);
        offset += 4;
        dataView.setFloat32(offset, Math.log(Math.max(cloud.scales[i * 3 + 1], 1e-20)), true);
        offset += 4;
        dataView.setFloat32(offset, Math.log(Math.max(cloud.scales[i * 3 + 2], 1e-20)), true);
        offset += 4;
        // Rotation (wxyz, raw — not normalized here, PLY stores raw values)
        dataView.setFloat32(offset, cloud.rotations[i * 4], true);
        offset += 4;
        dataView.setFloat32(offset, cloud.rotations[i * 4 + 1], true);
        offset += 4;
        dataView.setFloat32(offset, cloud.rotations[i * 4 + 2], true);
        offset += 4;
        dataView.setFloat32(offset, cloud.rotations[i * 4 + 3], true);
        offset += 4;
    }
    return buffer;
}
