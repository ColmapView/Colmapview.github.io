// Stereo Pipeline Orchestrator
// ============================
// Dual-eye render function that orchestrates projection, sort, and
// rasterization for both eyes using separate command encoder submissions.
//
// This function does NOT own any modules — it borrows them from the caller.
// The caller is responsible for creating, configuring, and destroying the
// projection, sort, and raster modules.
//
// Each eye gets its own command encoder + submit so that setUniforms()
// (which calls device.queue.writeBuffer) takes effect before the GPU
// commands execute. A single encoder would cause the second writeBuffer
// to overwrite the first before either eye's commands run.
//
// Usage:
// ```typescript
// const eyes = computeStereoEyes(viewMatrix, projMatrix, camPos, { ipd: 0.063 });
// encodeStereoFrame(device, { projection: projModule, sort: sortModule, raster: rasterModule },
//   targets.left.colorView, targets.right.colorView,
//   { eyes, projection: { ... }, raster: { ... } });
// ```
/**
 * Encode and submit a stereo frame (both eyes).
 *
 * Sequence:
 * 1. Left eye: setUniforms -> encode projection+sort+raster -> submit
 * 2. Right eye: setUniforms -> encode projection+(sort if full)+raster -> submit
 *
 * Each eye is submitted separately so that uniform buffer writes
 * (via device.queue.writeBuffer) are flushed before the GPU commands execute.
 *
 * @param device - GPU device (used for creating encoders and submitting)
 * @param modules - Borrowed pipeline modules (not owned, not destroyed)
 * @param leftTarget - Left eye color texture view
 * @param rightTarget - Right eye color texture view
 * @param uniforms - Per-frame uniforms with stereo eye matrices
 * @param strategy - 'full' or 'shared-sort' (default: 'shared-sort')
 */
export function encodeStereoFrame(device, modules, leftTarget, rightTarget, uniforms, strategy = 'shared-sort') {
    const { projection, sort, raster } = modules;
    const { eyes } = uniforms;
    // --- Left eye ---
    projection.setUniforms({
        ...uniforms.projection,
        viewMatrix: eyes.left.viewMatrix,
        projMatrix: eyes.left.projMatrix,
        camPos: eyes.left.camPos,
    });
    raster.setUniforms(uniforms.raster);
    const encoderL = device.createCommandEncoder();
    projection.execute(encoderL);
    sort.execute(encoderL);
    raster.execute(encoderL, leftTarget, undefined, { r: 0, g: 0, b: 0, a: 0 });
    device.queue.submit([encoderL.finish()]);
    // --- Right eye ---
    projection.setUniforms({
        ...uniforms.projection,
        viewMatrix: eyes.right.viewMatrix,
        projMatrix: eyes.right.projMatrix,
        camPos: eyes.right.camPos,
    });
    raster.setUniforms(uniforms.raster);
    const encoderR = device.createCommandEncoder();
    projection.execute(encoderR);
    if (strategy === 'full') {
        sort.execute(encoderR);
    }
    raster.execute(encoderR, rightTarget, undefined, { r: 0, g: 0, b: 0, a: 0 });
    device.queue.submit([encoderR.finish()]);
}
