import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

export type FatLineMaterial = LineMaterial & {
  linewidth: number;
  opacity: number;
};

export interface FatLineSegmentsObject {
  geometry: LineSegmentsGeometry;
  material: FatLineMaterial;
  object: LineSegments2;
}

export interface FatLineSegmentsOptions {
  positions: Float32Array;
  colors?: Float32Array;
  alphas?: Float32Array;
  color?: THREE.ColorRepresentation;
  lineWidth: number;
  opacity?: number;
  transparent?: boolean;
  depthTest?: boolean;
  depthWrite?: boolean;
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
  renderOrder?: number;
}

function patchLineMaterialAlphaAttributes(material: FatLineMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        'attribute vec3 instanceColorEnd;',
        `attribute vec3 instanceColorEnd;

    attribute float instanceAlphaStart;
    attribute float instanceAlphaEnd;

    varying float vLineAlpha;`
      )
      .replace(
        'void main() {',
        `void main() {

      vLineAlpha = ( position.y < 0.5 ) ? instanceAlphaStart : instanceAlphaEnd;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <clipping_planes_pars_fragment>',
        `#include <clipping_planes_pars_fragment>

    varying float vLineAlpha;`
      )
      .replace('float alpha = opacity;', 'float alpha = opacity * vLineAlpha;');
  };

  material.customProgramCacheKey = () => 'fat-line-segments-alpha-v1';
  material.needsUpdate = true;
}

export function setFatLineAlphaAttributes(
  geometry: LineSegmentsGeometry,
  alphas: Float32Array
): void {
  const alphaBuffer = new THREE.InstancedInterleavedBuffer(alphas, 2, 1);
  geometry.setAttribute('instanceAlphaStart', new THREE.InterleavedBufferAttribute(alphaBuffer, 1, 0));
  geometry.setAttribute('instanceAlphaEnd', new THREE.InterleavedBufferAttribute(alphaBuffer, 1, 1));
}

export function createFatLineSegmentsObject({
  positions,
  colors,
  alphas,
  color = '#ffffff',
  lineWidth,
  opacity = 1,
  transparent = true,
  depthTest = true,
  depthWrite = false,
  polygonOffset = false,
  polygonOffsetFactor = 0,
  polygonOffsetUnits = 0,
  renderOrder = 0,
}: FatLineSegmentsOptions): FatLineSegmentsObject {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);

  if (colors) {
    geometry.setColors(colors);
  }
  if (alphas) {
    setFatLineAlphaAttributes(geometry, alphas);
  }

  const material = new LineMaterial({
    color,
    vertexColors: Boolean(colors),
    transparent,
    depthTest,
    depthWrite,
    polygonOffset,
    polygonOffsetFactor,
    polygonOffsetUnits,
  }) as FatLineMaterial;

  material.linewidth = lineWidth;
  material.opacity = opacity;
  if (alphas) {
    patchLineMaterialAlphaAttributes(material);
  }

  const object = new LineSegments2(geometry, material);
  object.renderOrder = renderOrder;

  return { geometry, material, object };
}

function getInterleavedFloatArray(
  geometry: LineSegmentsGeometry,
  attributeName: string
): Float32Array | null {
  const attribute = geometry.getAttribute(attributeName);
  if (!(attribute instanceof THREE.InterleavedBufferAttribute)) return null;

  const { array } = attribute.data;
  return array instanceof Float32Array ? array : null;
}

function markInterleavedAttributeNeedsUpdate(
  geometry: LineSegmentsGeometry,
  attributeName: string
): void {
  const attribute = geometry.getAttribute(attributeName);
  if (attribute instanceof THREE.InterleavedBufferAttribute) {
    attribute.data.needsUpdate = true;
  }
}

export function getFatLineColorArray(geometry: LineSegmentsGeometry): Float32Array | null {
  return getInterleavedFloatArray(geometry, 'instanceColorStart');
}

export function getFatLineAlphaArray(geometry: LineSegmentsGeometry): Float32Array | null {
  return getInterleavedFloatArray(geometry, 'instanceAlphaStart');
}

export function markFatLineColorsNeedUpdate(geometry: LineSegmentsGeometry): void {
  markInterleavedAttributeNeedsUpdate(geometry, 'instanceColorStart');
}

export function markFatLineAlphasNeedUpdate(geometry: LineSegmentsGeometry): void {
  markInterleavedAttributeNeedsUpdate(geometry, 'instanceAlphaStart');
}

export function disposeFatLineSegmentsObject(fatLines: FatLineSegmentsObject): void {
  fatLines.geometry.dispose();
  fatLines.material.dispose();
}
