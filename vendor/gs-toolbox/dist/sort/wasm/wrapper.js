// WASM Sort Module Wrapper
// ========================
// Each WASM sort algorithm is compiled as an individual module (.wasm.js),
// exporting a single `_sort` function with a uniform signature.
// This wrapper dynamically imports the correct module for the requested algorithm.
/** Map algorithm name to WASM module file (without .wasm.js extension). */
const MODULE_MAP = {
    'wasm-radix-8bit': 'radix-8bit',
    'wasm-radix-16bit': 'radix-16bit',
    'wasm-radix': 'radix-32bit',
    'wasm-counting': 'counting-16bit',
};
/**
 * Dynamically import a WASM sort module by algorithm name.
 * Each module exports a `createWasmModule()` default function.
 */
async function loadWasmModule(algorithm) {
    const name = MODULE_MAP[algorithm];
    // Dynamic import — bundler (Vite) resolves the relative path at build time.
    // Each module is a self-contained ES module with embedded WASM binary.
    switch (name) {
        case 'radix-8bit': {
            const mod = await import('./radix-8bit.wasm.js');
            return mod.default();
        }
        case 'radix-16bit': {
            const mod = await import('./radix-16bit.wasm.js');
            return mod.default();
        }
        case 'radix-32bit': {
            const mod = await import('./radix-32bit.wasm.js');
            return mod.default();
        }
        case 'counting-16bit': {
            const mod = await import('./counting-16bit.wasm.js');
            return mod.default();
        }
        default:
            throw new Error(`Unknown WASM sort module: ${name}`);
    }
}
export async function createWasmSortModule(algorithm = 'wasm-radix') {
    const wasm = await loadWasmModule(algorithm);
    if (typeof wasm._sort !== 'function') {
        throw new Error(`WASM module for "${algorithm}" does not export _sort. ` +
            `Rebuild WASM with: cd sort/wasm && bash build.sh`);
    }
    // Persistent heap allocations (grow-only)
    let capacity = 0;
    let ptrDepths = 0;
    let ptrIndices = 0;
    let ptrScratchD = 0;
    let ptrScratchI = 0;
    function ensureCapacity(n) {
        if (n <= capacity)
            return;
        // Free old allocations
        if (capacity > 0) {
            wasm._free(ptrDepths);
            wasm._free(ptrIndices);
            wasm._free(ptrScratchD);
            wasm._free(ptrScratchI);
        }
        // Allocate 4 buffers x n x 4 bytes
        const bytes = n * 4;
        ptrDepths = wasm._malloc(bytes);
        ptrIndices = wasm._malloc(bytes);
        ptrScratchD = wasm._malloc(bytes);
        ptrScratchI = wasm._malloc(bytes);
        capacity = n;
    }
    return {
        name: algorithm,
        sort(config) {
            const { count, depths, indices } = config;
            if (count <= 1)
                return;
            ensureCapacity(count);
            // Copy JS -> WASM heap
            const u32 = wasm.HEAPU32;
            const dOff = ptrDepths >>> 2;
            const iOff = ptrIndices >>> 2;
            u32.set(depths.subarray(0, count), dOff);
            u32.set(indices.subarray(0, count), iOff);
            // Sort in WASM
            wasm._sort(ptrDepths, ptrIndices, ptrScratchD, ptrScratchI, count);
            // Re-read HEAPU32 after _sort() in case WASM heap was grown
            const u32After = wasm.HEAPU32;
            depths.set(u32After.subarray(dOff, dOff + count));
            indices.set(u32After.subarray(iOff, iOff + count));
        },
    };
}
