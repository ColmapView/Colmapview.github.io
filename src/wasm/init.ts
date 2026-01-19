/**
 * WASM module initialization and loading
 */

import type { ColmapWasmModule, CreateColmapWasm } from './types';

let modulePromise: Promise<ColmapWasmModule | null> | null = null;
let cachedModule: ColmapWasmModule | null = null;

/**
 * Check if WebAssembly is supported
 */
export function isWasmSupported(): boolean {
  try {
    if (
      typeof WebAssembly === 'object' &&
      typeof WebAssembly.instantiate === 'function'
    ) {
      // Test with a minimal valid WASM module
      const module = new WebAssembly.Module(
        new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
      );
      return module instanceof WebAssembly.Module;
    }
  } catch {
    // WebAssembly not supported
  }
  return false;
}

/**
 * Load the colmap-wasm module
 *
 * Returns a cached module if already loaded.
 * Falls back to null if WASM is not supported or module fails to load.
 */
export async function loadColmapWasm(): Promise<ColmapWasmModule | null> {
  // Return cached module if available
  if (cachedModule) {
    return cachedModule;
  }

  // Return existing promise if loading is in progress
  if (modulePromise) {
    return modulePromise;
  }

  // Check WASM support
  if (!isWasmSupported()) {
    console.warn('WebAssembly is not supported in this browser');
    return null;
  }

  // Start loading
  modulePromise = (async () => {
    try {
      // Dynamic import from public directory
      // The WASM module is built by Emscripten and placed in public/wasm/
      // @ts-expect-error Dynamic import path resolved at runtime
      const wasmModule = await import('/wasm/colmap_wasm.js');
      const createColmapWasm = wasmModule.default as CreateColmapWasm;

      const module = await createColmapWasm();
      cachedModule = module;
      console.log('colmap-wasm module loaded successfully');
      return module;
    } catch (error) {
      console.warn('Failed to load colmap-wasm module:', error);
      modulePromise = null;
      return null;
    }
  })();

  return modulePromise;
}

/**
 * Get the loaded module synchronously (returns null if not yet loaded)
 */
export function getColmapWasmModule(): ColmapWasmModule | null {
  return cachedModule;
}

/**
 * Check if the module is loaded
 */
export function isColmapWasmLoaded(): boolean {
  return cachedModule !== null;
}

/**
 * Get WASM memory statistics
 */
export function getWasmMemoryStats(): {
  heapSize: number;
  heapUsed: number;
} | null {
  if (!cachedModule) {
    return null;
  }

  const heapSize = cachedModule.HEAPU8.length;

  // Note: Actual used memory is harder to determine without tracking allocations
  // This is just the total linear memory size
  return {
    heapSize,
    heapUsed: heapSize, // Approximation
  };
}
