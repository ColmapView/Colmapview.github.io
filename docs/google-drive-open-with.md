# Google Drive Open with

ColmapView opens a single ZIP or TAR dataset selected in Google Drive. Where [remembered connections](account-sessions.md) are enabled, it restores the matching verified Google account and loads directly. Otherwise it completes one authorization and returns to the selected archive. Cancellation offers an explicit retry. The launch account is an untrusted hint, never authorization. Existing in-memory tokens are cleared before matching the account. Invalid or multiple-file launches do not start another URL or shared-fragment load.

## Production registration

Use project **`colmapview-prod-20261006`**, project number **`425433759789`**, and its existing browser OAuth client. The exact supported origin remains **`https://colmapview.opsiclear.com`**. GitHub and preview hosts offer an explicit handoff and perform no Google authorization or API calls.

**Setup evidence, 2026-10-19:** the production owner account saved both `drive.file` and `drive.install` in Data Access. Google displayed both under non-sensitive scopes, confirmed the save, and continued to report verified branding with no scope verification required. The Drive UI form was submitted successfully with the configuration below and all five app icons. A Marketplace listing has not been submitted. Live installation and launch checks must be recorded against the released handler separately.

In Google Drive API → Drive UI Integration, configure:

| Field | Value |
| --- | --- |
| Application name | ColmapView |
| Short description | View COLMAP reconstructions from ZIP and TAR archives in your browser. |
| Open URL | `https://colmapview.opsiclear.com/?drive=open` |
| Application icons | Existing favicon artwork extracted to `docs/assets/drive-icon-{256,128,64,32,16}.png` |
| Default MIME types/extensions | Empty; COLMAP archives use common container formats |
| Secondary MIME types | `application/zip`, `application/x-zip-compressed`, `application/x-tar`, `application/gzip`, `application/x-gzip`, `application/x-bzip2`, `application/x-xz` (separate entries) |
| Secondary extensions | `zip`, `tar`, `tar.gz`, `tgz`, `tar.bz2`, `tbz2`, `tbz`, `tar.xz`, `txz` (separate entries, no leading dots) |
| Mobile browser / shared drives | Enabled |
| Automatic OAuth consent / create / import / multiple files | Disabled |

Declare `drive.file` and `drive.install` in Google Auth Platform → Data Access. The remembered flow also uses `openid` to verify the account identifier without requesting email or profile. Normal loading and publication request `drive.file`; only **Add to Google Drive** adds `drive.install`. Installation starts no file load or publication. [Session service setup](account-sessions.md) documents the confidential callback, encrypted credential retention and rollback. Browser-only fallback tokens remain in tab memory.

Google appends a URL-encoded `state` object with `action: "open"`, one file ID, optional resource keys and an optional account ID. The parser bounds and validates that input, reconstructs only a fixed Google Drive file URL, and removes raw state and the account hint from the address bar. A resource key is sent in the existing `X-Goog-Drive-Resource-Keys` header. Download permissions still apply.

## Public listing draft

Drive UI registration and OAuth branding verification do not publish a Google Workspace Marketplace listing. A public listing enables discovery through **Connect more apps** and has its own Google review. Use the same project and scopes; do not create another client or request broad Drive access.

- Name: **ColmapView**
- Summary: **Explore COLMAP reconstructions from Google Drive in your browser.**
- Description: **Open a dataset ZIP or TAR from Drive to inspect its cameras, sparse points and images in an interactive 3D viewer. Processing and rendering run in your browser. ColmapView accesses only files you select, open with the app or create through its optional publishing tools. Source archives remain unchanged.**
- Homepage: `https://colmapview.opsiclear.com/about`
- Privacy: `https://colmapview.opsiclear.com/privacy`
- Terms: `https://colmapview.opsiclear.com/terms`
- Support: `info@opsiclear.com`
- Category: Productivity / visualization, using the closest category available in Google's current form.
- Screenshots: use a disposable synthetic dataset and the actual released UI, with no account details or private data.

## Verification

Focused unit tests cover malformed and oversized launches, duplicate parameters, multiple files, canonical file/resource-key handling, fixed-host handoff, token replacement, account hints, installation-only permissions and canceled authorization. Compiled-artifact browser tests exercise real app startup and native ZIP decoding with mocked Google responses, verify private-file authorization and resource-key headers, and assert that other hosts make no Google requests.

For the live check, install using a test account, right-click one supported archive in Drive and choose ColmapView. Confirm the selected scene renders, the original is unchanged, and raw launch state/account identifiers are absent from the address bar. Repeat with a private archive and cancel sign-in once. Record registration, consent and listing status separately; an automated mock is not a real Google consent or Marketplace approval.

References: [Drive UI configuration](https://developers.google.com/workspace/drive/api/guides/enable-sdk), [Open with launch state](https://developers.google.com/workspace/drive/api/guides/integrate-open), [scope classifications](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Marketplace publication](https://developers.google.com/workspace/drive/api/guides/publish).
