import '@testing-library/jest-dom';
import 'three';

// Vitest may evaluate direct Three imports from the source package while optimized
// R3F dependencies load Vite's prebundled Three chunk. Warm the source module and
// clear Three's browser marker so that module-id split does not look like a
// duplicate installed package during tests.
if (typeof window !== 'undefined') {
  Reflect.deleteProperty(window, '__THREE__');
}

// Mock WebGL context for Three.js tests
class MockWebGLRenderingContext {}

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: function (contextId: string) {
    if (contextId === 'webgl' || contextId === 'webgl2') {
      return new MockWebGLRenderingContext();
    }
    return null;
  },
});
