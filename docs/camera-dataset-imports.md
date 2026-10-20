# Camera datasets

ColmapView can import the following open camera metadata formats together with their photos. Imported models contain posed cameras and images. NeRF-style metadata can also import an associated XYZ PLY cloud. OpenMVG `sfm_data.json` imports its optional `structure` landmarks and their image observations. OpenSfM imports its embedded XYZ/RGB points. Other camera-only imports contain zero sparse points; feature observations are not synthesized.

| Format | Metadata | Supported cameras |
| --- | --- | --- |
| Blender / NeRF | `transforms.json` or `transforms_train.json` | Perspective FOV; dimensions from a representative original photo when absent |
| Nerfstudio | `transforms.json` | PINHOLE, OPENCV and OPENCV_FISHEYE; global or per-frame intrinsics |
| Legacy Instant-NGP | `transforms.json` | Perspective focal/FOV and named distortion; undeclared camera models retain nonzero distortion |
| OpenSfM | `reconstruction.json` | Perspective cameras with normalized focal and radial distortion; optional embedded XYZ/RGB points |
| OpenMVG | `sfm_data.json` | Pinhole, radial k1 and radial k3 |
| Bundler | `bundle.out` version 0.3 plus `list.txt` or `images.txt` | Perspective with radial k1/k2; the list must preserve original camera order |
| Standard 3DGS camera JSON | `cameras.json` | Pinhole `fx`/`fy`, dimensions, camera-to-world rotation and position; optional `cx`/`cy` |
| LLFF | `poses_bounds.npy` | N by 17 float camera arrays with a complete ordered RGB directory or `list.txt` |
| DTU / IDR | `cameras.npz`, `cameras_sphere.npz` or `cameras_normalized.npz` | Consecutive 4 by 4 `world_mat_N` / `scale_mat_N` pairs with pinhole calibration |

OpenSfM imports the selected component's `points` as XYZ/RGB in the camera world frame. Canonical unsigned integer IDs are preserved; arbitrary string IDs are reindexed in lexical order. Feature tracks live outside the JSON and are not synthesized. Unavailable reprojection errors use zero, and the initial track threshold is zero so these points are visible. Existing saved viewer settings still take precedence. The Berlin example contains 1,430 points and three posed photographs.

Drop a scene folder or an archive containing metadata and photos. ZIP and plain TAR keep media lazy. Supported compressed archives use the existing archive reader. A checksummed plain TAR named `.tar.gz` is detected before choosing a decoder. When camera metadata spans several scene roots, choose a scene; a complete native COLMAP model takes priority within its root. Native archive files come from one complete model directory, and files from incomplete directories are never combined to invent a model. Existing automatic native-model preference applies to archives containing native models alone. Media lookup omits other named native roots, and multi-scene settings lookup stays on the chosen model's ancestry. NeRF train is the default split. OpenSfM reconstructions are selected separately.

Direct HTTP(S) metadata URLs also work through **Load from URL**. The metadata request retains the supplied query. Relative media references resolve against the original metadata URL, retaining its revision path. Absolute image URLs retain their own query, including PNG alpha-mask bindings. The host must allow browser CORS reads. Existing ColmapView manifest JSON continues to use its own schema. A dataset repository or folder URL alone does not discover these new formats: provide its metadata URL or download a scene archive.

HF metadata URLs use a complete, scene-scoped file listing when available. It resolves extensionless references without per-photo probes and enables conventional LLFF/DTU image ordering and DTU mask discovery. Partial listings are discarded. Pagination stays on the same tree endpoint and stops at 50 pages or 100,000 entries, with a 16 MiB per-page body limit. References outside the listed subtree keep the existing URL resolution. See the [supported-type path audit](supported-dataset-paths.md) for the per-format browser matrix and original-source results.

Distinct listed paths that collide after normalization invalidate the listing. When a complete listing declares an array's `list.txt`, that order file must be readable; a 404 cannot silently replace its intended camera order with sorted filenames.

Image references resolve exactly within the selected scene. Local/archive metadata in a subfolder can reference sibling photos and masks with `../`; the inferred scope stays inside the source branch and stops before another named metadata/native scene. Top-level `calibration`, `metadata`, `cameras` and `poses` folders can use sibling media at the source root. These metadata folders belong to their parent scene when choosing between native COLMAP and JSON, preserving native priority within that scene. URL parent references resolve against the original metadata directory. Absolute URL names retain directory components, so `left/a.png` and `right/a.png` remain distinct; the original URL and query still identify the media.

Paths that collide after separator or dot-segment normalization are rejected. Extensionless references require a unique matching image extension; local/archive lookup preserves filename case and accepts uppercase extensions. URL extension probes check lowercase and uppercase extensions, support dotted stems and preserve an absolute URL's query. Multiple matches fail validation. Automatic discovery skips unrelated JSON filename hints within the selected folder. Explicitly selected unsupported metadata fails validation. Missing local/archive photos are omitted with a summary; original metadata frame order determines IDs, including gaps. Duplicate OpenMVG camera or pose IDs are rejected. A portable OpenMVG `root_path`, including an empty root, is authoritative: missing files under that root never fall back to a same-named sibling. Metadata containing an absolute author-machine root retains the existing relocation lookup.

The published `openMVG/openMVG/.../sfm_viewer/sample_data/` example has one explicit source exception: its conventional `images` or `./images` root resolves to `openMVG/ImageDataset_SceauxCastle`. Empty or custom portable roots keep their declared meaning, and other hosts retain ordinary path resolution. This sample contains 6,586 landmarks and 22,564 observations across 11 posed images. OpenMVG observation keys refer to view IDs, not pose IDs; source feature IDs are compacted into reciprocal COLMAP image/point tracks. Missing-photo or unregistered views do not receive dangling track references, while source 3D geometry is retained. The normalizer preserves source coordinates; the existing WASM viewer/export path uses float32 point positions and errors. The format has no per-point RGB, so points use neutral gray. Pixel reprojection errors are computed from retained observations; points without a projectable retained observation use zero with a diagnostic. Control points are not sparse reconstruction landmarks and are not imported as such.

An explicit `camera_model` requires `fl_x`, `fl_y`, `cx`, `cy`, `w` and `h`, either globally or completely for each frame. Legacy FOV metadata can infer photo dimensions and a centered principal point. Only the basic Blender format with global horizontal FOV reuses a representative photo's inferred dimensions. Legacy FOV/distortion metadata, vertical or degree FOV, and per-frame calibration infer dimensions separately for each photograph that needs them. Declared dimensions are checked against original media when read. Unsupported image orientation, ambiguous names, invalid poses, conflicting intrinsics and unrepresentable distortion are rejected. Lens declarations and mask paths are validated even when a photo is missing; an explicit fisheye flag must agree with the declared model. Rotations must be rigid; already-baked `applied_transform` and related metadata are retained as provenance without applying them again.

Later photo or mask failures are reported for that media item without discarding the committed scene. Bounded URL media reads use the existing request scheduler and retry policy. Results from a previous scene cannot populate the current scene. Oversized or unreadable optional `colmapview.yaml` settings are skipped with a warning.

Explicit `mask_path` / `mask_file_path` references bind their exact files. NeRF PNG alpha produces an on-demand grayscale foreground mask, including partial alpha; fully opaque images have no derived mask. Industrial Part's `train/good` and `train/masks/*_mask.png` layout can display its masks, but their role remains unverified and they cannot be exported as feature masks. Depth images, meshes and Gaussian splats are not imported with camera JSON.

NeRF, Nerfstudio and Instant-NGP metadata can declare `ply_file_path`. Without that declaration, a folder, archive or complete HF listing can identify one cloud beside the selected metadata named `points_gt.ply`, `points3D.ply`, `points.ply`, `point_cloud.ply` or `sparse_pc.ply` (case-insensitive). Multiple candidates produce a warning and require `ply_file_path`; the loader does not guess HTTP filenames or borrow another scene's cloud. A selected cloud must be nonempty XYZ PLY without mesh faces or Gaussian properties, within a 64 MiB read budget. An unreadable or invalid selected cloud fails the import and preserves the previously loaded scene.

Companion XYZ stays in the metadata's saved world coordinates: camera-basis conversion does not transform the world, and `applied_transform` / `applied_scale` are not applied again. XYZ-only points display in white and export as native COLMAP points with empty tracks and zero error. The import sets Min Track to zero and enables point display before restoring any saved viewer settings. These points do not imply feature correspondences or a sparse SfM reconstruction. This follows Nerfstudio's [saved-world PLY convention](https://docs.nerf.studio/_modules/nerfstudio/data/dataparsers/nerfstudio_dataparser.html).

The Export panel has three package options:

- **ZIP**: native COLMAP model only.
- **COLMAP + original images**: native model and original image bytes under `images/<model name>`.
- **COLMAP + images + masks**: adds grayscale PNG feature masks under `masks/<model name>.png`, where available. A missing declared mask fails this requested export; an opaque alpha mask is optional. The completion message reports mask coverage.

Combined packages stop if required RGB is unavailable, calibration mismatches, paths collide or the package exceeds its byte budget. Original RGB is never replaced by a preview or JPEG conversion. The separate Images download action remains a JPEG export.

Package paths must also form an extractable file tree. Registered names such as `a.png` and `a.png/b.png` conflict as RGB files; appending the mask suffix can create a separate mask-only conflict. Such exports stop with a path-conflict error, including case-insensitive conflicts. The loaded scene remains available for model-only export, or RGB export when only mask paths conflict. Missing optional masks do not reserve hypothetical package paths.

Partial mask coverage produces a warning. COLMAP's mask-folder reader requires a readable mask for each image in that run; it does not treat a missing mask as all white. Use explicit image lists for separate masked and unmasked runs, leaving the mask folder unset for the unmasked run. Existing optional-mask export behavior is retained; the viewer does not synthesize all-white masks or rename registered images. A package with partial sidecars is not qualified for a single COLMAP feature-extraction run over every image with a mask folder selected.

COLMAP model image names remain intact during packaging, including a genuine nested `images/` directory. Conversion from camera JSON removes the source image-root prefix once; subsequent native export/reimport does not remove it again. Native archive reimport resolves original media paths within the selected model's scene before considering legacy suffix aliases.

Limits are 16 MiB of selected metadata, 256 metadata candidates, 100,000 frames, 64 MiB per original media read and 16 million pixels per derived/normalized mask. Photo-package export writes original photos and normalized masks sequentially to temporary browser-managed disk storage, with backpressure and ZIP64 support. It no longer accumulates all photos or a complete ZIP in JavaScript memory and has no 256 MiB aggregate input limit when writable browser storage is available. Model serialization, one original photo, mask decoding, existing media caches and ZIP directory records still use memory; this is not a bound on total browser/GPU memory.

The completed package is downloaded only after all mandatory media validates and the ZIP finishes. Cancellation, missing media and disk errors discard the temporary output. Browser storage quota and available disk space limit package size. On browsers without writable storage, small exports retain a bounded memory fallback (256 MiB of ZIP output); larger exports explain that writable storage is required. Completed disk-backed exports remain for at least 24 hours so cleanup cannot immediately invalidate the browser download; later archive operations reclaim expired files when browser locks permit safe cleanup. Clearing site data also removes them. Keep the tab open until the download starts.

Browsers with the native save-file picker also offer **Save ZIP to file** for both photo-package formats. Choose a destination at the start of the export, then confirm any pending deletions or transform. This writes directly to that destination through a transactional file writer, bypassing browser-storage quota and the memory fallback limit. Available disk space still applies. All photo, calibration, path and mask checks are shared with Download COLMAP. A failed or cancelled export aborts the writer, preserving an existing destination; a newly chosen filename can remain as an empty file. The complete ZIP is committed only when all checks and ZIP finalization succeed. Once the final file commit starts, cancellation cannot roll it back; the completion message reports a successful save. Keep the tab open until that message appears. The native picker is capability-detected; ordinary downloads remain available in other browsers.

Random access requires exposed, validated byte ranges; an oversized range failure does not trigger a whole-archive download.

## Common data layout and array conventions

Every adapter produces the same camera model: OpenCV world-to-camera poses, pixel intrinsics, stable frame IDs and exact original-media bindings. Imported camera-only sources have no sparse points or feature observations. The combined export is a standard scene directory that can be reopened by the native loader:

```text
scene/
  sparse/0/cameras.bin
  sparse/0/images.bin
  sparse/0/points3D.bin
  images/<model image name>
  masks/<model image name>.png   # optional feature masks
```

Image names can include nested directories. Original RGB bytes are preserved. Black feature-mask pixels exclude features; white pixels retain them, with grayscale coverage preserved for soft masks unless a format explicitly declares binary foreground semantics. The import context retains source paths and format diagnostics while the scene is open.

Standard 3DGS JSON uses its `img_name` and original `images/` directory. Names without extensions must resolve uniquely. If local/archive photos match both beside the metadata and under `images/`, import fails rather than choosing one. Its rotation is OpenCV camera-to-world, so the NeRF axis conversion does not apply. Distorted camera variants need another supported schema; coefficients cannot be discarded. Missing local/archive photographs are reported individually.

LLFF arrays do not name their photos. Folder/archive import uses the complete, case-sensitive filename order of the adjacent `images/` directory, including only direct image children. DTU/IDR uses the adjacent `image/` directory. A count mismatch fails before a scene is committed. An optional `list.txt` beside either array overrides discovery: one relative image path per line, in camera order. URL-source lists can also use absolute HTTP(S) image URLs. Blank lines and comment lines starting with `#` are ignored. The list must contain exactly one distinct path per camera. Explicit positions remain intact when local/archive photos are missing. Array metadata URLs require this list unless a complete HF tree supplies the conventional image directory; generic HTTP folders cannot be enumerated reliably.

```text
# list.txt — paths relative to the metadata directory, in camera order
images_4/00000.png
images_4/00001.png
```

Downsampled LLFF directories such as `images_4/` require an explicit list. Each photo's actual dimensions scale the stored LLFF pixel intrinsics; a diagnostic records resizing. Original world coordinates are retained, and the final near/far columns are ignored. DTU/IDR applies `world_mat @ scale_mat` once, retaining that format's normalized world frame. Normalization must be an affine proper rotation with uniform positive scale and translation. Source projection skew is rejected except for a source-precision tolerance: eight float32 epsilons relative to focal length when either source matrix is float32, or 1e-12 for float64. Nontrivial rounding is reported per camera; original arrays are unchanged. This is an approximation within source precision, not exact preservation of nonzero skew.

NPY supports versions 1–3, float32/float64, both byte orders and row/column-major arrays. Headers, shapes and payload sizes are checked without executing Python or loading pickles. NPZ reads only the world/scale matrices, with at most 8 KiB per expanded matrix and 16 MiB total expanded camera metadata. The shared ZIP reader checks actual size and CRC. Unrelated arrays remain compressed; depth is never read.

DTU/IDR `mask/` files bind by a unique matching filename stem or numeric ID, allowing `image/000000.png` with `mask/000.png`. Multiple matches fail. These are format-declared foreground masks: export converts luminance `0.2125R + 0.7154G + 0.0721B > 127.5` to binary grayscale, following the IDR foreground convention. Other colored masks remain subject to the existing label/role checks. HF array imports can discover these sidecars from a complete scene listing. Other URL array imports require a scene folder/archive to discover undeclared mask directories.

The pose and array conventions follow [3DGS camera JSON](https://github.com/graphdeco-inria/gaussian-splatting/blob/main/utils/camera_utils.py), [LLFF camera arrays](https://github.com/Fyusion/LLFF/blob/master/llff/poses/pose_utils.py), [IDR camera/mask loading](https://github.com/lioryariv/idr/blob/main/code/datasets/scene_dataset.py), [IDR projection and foreground conversion](https://github.com/lioryariv/idr/blob/main/code/utils/rend_util.py) and the [NumPy file format](https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html).

Validation uses authored original-schema browser fixtures, independent PyCOLMAP projection checks and selected public samples. Downloaded samples and verification reports stay under ignored `.tmp/`; dataset-specific source, license and CORS evidence does not imply every dataset using a format is qualified.

## Hugging Face layout coverage

The October 15, 2026 implementation adds the three missing standard camera-schema families from the October 14 audit. This does **not** establish support for every Hugging Face dataset layout. Hugging Face is a host; each dataset still needs a supported camera schema, matching original photos and accessible assets.

| Catalog layout | Application support |
| --- | --- |
| Native COLMAP binary/text with matching photographs | Existing native loader; model and media paths must resolve within the selected scene |
| NeRF / Blender, Nerfstudio and legacy Instant-NGP `transforms*.json` | Implemented subsets described above; a generic NeRF catalog label does not qualify custom poses, camera models or media |
| Standard 3DGS `cameras.json` | Implemented pinhole subset; source names and rotation conventions are validated |
| LLFF `poses_bounds.npy` | Implemented camera/RGB subset with explicit or complete conventional image order; bounds ignored |
| DTU / IDR `cameras.npz` | Implemented projection-matrix camera/RGB subset and conventional foreground masks; depth ignored |
| CO3D gzip camera annotations, MatrixCity pose variants and other custom JSON | No dedicated adapter or complete qualification |
| Camera/image records inside Parquet, Arrow or dataset-specific shards | No generic record/shard loader |

In the 146-repository camera-metadata survey, 64 repositories had sampled camera-and-RGB export evidence: 52 used NeRF-style JSON, five standard 3DGS JSON, four LLFF arrays and three DTU NPZ. All four of those schema families now have adapters, with the subsets and source-layout requirements above. That is family coverage, not 64 verified application loads. Public browser export checks cover unchanged source metadata and two original RGB files each from `jhuangbu/gaussian-editor-garden-scene`, `SHlNDY/HDR-NSFF` and `turandai/gaussian-surfels-dtu`, including the latter's matched masks. Camera arrays keep their full original ordering in the sampled fixtures.

These are sampled research counts, not application load-pass counts. The survey converter accepted conventions that the application deliberately rejects, and the full Hub and every archive were not exhaustively inspected. CORS qualification proves delivery of the checked assets, not schema support. Custom EXR color assets, video-only RGB and ambiguous rendering variants still require separate conversion or binding work. Inferred Industrial Part masks remain display-only because their role is unverified.

For camera JSON, a direct metadata URL or a scene folder/archive is required. A Hugging Face repository/tree URL does not automatically discover all of these camera layouts.

## Native COLMAP physical arrangements

Native model media now bind to physical paths consistently for folders, archives and discovered HF trees. Matching accounts for nested model containers, scene ownership, per-camera directories, original versus resized image roots, common mask folder/name variants and scoped `image_mapping.csv` files. Unique complete flattened collections can be recovered; ambiguous collections offer explicit selection. A real `images/` prefix inside a registered name is preserved through export and reimport. Native calibration is retained; resized previews still fail package export if their dimensions do not match it.

Co-located cameras and images files can load without a points file. Exports contain zero sparse points and empty observations for that camera-only source. Explicit manifests may omit `files.points3D`, use absolute HTTP(S) model/media URLs, and declare mask mappings and roles. The known PhoMo text extension imports geometry and supplied PNG previews while omitting photometric fields from standard COLMAP exports. See [loading recovery and remaining failures](dataset-loading-failures.md) for the tested subsets and manifest example.

This does not make every catalog entry loadable. The [dated arrangement audit](dataset-layout-audit.md) records original model checks, browser CORS/range failures, missing RGB, camera-only models and extended text formats. Nonstandard mask filenames can be displayed while their role remains unknown; they are not silently converted to COLMAP feature masks.
