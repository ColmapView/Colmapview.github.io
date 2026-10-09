declare module 'libarchive.js/src/webworker/wasm-gen/libarchive.js' {
  export default function createLibarchive(options: object): Promise<import('../archive/nativeArchive').NativeWasmModule>;
}
declare module 'libarchive.js/src/webworker/wasm-module.js' {
  export class WasmModule {
    locateFile?: (filename: string) => string;
    initFunctions(): void;
  }
}
