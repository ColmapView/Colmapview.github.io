#!/usr/bin/env python3
"""Validate a bicycle splat render against an independent gsrender_gl render.

This is an optional developer validation harness. It intentionally depends on a
local gsplat checkout and must not be imported by the app or release build.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


CAMERA_MODEL_PARAMS = {
    0: ("SIMPLE_PINHOLE", 3),
    1: ("PINHOLE", 4),
    2: ("SIMPLE_RADIAL", 4),
    3: ("RADIAL", 5),
    4: ("OPENCV", 8),
    5: ("OPENCV_FISHEYE", 8),
    6: ("FULL_OPENCV", 12),
    7: ("FOV", 5),
    8: ("SIMPLE_RADIAL_FISHEYE", 4),
    9: ("RADIAL_FISHEYE", 5),
    10: ("THIN_PRISM_FISHEYE", 12),
}


@dataclass(frozen=True)
class Camera:
    camera_id: int
    model_id: int
    model_name: str
    width: int
    height: int
    params: tuple[float, ...]


@dataclass(frozen=True)
class ImageRecord:
    image_id: int
    qvec: tuple[float, float, float, float]
    tvec: tuple[float, float, float]
    camera_id: int
    name: str
    point2d_count: int


@dataclass(frozen=True)
class PlyProperty:
    name: str
    type_name: str
    byte_size: int
    offset: int


@dataclass(frozen=True)
class PlyHeader:
    format_name: str
    vertex_count: int
    properties: tuple[PlyProperty, ...]
    header_bytes: int
    row_bytes: int


PLY_SCALAR_BYTE_SIZES = {
    "char": 1,
    "int8": 1,
    "uchar": 1,
    "uint8": 1,
    "short": 2,
    "int16": 2,
    "ushort": 2,
    "uint16": 2,
    "int": 4,
    "int32": 4,
    "uint": 4,
    "uint32": 4,
    "float": 4,
    "float32": 4,
    "double": 8,
    "float64": 8,
}

PLY_NUMPY_LITTLE_ENDIAN_DTYPES = {
    "char": "i1",
    "int8": "i1",
    "uchar": "u1",
    "uint8": "u1",
    "short": "<i2",
    "int16": "<i2",
    "ushort": "<u2",
    "uint16": "<u2",
    "int": "<i4",
    "int32": "<i4",
    "uint": "<u4",
    "uint32": "<u4",
    "float": "<f4",
    "float32": "<f4",
    "double": "<f8",
    "float64": "<f8",
}


def main() -> int:
    args = parse_args()
    if args.limit_gaussians is not None and args.limit_gaussians <= 0:
        raise RuntimeError("--limit-gaussians must be positive")

    repo_root = Path(__file__).resolve().parents[1]
    dataset = args.dataset.resolve()
    sparse_dir = dataset / "sparse" / "0"
    splat_path = (dataset / args.splat).resolve()
    images_dir = (dataset / args.images_dir).resolve()
    gsrender_path = args.gsrender_gl.resolve()

    started_at = time.perf_counter()
    cameras = read_cameras_bin(sparse_dir / "cameras.bin")
    images = read_images_bin(sparse_dir / "images.bin")
    image = select_image(images, args.image_id, args.image_name)
    camera = cameras[image.camera_id]
    source_image = images_dir / image.name
    ply_vertices = read_ply_vertex_count(splat_path)
    render_width, render_height = read_image_size(source_image)
    scale_x = render_width / camera.width
    scale_y = render_height / camera.height

    result: dict[str, Any] = {
        "dataset": str(dataset),
        "splat": str(splat_path),
        "gsrenderGlPath": str(gsrender_path),
        "image": {
            "id": image.image_id,
            "name": image.name,
            "path": str(source_image),
            "point2dCount": image.point2d_count,
        },
        "camera": {
            "id": camera.camera_id,
            "modelId": camera.model_id,
            "modelName": camera.model_name,
            "width": camera.width,
            "height": camera.height,
            "params": camera.params,
        },
        "render": {
            "width": render_width,
            "height": render_height,
            "scaleX": scale_x,
            "scaleY": scale_y,
            "background": args.background,
            "trustedFullResolution": (
                args.images_dir == "images"
                and args.limit_gaussians is None
                and render_width == camera.width
                and render_height == camera.height
            ),
        },
        "ply": {
            "vertexCount": ply_vertices,
            "byteSize": splat_path.stat().st_size,
            "limitGaussians": args.limit_gaussians,
        },
    }

    if args.dry_run:
        result["status"] = "dry-run"
        if not args.skip_renderer_import_check:
            result["rendererEnvironment"] = check_renderer_environment(gsrender_path, args.backend)
        result["elapsedSeconds"] = round(time.perf_counter() - started_at, 3)
        print_json(result)
        return 0

    if camera.model_name != "PINHOLE":
        raise RuntimeError(
            f"Only PINHOLE is supported by this validation harness, got {camera.model_name}"
        )

    render_result = render_with_gsrender_gl(
        gsrender_path=gsrender_path,
        splat_path=splat_path,
        camera=camera,
        image=image,
        source_image=source_image,
        width=render_width,
        height=render_height,
        scale_x=scale_x,
        scale_y=scale_y,
        backend=args.backend,
        background=args.background,
        limit_gaussians=args.limit_gaussians,
        output_render=args.output_render,
    )
    result.update(render_result)
    result["status"] = "ok"
    result["elapsedSeconds"] = round(time.perf_counter() - started_at, 3)
    print_json(result)
    return 0


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[1]
    default_dataset = repo_root.parent / "360_v2" / "bicycle"
    default_gsrender = (
        repo_root.parent.parent
        / "gsplat"
        / "benchmarks"
        / "python"
        / "renderers"
        / "gsrender_gl"
    )
    parser = argparse.ArgumentParser(
        description="Compare a bicycle ground-truth image with gsrender_gl output."
    )
    parser.add_argument("--dataset", type=Path, default=default_dataset)
    parser.add_argument("--splat", default="output/splat_30000.ply")
    parser.add_argument("--images-dir", default="images")
    parser.add_argument("--gsrender-gl", type=Path, default=default_gsrender)
    parser.add_argument("--image-id", type=int)
    parser.add_argument("--image-name")
    parser.add_argument("--backend", choices=["auto", "opengl", "cpu", "cpp"], default="auto")
    parser.add_argument("--background", choices=["black", "white"], default="black")
    parser.add_argument("--limit-gaussians", type=int)
    parser.add_argument("--output-render", type=Path)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse metadata and image dimensions without loading or rendering the PLY.",
    )
    parser.add_argument(
        "--skip-renderer-import-check",
        action="store_true",
        help="In dry-run mode, skip importing gsrender_gl and image/torch dependencies.",
    )
    return parser.parse_args()


def read_cameras_bin(path: Path) -> dict[int, Camera]:
    data = path.read_bytes()
    offset = 0
    camera_count, offset = read("<Q", data, offset)
    cameras: dict[int, Camera] = {}
    for _ in range(camera_count):
        camera_id, model_id, offset = read_values("<ii", data, offset)
        width, height, offset = read_values("<QQ", data, offset)
        if model_id not in CAMERA_MODEL_PARAMS:
            raise RuntimeError(f"Unsupported COLMAP camera model id {model_id}")
        model_name, param_count = CAMERA_MODEL_PARAMS[model_id]
        params, offset = read_tuple("<" + "d" * param_count, data, offset)
        cameras[camera_id] = Camera(
            camera_id=camera_id,
            model_id=model_id,
            model_name=model_name,
            width=width,
            height=height,
            params=params,
        )
    if offset != len(data):
        raise RuntimeError(f"Unexpected trailing bytes in {path}: {len(data) - offset}")
    return cameras


def read_images_bin(path: Path) -> list[ImageRecord]:
    data = path.read_bytes()
    offset = 0
    image_count, offset = read("<Q", data, offset)
    images: list[ImageRecord] = []
    for _ in range(image_count):
        image_id, offset = read("<i", data, offset)
        qvec, offset = read_tuple("<dddd", data, offset)
        tvec, offset = read_tuple("<ddd", data, offset)
        camera_id, offset = read("<i", data, offset)
        name_end = data.index(0, offset)
        name = data[offset:name_end].decode("utf-8")
        offset = name_end + 1
        point2d_count, offset = read("<Q", data, offset)
        offset += point2d_count * 24
        images.append(ImageRecord(image_id, qvec, tvec, camera_id, name, point2d_count))
    if offset != len(data):
        raise RuntimeError(f"Unexpected trailing bytes in {path}: {len(data) - offset}")
    return images


def select_image(
    images: list[ImageRecord],
    image_id: int | None,
    image_name: str | None,
) -> ImageRecord:
    if image_id is not None and image_name is not None:
        raise RuntimeError("Use either --image-id or --image-name, not both")
    if image_id is not None:
        for image in images:
            if image.image_id == image_id:
                return image
        raise RuntimeError(f"Image id {image_id} not found")
    if image_name is not None:
        for image in images:
            if image.name == image_name:
                return image
        raise RuntimeError(f"Image name {image_name} not found")
    if not images:
        raise RuntimeError("No images found in images.bin")
    return images[0]


def read_ply_vertex_count(path: Path) -> int | None:
    try:
        return read_standard_ply_header(path).vertex_count
    except RuntimeError:
        return None


def read_standard_ply_header(path: Path) -> PlyHeader:
    format_name: str | None = None
    vertex_count: int | None = None
    vertex_properties: list[PlyProperty] = []
    header_bytes = 0
    row_bytes = 0
    in_vertex_element = False

    with path.open("rb") as handle:
        for raw_line in handle:
            header_bytes += len(raw_line)
            line = raw_line.decode("ascii", errors="replace").strip()
            parts = line.split()
            if line == "ply":
                continue
            if not parts:
                continue
            if parts[0] == "format" and len(parts) >= 2:
                format_name = parts[1]
                continue
            if parts[0] == "element" and len(parts) >= 3:
                in_vertex_element = parts[1] == "vertex"
                if in_vertex_element:
                    vertex_count = int(parts[2])
                continue
            if in_vertex_element and parts[0] == "property":
                if len(parts) >= 2 and parts[1] == "list":
                    raise RuntimeError("List properties in vertex PLY data are not supported")
                if len(parts) != 3:
                    raise RuntimeError(f"Unsupported PLY property line: {line}")
                type_name = parts[1]
                if type_name not in PLY_SCALAR_BYTE_SIZES:
                    raise RuntimeError(f"Unsupported PLY scalar type: {type_name}")
                byte_size = PLY_SCALAR_BYTE_SIZES[type_name]
                vertex_properties.append(
                    PlyProperty(
                        name=parts[2],
                        type_name=type_name,
                        byte_size=byte_size,
                        offset=row_bytes,
                    )
                )
                row_bytes += byte_size
                continue
            if line == "end_header":
                break
        else:
            raise RuntimeError(f"PLY end_header not found: {path}")

    if format_name is None:
        raise RuntimeError(f"PLY format line not found: {path}")
    if vertex_count is None:
        raise RuntimeError(f"PLY vertex element not found: {path}")
    if not vertex_properties:
        raise RuntimeError(f"PLY vertex properties not found: {path}")
    return PlyHeader(
        format_name=format_name,
        vertex_count=vertex_count,
        properties=tuple(vertex_properties),
        header_bytes=header_bytes,
        row_bytes=row_bytes,
    )


def read_image_size(path: Path) -> tuple[int, int]:
    if not path.exists():
        raise RuntimeError(f"Image file not found: {path}")
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required to read image dimensions") from exc
    with Image.open(path) as image:
        return image.size


def render_with_gsrender_gl(
    *,
    gsrender_path: Path,
    splat_path: Path,
    camera: Camera,
    image: ImageRecord,
    source_image: Path,
    width: int,
    height: int,
    scale_x: float,
    scale_y: float,
    backend: str,
    background: str,
    limit_gaussians: int | None,
    output_render: Path | None,
) -> dict[str, Any]:
    if not gsrender_path.exists():
        raise RuntimeError(f"gsrender_gl path not found: {gsrender_path}")
    sys.path.insert(0, str(gsrender_path))

    import numpy as np
    import torch
    from PIL import Image
    from gsrender_gl import GSTensor, get_backend, render, set_backend

    actual_backend = set_backend(backend)
    if limit_gaussians is not None:
        gs = load_limited_gs_tensor_from_ply(
            splat_path=splat_path,
            limit_gaussians=limit_gaussians,
            GSTensor=GSTensor,
            torch=torch,
            np=np,
        )
    else:
        gs = GSTensor.from_ply(splat_path, device="cpu")

    fx, fy, cx, cy = camera.params
    K = torch.tensor(
        [
            [
                [fx * scale_x, 0.0, cx * scale_x],
                [0.0, fy * scale_y, cy * scale_y],
                [0.0, 0.0, 1.0],
            ]
        ],
        dtype=torch.float32,
    )
    viewmat = torch.tensor([colmap_world_to_camera_matrix(image.qvec, image.tvec)], dtype=torch.float32)
    bg_value = 0.0 if background == "black" else 1.0
    backgrounds = torch.tensor([[bg_value, bg_value, bg_value]], dtype=torch.float32)

    render_started = time.perf_counter()
    renders, alphas, _meta = render(
        gs,
        viewmat,
        K,
        width,
        height,
        backgrounds=backgrounds,
        camera_model="pinhole",
    )
    render_seconds = time.perf_counter() - render_started

    rendered = renders.detach().cpu().numpy()
    alpha = alphas.detach().cpu().numpy()
    rendered = squeeze_render(rendered)
    alpha = squeeze_alpha(alpha)
    gt = np.asarray(Image.open(source_image).convert("RGB"), dtype=np.float32) / 255.0
    if rendered.shape[:2] != gt.shape[:2]:
        raise RuntimeError(f"Rendered shape {rendered.shape} does not match GT {gt.shape}")
    rendered = np.clip(rendered[..., :3], 0.0, 1.0)
    tile_seams = compute_tile_seam_diagnostics(rendered, np=np)
    diff = rendered - gt
    mse = float(np.mean(diff * diff))
    psnr = math.inf if mse == 0 else 10.0 * math.log10(1.0 / mse)
    actual_backend_name = actual_backend or get_backend()
    offline_validation = assess_offline_validation(
        camera=camera,
        width=width,
        height=height,
        limit_gaussians=limit_gaussians,
        tile_seams=tile_seams,
    )

    if output_render is not None:
        output_render.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray((rendered * 255.0).round().astype("uint8")).save(output_render)

    return {
        "backend": {
            "requested": backend,
            "actual": actual_backend_name,
        },
        "metric": {
            "psnr": psnr,
            "mse": mse,
            "pixelCount": int(width * height),
            "gaussianCount": int(len(gs)),
            "limitedPlyLoad": limit_gaussians is not None,
            "renderSeconds": round(render_seconds, 3),
            "alphaMean": float(np.mean(alpha)),
            "alphaMin": float(np.min(alpha)),
            "alphaMax": float(np.max(alpha)),
        },
        "renderDiagnostics": {
            "tileSeams": tile_seams,
        },
        "offlineValidation": offline_validation,
    }


def compute_tile_seam_diagnostics(
    rendered: Any,
    *,
    np: Any,
    tile_size: int = 16,
    artifact_ratio_threshold: float = 3.0,
) -> dict[str, Any]:
    values = np.asarray(rendered[..., :3], dtype=np.float32)
    vertical = compute_axis_seam_diagnostics(
        np.mean(np.abs(values[:, 1:, :] - values[:, :-1, :]), axis=2),
        tile_size=tile_size,
        np=np,
    )
    horizontal = compute_axis_seam_diagnostics(
        np.mean(np.abs(values[1:, :, :] - values[:-1, :, :]), axis=2).T,
        tile_size=tile_size,
        np=np,
    )
    max_ratio = max(vertical["boundaryRatio"], horizontal["boundaryRatio"])
    return {
        "tileSize": tile_size,
        "artifactRatioThreshold": artifact_ratio_threshold,
        "suspectedTileArtifact": max_ratio >= artifact_ratio_threshold,
        "maxBoundaryRatio": max_ratio,
        "vertical": vertical,
        "horizontal": horizontal,
    }


def compute_axis_seam_diagnostics(
    diffs: Any,
    *,
    tile_size: int,
    np: Any,
) -> dict[str, float | int]:
    if diffs.size == 0:
        return {
            "boundaryCount": 0,
            "interiorCount": 0,
            "boundaryMean": 0.0,
            "interiorMean": 0.0,
            "boundaryRatio": 0.0,
        }
    positions = np.arange(1, diffs.shape[1] + 1)
    boundary_mask = (positions % tile_size) == 0
    interior_mask = ~boundary_mask
    boundary_values = diffs[:, boundary_mask]
    interior_values = diffs[:, interior_mask]
    boundary_mean = float(np.mean(boundary_values)) if boundary_values.size else 0.0
    interior_mean = float(np.mean(interior_values)) if interior_values.size else 0.0
    ratio = boundary_mean / max(interior_mean, 1e-9)
    return {
        "boundaryCount": int(boundary_values.size),
        "interiorCount": int(interior_values.size),
        "boundaryMean": boundary_mean,
        "interiorMean": interior_mean,
        "boundaryRatio": float(ratio),
    }


def assess_offline_validation(
    *,
    camera: Camera,
    width: int,
    height: int,
    limit_gaussians: int | None,
    tile_seams: dict[str, Any],
) -> dict[str, Any]:
    reasons: list[str] = []
    if width != camera.width or height != camera.height:
        reasons.append("render is not full-resolution")
    if limit_gaussians is not None:
        reasons.append("render uses a limited gaussian subset")
    if tile_seams["suspectedTileArtifact"]:
        reasons.append("render has suspected tile-boundary artifacts")
    return {
        "trustedComparison": len(reasons) == 0,
        "reasons": reasons,
    }


def load_limited_gs_tensor_from_ply(
    *,
    splat_path: Path,
    limit_gaussians: int,
    GSTensor: Any,
    torch: Any,
    np: Any,
) -> Any:
    header = read_standard_ply_header(splat_path)
    if header.format_name != "binary_little_endian":
        raise RuntimeError(
            f"Limited PLY loading requires binary_little_endian, got {header.format_name}"
        )

    count = min(limit_gaussians, header.vertex_count)
    dtype_fields = []
    for prop in header.properties:
        np_dtype = PLY_NUMPY_LITTLE_ENDIAN_DTYPES.get(prop.type_name)
        if np_dtype is None:
            raise RuntimeError(f"Unsupported PLY scalar type for limited load: {prop.type_name}")
        dtype_fields.append((prop.name, np_dtype))
    dtype = np.dtype(dtype_fields)
    if dtype.itemsize != header.row_bytes:
        raise RuntimeError(
            f"PLY dtype row size {dtype.itemsize} does not match header row size {header.row_bytes}"
        )

    rows = np.memmap(
        splat_path,
        dtype=dtype,
        mode="r",
        offset=header.header_bytes,
        shape=(header.vertex_count,),
    )[:count]

    def require_fields(names: tuple[str, ...]) -> None:
        missing = [name for name in names if name not in rows.dtype.names]
        if missing:
            raise RuntimeError(f"PLY missing required fields: {', '.join(missing)}")

    def stack_fields(names: tuple[str, ...]) -> Any:
        require_fields(names)
        return np.stack([np.asarray(rows[name], dtype=np.float32) for name in names], axis=1)

    positions = stack_fields(("x", "y", "z"))
    scales = np.exp(stack_fields(("scale_0", "scale_1", "scale_2"))).astype(np.float32)
    quats = stack_fields(("rot_0", "rot_1", "rot_2", "rot_3"))
    norms = np.linalg.norm(quats, axis=1, keepdims=True)
    nonzero = norms[:, 0] > 0
    quats[nonzero] = quats[nonzero] / norms[nonzero]
    quats[~nonzero] = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)

    require_fields(("opacity", "f_dc_0", "f_dc_1", "f_dc_2"))
    opacities = sigmoid_array(np.asarray(rows["opacity"], dtype=np.float32), np)
    sh0 = stack_fields(("f_dc_0", "f_dc_1", "f_dc_2"))

    rest_indices = sorted(
        int(name.removeprefix("f_rest_"))
        for name in rows.dtype.names
        if name.startswith("f_rest_")
    )
    sh_degree = 0
    shN = None
    if rest_indices:
        expected_indices = list(range(rest_indices[-1] + 1))
        if rest_indices != expected_indices:
            raise RuntimeError("PLY f_rest fields must be contiguous from f_rest_0")
        if len(rest_indices) % 3 != 0:
            raise RuntimeError("PLY f_rest field count must be divisible by 3")
        sh_coeffs = len(rest_indices) // 3
        for degree in range(1, 4):
            if degree * degree + 2 * degree == sh_coeffs:
                sh_degree = degree
                break
        if sh_degree == 0:
            raise RuntimeError(f"Unsupported SH coefficient count: {sh_coeffs}")
        shN_np = np.empty((count, sh_coeffs, 3), dtype=np.float32)
        for coeff in range(sh_coeffs):
            shN_np[:, coeff, 0] = np.asarray(rows[f"f_rest_{coeff}"], dtype=np.float32)
            shN_np[:, coeff, 1] = np.asarray(
                rows[f"f_rest_{coeff + sh_coeffs}"],
                dtype=np.float32,
            )
            shN_np[:, coeff, 2] = np.asarray(
                rows[f"f_rest_{coeff + sh_coeffs * 2}"],
                dtype=np.float32,
            )
        shN = torch.from_numpy(shN_np)

    return GSTensor(
        means=torch.from_numpy(positions.astype(np.float32, copy=False)),
        scales=torch.from_numpy(scales),
        quats=torch.from_numpy(quats.astype(np.float32, copy=False)),
        opacities=torch.from_numpy(opacities),
        sh0=torch.from_numpy(sh0.astype(np.float32, copy=False)),
        shN=shN,
        sh_degree=sh_degree,
    )


def sigmoid_array(values: Any, np: Any) -> Any:
    values = np.asarray(values, dtype=np.float32)
    out = np.empty_like(values)
    positive = values >= 0
    out[positive] = 1.0 / (1.0 + np.exp(-values[positive]))
    exp_values = np.exp(values[~positive])
    out[~positive] = exp_values / (1.0 + exp_values)
    return out.astype(np.float32, copy=False)


def check_renderer_environment(gsrender_path: Path, backend: str) -> dict[str, Any]:
    if not gsrender_path.exists():
        return {
            "ok": False,
            "error": f"gsrender_gl path not found: {gsrender_path}",
        }

    sys.path.insert(0, str(gsrender_path))
    try:
        import numpy
        import torch
        from PIL import Image
        from gsrender_gl import get_backend, set_backend

        actual_backend = set_backend(backend)
        return {
            "ok": True,
            "requestedBackend": backend,
            "actualBackend": actual_backend or get_backend(),
            "numpy": numpy.__version__,
            "torch": torch.__version__,
            "pillow": Image.__version__,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
        }


def colmap_world_to_camera_matrix(
    qvec: tuple[float, float, float, float],
    tvec: tuple[float, float, float],
) -> list[list[float]]:
    qw, qx, qy, qz = qvec
    xx = qx * qx
    yy = qy * qy
    zz = qz * qz
    xy = qx * qy
    xz = qx * qz
    yz = qy * qz
    wx = qw * qx
    wy = qw * qy
    wz = qw * qz
    return [
        [1.0 - 2.0 * (yy + zz), 2.0 * (xy - wz), 2.0 * (xz + wy), tvec[0]],
        [2.0 * (xy + wz), 1.0 - 2.0 * (xx + zz), 2.0 * (yz - wx), tvec[1]],
        [2.0 * (xz - wy), 2.0 * (yz + wx), 1.0 - 2.0 * (xx + yy), tvec[2]],
        [0.0, 0.0, 0.0, 1.0],
    ]


def squeeze_render(value: Any) -> Any:
    while value.ndim > 3 and value.shape[0] == 1:
        value = value[0]
    if value.ndim != 3:
        raise RuntimeError(f"Unexpected rendered tensor shape: {value.shape}")
    return value


def squeeze_alpha(value: Any) -> Any:
    while value.ndim > 3 and value.shape[0] == 1:
        value = value[0]
    return value


def read(fmt: str, data: bytes, offset: int) -> tuple[Any, int]:
    size = struct.calcsize(fmt)
    return struct.unpack_from(fmt, data, offset)[0], offset + size


def read_tuple(fmt: str, data: bytes, offset: int) -> tuple[tuple[Any, ...], int]:
    size = struct.calcsize(fmt)
    return struct.unpack_from(fmt, data, offset), offset + size


def read_values(fmt: str, data: bytes, offset: int) -> tuple[Any, ...]:
    values, next_offset = read_tuple(fmt, data, offset)
    return (*values, next_offset)


def print_json(value: dict[str, Any]) -> None:
    print(json.dumps(value, indent=2, sort_keys=True))


if __name__ == "__main__":
    raise SystemExit(main())
