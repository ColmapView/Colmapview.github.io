# Google Drive Open with

ColmapView opens a single ZIP or TAR dataset selected in Google Drive. It preserves that archive while you sign in directly with Google, then loads it without a second Picker selection. Cancellation leaves an explicit retry. The launch account ID is an untrusted sign-in hint; Google enforces access to the selected file. Existing in-memory tokens are cleared before launch sign-in. Invalid or multiple-file launches do not start a conflicting URL or shared-fragment load. See [browser connections](account-sessions.md).

## Production registration

Use project **`colmapview-prod-20261006`**, project number **`425433759789`**, and its existing browser OAuth client. The exact supported origin remains **`https://colmapview.opsiclear.com`**. GitHub and preview hosts offer an explicit handoff and perform no Google authorization or API calls.

**Setup evidence, 2026-10-19:** the production owner account saved both `drive.file` and `drive.install` in Data Access. Google displayed both under non-sensitive scopes, confirmed the save, and continued to report verified branding with no scope verification required. The Drive UI form was submitted successfully with the configuration below and all five app icons. Private Drive Open with, account matching, reload/separate-tab restoration and renewal passed in Chrome against the released custom handler; see the [dated live checks](account-sessions.md#live-checks--2026-10-19). A Marketplace listing has not been submitted.

**Browser-only validation, 2026-10-20:** after server credential retirement, a private save and an actual Drive Open with launch passed with viewer 0.19.5. Sign-in loaded the selected archive without Picker; see the [current-flow receipt](account-sessions.md#live-checks--2026-10-20).

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

Declare `drive.file` and `drive.install` in Google Auth Platform → Data Access. Normal loading and publication request only `drive.file`; **Add to Google Drive** also requests `drive.install`. Installation starts no file load or publication. Browser tokens stay in tab memory. This flow needs no server callback, client secret or Google `openid` scope.

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
