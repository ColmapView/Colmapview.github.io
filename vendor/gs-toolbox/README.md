# Vendored gs-toolbox

This package is a vendored build of `gs-toolbox` used by colmapview for
Gaussian splat loading and WebGPU renderer building blocks.

The root `package.json` depends on this directory with `file:vendor/gs-toolbox`
so release installs do not require a sibling `../../gsplat` checkout. The Vite
config may still alias `gs-toolbox` to a local source checkout when explicitly
enabled for development.

The vendored package manifest includes `pako` for SPZ support.

Source license: Apache-2.0. See `LICENSE`.
