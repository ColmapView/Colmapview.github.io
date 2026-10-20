# Supported dataset path audit — October 17, 2026

This audit covers the ten supported camera families, standalone geometry, the local named-scene Hub inventory, and the boundary between a supported format and a loadable public source. The loader fixes and tests below are local changes; this audit did not deploy the viewer or change Hub qualification.

The subsequent [sparse-folder link follow-up](dataset-loading-failures.md#sparse-folder-links-and-pictures-above-the-model--october-17-2026) reproduces the released viewer's missing-picture behavior and extends local scene-root handling to BMVS workspaces. A scoped model URL passing in this local implementation does not establish support in the currently deployed viewer.

## Dataset lists

- [Latest per-scene loading audit](../.tmp/scene-loading-audit-2026-10-17/README.md): all 20,092 named scenes have a bounded preflight result, including explicit failures and deferred checks. Its [searchable report](../.tmp/scene-loading-audit-2026-10-17/index.html), [per-scene CSV](../.tmp/scene-loading-audit-2026-10-17/each-scene.csv), [source CSV](../.tmp/scene-loading-audit-2026-10-17/each-source.csv) and [findings notes](../.tmp/scene-loading-audit-2026-10-17/notes.md) distinguish metadata, photo paths, actual browser reads and export evidence. A completed preflight does not certify an entire scene or collection.
- [Every named Hub scene](../.tmp/supported-path-audit-2026-10-17/hub-scene-paths.csv): 20,092 rows, one per named scene, with source, family, model/metadata paths and route classification.
- [Source catalog](../.tmp/supported-path-audit-2026-10-17/hub-source-paths.csv): 2,113 source records and their viewer routes.
- [Inventory summary](../.tmp/supported-path-audit-2026-10-17/hub-path-summary.json): counts and exact catalog generation.
- [Earlier per-dataset support matrix](../.tmp/dataset-support-audit-2026-10-16/all-datasets.csv): broader dataset research, including sources outside the current named-scene inventory.

CSV and machine-readable receipts live in Git-ignored `.tmp/`. This document retains the findings; the CSVs are local research artifacts. A scene appearing in these lists is not a complete camera/RGB/export pass.

The per-scene audit found a deployment mismatch: the published individual index still contains 2,158,128 model/file records, while the local generation contains 20,092 named scenes. Its `viewer=available` facet counts 429 explicit proof links, while actual API enumeration also exposes 5,435 unchecked native trial actions. These populations must not be compared as if they were the same list or verification level.

An original six-view PanoWorld scene provides a complete local camera/RGB example: all six originals display, preserve their hashes in COLMAP export, match calibration dimensions, and pass independent pose comparisons and COLMAP CPU image reading. The released 0.16.14 viewer rejects its exact metadata URL as an invalid manifest. Local adapter support and released URL dispatch are separate qualifications. See the [original local check](../.tmp/scene-loading-audit-2026-10-17/pano-local.json), [export comparison](../.tmp/scene-loading-audit-2026-10-17/pano-export-verification.json) and [released failure](../.tmp/scene-loading-audit-2026-10-17/pano-released.json).

## Supported camera formats and entry points

| Family | Required metadata | Path rules checked |
| --- | --- | --- |
| Native COLMAP, binary or text | Co-located `cameras`, `images`, optional `points3D` | Complete and camera-only models; custom model directory; sibling RGB/masks; registered subdirectories retained |
| Blender / NeRF | `transforms*.json`, 4×4 transforms | Exact and extensionless image references; PNG alpha masks |
| Nerfstudio | `transforms*.json`, declared intrinsics | Exact photo and explicit mask paths |
| Legacy Instant-NGP | `transforms*.json`, supported FOV/intrinsics/distortion | Exact photo paths and PNG alpha masks |
| OpenSfM | `reconstruction.json` | Shot names, conventional `images/`, selected reconstruction |
| OpenMVG | `sfm_data.json` | Declared `root_path`, per-view `local_path`, filename; author-example companion repository |
| Bundler 0.3 | `bundle.out` and ordered `list.txt`/`images.txt` | Quoted filenames; list-relative photos; conventional parent list beside `results/` |
| Standard 3DGS camera JSON | `cameras.json` with rotation/position and pinhole calibration | Unique photo extension under `images/`; exact original image identity |
| LLFF | N×17 `poses_bounds.npy` | Complete adjacent `images/` order or explicit ordered `list.txt` |
| DTU / IDR | Supported `cameras*.npz`, `world_mat_N`/`scale_mat_N` | Complete adjacent `image/` order or explicit list; unique `mask/` sidecars |

All nine non-native adapters were checked through local folders, local ZIP, plain TAR, direct metadata URLs and ranged remote ZIP. All nine also have an HF metadata-URL case using a complete tree listing. Native binary/text models were checked as complete and camera-only scenes through folders, ZIP, TAR, HF scene URLs, HF model-directory URLs and explicit manifests.

The fixture matrix deliberately separates metadata from media:

```text
S Ω#%/
  calibration/<camera metadata>
  images/left #/a 100%.PNG
  images/right Ω/b %23.PNG
  masks/<explicit mask names>
```

DTU uses `image/` and its declared mask convention. Tests cover parent references, spaces, Unicode, literal `%`, literal `#`, uppercase extensions, signed/query-bearing metadata URLs, distinct photo bytes, mask decoding and COLMAP package export. They check which image was bound, not only whether a file existed. Exported native models are parsed and their image names and original RGB bytes compared.

HF **folder URLs discover native models**. For other camera formats, supply the exact metadata file URL or a scene archive/folder. A repository listing is not an instruction to choose an arbitrary JSON/NPZ file. Generic HTTP folders cannot be enumerated reliably; LLFF/DTU metadata URLs on those hosts still require an ordered list.

## Gaps fixed in this pass

**The published OpenMVG viewer example lost its photos.** Its metadata declares `root_path: "./images"`, while the photos live in `openMVG/ImageDataset_SceauxCastle`. The existing relocation handled an author-machine root but missed this portable declaration. The fix applies only to that exact published example path and its conventional `images` declaration. Other portable roots, including an empty root, remain authoritative. Four regression cases cover relocated and preserved roots.

**HF extensionless names caused excessive requests.** Each image could require fourteen extension probes. An original-data run hit HTTP 429 on larger sources. Metadata loads now request a complete, scene-scoped HF file listing and resolve extensions against exact listed paths. The same listing supplies LLFF/DTU conventional image order and DTU mask paths. The nine HF browser cases issue zero extension probes.

Listing use is bounded to 50 pages, 100,000 entries and 16 MiB per page. Pagination must stay on the same tree endpoint. Cycles, failed pages, invalid responses and budget exhaustion discard the listing; a partial tree cannot establish image order. Cancellation remains fatal. References outside the listed subtree retain the prior URL lookup. An unavailable listing retains the established fallback, including an explicit list requirement for arrays when enumeration is unavailable.

The final review reproduced two additional edge cases. A listed `list.txt` returning 404 must fail instead of silently switching LLFF/DTU to filename order. Distinct listed paths that collide after normalization must not become an authoritative file index. Both guards are implemented. Their four regression cases failed before the fixes and pass afterward; the combined listing/array edge suite passes all 37 tests.

## Original public sources

These are actual original metadata URLs loaded in the local application, with one original photo fetched and decoded per successful source. Counts are camera/image bindings, not certification of every photo or export. HF revisions are pinned in the receipts.

| Source | Family | Result |
| --- | --- | --- |
| [phuckstnk63/nerf-synthetic, Lego](https://huggingface.co/datasets/phuckstnk63/nerf-synthetic/tree/68ab61d46f109b192f9a519c4bc5a646e1669db0/nerf_synthetic/lego) | Blender | 100 bindings; original 800×800 PNG decoded |
| [nerfstudioteam/datasets, dozer](https://huggingface.co/datasets/nerfstudioteam/datasets/tree/461701c17e83c3f4d2481db32315aa7df703d2f8/dozer) | Nerfstudio | 359 bindings; original 3008×2000 JPEG decoded |
| [vlongle/pixie, cup](https://huggingface.co/datasets/vlongle/pixie/tree/3e01d29ef23f13149ee5472458b3a0ee6b1480a1/real_scene_data/vid2sim_real_data/cup) | Legacy Instant-NGP | 4 bindings; original 512×375 PNG decoded |
| [OpenSfM Berlin example](https://github.com/mapillary/OpenSfM/tree/main/data/berlin) | OpenSfM | 3 bindings; original 3264×2448 JPEG decoded; 1,430 embedded XYZ/RGB points exported and independently checked, without fabricated observations |
| [OpenMVG Sceaux example](https://github.com/openMVG/openMVG/tree/develop/src/software/SfM/python/sfm_viewer/sample_data) | OpenMVG | 11 bindings; companion original 2832×2128 JPEG decoded after repair; 6,586 landmarks and 22,564 observations preserved and independently read in PyCOLMAP |
| [jhuangbu/gaussian-editor-garden-scene](https://huggingface.co/datasets/jhuangbu/gaussian-editor-garden-scene/tree/e98f047a593a20d8d8c6f8612cd7ecf4ede12ae3/garden) | Standard 3DGS cameras | 185 bindings; original 5187×3361 JPEG decoded |
| [SHlNDY/HDR-NSFF, bag](https://huggingface.co/datasets/SHlNDY/HDR-NSFF/tree/dc317d044cbf7d4755bf8b29338bb6b51afe4f7d/bag/dense) | LLFF | 36 bindings; original 1930×1081 PNG decoded |
| [turandai/gaussian-surfels-dtu, scan24](https://huggingface.co/datasets/turandai/gaussian-surfels-dtu/tree/70ec15cd824556d17493e1c18e7e6c8b79f3ad94/scan24) | DTU / IDR | 49 bindings; original 1600×1200 PNG decoded |
| [Bundler Kermit example](https://github.com/snavely/bundler_sfm/tree/master/examples/kermit) | Bundler | Not directly loadable: the published example lacks an ordered image list. Eleven JPEG filenames do not prove camera order. Supply the original order in `list.txt` |
| [nadavo11/aquarium-gaussian-splats](https://huggingface.co/datasets/nadavo11/aquarium-gaussian-splats/tree/a8f5078cf9c0c03903d408ec84cb79acd6697c84) | NeRF-style filename candidate | Rejected: its frame transforms have three rows. This candidate is not qualified as a supported 4×4 camera schema |

The first run's HTTP 429 failures are preserved. Fresh checks after the listing change pass for Blender, Instant-NGP, 3DGS, LLFF and DTU. The OpenMVG before/after receipts preserve the reproduced photo failure and repair.

Fresh anonymous browser checks from both `https://colmapview.opsiclear.com` and `https://colmapview.github.io` also pass for the eight successful sources' exact metadata and sampled original photo URLs. All 64 bounded checks pass: eight sources × two resources × GET/range × two viewer origins. These establish dated access to the sampled URLs, not every asset or permission to redistribute the datasets.

## Standalone geometry

XYZ/RGB PLY, Gaussian PLY, gzip SPZ v2 and SOG v2 each pass both local-file and direct-URL path checks with the same special characters. All eight checks preserve the original SHA-256, filename and byte length. Counts are three points, 2,000 Gaussian PLY splats, two SPZ splats and 2,000 SOG splats. PLY/SPZ use the application decoder; SOG uses its bundle validator. These checks establish paths and decode/validation, not visual rendering quality.

Geometry files do not establish cameras or photographs. The SPZ decoder accepts its supported gzip versions; this path check uses v2 and does not qualify v4/Zstd. SOG requires Spark. `.splat`, `.ksplat`, STL and OBJ are not direct loader types. Geometry-only ZIPs still need extraction; this audit does not extend the archive loader to those packages.

## Photo encodings

A separate Chromium pixel-decoder check passes for authored PNG, JPG, JPEG, WebP and BMP originals. Both TIFF extensions are accepted as paths and their 8×4 headers are readable, but their actual pixels fail browser decoding. TIFF path support therefore does not qualify gallery/detail display; a decoder or compatible source previews are still needed. GIF pixels decode in the browser, but GIF is outside the non-native camera adapters' accepted image extensions. These distinctions are recorded in the [raster-codec receipt](../.tmp/supported-path-audit-2026-10-17/raster-codecs.json).

## Hub inventory findings

The complete public inventory has 6,762 complete native scene records, 305 camera-only native records, 12,934 camera filename candidates and 91 explicit public scene records. The filename candidates comprise 7,256 NeRF-style JSON, 5,623 NPZ and 55 LLFF records. In particular, a file named `cameras.npz` does not establish DTU matrix conventions; custom Waymo `R/T/K` arrays remain unqualified.

There are 132 exact qualified scene viewer targets: 103 native directory targets, one JSON metadata target and 28 standalone geometry targets. No structural route/model-role errors were found in those qualified targets. This is a read-only audit of every catalog row and exact qualified target, not 20,092 full network imports. It does not promote candidates, infer absent images, or create cards for individual files.

## Remaining source requirements

- Missing original RGB cannot be recovered from masks, camera poses or a geometry file. The ArmGS mask-only case remains a camera-and-mask scene; a COLMAP + original images export still requires original photographs.
- Ambiguous photos, duplicate paths and inconsistent array/list counts must fail or require an explicit mapping/order. Nearby similarly named files are not sufficient evidence.
- Custom matrix schemas, unsupported distortion, nonrigid transforms and oriented/resized photos with incompatible calibration need separate validated adapters or corrected packaging.
- A recognized image extension or readable dimensions do not establish browser pixel support. TIFF remains an explicit display limitation.
- Gated/private sources, revoked URLs, CORS restrictions, HTTP 429 and invalid archive ranges remain delivery failures. Format support does not grant access or a license.
- Separate/nested archives and geometry-only archives are not covered by a complete native/camera scene package pass. Compressed containers share the existing extraction path; the new exhaustive path matrix specifically exercises ZIP, plain TAR and ranged ZIP.

## Verification receipts

- [Persistent 78-case browser matrix](../e2e/supported-dataset-paths.spec.ts).
- [Chromium result](../.tmp/supported-path-audit-2026-10-17/chromium-final.json): 78 passed, zero failures, skips or flaky results.
- [Firefox result](../.tmp/supported-path-audit-2026-10-17/firefox-final.json): the same 78 cases passed, zero failures, skips or flaky results.
- [Final HF metadata follow-up](../.tmp/supported-path-audit-2026-10-17/hf-metadata-final.json): all nine Chromium cases passed again after the listing/order guards.
- [Focused unit result](../.tmp/supported-path-audit-2026-10-17/unit-final.json): 578 passed, including camera importers, native media, URL discovery, manifest/media paths and existing mask gallery/detail regressions.
- [Standalone geometry paths](../.tmp/supported-path-audit-2026-10-17/geometry-paths.json): eight passed.
- [Original public checks](../.tmp/supported-path-audit-2026-10-17/public-original-paths.json), [fresh HF checks](../.tmp/supported-path-audit-2026-10-17/public-hf-after.json), [OpenMVG repair](../.tmp/supported-path-audit-2026-10-17/public-openmvg-after.json).
- [Deployed-origin browser access](../.tmp/supported-path-audit-2026-10-17/public-cors.json): 64 successful checks of exact metadata/photo URLs.

Lint, application/test/browser TypeScript checks and the production build pass. No Safari load qualification is claimed by this two-browser matrix.

See [camera format and export details](camera-dataset-imports.md), [native layout audit](dataset-layout-audit.md) and [dataset failure notes](dataset-loading-failures.md) for the preceding checks and their limits.
