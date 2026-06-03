import * as THREE from 'three';
import { GRID_COLORS } from '../../theme';

export const ORIGIN_GRID_VERTEX_SHADER = `
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const ORIGIN_GRID_FRAGMENT_SHADER = `
  uniform float uGridScale;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  varying vec3 vWorldPos;

  // Robust grid line calculation - compute derivative on raw position for stability
  float getGrid(vec2 pos, float scale, float lineWidth) {
    vec2 coord = pos / scale;
    vec2 grid = abs(fract(coord - 0.5) - 0.5);
    // Compute derivative on raw world position, then scale
    // This avoids precision issues from fwidth on large scaled coordinates
    vec2 deriv = fwidth(pos) / scale;
    // Clamp derivatives to avoid precision issues at grazing angles and orthographic view
    deriv = clamp(deriv, vec2(0.001), vec2(0.5));
    vec2 lines = smoothstep(deriv * lineWidth, vec2(0.0), grid);
    return max(lines.x, lines.y);
  }

  void main() {
    // Major grid lines (every 10 units)
    float majorGrid = getGrid(vWorldPos.xz, uGridScale * 10.0, 1.5);
    // Minor grid lines (every 1 unit)
    float minorGrid = getGrid(vWorldPos.xz, uGridScale, 1.0);

    // Fade based on distance from origin
    float dist = length(vWorldPos.xz);
    float fade = 1.0 - smoothstep(uGridScale * 50.0, uGridScale * 100.0, dist);

    // Combine grids - only show actual grid lines, no fill
    vec3 color = mix(uColor2, uColor1, majorGrid);
    float alpha = max(majorGrid * 0.8, minorGrid * 0.3) * fade;

    // Discard pixels that aren't on grid lines
    if (alpha < 0.05) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function getOriginGridScale(size: number, scale: number): number {
  return size * 0.1 * scale;
}

export function createOriginGridMaterial(gridScale: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uGridScale: { value: gridScale },
      uColor1: { value: new THREE.Color(GRID_COLORS.majorLines) },
      uColor2: { value: new THREE.Color(GRID_COLORS.minorLines) },
    },
    vertexShader: ORIGIN_GRID_VERTEX_SHADER,
    fragmentShader: ORIGIN_GRID_FRAGMENT_SHADER,
  });
}

export function updateOriginGridScale(material: THREE.ShaderMaterial, gridScale: number): void {
  material.uniforms.uGridScale.value = gridScale;
}
