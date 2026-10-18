# Dataset arrangement audit — October 15, 2026

**The surveyed datasets are not all automatically loadable.** The audit distinguishes physical listings, original registration-to-photo matches, browser transport, and actual load/export checks. A passing folder-pattern test does not qualify every scene using that pattern.

The scope is the existing 2,012-repository Hugging Face search catalog and the 88-row broader public catalog. These contain duplicate scenes, mirrors and reconstruction variants. They are not a census of the Hub or the internet.

The subsequent [loading recovery audit](dataset-loading-failures.md) adds camera-only native models, photo collection selection, explicit split-host media and PhoMo geometry. The table below preserves the initial audit results; the follow-up records the updated path checks and remaining failures.

## Dataset lists

- [October 17 supported-type and path audit](supported-dataset-paths.md): all ten camera families, standalone geometry, exact URL/folder/archive entry points, original-source failures and the complete 20,092-row named-scene inventory.
- [October 16 full support audit](../.tmp/dataset-support-audit-2026-10-16/README.md): all 5,602 HF candidates and 95 public records, including the 2,113 live Hub entries. The [full per-dataset matrix](../.tmp/dataset-support-audit-2026-10-16/all-datasets.csv) records loading, browser access, camera/RGB and export qualifications; the [camera/image candidates](../.tmp/dataset-support-audit-2026-10-16/camera-image-candidates.csv), [dated camera/RGB evidence](../.tmp/dataset-support-audit-2026-10-16/camera-images-evidence.csv) and [verified import samples](../.tmp/dataset-support-audit-2026-10-16/viewer-verified-samples.csv) are separate lists. Fresh checks cover 1,376 asset URLs and 175 bounded original imports (170 pass, five PLY-only ZIP failures). These extend the earlier inventory; they do not certify every scene or image.
- [Hugging Face camera + RGB shortlist](../.tmp/huggingface-scan-2026-10-12/future-export-with-images.csv): 64 repositories with sampled camera-and-image export evidence, including recorded native/alpha mask coverage. Survey conversions are separate from application load qualification.
- [Relevant Hugging Face catalog](../.tmp/huggingface-scan-2026-10-12/datasets.csv): 2,012 repository candidates, including unsupported and unverified sources. The [unfiltered search inventory](../.tmp/huggingface-scan-2026-10-12/all-candidates.csv) contains 5,602 repositories.
- [Broader public dataset catalog](../.tmp/public-colmap-expansion-2026-10-13/all-cors-safe-datasets.csv): 88 scene, variant and subset rows with dated access/export evidence. The filename does not establish current CORS access for every asset; later exceptions are recorded below.
- [Latest per-source loading notes](../.tmp/dataset-loading-improvements-2026-10-15/dataset-source-notes.csv): inspected model sources, sampled media matches, collection selection, original-model browser checks and unresolved cases.
- [Model layout atlas](../.tmp/dataset-arrangement-audit-2026-10-15/layout-atlas.csv): individual model directories and physical image/mask relationships.

These detailed CSVs are local, Git-ignored research artifacts under `.tmp/`. The tracked documents summarize the evidence; inclusion in a catalog is not a complete scene load pass.

## Initial inventory and verification

| Evidence | Result |
| --- | --- |
| Complete model records in the dated catalogs | 5,980 direct HF + 1,463 archived HF + 69 broader public |
| Currently readable complete model listings | 7,458; another 54 historical records are inside three archives whose tail ranges fail |
| Additional camera-only records | 305 in nine HF repositories; now supported as camera-only native models in the follow-up |
| Complete public models with no RGB listed in the inspected source | 3,748; images elsewhere or inside additional archives were not inferred |
| Representative source/layout pairs checked against original metadata | 224; up to three registered names per pair |
| All sampled RGB names resolve | 182 pairs, covering 39 observed physical relationship families |
| Remaining pairs | 30 have missing/unmatched names, eight have ambiguous matches, three use extended PHOMO text, one has unavailable metadata |
| Browser delivery | 320 of 326 exact asset URLs qualify from both deployed origins; files require readable GET, remote archives additionally require validated ranges |
| Original native models tested in the application | Four models from three public datasets, with all registered RGB, in Chromium and Firefox |

The complete listings yield 89 structural relationships, including models without listed photos; 65 occur with candidate public RGB. Those counts describe paths, rather than 89 independently implemented camera formats. The 224 representatives do not qualify every registered image or every other model in their source.

Detailed, ignored working reports are in [the audit folder](../.tmp/dataset-arrangement-audit-2026-10-15/README.md): model inventories, dataset notes, exact names and matches, CORS receipts, original hashes and independent export checks. [Camera schema support](camera-dataset-imports.md) remains a separate qualification.

## Loader changes verified

Folders, archives and discovered HF trees now use original physical paths for native media bindings. The selected scene takes priority over a larger neighboring image folder. Equal candidates remain unbound. Qualified camera paths do not fall back to another camera's basename. Native cameras, IDs and poses are retained.

| Arrangement | Behavior |
| --- | --- |
| Model at root, `sparse/`, `sparse/N`, `colmap/`, `colmap/N`, or `colmap/sparse/N` | Find one co-located model group and bind its media |
| `colmap_workspace/sparse_native` or `colmap_workspace/sparse_seed`, RGB above the workspace | Retain the exact selected model and resolve media from its owning scene, including a directly scoped HF model URL |
| ETH3D `dslr_calibration_jpg` or `dslr_calibration_undistorted`, sibling `images/` | Read the owning scene for a directly scoped HF URL; retain registered `dslr_images/...` or `dslr_images_undistorted/...` names and exclude the other representation from automatic photo/mask matching |
| Custom model directory, photos beside it or in a sibling subtree | Match original registered names against physical paths |
| `images/cam_N/...`, shared RGB roots, corrected images | Retain camera subdirectories; use scene proximity and explicit mappings |
| Original `images/` and resized `images_N/` alternatives | Prefer original `images/`; a resized native preview does not change calibration |
| A registered name itself begins with `images/` | Preserve that real subdirectory, including package reimport |
| `masks/`, `mask/`, `fg_masks/`, `foreground_masks/`, `obj_masks/`, `com_masks/` | Bind matched sidecars without using them as RGB |
| Mask keeps the RGB extension, appends `.png`, replaces the extension, or uses `_mask.png` | Resolve the physical mask; preserve an unknown role where semantics are undeclared |
| HF URL points directly to a conventional model container with sibling images or masks | Read the owning scene for media while retaining the exact selected model; optional parent listing failures preserve the original subtree |
| Native masks exist while original RGB is absent | Bind and display masks independently in gallery mask mode and desktop/touch detail views; photo packages still require originals |
| `image_mapping.csv` renames photographs | Use the model's mapping or nearest ancestor, bounded to 16 MiB; scene-relative paths can retain an outer folder prefix |
| Conflicting scenes or filenames | Offer supported photo collections explicitly; keep unresolved matches unbound when declined |

An explicit full physical CSV path can identify shared RGB outside the automatically selected scene. The mapping columns are `colmap_image,raw_path`. Unrelated scene CSVs are ignored. A native source keeps its existing archive/URL owner and is not converted into a camera-JSON import.

Standard COLMAP sidecars named `masks/<registered-name>.png` are treated as validity masks. Other inferred mask roles remain display-only for feature-mask export: select COLMAP + RGB unless an adapter declares their semantics. Package export still checks original image dimensions, orientation and mask validity. Resized native previews cannot silently produce a package with mismatched calibration. See the [COLMAP model specification](https://colmap.github.io/format.html) and [mask convention](https://colmap.github.io/faq.html).

## Original data checks

| Dataset / model | RGB | Masks displayed | Result |
| --- | ---: | ---: | --- |
| [pablovela5620/example-colmap-glomap](https://huggingface.co/datasets/pablovela5620/example-colmap-glomap), `colmap/sparse/0` | 2/2 | — | Native archive load/export; pinned HF URL also loads in both browsers |
| [lishenyu/Plant3D](https://huggingface.co/datasets/lishenyu/Plant3D), `plant_000/dense/sparse` | 2/2 | — | Native model with rigs/frames loads and exports |
| [Wuuu3511/bmvs_sparse_dtu2](https://huggingface.co/datasets/Wuuu3511/bmvs_sparse_dtu2), `colmap_workspace/sparse_native` | 3/3 | 3 | Custom model folder and sibling RGB/singular masks load; RGB package exports |
| Same dataset, `colmap_workspace/sparse_seed` | 3/3 | 3 | Original text model and empty points file load; RGB package exports |
| [alexmkwizu/colmap-testing-dataset](https://huggingface.co/datasets/alexmkwizu/colmap-testing-dataset/tree/511152c3b9cd20ecda698e1ed1559c341ee777ab/kicker), `kicker/dslr_calibration_jpg` | 31/31 | — | Direct calibration URL retains 1 camera definition, 31 poses and 15,897 points; all original photographs load and decode at 6048×4032; model ZIP preserves calibration, names, poses, observations and points |

The October 17 ETH3D follow-up checks sibling paths for 57 calibration records across `alexmkwizu/colmap-testing-dataset`, `Livioni/eth3d_omnivggt`, `onground/robustvggt` and `PeterDAI/eth3d`, using complete pose metadata and pinned inventories. All 2,003 registered names resolve. This is a path check, not a complete browser load claim for those 57 scenes. Kicker additionally passes a browser read and full image decode of all 31 original photographs (407,323,548 bytes). The October 18 streaming exporter produces its complete 414,603,162-byte image ZIP. Independent Python ZIP reads verify every photo's CRC and SHA-256 against the pinned publisher LFS objects. Native parser comparisons preserve camera intrinsics, poses, registered names, observations, point IDs, coordinates, colors, errors and tracks (maximum point-coordinate difference: zero). The 70 native arrangement tests pass in Chromium and Firefox, including original-photo and mask exports for both ETH3D variants. Distorted and undistorted calibration folders remain distinct; an incompatible photo collection is not offered as an automatic fallback. Optional parent-listing failures still leave the requested model usable and retain the photo variant policy from the source URL.

Original source files were not rewritten. Independent PyCOLMAP checks on eight browser exports find zero camera-pose and intrinsic differences; all original RGB hashes, point counts, point IDs and colors match. Existing native point export uses float32 viewer coordinates: maximum coordinate difference in these samples is 3.76e-6 source units. This is not a claim of lossless float64 point export. Undeclared BMVS mask roles were not exported as feature masks.

The full unit suite passes 5,512 tests. The browser matrix has 156 distinct cases. Its initial run exposed the real nested-`images/` regression in both browsers; after fixing it, all 78 relevant export/native cases pass on rerun, with no skips or flaky results. Independent camera-schema projection tests also pass.

## Remaining dataset gaps

These are explicit exceptions, rather than loader pass claims:

- **No points file:** the follow-up adds camera-only native support for these 305 listed pairs, with original pose checks for eight public repositories. This does not certify every file in all 305 models.
- **Missing or renamed photographs:** examples include `boazkg/gs-pool-paslcd`, PlanarGS alignment-only branches, `Dororo99` driving reconstructions and some Nerfstudio dozer mirrors. A listed photo elsewhere does not establish which rendering/calibration variant belongs to the model.
- **Flattened or shared paths:** `Uniiii/eth3d_v2` has registered `dslr_images/...` names alongside flattened photos; `YouLiXiya/nerf` has sparse models separate from shared RGB. The follow-up adds complete-set recovery and explicit collection selection; a mapping remains available for otherwise unresolvable names.
- **Ambiguous variants:** examples include `SiminKou/DyOmni` ERP/CPP images, RGBT RGB/thermal alternatives, synthetic train/test names and repaired versus joint reconstructions. Automatic selection would risk using the wrong picture.
- **Extended native-looking text:** three `travisdriver/phomo-data` representatives add sun direction and photometric fields, including intensity in observations. The exact declared schema is now recognized and normalized for COLMAP geometry export. Source-derived one-view fixtures exercise its PNG previews; complete large-scene qualification remains separate.
- **Unavailable assets:** the checked `Perry233/astrovision-data` model URL returns 404. `travisdriver/astrovision-data` is a separately checked source, not proof that Perry's URL works.
- **Browser CORS:** the checked Apple Neuman and INRIA `tandt_db.zip` URLs lack `Access-Control-Allow-Origin` from both deployed origins. They are excluded from approved online delivery, although bounded server-side range reads work.
- **Large-archive access:** the checked 13.7 GB ZIP mirrors in `ZaY19`, `yuhaiyang123` and `zephyr663/3DGS_datasets` return HTTP 416 for valid tail ranges. Their small prefix ranges work; that does not make the ZIP remotely indexable.

The historical X-Splat revision returned 404; its replacement revision was indexed separately and recorded. One other HF ZIP needed a transport retry; both origins passed on retry. Exact timestamps and URLs are retained in the reports.

Separate image archives, nested archives, unavailable files, raw/EXR/video-only color, custom camera records, gated access and arbitrary unlistable HTTP folders still need source-specific handling. Use an explicit manifest for declared remote model/media paths. Dataset access/licensing is separate from whether its file format is open.
