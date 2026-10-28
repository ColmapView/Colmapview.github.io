# Manifest access requirements

A manifest binds a scene to exact resources. Access metadata describes permissions
a reader may need; the provider remains the authority. Access is separate from
license, photo availability, compatibility and Hub publication permission.

## Contract

Native COLMAP manifests, versions 1–5, accept an optional `access` array:

```json
"access": [
  { "provider": "huggingface", "repository": "owner/dataset", "requirement": "gated" }
]
```

| Field | Meaning |
| --- | --- |
| `provider` | Currently only `huggingface`; other providers need a future explicit contract. |
| `repository` | Exact, case-sensitive dataset ID `owner/dataset`, without URL, revision or path. Model repositories are not supported. |
| `requirement` | `gated`: terms acceptance or publisher approval may be needed. `private`: an authorized account is required. |

Each declaration applies only to reads from that exact repository. Use multiple
declarations when geometry and media come from different repositories. Resource
URLs still determine paths and revisions; hints never rewrite them.

Omit `access` for unknown requirements or expected anonymous access. Omission is
**not** proof of public access. Arrays contain 1–16 unique repository IDs, each at
most 193 characters. Components start with a letter or digit and contain letters,
digits, dots, underscores or hyphens. Declarations reject unknown fields, including
tokens, secrets, request headers and custom login URLs.

This optional addition does not change resource interpretation and needs no new
manifest version. Older viewers ignore it and retain provider-error handling.
Video and archive features retain their existing version requirements. The
separate `colmapview-camera-dataset` format does not accept this field yet; its
provider-denial login handling still works.

## Viewer behavior

1. Validate, then read through the existing provider-aware transport. Hints alone
   never open login popups or block successful anonymous reads.
2. On a matching 401/403 denial, explain the requirement and offer the existing
   Hugging Face connection dialog. Preserve the provider's distinction between an
   expired connection and denied gated access.
3. Sign in, accept terms or request access at Hugging Face if needed, then choose
   **Retry loading**. Failed required model reads preserve the current scene.

Cancellation remains cancellation. Missing files, network errors and unrelated
repositories are not reclassified using hints. Bare URLs and undeclared gates
retain provider-based detection. A stale hint cannot block a successful read.

Hints explain manifest-loader reads for models, selected geometry, settings and
companion archives. Lazy photos and videos retain the existing provider-aware
transport and denial detection. A successful model read does not establish access
to every medium. An access declaration does not discover photo directories or
supply missing media mappings; declare checked image paths separately.

Credentials stay in tab memory and go directly to recognized provider endpoints,
never to the Hub Worker. Never put credentials in any manifest field or URL.
This contract provides no proxy or way around publisher permissions.

## Hub publication

The curated Hub derives `requirement: gated` from reviewed source access metadata
and emits pinned native launch manifests. Cards show **Gated · HF login required**
with **Login required** placeholders instead of restricted preview pixels. Gate
status does not assert that photos or points are absent.

The operator-only `gatedPublicListing` flag permits publicly listed gated sources
in the curated catalog. A manifest declaration cannot grant that permission.
Private sources remain excluded. User **Share on Hub** publication still requires
server verification of anonymous public access; it never trusts a manifest hint
as proof. The Worker does not read restricted source bytes or store credentials.

## Authoring and maintenance

Start with [the gated-scene template](examples/gated-scene.manifest.json). Replace
the placeholder repository and pinned revision consistently. List only existing
files; retain camera calibration, registered names and selected geometry frames.
See [the manifest standard](dataset-manifests.md) for photo/mask paths and exact
video-frame bindings. No photo mapping or source-byte check is implied by a hint.

When permissions change, update the source review and generate new immutable
manifest assets. Retain old assets and stable short-link identities. Regression
checks cover schema rejection, stale hints, scoped denials, expiry, cancellation,
and the separate Hub publication boundary.
