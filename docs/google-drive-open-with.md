# Google Drive Open with

ColmapView can open a single ZIP or TAR dataset selected in Google Drive. The user signs in explicitly; the existing archive loader downloads that file directly from Google. The launch account is a sign-in hint, never authorization. Existing tokens are discarded on a Drive launch to avoid using another account's session. Invalid or multiple-file launches show an actionable error and do not start another URL or shared-fragment load.

## Production registration

Use project **`colmapview-prod-20261006`**, project number **`425433759789`**, and its existing browser OAuth client. The exact supported origin remains **`https://colmapview.opsiclear.com`**. GitHub and preview hosts offer an explicit handoff and perform no Google authorization or API calls.

**Setup evidence, 2026-10-19:** the production owner account saved both `drive.file` and `drive.install` in Data Access. Google displayed both under non-sensitive scopes and confirmed the save. The Drive UI registration form is prepared; icon upload and submission are separate remaining steps. A Marketplace listing has not been submitted.

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

Declare `drive.file` and `drive.install` in Google Auth Platform → Data Access. Normal loading and publishing request only `drive.file`. The account dialog's separate **Add to Google Drive** action also requests `drive.install` and verifies both grants. Installation never opens Picker, loads an archive or starts publication. Tokens and the launch account hint remain in tab memory; there are no new persistent credentials.

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
