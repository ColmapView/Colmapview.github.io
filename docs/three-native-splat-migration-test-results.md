# Native Three.js splat migration feasibility results

Date: 2026-09-06. Decision: keep the production renderer unchanged.

## What was tested

An isolated checkout at `.tmp/native-three-test/three`, pinned to upstream commit
1091c70369e47728e0b951ad0ced066e0173588e (186dev). Served separately on localhost:5188
and driven using Playwright CLI with installed Chrome. The app package.json,
lockfile and source were not changed.

No checked-in PLY/SPZ assets were found in the local source tree. This experiment
therefore generated controlled 256-splat fixtures: PLY with SH0, SH1, SH2 and SH3,
and gzip SPZ v2. These are format and behavior smoke tests, not real-dataset parity.

| Check | Native WebGPU | Native forced WebGL |
| --- | --- | --- |
| Actual renderer backend checked | WebGPU | WebGL |
| Load/render four PLY SH degrees | Pass | Pass |
| Load/render synthetic SPZ v2 | Pass | Pass |
| Translation moves pixel centroid | Pass | Pass |
| Visibility off produces black target | Pass | Pass |
| Perspective camera motion renders | Pass | Pass |
| Offscreen render-target readback | Pass | Pass |
| Orthographic size invariant under camera distance | FAIL | FAIL |

The tests read a 384x384 offscreen render target and count nonblack pixels.
Moving the orthographic camera from z=3 to z=6 without changing frustum/zoom
reduced nonblack area to approximately 0.3025 of the original for the PLY fixtures,
and 0.3009 for SPZ. Expected ratio is approximately 1. This is a real projection
mismatch, not a timing benchmark. All models remained within the fixed frustum.

Source inspection corroborates the result: GaussianSplat.js lines 933–941 compute
the covariance projection using inverse view-space depth, with no orthographic
branch in that calculation. The current app exposes orthographic viewing.

## Integration assessment

The native addon explicitly supports WebGPURenderer and its forceWebGL backend;
it does not support WebGLRenderer, which the current R3F/Spark integration uses.
A unified-canvas migration must also port or validate the app's custom shaders
(for example UndistortedImageMaterial uses ShaderMaterial). A second canvas would
require composition and capture work and would not share scene depth.

Consequently this is not currently a drop-in, simple migration. Fixing upstream
orthographic support and changing the renderer architecture both add scope.
The experiment deliberately made no renderer-internal patches to make it pass.

## Limits

Not validated: large real reconstructions, SPZ v3/v4 assets, numerical SH fidelity,
repo GaussianCloud-to-native geometry conversion, PSNR/SSIM parity, R3F integration,
point/frustum/image-plane composition, screenshot/recording feature parity,
long-run GPU memory cleanup, other browsers, or physical mobile devices. Readback
success only establishes an offscreen primitive; it does not validate app capture.
No performance claim is made from tiny fixtures or browser automation timings.
The tests are browser-level, not a complete app migration.

Observed console output: a missing favicon and an upstream renderAsync deprecation
warning; no shader/runtime errors in these smoke tests. The test code can use
render() after init() in a future cleanup; no compatibility workarounds were used.

## Reproduction artifacts

- `.tmp/native-three-test/index.html` and `test.js`: isolated harness.
- `sh0.ply` through `sh3.ply`, `v2.spz`: generated fixtures.
- `webgl-result.txt`, `webgpu-result.txt`: initial perspective smoke outputs.
- `orthographic-webgl.txt`, `orthographic-gpu.txt`: orthographic measurements.

Initial logs' `pass` fields refer to perspective smoke assertions only; the
orthographic checks were added afterward. The final harness exposes separate
perspectiveSmokePass and orthographicPass flags; overall migration gate fails.

Recommendation: retain Spark and the existing repository-owned WebGPU renderer.
Revisit when orthographic support is corrected and a stable Three.js release
contains the addon, or when a separate, intentional renderer migration is justified.

Source: https://github.com/mrdoob/three.js/blob/1091c70369e47728e0b951ad0ced066e0173588e/examples/jsm/objects/GaussianSplat.js
