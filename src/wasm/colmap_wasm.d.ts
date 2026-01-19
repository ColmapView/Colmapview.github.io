/**
 * Type declaration for the dynamically loaded colmap_wasm.js module
 *
 * This module is built by Emscripten and loaded at runtime.
 * It exports a factory function that returns a Promise<ColmapWasmModule>.
 */

import type { ColmapWasmModule } from './types';

declare module '/wasm/colmap_wasm.js' {
  const createColmapWasm: () => Promise<ColmapWasmModule>;
  export default createColmapWasm;
}
