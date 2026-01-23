/**
 * Shared shader code for 3D viewer components
 */

// Custom shader material for lines with per-vertex alpha
export const lineVertexShader = `
  attribute float alpha;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vColor = color;
    vAlpha = alpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const lineFragmentShader = `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;
