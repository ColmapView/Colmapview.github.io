# Camera Model Conversions Reference

This document describes the compatibility between COLMAP camera models and the rules for converting between them.

## Overview

COLMAP supports 12 camera models split into two families:
- **Perspective models** (0-4, 6-7): Standard pinhole projection
- **Fisheye models** (5, 8-11): Equidistant fisheye projection

Conversions between families are **never exact** due to fundamentally different projection formulas.

## Model Summary

### Perspective Models

| ID | Model | Params | Layout | Distortion Formula |
|----|-------|--------|--------|-------------------|
| 0 | SIMPLE_PINHOLE | 3 | f, cx, cy | None |
| 1 | PINHOLE | 4 | fx, fy, cx, cy | None |
| 2 | SIMPLE_RADIAL | 4 | f, cx, cy, k | Additive polynomial |
| 3 | RADIAL | 5 | f, cx, cy, k1, k2 | Additive polynomial |
| 4 | OPENCV | 8 | fx, fy, cx, cy, k1, k2, p1, p2 | Additive polynomial + tangential |
| 6 | FULL_OPENCV | 12 | fx, fy, cx, cy, k1-k2, p1-p2, k3-k6 | **Rational polynomial** |
| 7 | FOV | 5 | fx, fy, cx, cy, omega | atan-based |

### Fisheye Models

| ID | Model | Params | Layout | Distortion Formula |
|----|-------|--------|--------|-------------------|
| 8 | SIMPLE_RADIAL_FISHEYE | 4 | f, cx, cy, k | Additive polynomial |
| 9 | RADIAL_FISHEYE | 5 | f, cx, cy, k1, k2 | Additive polynomial |
| 5 | OPENCV_FISHEYE | 8 | fx, fy, cx, cy, k1, k2, k3, k4 | Additive polynomial |
| 10 | THIN_PRISM_FISHEYE | 12 | fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, sx1, sy1 | Additive polynomial |
| 11 | RAD_TAN_THIN_PRISM_FISHEYE | 16 | fx, fy, cx, cy, k0-k5, p0, p1, s0-s3 | **Multiplicative** |

## Critical Incompatibilities

### 1. OPENCV ↔ FULL_OPENCV

These models use **different distortion formulas**—not simple parameter extension!

**OPENCV** (additive):
```
du = u × (k1·r² + k2·r⁴) + tangential_terms
```

**FULL_OPENCV** (rational polynomial):
```
factor = (1 + k1·r² + k2·r⁴ + k3·r⁶) / (1 + k4·r² + k5·r⁴ + k6·r⁶)
du = u × factor - u + tangential_terms
```

The rational form in FULL_OPENCV cannot be converted to/from OPENCV exactly, even when k3-k6 = 0.

### 2. RAD_TAN_THIN_PRISM_FISHEYE

This model uses a **multiplicative** formula vs the **additive** formula in other fisheye models:

**Other fisheye models** (additive):
```
θ_distorted = θ × (1 + k1·θ² + k2·θ⁴ + ...)
```

**RAD_TAN_THIN_PRISM** (multiplicative):
```
θ_distorted = θ × (1 + k0·θ² + k1·θ⁴ + ...) × (1 + ...)
```

Additionally, it has a `k0` parameter with no equivalent in other models.

### 3. Parameter Index Differences

Different models place parameters at different indices:
- OPENCV_FISHEYE: k3, k4 at indices [6, 7]
- THIN_PRISM_FISHEYE: k3, k4 at indices [8, 9]

Direct array copying will produce incorrect results!

## Conversion Matrix

| From ↓ To → | SP | P | SR | R | OCV | FOCV | FOV | SRF | RF | OCVF | TPF | RTPF |
|-------------|:--:|:-:|:--:|:-:|:---:|:----:|:---:|:---:|:--:|:----:|:---:|:----:|
| SIMPLE_PINHOLE | — | ✓ | ✓ | ✓ | ✓ | ≈ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| PINHOLE | ≈ | — | ✓ | ✓ | ✓ | ≈ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| SIMPLE_RADIAL | ✗ | ✗ | — | ✓ | ✓ | ≈ | ≈ | ✗ | ✗ | ✗ | ✗ | ✗ |
| RADIAL | ✗ | ✗ | ≈ | — | ✓ | ≈ | ≈ | ✗ | ✗ | ✗ | ✗ | ✗ |
| OPENCV | ✗ | ✗ | ≈ | ≈ | — | ≈ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| FULL_OPENCV | ✗ | ✗ | ✗ | ✗ | ✗ | — | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| FOV | ✗ | ✗ | ≈ | ≈ | ✗ | ✗ | — | ✗ | ✗ | ✗ | ✗ | ✗ |
| SIMPLE_RADIAL_FISHEYE | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — | ✓ | ✓ | ✓ | ✗ |
| RADIAL_FISHEYE | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ≈ | — | ✓ | ✓ | ✗ |
| OPENCV_FISHEYE | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ≈ | ≈ | — | ✓ | ✗ |
| THIN_PRISM_FISHEYE | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ≈ | ≈ | ≈ | — | ✗ |
| RAD_TAN_THIN_PRISM | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — |

**Legend:**
- ✓ = Exact conversion (mathematically equivalent)
- ≈ = Approximate/lossy (may lose precision or information)
- ✗ = Incompatible (fundamentally different models)
- — = Same model

## Valid Conversion Chains

### Perspective Family

```
SIMPLE_PINHOLE ──► PINHOLE
       │
       ▼
SIMPLE_RADIAL ──► RADIAL ──► OPENCV
                               │
                               ╳ (INCOMPATIBLE with FULL_OPENCV)
```

### Fisheye Family

```
SIMPLE_RADIAL_FISHEYE ──► RADIAL_FISHEYE ──► OPENCV_FISHEYE ──► THIN_PRISM_FISHEYE
                                                                       │
                                                                       ╳ (INCOMPATIBLE)
                                                               RAD_TAN_THIN_PRISM_FISHEYE
```

## Expansion Conversions (Exact)

### SIMPLE_PINHOLE → PINHOLE
```
[f, cx, cy] → [f, f, cx, cy]
```

### SIMPLE_RADIAL → RADIAL
```
[f, cx, cy, k] → [f, cx, cy, k, 0]
```

### RADIAL → OPENCV
```
[f, cx, cy, k1, k2] → [f, f, cx, cy, k1, k2, 0, 0]
```

### SIMPLE_RADIAL_FISHEYE → RADIAL_FISHEYE
```
[f, cx, cy, k] → [f, cx, cy, k, 0]
```

### RADIAL_FISHEYE → OPENCV_FISHEYE
```
[f, cx, cy, k1, k2] → [f, f, cx, cy, k1, k2, 0, 0]
```

### OPENCV_FISHEYE → THIN_PRISM_FISHEYE
**Note: Index remapping required!**
```
[fx, fy, cx, cy, k1, k2, k3, k4]
    ↓
[fx, fy, cx, cy, k1, k2, 0, 0, k3, k4, 0, 0]
                        ↑↑↑↑  ↑↑↑↑↑↑
                        p1,p2  k3,k4 moved to indices 8-9
```

## Reduction Conversions (Conditional)

Reductions are only safe when dropped parameters are negligible.

### RADIAL → SIMPLE_RADIAL
- **Requirement:** |k2| < threshold (default: 1e-6)
```
[f, cx, cy, k1, k2] → [f, cx, cy, k1]
```

### OPENCV → RADIAL
- **Requirements:**
  - |p1| < threshold
  - |p2| < threshold
  - |fx - fy| / fx < 0.01 (aspect ratio ~1)
```
[fx, fy, cx, cy, k1, k2, p1, p2] → [fx, cx, cy, k1, k2]
```

### RADIAL_FISHEYE → SIMPLE_RADIAL_FISHEYE
- **Requirement:** |k2| < threshold
```
[f, cx, cy, k1, k2] → [f, cx, cy, k1]
```

### OPENCV_FISHEYE → RADIAL_FISHEYE
- **Requirements:**
  - |k3| < threshold
  - |k4| < threshold
  - |fx - fy| / fx < 0.01
```
[fx, fy, cx, cy, k1, k2, k3, k4] → [fx, cx, cy, k1, k2]
```

### THIN_PRISM_FISHEYE → OPENCV_FISHEYE
**Note: Index remapping required!**
- **Requirements:**
  - |p1|, |p2| < threshold
  - |sx1|, |sy1| < threshold
```
[fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, sx1, sy1]
    ↓
[fx, fy, cx, cy, k1, k2, k3, k4]
                        ↑↑↑↑↑↑
                        from indices 8-9
```

## Approximate Conversions

### OPENCV → FULL_OPENCV (Approximate)

**Warning:** This is NOT exact due to different formula structures!
```
[fx, fy, cx, cy, k1, k2, p1, p2] → [fx, fy, cx, cy, k1, k2, p1, p2, 0, 0, 0, 0]
```

When k3-k6 are all zero, FULL_OPENCV approximates OPENCV behavior, but the rational vs additive formula difference means small numerical differences will occur.

### FOV ↔ Polynomial Models (Taylor Approximation)

**FOV → RADIAL:**
```
k1 ≈ omega² / 3
k2 ≈ 0
```
- Valid for omega < 0.1 radians (~6°) for < 1% error
- Rough approximation for omega < 0.5 radians (~29°)

**RADIAL → FOV:**
```
omega ≈ sqrt(3 × k1)
```
- Only valid when k1 > 0 and k2 ≈ 0

## Usage in Code

```typescript
import {
  convertCameraModel,
  canConvertModel,
  validateConversion
} from './utils/cameraModelConversions';

// Check if conversion is possible
const compatibility = canConvertModel(CameraModelId.OPENCV, CameraModelId.RADIAL);
// Returns: 'exact' | 'approximate' | 'incompatible'

// Perform conversion
const result = convertCameraModel(camera, CameraModelId.RADIAL);
if (result.type === 'exact') {
  // Use result.params directly
} else if (result.type === 'approximate') {
  // result.params available, but check result.maxError
} else {
  // result.reason explains why conversion failed
}

// Validate accuracy via reprojection
const validation = validateConversion(srcCamera, dstCamera);
console.log(`Max reprojection error: ${validation.maxError} pixels`);
```

## Best Practices

1. **Prefer exact conversions** when possible
2. **Avoid cross-family conversions** (perspective ↔ fisheye)
3. **Validate approximate conversions** using reprojection error
4. **Never assume OPENCV ↔ FULL_OPENCV** are interchangeable
5. **Check parameter thresholds** before reduction conversions
6. **Be aware of index remapping** when converting fisheye models
