import '@testing-library/jest-dom';

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
