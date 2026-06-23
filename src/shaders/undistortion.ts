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
varying float vValid;

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

// Fisheye angle-space coord (radius == theta) -> pinhole-normalized coord.
// valid=false for theta >= ~90deg: tan(theta) diverges at 90deg and flips sign
// beyond it, so such rays cannot be placed on a flat pinhole plane. Mirrors
// COLMAP NormalFromFisheye's domain guard. See src/utils/cameraUndistortion.ts.
vec2 fisheyeToPinhole(vec2 uu, out bool valid) {
  valid = true;
  float theta = length(uu);
  if (theta < 0.00001) {
    return uu; // near optical axis, scale ~ 1
  }
  if (cos(theta) <= 0.001) {
    valid = false; // theta >= ~90deg: unrepresentable on a flat plane
    return uu;
  }
  return uu * (tan(theta) / theta);
}

vec2 inverseDistort(vec2 distorted, out bool valid) {
  valid = true;

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
    return fisheyeToPinhole(fisheyeUndist, valid);
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

    return fisheyeToPinhole(fisheyeUndist, valid);
  }

  // FOV model: exact closed-form inverse (COLMAP FOVCameraModel::Undistortion).
  if (modelId == FOV) {
    float rd = length(distorted);
    // omega -> 0 is the no-distortion limit; guard the 0/0 division.
    if (rd < 0.00001 || abs(omega) < 0.00001) {
      return distorted;
    }
    float arg = rd * omega;
    if (arg >= 1.5707963 - 0.00001) {
      valid = false; // past the tan() singularity
      return distorted;
    }
    return distorted * (tan(arg) / (rd * 2.0 * tan(omega / 2.0)));
  }

  // Perspective radial/tangential models: Newton's method on
  // f(u) = u + delta(u) = distorted, with Jacobian J = I + d(delta)/du.
  // (A plain fixed-point iteration converges only linearly and diverges for
  // strong barrel distortion; Newton is quadratic and stays accurate.)
  vec2 u = distorted;
  float resid = 1.0; // |f(u) - distorted| at the latest evaluated u
  for (int i = 0; i < 15; i++) {
    float x = u.x;
    float y = u.y;
    float r2 = x * x + y * y;

    float R = 0.0;   // radial factor: delta_radial = u * R
    float Rp = 0.0;  // dR/d(r2)
    if (modelId == SIMPLE_RADIAL) {
      R = k1 * r2;
      Rp = k1;
    } else if (modelId == RADIAL) {
      R = k1 * r2 + k2 * r2 * r2;
      Rp = k1 + 2.0 * k2 * r2;
    } else if (modelId == OPENCV) {
      R = k1 * r2 + k2 * r2 * r2;
      Rp = k1 + 2.0 * k2 * r2;
    } else if (modelId == FULL_OPENCV) {
      float r4 = r2 * r2;
      float r6 = r4 * r2;
      float num = 1.0 + k1 * r2 + k2 * r4 + k3 * r6;
      float den = 1.0 + k4 * r2 + k5 * r4 + k6 * r6;
      R = num / den - 1.0;
      float numP = k1 + 2.0 * k2 * r2 + 3.0 * k3 * r4;
      float denP = k4 + 2.0 * k5 * r2 + 3.0 * k6 * r4;
      Rp = (numP * den - num * denP) / (den * den);
    }

    float dx = x * R;
    float dy = y * R;
    float j11 = 1.0 + R + 2.0 * x * x * Rp;
    float j12 = 2.0 * x * y * Rp;
    float j21 = 2.0 * x * y * Rp;
    float j22 = 1.0 + R + 2.0 * y * y * Rp;

    if (modelId == OPENCV || modelId == FULL_OPENCV) {
      dx += 2.0 * p1 * x * y + p2 * (r2 + 2.0 * x * x);
      dy += p1 * (r2 + 2.0 * y * y) + 2.0 * p2 * x * y;
      j11 += 2.0 * p1 * y + 6.0 * p2 * x;
      j12 += 2.0 * p1 * x + 2.0 * p2 * y;
      j21 += 2.0 * p1 * x + 2.0 * p2 * y;
      j22 += 6.0 * p1 * y + 2.0 * p2 * x;
    }

    vec2 g = vec2(x + dx, y + dy) - distorted;
    resid = length(g);
    float det = j11 * j22 - j12 * j21;
    if (abs(det) > 0.000001) {
      vec2 stepv = vec2(j22 * g.x - j12 * g.y, j11 * g.y - j21 * g.x) / det;
      u -= stepv;
    }
  }

  // Reject a non-physical root: strong barrel distortion can fold the forward map
  // so Newton converges to a wrong root. A large residual means u is not a true
  // inverse -> blank the ray (matches the CPU reference).
  if (resid > 0.001) {
    valid = false;
  }
  return u;
}

void main() {
  vUv = uv;

  // Get this vertex's position in distorted normalized coordinates
  vec2 distortedNorm = uvToDistortedNormalized(uv);

  // Compute undistorted position. valid=false marks rays that cannot live on a
  // flat plane (wide fisheye / FOV singularity); the fragment shader discards them.
  bool valid;
  vec2 undistortedNorm = inverseDistort(distortedNorm, valid);
  vValid = valid ? 1.0 : 0.0;

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
  // omega -> 0 is the no-distortion limit; guard the 0/0 division.
  if (r < 0.00001 || abs(omega) < 0.00001) return vec2(0.0);

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

// THIN_PRISM_FISHEYE: fisheye + radial + tangential + thin prism.
// COLMAP evaluates the radial, tangential AND thin-prism terms in angle space
// (on the fisheye coords uu, radius == theta), not on the radially-scaled
// coords. Mirrors src/utils/cameraUndistortion.ts applyFisheyeDistortion.
vec2 distortThinPrismFisheye(vec2 p) {
  float r = length(p);
  if (r < 0.00001) return vec2(0.0);

  float theta = atan(r);
  vec2 uu = p * (theta / r); // angle-space coords (FisheyeFromNormal), radius theta
  float theta2 = dot(uu, uu);
  float theta4 = theta2 * theta2;
  float theta6 = theta4 * theta2;
  float theta8 = theta4 * theta4;
  float radial = k1 * theta2 + k2 * theta4 + k3 * theta6 + k4 * theta8;

  float x = uu.x;
  float y = uu.y;
  float dx = x * radial + 2.0 * p1 * x * y + p2 * (theta2 + 2.0 * x * x) + sx1 * theta2;
  float dy = y * radial + p1 * (theta2 + 2.0 * y * y) + 2.0 * p2 * x * y + sy1 * theta2;

  // Return delta from original perspective point p
  return vec2(uu.x + dx - p.x, uu.y + dy - p.y);
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
 * Discard threshold for the interpolated per-vertex validity flag. vValid is 1.0
 * at valid vertices and 0.0 at invalid ones (rays past the FOV/fisheye
 * singularity), and interpolates across a triangle. A triangle that straddles the
 * validity boundary would otherwise stretch toward the invalid vertex's bogus
 * undistorted position. Requiring vValid ~ 1.0 blanks every fragment with any
 * meaningful contribution from an invalid vertex, so those mixed triangles are
 * dropped entirely rather than rendered stretched. Cost: a ~1-triangle-thick band
 * at the boundary is also blanked (sub-pixel at the 32x32 tessellation).
 */
export const FULLFRAME_VALID_DISCARD_THRESHOLD = 0.999;

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
varying float vValid;

void main() {
  // Blank any fragment that draws on (or near) an invalid vertex. Using a
  // near-1.0 threshold discards whole triangles straddling the validity boundary
  // instead of cutting them along an arbitrary interpolated line and stretching
  // geometry toward the invalid vertex's bogus position.
  if (vValid < ${FULLFRAME_VALID_DISCARD_THRESHOLD}) {
    gl_FragColor = vec4(color, 0.0);
    return;
  }
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
