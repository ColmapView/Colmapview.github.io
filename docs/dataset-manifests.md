# Explicit dataset manifests

Use a version 1 manifest to bind one named scene to its exact camera model, poses,
points, photographs, masks and splats. The manifest can live on the Hub while the
large source files stay at their original public URLs. The existing format supports
COLMAP binary/text models, camera-only models and a camera model with an XYZ PLY;
these layouts do not need a new manifest version.

## Video frame numbers (version 5)

Version 5 adds a zero-based `frameIndex` selector. Several registered views can
refer to different frames of the same recording:

```json
{
  "version": 5,
  "baseUrl": "https://data.example/pinned/scene/",
  "files": { "cameras": "cameras.bin", "images": "images.bin" },
  "videoImages": {
    "cameraA/view01.jpg": { "url": "cameraA.mp4", "bytes": 100000000, "frameIndex": 240 },
    "cameraA/view02.jpg": { "url": "cameraA.mp4", "bytes": 100000000, "frameIndex": 255 }
  },
  "splats": []
}
```

Open the manifest URL with **Load URL**, or use the Hub's **Open in viewer** link.
The manifest supplies the exact recording and frame association for each view.

`frameIndex: 0` means the first displayed frame in the source's primary video
track; 240 means the 241st. The order is presentation order, including variable
frame timing and B-frame reordering. Decode preroll is excluded; a frame spanning
time zero is selected at zero. Frames missing from the source are not counted.
A publisher frame ID, extracted JPEG counter or COLMAP image ID is a different
identifier and needs an explicit association. The native COLMAP rig file
`files.frames` is unrelated to video selection.

Each v5 binding must have exactly one of `frameIndex` or `timestamp`. Timestamp
bindings retain v4 behavior: seconds in the source presentation clock, selecting
the last frame whose presentation start is at or before that time. `playbackRate`
changes only playback time. Frame indices resolve against the original source
before retiming or compatibility conversion; seeking never changes the image used
by geometry, metrics, exports or publishing. An explicit video binding takes
precedence for its registered name. Unmapped names retain the existing declared
photo sources; a failed binding never substitutes another frame.

Indices are read lazily from sample metadata, without decoding all frames or
caching full recordings. Images sharing a recording share one cancellable index.
Reads have a 16 MiB metadata budget, at most 250,000 samples, and an 8 MiB scene
index cache. Duplicate presentation timestamps or invalid sample durations are
reported as ambiguous rather than guessed. Existing frame-decoding budgets below
still apply. Scene replacement cancels work and releases its indices.

From the Hub repository root, its offline authoring tool accepts a model plus
deduplicated `videos` and `images` tables and emits explicit v5 bindings:

```sh
node scripts/audit/compile-video-frame-manifest.mjs --input mapping.json --output scene.manifest.json --viewer-root ../colmap-webview
```

In that authoring document, `model` is the base manifest, `videos` contains
`{ "id": "cameraA", "url": "cameraA.mp4", "bytes": 100000000 }`, and `images`
contains `{ "name": "cameraA/view01.jpg", "video": "cameraA", "frameIndex": 240 }`.
Compilation validates structure, not source pixels. Verify the exact native names,
source dimensions and frame correspondence independently before publication.
Versions 1–4 and their existing selectors remain unchanged; older viewers reject
v5 rather than silently treating frame numbers as times.

## Camera video frames (version 4)

Version 4 adds `videoImages`: exact registered image names mapped to presentation
timestamps in MP4 or WebM videos. Existing versions 1–3 are unchanged. A video
binding may accompany the same version 2 media archives and version 3 selected
geometry. `skipImages: true` conflicts with video bindings and is rejected.

```json
{
  "version": 4,
  "baseUrl": "https://data.example/pinned/scene/",
  "files": { "cameras": "colmap/cameras.bin", "images": "colmap/images.bin" },
  "videoImages": {
    "0028.png": { "url": "camera_0028.mp4", "bytes": 52031614, "timestamp": 240, "playbackRate": 30 }
  },
  "splats": []
}
```

`timestamp` is presentation time in seconds, not a source frame ID. Use the
publisher's ordered frame-ID list when it has dropped frames: DanceNet3D frame
`0000242` in `s6/BiancaGolden_Ocho` is video sample 240.

## Video loading, playback and export

These rules apply to both v4 timestamp bindings and v5 frame-index or timestamp
bindings. Version 5 requires viewer 0.23.0 or newer.

The URL can be absolute or
relative to `baseUrl`; credentials and fragments are rejected. The declared byte
size must match validated HTTP range responses. Hosts need CORS and exposed
`Content-Range` headers. Video sources never imply an `images/` or `masks/` folder.

Optional `playbackRate` scales only the playback clock (0.0625–120, default 1).
Declare it from publisher evidence, never by guessing from the filename or frame
count. DanceNet3D declares 30 fps capture but encodes each sample at 1 fps, so its
binding uses 30: source timestamp 240 becomes playback time 8 seconds. The player
remuxes the cached encoded pictures with scaled timestamps, without decoding or
re-encoding pixels. Matching stills, geometry and exports keep source time 240.

Frames are requested asynchronously through the existing gallery, camera-plane,
detail and export image access. Concurrent requests for one registered image
coalesce. A selected camera takes priority over queued background work. The
64 MiB frame cache evicts older PNG files; moving away cancels unneeded work.
Each read releases its demuxer, compressed cache and decoder, and replacing or
clearing the scene aborts pending reads and clears retained frames.

Native WebCodecs decoding is preferred. An on-demand, same-origin single-thread
FFmpeg.wasm Worker handles codecs such as H.265 when native decoding is unavailable;
its core is downloaded only when needed (about 10 MiB compressed, 31 MiB decoded).
It receives a bounded
encoded keyframe group rather than a URL and terminates after the frame is read.
All decoded frames are limited to 16 million pixels. Software frame extraction
limits each keyframe group to 512 packets and 64 MiB of encoded data. Errors leave
the model usable and report that frame's failure.

Image export includes the fixed matched frame for each registered view, its
calibration and pose, and the reconstruction's COLMAP points when available.
Moving-camera poses can select different frames from the same recording.
Synchronized multi-camera scenes such as DanceNet3D retain one temporal snapshot.
Playing or seeking leaves geometry, metrics and saved image selections unchanged.
Decoded frames stay lossless PNGs in the frame/metric cache. Dataset packages and
uploads preserve registered image names: derived PNG-named files stay PNG;
JPEG-named files are encoded once at JPEG quality 0.95. Other derived filename
formats need an explicit supported export format. Original uploaded photographs
are copied unchanged. Derived frames do not recover the publisher's original JPEG
bytes; source compression artifacts remain, and optional color LUTs are not applied.

### Individual camera playback

Open a camera's image details and choose **Video**. The selected recording is
downloaded once, with progress and exact byte-size validation, before playback
starts at its matched source frame. Its image placement and footer height stay
unchanged. A translucent play/pause, seek and return-to-matched-frame bar floats
over the image's bottom edge, using the viewer's existing icon and slider styles.
Time appears on hover and through accessible slider text. The matched still
stays visible during preparation.

The browser plays the cached file directly. Pause, resume and seeking reuse that
file without new source requests or frame-by-frame software extraction. If the
browser cannot play the source codec, one on-demand FFmpeg worker converts the
selected clip to a cached H.264 MP4 with a maximum display edge of 1280 pixels.
The worker terminates before playback begins. It receives bytes, never source
URLs or credentials. Cached input and converted output each have a 256 MiB limit;
decoder and conversion working memory are additional. Required original/metric
reads can interrupt compatibility conversion and remain independent of ordinary
cached playback. Retry restarts interrupted preparation.

A source larger than 256 MiB can still provide matched stills through bounded
ranges. Its disabled Video control explains the playback limit. No whole-recording
download starts, and the cache limits stay unchanged.

Video mode stays active when Previous/Next selects another camera with a recording.
Its cache holds the current recording and, when they fit, the next and previous
recordings. Full downloads run one at a time; selecting a downloading neighbor
reuses its request, and a different selection interrupts background work. Neighbor
prefetch downloads bytes without decoding or transcoding. Successfully prepared
playback copies are retained too, so returning to a nearby camera avoids repeated
conversion. Identical recording URLs, sizes, dimensions and rates share one entry
even when their matched timestamps differ.

The window reserves room for source and prepared copies within 512 MiB total;
each file still has a 256 MiB limit. Large recordings use temporary browser storage
when available, otherwise bounded Blobs in memory. Entries outside the window are
evicted after their player releases them. Returning to the matched still, closing
the detail or disposing the scene cancels work and clears the window. A hidden tab
pauses playback without automatically resuming and pauses neighbor downloads while
retaining completed entries. No videos go to IndexedDB, Cache Storage or the Hub.
Browser HTTP caching remains browser-managed; decoder/conversion working memory
is additional to the file cache budget.

Gallery thumbnails, camera planes and 3D geometry stay at the registered
reconstruction time. Static masks, keypoints and match lines
are hidden during video playback. This player shows one muted camera video;
it does not synchronize cameras or animate the reconstruction.

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

## Camera metadata with Gaussian companions (version 2)

Viewer 0.25.0 adds version 2 of `colmapview-camera-dataset`. It retains the original
camera metadata and optional XYZ cloud while explicitly listing Gaussian sources:

```json
{
  "format": "colmapview-camera-dataset",
  "version": 2,
  "metadataUrl": "https://data.example/pinned/mic/transforms_train.json",
  "splats": ["https://data.example/pinned/trained/mic.ply"],
  "viewerStatePath": "mic.state.json"
}
```

`splats` contains 1–1,024 distinct, absolute HTTP(S) URLs without embedded
credentials or fragments. Gaussian sources are classified and listed using the
existing lazy source selector and desktop/touch transfer budgets. They never
become sparse COLMAP points. Multiple alternatives remain separate sources.

The optional `viewerStatePath` is a required saved-state sidecar when declared,
relative to the camera manifest's own URL. Its `config.splat.transform` aligns the
Gaussian coordinates with the unchanged camera world. A missing or invalid
sidecar prevents committing a misaligned scene. The sidecar may select a source;
publishers should leave oversized sources lazy instead of forcing a download.
Metrics, export and sharing keep the camera manifest as the scene URL.
Version 1 retains its strict contract; older viewers reject version 2.

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

## Selected photograph frames in TAR archives

Version 2 manifests can attach a ZIP or plain TAR through `mediaArchives`. A plain
TAR can set `indexBytes` to the end of a complete, 512-byte-aligned prefix, such as
the first frame of a multi-frame capture. Only members in that prefix are indexed
and made available; their image bodies remain lazy reads.

```json
{
  "version": 2,
  "baseUrl": "https://data.example/pinned/scene/",
  "files": { "cameras": "cameras.bin", "images": "images.bin" },
  "mediaArchives": [{
    "url": "https://data.example/pinned/capture.tar",
    "bytes": 25348495360,
    "indexBytes": 100589056,
    "stripPrefix": "capture/frame000000/images",
    "mountPath": "images",
    "role": "images"
  }]
}
```

Replace the illustrated size, boundary and paths with checked source values. The
prefix must contain complete TAR members and their padding; a boundary cutting
through a member is rejected. The original archive's total size and validators
are still checked on HTTP range responses. This option does not alter camera
poses, merge temporal frames or assert that photos in other frames are registered.
ZIP archives require their normal complete central directory and cannot use this
prefix option. Omit `indexBytes` to index an ordinary archive in full.

## Selected geometry inside archives

Viewer 0.19.10 adds version 3 manifests with `geometryFiles`. Versions 1 (loose
files) and 2 (companion media archives) keep their existing behavior. Each entry
selects one required member, rather than merging an animated sequence into a
static reconstruction. A version 3 manifest can also include `mediaArchives`.

```json
{
  "version": 3,
  "baseUrl": "https://data.example/pinned/scene/",
  "files": { "cameras": "cameras.bin", "images": "images.bin" },
  "skipImages": true,
  "splats": [],
  "geometryFiles": [{
    "url": "https://data.example/pinned/scene/frames.zip",
    "bytes": 4294967297,
    "format": "zip",
    "role": "points3D",
    "member": {
      "path": "0000001.ply",
      "bytes": 4000000,
      "sha256": "<64 lowercase hexadecimal digits from the complete member>"
    }
  }]
}
```

The values illustrate the schema; replace sizes and hashes with source receipts.
ZIP/ZIP64 uses the central directory and bounded HTTP range reads. `tar.zst`
requires a `prefix` object with `bytes` and `sha256`: a checked compressed prefix
that decodes the complete first regular TAR member. Later TAR members require a
different delivery format. Prefixes are bounded to 16 MiB, extracted members to
64 MiB, Zstandard windows to 32 MiB, and leading TAR metadata to 1 MiB. The source
must expose accurate 206/Content-Range responses and permit browser CORS reads.
The archive's declared total size is checked; it is not a claim that the browser
downloads or hashes the entire archive. The extracted member's size and SHA-256
are always checked before the new scene is committed. Failures retain the prior
scene instead of silently omitting declared geometry.

Use `points3D` only for an ordinary XYZ PLY already in the camera world. Auxiliary
PLY list properties, such as per-vertex visibility indices, are skipped and do
not create COLMAP observation tracks. Use `splat` for Gaussian PLY/SPZ/SOG; it
remains a separate render layer and does not increase the COLMAP sparse-point
count. A saved `config.splat.transform` may align this layer only when supported
by a pinned publisher declaration or independent camera proof. Do not transform
the unchanged camera model to fit it. Each role can appear once and cannot
conflict with a loose points or splat selection.

Label the selected frame in the scene and retain the publisher's frame/camera
manifest as evidence. `skipImages: true` disables guessed photograph requests;
an explicitly bound mask remains available even without RGB. Add version 4 video
bindings for matching camera frames. Sequence playback and unselected archive
masks remain separate capabilities.

## Generating Hub manifests

Generate manifests offline from the catalog's pinned source listing and explicit
per-scene associations. Do not fetch submitted source URLs in the Hub Worker.
Generate a new immutable manifest when a scene selection changes and point its Hub
launch link at it. Retain old manifest bodies so previously shared URLs still work.

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
