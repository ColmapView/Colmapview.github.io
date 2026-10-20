# Explicit dataset manifests

Use a version 1 manifest to bind one named scene to its exact camera model, poses,
points, photographs, masks and splats. The manifest can live on the Hub while the
large source files stay at their original public URLs. The existing format supports
COLMAP binary/text models, camera-only models and a camera model with an XYZ PLY;
these layouts do not need a new manifest version.

## Camera metadata and explicit companions

For NeRF/Nerfstudio, DTU or other supported camera metadata, a separate JSON document can retain the original metadata URL while selecting a companion cloud:

```json
{
  "format": "colmapview-camera-dataset",
  "version": 1,
  "metadataUrl": "https://data.example/pinned/scene/transforms.json",
  "pointCloud": {
    "url": "https://data.example/pinned/scene/3dgs_output/input.ply",
    "format": "ply",
    "transform": [0, 1, 0, 0, 1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]
  }
}
```

The optional transform is a finite row-major similarity from cloud coordinates into the world already used by the metadata. It changes XYZ only. It does not change camera poses or automatically apply Nerfstudio's `applied_transform` a second time. Omit it when the cloud already uses the metadata's world frame. Mesh faces and Gaussian properties are rejected. A generic PLY has no COLMAP point IDs: existing image feature coordinates are retained, but their old 3D references are disconnected instead of being joined to unrelated vertex numbers.

For a numeric NPZ trajectory shaped `(frames, vertices, 3)`, use `"pointCloud": {"url": ".../trajectory.npz", "format": "npz", "array": "pos", "frame": 0}` and `"frameIndices": [0, 23, 46, 69]` to select the matching views in NeRF metadata. Indices refer to the original metadata array; their order becomes the exported camera order. This is an explicit static frame selection, without mixing times. Only the named float32/float64 C-order array is decoded, with ZIP size/CRC checks. Pickles and object arrays are rejected. NPZ and expanded arrays are bounded to 16 MiB; PLY sources to 64 MiB.

An optional absolute HTTP(S) `tracksUrl` makes an OpenSfM observation sidecar required. Without it, conventional sibling tracks are optional; failures produce a diagnostic while retaining the source geometry. All metadata/media/cloud requests run in the browser and require source CORS access. Native COLMAP manifests above remain unchanged.

## Separate source folders

For a Hub-hosted manifest, set `baseUrl` to its published asset directory and use
absolute, revision-pinned URLs for external source files. This also lets the Hub
host saved settings beside the manifest without modifying an upstream dataset.
The following URLs illustrate the structure; replace them with published assets.

```json
{
  "version": 1,
  "name": "Example scene",
  "baseUrl": "https://colmapview.opsiclear.com/hub/datasets/individual/manifests/example/",
  "viewerStatePath": "colmapview.yaml",
  "files": {
    "cameras": "https://data.example/pinned/scene/sparse_mast3r/cameras.bin",
    "images": "https://data.example/pinned/scene/sparse_mast3r/images.bin",
    "points3D": "https://data.example/pinned/scene/sparse_mast3r/points3D.ply"
  },
  "imagesPath": "https://data.example/pinned/scene/images/",
  "maskNameToPath": {
    "0000.png": "https://data.example/pinned/scene/mask/0000.png"
  },
  "maskRole": "unknown",
  "splats": []
}
```

- `files.images` is the COLMAP pose file. `imagesPath` is the photograph folder;
  registered image names, including subdirectories, are appended to it.
- Use `imageNameToPath` for renamed or scattered photographs. Its keys must be
  exact registered names; its values may be absolute HTTP(S) URLs. Preserve the
  calibration's image choice and resolution. Matching basenames in a peer scene
  do not establish an association.
- Use `maskNameToPath` for exact mask names such as `mask/0000.png`. The default
  `masksPath` convention would instead look for `0000.png.png`. Declare a known
  mask role only with evidence; `unknown` masks cannot be exported as feature masks.
- Put Gaussian assets in `splats`, separately from an ordinary XYZ cloud.
- Omit `files.points3D` for camera-only scenes. A declared points file is required;
  its failure does not silently turn the scene into a camera-only load.

## Untracked XYZ points

An ordinary PLY does not provide COLMAP observation tracks. The default minimum
track length of two can hide its entire cloud. An explicitly referenced
`colmapview.yaml` can include these points:

```yaml
version: 1
point_cloud:
  min_track_length: 0
```

`viewerStatePath` must be a relative path below `baseUrl`. Its document must be
published there; an absolute source URL is not accepted for this field. JSON
published viewer state also supports `config.pointCloud.minTrackLength: 0`.
This zero value is supported in saved settings and share links from 0.17.5.
Release 0.17.4 discards it during saved-settings validation.

Select a companion PLY as `files.points3D` only after checking its coordinate frame
against the cameras. Keep valid native points and their observation IDs intact;
PLY vertex IDs do not establish feature correspondences. A further, independent
point layer alongside a nonempty native reconstruction would need additional
loader/manifest support. A whole-scene saved transform cannot align an unrelated
cloud to unchanged cameras.

For clouds that extend beyond a compact camera trajectory, save an overview in
the published state's `viewState` as well. The automatic camera overview may crop
most of the cloud even after the points become visible. Point-filter warnings are
reported after saved and shared settings apply, so they describe the final filter.

## Generating Hub manifests

Generate manifests offline from the catalog's pinned source listing and explicit
per-scene associations. Do not fetch submitted source URLs in the Hub Worker.
Update an existing curated manifest when one already represents that exact scene;
otherwise generate one for the scene and point its Hub launch link at it.

Before activating a generated manifest:

1. Bind each camera, pose, points and media path to the same immutable source
   revision, or record the explicit cross-repository association. Preserve the
   exact selected model when photos live in a sibling folder.
2. Read the files from the viewer origin and parse the selected representation.
   A listing, CORS header or PLY vertex-count header alone is not a complete load.
3. Check every registered photo mapping for missing or ambiguous targets. Decode
   the photos and masks being claimed as checked, including dimensions. Leave
   unresolved photos unbound and label the camera-only result accurately.
4. Verify finite geometry, cloud/camera alignment, view framing and visible points
   with the manifest's saved settings. Check empty native points and untracked
   PLYs explicitly. Do not infer alignment from filenames or adjacent folders.
5. Export the combined scene to COLMAP and reload it. Verify camera and pose
   counts, point counts, observation references, image/mask paths and dimensions.
   Do not manufacture point tracks to satisfy a filter or an export check.
6. Derive Hub statistics and availability from the selected launch representation.
   Keep the original native count and companion-cloud count distinct in evidence;
   an empty native model does not become a nonempty native model merely because
   an associated PLY exists. Keep load, photo and export evidence separate.

Store generated assets below the existing `/hub/datasets/individual/` static
prefix and bind them to the catalog generation so manifests, settings, launch
links and displayed statistics update together. Activation should require the
checks above, rather than upgrading every listed companion automatically.

The October 18 implementation qualifies 16 published scenes through this workflow:
14 BMVS variants and two blur-slam variants. All imported in Chromium, rendered
their selected point sets and exported complete COLMAP + original-photo packages.
Independent PyCOLMAP reads matched calibration and poses; complete binary checks
matched every point coordinate and RGB value, with unchanged original photo hashes.
The seven BMVS `sparse_mast3r` variants use explicit sibling photo/mask mappings.
Both blur-slam variants have byte-identical cameras, poses and PLY clouds, establishing
the explicit peer-folder photo association for the second variant.

The checked manifests cover 496 posed photo instances, 13,502,936 points and 42
displayable masks. Mask semantics remain unverified, so they are not qualified as
COLMAP feature masks. A complete catalog comparison preserved all native evidence
and left the other 5,221 scene records unchanged. The Hub's `data/scene-manifests.json`
contains the revision-bound selections, file hashes, overview settings, viewer
commit and export receipts used to generate each immutable manifest.
