import type { CPUSortModule } from '../types';
export type WasmSortAlgorithm = 'wasm-radix' | 'wasm-radix-16bit' | 'wasm-radix-8bit' | 'wasm-counting';
export declare function createWasmSortModule(algorithm?: WasmSortAlgorithm): Promise<CPUSortModule>;
