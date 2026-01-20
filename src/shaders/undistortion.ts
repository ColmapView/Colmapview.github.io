/**
 * GLSL shaders for real-time image undistortion.
 * Implements all 11 COLMAP camera distortion models.
 *
 * Two modes:
 * 1. Cropped mode (fullFrame=false): Output is rectangular perspective projection.
 *    For each output pixel, find where to sample in the distorted image.
 *    Edges outside the source image are transparent.
 *
 * 2. Full-frame mode (fullFrame=true): Shows the entire undistorted image with
 *    curved borders. Uses tessellated geometry where vertices are moved from
 *    distorted to undistorted positions.
 */

export const undistortionVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Vertex shader for full-frame undistortion mode.
 * Moves vertices from distorted positions to undistorted positions.
 */
export const fullFrameVertexShader = `
uniform float fx;
uniform float fy;
uniform float cx;
uniform float cy;
uniform float imageWidth;
uniform float imageHeight;
uniform float planeWidth;
uniform float planeHeight;
uniform int modelId;
uniform float k1;
uniform float k2;
uniform float k3;
uniform float k4;
uniform float k5;
uniform float k6;
uniform float p1;
uniform float p2;
uniform float omega;
uniform float sx1;
uniform float sy1;

varying vec2 vUv;

// Camera model constants
const int SIMPLE_PINHOLE = 0;
const int PINHOLE = 1;
const int SIMPLE_RADIAL = 2;
const int RADIAL = 3;
const int OPENCV = 4;
const int OPENCV_FISHEYE = 5;
const int FULL_OPENCV = 6;
const int FOV = 7;
const int SIMPLE_RADIAL_FISHEYE = 8;
const int RADIAL_FISHEYE = 9;
const int THIN_PRISM_FISHEYE = 10;

// Convert UV to normalized camera coordinates (distorted space)
vec2 uvToDistortedNormalized(vec2 uv) {
  float px = uv.x * imageWidth;
  float py = (1.0 - uv.y) * imageHeight;
  return vec2((px - cx) / fx, (py - cy) / fy);
}

// Compute inverse distortion: distorted -> undistorted
// Uses iterative approach for accurate inversion
//
// For fisheye models, follows COLMAP's two-step approach:
// 1. Remove polynomial distortion in fisheye θ-space (iteratively)
// 2. Convert from fisheye to pinhole via tan(θ)/θ scaling
vec2 inverseDistort(vec2 distorted) {
  if (modelId == SIMPLE_PINHOLE || modelId == PINHOLE) {
    return distorted;
  }

  // Handle fisheye models separately - they need special two-step inversion
  if (modelId == OPENCV_FISHEYE || modelId == SIMPLE_RADIAL_FISHEYE || modelId == RADIAL_FISHEYE) {
    // Input is already in fisheye normalized space: (x-cx)/fx, (y-cy)/fy
    // Step 1: Iteratively remove polynomial distortion in fisheye space
    // The distortion is: distorted = undistorted * (1 + k1*θ² + k2*θ⁴ + ...)
    // where θ² = undistorted.x² + undistorted.y²
    vec2 fisheyeUndist = distorted;

    for (int i = 0; i < 10; i++) {
      float theta2 = fisheyeUndist.x * fisheyeUndist.x + fisheyeUndist.y * fisheyeUndist.y;
      float theta4 = theta2 * theta2;
      float theta6 = theta4 * theta2;
      float theta8 = theta4 * theta4;

      float radial = 0.0;
      if (modelId == OPENCV_FISHEYE) {
        radial = k1 * theta2 + k2 * theta4 + k3 * theta6 + k4 * theta8;
      } else if (modelId == SIMPLE_RADIAL_FISHEYE) {
        radial = k1 * theta2;
      } else if (modelId == RADIAL_FISHEYE) {
        radial = k1 * theta2 + k2 * theta4;
      }

      // Solve: distorted = fisheyeUndist * (1 + radial)
      // So: fisheyeUndist = distorted / (1 + radial)
      fisheyeUndist = distorted / (1.0 + radial);
    }

    // Step 2: Convert from fisheye to pinhole (NormalFromFisheye in COLMAP)
    // In fisheye space, θ = length(fisheyeUndist) represents the angle from optical axis
    // To convert to pinhole: scale by tan(θ)/θ
    float theta = sqrt(fisheyeUndist.x * fisheyeUndist.x + fisheyeUndist.y * fisheyeUndist.y);
    if (theta < 0.00001) {
      return fisheyeUndist;
    }
    // scale = sin(θ)/(θ*cos(θ)) = tan(θ)/θ
    float scale = tan(theta) / theta;
    return fisheyeUndist * scale;
  }

  // THIN_PRISM_FISHEYE: fisheye + tangential + thin prism
  // Distortion order: 1) fisheye radial, 2) tangential + thin prism on scaled coords
  // Inverse order: 1) remove tangential + thin prism, 2) remove fisheye radial, 3) fisheye to pinhole
  if (modelId == THIN_PRISM_FISHEYE) {
    vec2 fisheyeUndist = distorted;

    for (int i = 0; i < 10; i++) {
      // First estimate what the fisheye-only point would be (before tangential/thin prism)
      float theta2 = fisheyeUndist.x * fisheyeUndist.x + fisheyeUndist.y * fisheyeUndist.y;
      float theta4 = theta2 * theta2;
      float theta6 = theta4 * theta2;
      float theta8 = theta4 * theta4;
      float radial = k1 * theta2 + k2 * theta4 + k3 * theta6 + k4 * theta8;

      // Compute tangential + thin prism delta at current estimate
      float x = fisheyeUndist.x;
      float y = fisheyeUndist.y;
      float r2d = x * x + y * y;
      float dx = 2.0 * p1 * x * y + p2 * (r2d + 2.0 * x * x) + sx1 * r2d;
      float dy = p1 * (r2d + 2.0 * y * y) + 2.0 * p2 * x * y + sy1 * r2d;

      // Remove tangential/thin prism, then remove radial
      vec2 withoutTangential = distorted - vec2(dx, dy);
      fisheyeUndist = withoutTangential / (1.0 + radial);
    }

    // Convert from fisheye to pinhole
    float theta = sqrt(fisheyeUndist.x * fisheyeUndist.x + fisheyeUndist.y * fisheyeUndist.y);
    if (theta < 0.00001) {
      return fisheyeUndist;
    }
    float scale = tan(theta) / theta;
    return fisheyeUndist * scale;
  }

  // For non-fisheye models: standard iterative undistortion
  // Initial guess: the distorted point itself
  vec2 undistorted = distorted;

  // Newton-Raphson iteration to find undistorted point
  // We're solving: distorted = undistorted + delta(undistorted)
  // So: undistorted = distorted - delta(undistorted)
  for (int i = 0; i < 10; i++) {
    float x = undistorted.x;
    float y = undistorted.y;
    float r2 = x * x + y * y;
    float r = sqrt(r2);

    vec2 delta = vec2(0.0);

    if (modelId == SIMPLE_RADIAL) {
      float radial = k1 * r2;
      delta = undistorted * radial;
    } else if (modelId == RADIAL) {
      float r4 = r2 * r2;
      float radial = k1 * r2 + k2 * r4;
      delta = undistorted * radial;
    } else if (modelId == OPENCV) {
      float r4 = r2 * r2;
      float radial = k1 * r2 + k2 * r4;
      float dx = 2.0 * p1 * x * y + p2 * (r2 + 2.0 * x * x);
      float dy = p1 * (r2 + 2.0 * y * y) + 2.0 * p2 * x * y;
      delta = vec2(x * radial + dx, y * radial + dy);
    } else if (modelId == FULL_OPENCV) {
      float r4 = r2 * r2;
      float r6 = r4 * r2;
      float num = 1.0 + k1 * r2 + k2 * r4 + k3 * r6;
      float denom = 1.0 + k4 * r2 + k5 * r4 + k6 * r6;
      float radial = num / denom - 1.0;
      float dx = 2.0 * p1 * x * y + p2 * (r2 + 2.0 * x * x);
      float dy = p1 * (r2 + 2.0 * y * y) + 2.0 * p2 * x * y;
      delta = vec2(x * radial + dx, y * radial + dy);
    } else if (modelId == FOV) {
      if (r > 0.00001) {
        float rd = atan(r * 2.0 * tan(omega / 2.0)) / omega;
        float factor = rd / r - 1.0;
        delta = undistorted * factor;
      }
    }

    // Update: undistorted = distorted - delta
    undistorted = distorted - delta;
  }

  return undistorted;
}

void main() {
  vUv = uv;

  // Get this vertex's position in distorted normalized coordinates
  vec2 distortedNorm = uvToDistortedNormalized(uv);

  // Compute undistorted position
  vec2 undistortedNorm = inverseDistort(distortedNorm);

  // Convert back to UV space
  float undistortedPx = undistortedNorm.x * fx + cx;
  float undistortedPy = undistortedNorm.y * fy + cy;
  float undistortedU = undistortedPx / imageWidth;
  float undistortedV = 1.0 - (undistortedPy / imageHeight);

  // Compute new position using plane dimensions passed as uniforms
  // PlaneGeometry maps UV (0-1) to position (-width/2 to width/2)
  vec3 newPosition = position;
  newPosition.x = (undistortedU - 0.5) * planeWidth;
  newPosition.y = (undistortedV - 0.5) * planeHeight;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

export const undistortionFragmentShader = `
precision highp float;

uniform sampler2D map;
uniform float opacity;
uniform vec3 color;
uniform bool undistortionEnabled;

// Camera model ID (matches COLMAP)
uniform int modelId;

// Image dimensions
uniform float imageWidth;
uniform float imageHeight;

// Camera intrinsics - up to 12 parameters
uniform float fx;
uniform float fy;
uniform float cx;
uniform float cy;
uniform float k1;
uniform float k2;
uniform float k3;
uniform float k4;
uniform float k5;
uniform float k6;
uniform float p1;
uniform float p2;
uniform float omega;  // FOV model parameter
uniform float sx1;    // Thin prism parameters
uniform float sy1;

varying vec2 vUv;

// Camera model constants (must match CameraModelId in colmap.ts)
const int SIMPLE_PINHOLE = 0;
const int PINHOLE = 1;
const int SIMPLE_RADIAL = 2;
const int RADIAL = 3;
const int OPENCV = 4;
const int OPENCV_FISHEYE = 5;
const int FULL_OPENCV = 6;
const int FOV = 7;
const int SIMPLE_RADIAL_FISHEYE = 8;
const int RADIAL_FISHEYE = 9;
const int THIN_PRISM_FISHEYE = 10;

// Convert UV (0-1) to normalized camera coordinates
vec2 uvToNormalized(vec2 uv) {
  // UV goes from 0-1, convert to pixel coordinates
  float px = uv.x * imageWidth;
  float py = (1.0 - uv.y) * imageHeight; // Flip Y for image coordinate system

  // Convert to normalized camera coordinates (centered at principal point)
  float x = (px - cx) / fx;
  float y = (py - cy) / fy;

  return vec2(x, y);
}

// Convert normalized camera coordinates back to UV
vec2 normalizedToUv(vec2 normalized) {
  // Convert back to pixel coordinates
  float px = normalized.x * fx + cx;
  float py = normalized.y * fy + cy;

  // Convert to UV (0-1), flip Y back
  float u = px / imageWidth;
  float v = 1.0 - (py / imageHeight);

  return vec2(u, v);
}

// ============ DISTORTION FUNCTIONS ============
// These compute the distortion delta for each model

// SIMPLE_RADIAL: du = u * k * r^2
vec2 distortSimpleRadial(vec2 p) {
  float r2 = dot(p, p);
  float radial = k1 * r2;
  return p * radial;
}

// RADIAL: du = u * (k1*r^2 + k2*r^4)
vec2 distortRadial(vec2 p) {
  float r2 = dot(p, p);
  float r4 = r2 * r2;
  float radial = k1 * r2 + k2 * r4;
  return p * radial;
}

// OPENCV: radial + tangential distortion
vec2 distortOpenCV(vec2 p) {
  float x = p.x;
  float y = p.y;
  float r2 = x * x + y * y;
  float r4 = r2 * r2;

  // Radial distortion
  float radial = k1 * r2 + k2 * r4;

  // Tangential distortion
  float dx = 2.0 * p1 * x * y + p2 * (r2 + 2.0 * x * x);
  float dy = p1 * (r2 + 2.0 * y * y) + 2.0 * p2 * x * y;

  return vec2(x * radial + dx, y * radial + dy);
}

// FULL_OPENCV: rational polynomial model
vec2 distortFullOpenCV(vec2 p) {
  float x = p.x;
  float y = p.y;
  float r2 = x * x + y * y;
  float r4 = r2 * r2;
  float r6 = r4 * r2;

  // Rational polynomial
  float num = 1.0 + k1 * r2 + k2 * r4 + k3 * r6;
  float denom = 1.0 + k4 * r2 + k5 * r4 + k6 * r6;
  float radial = num / denom - 1.0;

  // Tangential distortion
  float dx = 2.0 * p1 * x * y + p2 * (r2 + 2.0 * x * x);
  float dy = p1 * (r2 + 2.0 * y * y) + 2.0 * p2 * x * y;

  return vec2(x * radial + dx, y * radial + dy);
}

// FOV model distortion
vec2 distortFOV(vec2 p) {
  float r = length(p);
  if (r < 0.00001) return vec2(0.0);

  float rd = atan(r * 2.0 * tan(omega / 2.0)) / omega;
  float factor = rd / r - 1.0;

  return p * factor;
}

// OPENCV_FISHEYE: equidistant fisheye projection with k1-k4
// This computes the delta to go from perspective to fisheye projection
vec2 distortOpenCVFisheye(vec2 p) {
  float r = length(p);
  if (r < 0.00001) return vec2(0.0);

  float theta = atan(r);
  float theta2 = theta * theta;
  float theta4 = theta2 * theta2;
  float theta6 = theta4 * theta2;
  float theta8 = theta4 * theta4;

  float thetad = theta * (1.0 + k1 * theta2 + k2 * theta4 + k3 * theta6 + k4 * theta8);

  // The distorted point is p * (thetad / r)
  // So delta = p * (thetad/r - 1)
  return p * (thetad / r - 1.0);
}

// SIMPLE_RADIAL_FISHEYE: fisheye with single k parameter
vec2 distortSimpleRadialFisheye(vec2 p) {
  float r = length(p);
  if (r < 0.00001) return vec2(0.0);

  float theta = atan(r);
  float theta2 = theta * theta;

  float thetad = theta * (1.0 + k1 * theta2);
  float factor = thetad / r - 1.0;

  return p * factor;
}

// RADIAL_FISHEYE: fisheye with k1, k2
vec2 distortRadialFisheye(vec2 p) {
  float r = length(p);
  if (r < 0.00001) return vec2(0.0);

  float theta = atan(r);
  float theta2 = theta * theta;
  float theta4 = theta2 * theta2;

  float thetad = theta * (1.0 + k1 * theta2 + k2 * theta4);
  float factor = thetad / r - 1.0;

  return p * factor;
}

// THIN_PRISM_FISHEYE: fisheye + radial + tangential + thin prism
vec2 distortThinPrismFisheye(vec2 p) {
  float r = length(p);
  if (r < 0.00001) return vec2(0.0);

  float theta = atan(r);
  float theta2 = theta * theta;
  float theta4 = theta2 * theta2;
  float theta6 = theta4 * theta2;
  float theta8 = theta4 * theta4;

  float thetad = theta * (1.0 + k1 * theta2 + k2 * theta4 + k3 * theta6 + k4 * theta8);

  // Scale to distorted radius
  vec2 pd = p * (thetad / r);

  // Add tangential and thin prism distortion
  float x = pd.x;
  float y = pd.y;
  float r2d = x * x + y * y;

  float dx = 2.0 * p1 * x * y + p2 * (r2d + 2.0 * x * x) + sx1 * r2d;
  float dy = p1 * (r2d + 2.0 * y * y) + 2.0 * p2 * x * y + sy1 * r2d;

  // Return delta from original point
  return vec2(pd.x + dx - p.x, pd.y + dy - p.y);
}

// Apply distortion based on model ID
vec2 applyDistortion(vec2 p) {
  if (modelId == SIMPLE_PINHOLE || modelId == PINHOLE) {
    return vec2(0.0); // No distortion
  } else if (modelId == SIMPLE_RADIAL) {
    return distortSimpleRadial(p);
  } else if (modelId == RADIAL) {
    return distortRadial(p);
  } else if (modelId == OPENCV) {
    return distortOpenCV(p);
  } else if (modelId == OPENCV_FISHEYE) {
    return distortOpenCVFisheye(p);
  } else if (modelId == FULL_OPENCV) {
    return distortFullOpenCV(p);
  } else if (modelId == FOV) {
    return distortFOV(p);
  } else if (modelId == SIMPLE_RADIAL_FISHEYE) {
    return distortSimpleRadialFisheye(p);
  } else if (modelId == RADIAL_FISHEYE) {
    return distortRadialFisheye(p);
  } else if (modelId == THIN_PRISM_FISHEYE) {
    return distortThinPrismFisheye(p);
  }
  return vec2(0.0);
}

// Given an undistorted (ideal perspective) coordinate, find the corresponding
// coordinate in the distorted (actual captured) image to sample from.
//
// For radial/tangential models: removes lens distortion aberrations
// For fisheye models: converts fisheye projection to perspective projection
//
// IMPORTANT: For fisheye cameras with wide FOV (>90 degrees), the edges of
// the perspective view will sample from the center of the fisheye image,
// and much of the fisheye image won't be visible. This is a fundamental
// limitation of projecting fisheye onto a flat perspective plane.
vec2 perspectiveToDistorted(vec2 undistorted) {
  // For no-distortion models, return as-is
  if (modelId == SIMPLE_PINHOLE || modelId == PINHOLE) {
    return undistorted;
  }

  // COLMAP's distortion model: distorted = undistorted + delta(undistorted)
  // This is a direct computation, no iteration needed.
  return undistorted + applyDistortion(undistorted);
}

void main() {
  vec2 sampleUv;

  if (undistortionEnabled && modelId != SIMPLE_PINHOLE && modelId != PINHOLE) {
    // Convert UV to normalized camera coordinates (perspective projection)
    vec2 normalized = uvToNormalized(vUv);

    // Find where to sample in the distorted image
    vec2 distortedNormalized = perspectiveToDistorted(normalized);

    // Convert back to UV
    sampleUv = normalizedToUv(distortedNormalized);

    // Check bounds - if outside image, render as transparent
    // This is common for fisheye undistortion where perspective FOV exceeds fisheye coverage
    if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
      gl_FragColor = vec4(color, 0.0);
      return;
    }
  } else {
    sampleUv = vUv;
  }

  vec4 texColor = texture2D(map, sampleUv);

  // The texture has colorSpace=SRGBColorSpace, so Three.js auto-converts sRGB->linear when sampling.
  // Use Three.js colorspace_fragment to convert back to sRGB for output (same as meshBasicMaterial).
  gl_FragColor = vec4(texColor.rgb, opacity);

  #include <colorspace_fragment>
}
`;

/**
 * Fragment shader for full-frame undistortion mode.
 * Simply samples the texture at the original UV (distorted space).
 * The vertex shader has already moved vertices to undistorted positions.
 */
export const fullFrameFragmentShader = `
precision highp float;

uniform sampler2D map;
uniform float opacity;
uniform vec3 color;

varying vec2 vUv;

void main() {
  vec4 texColor = texture2D(map, vUv);
  gl_FragColor = vec4(texColor.rgb, opacity);
  #include <colorspace_fragment>
}
`;

/**
 * Camera intrinsics extracted from COLMAP camera parameters
 */
export interface CameraIntrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  k5: number;
  k6: number;
  p1: number;
  p2: number;
  omega: number;
  sx1: number;
  sy1: number;
}
