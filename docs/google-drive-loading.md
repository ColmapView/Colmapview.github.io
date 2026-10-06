# Google Drive dataset loading

Use **Load URL** with a public Drive archive sharing link such as `https://drive.google.com/file/d/FILE_ID/view`. For a private archive, sign in through the **Google Drive account** icon and select the file in **Google Picker**. Drive loading supports **ZIP and TAR**, including compressed TAR, lazy image extraction, and embedded `colmapview.yaml` settings. Accepted filename extensions, ignoring case, are `.zip`, `.tar`, `.tar.gz`, `.tgz`, `.tar.bz2`, `.tbz2`, `.tbz`, `.tar.xz`, and `.txz`. Drive folders, Google documents, individual images, and `.7z` filenames are not accepted. Local files and URLs on other hosts retain their existing supported archive formats, including 7z.

Hosted Google Drive access is available only at **`https://colmapview.opsiclear.com/`** when its production profile is configured. The independent GitHub viewer and Pages previews offer **Use Google Drive**, an explicit handoff to that host, and do not load Google SDKs or make Drive API requests. Following a handoff does not authorize a private file. See [dual-host setup and tests](dual-hosting.md).

Public archives shared with **Anyone with the link** need no sign-in or Google download confirmation. Private archives require Google sign-in and the `drive.file` permission; use **Choose archive from Drive** in the Drive account control to select the file in Google Picker. This authorizes the selected file for ColmapView; pasting an arbitrary private URL alone does not grant access. A pasted private URL can work after that file was selected for the app or created by it, provided the connected account can download it. Public requests stay anonymous even when an account is connected; inaccessible links can retry using the current per-file session. If access is still denied, explicitly select the archive through Picker. Pasting a URL does not automatically open Picker.

The two account icons sit beside **Upload configuration** on desktop and are also available on the touch loading panel. The Hugging Face icon supports [private dataset loading](hugging-face-loading.md). Public Hugging Face URLs continue to load without signing in.

To save the current reconstruction as a new Drive ZIP, use the toolbar's **Publish to Google Drive** icon. See [Drive publishing](google-drive-publishing.md) for sharing and upload recovery.

## Transfer behavior

Drive downloads go directly from Google's API to the browser, with no relay. The complete archive downloads before parsing; a 1.65 GB TAR still transfers 1.65 GB. Files larger than the existing 2 GiB archive limit are rejected using metadata before download. Progress uses Drive's declared size even when Content-Length is hidden. Cancel loading aborts the active request and parser, and incomplete downloads are rejected. Selective TAR range extraction is not implemented.

Google access tokens exist only in the current tab's memory. Reloading, disconnecting, or expiry removes the local session. The browser supplies the token to Google's Picker and uses it in Authorization headers for fixed Drive API endpoints. Shared viewer links and dataset source information retain the Drive sharing URL, without API keys or access tokens. A private viewer link does not authorize its recipient: the recipient must sign in with an eligible account and authorize that archive for the app through Picker unless it is already available to the app. Google may ask for consent again when a session is renewed; the app does not refresh tokens automatically.

## Public access configuration

1. Enable **Google Drive API** in the appropriate Google Cloud project. Also enable **Google Picker API** for private file selection.
2. Create an API key restricted to **Google Drive API** and **Google Picker API**, and to the viewer's website referrers. Include **`https://docs.google.com/*`** because the Picker iframe sends requests from that origin. Production and development use separate projects and keys. Allow `https://colmapview.opsiclear.com` and `https://colmapview.opsiclear.com/*` in production, or `http://localhost:5173` and `http://localhost:5173/*` in the separate development project. See [Google's web Picker sample](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample).
3. Set `VITE_GOOGLE_DRIVE_API_KEY` in ignored `.env.local` for local builds.
4. Set GitHub Actions repository secret `CUSTOM_GOOGLE_DRIVE_API_KEY` from the production project. The custom profile maps it to `VITE_GOOGLE_DRIVE_API_KEY` and explicitly enables only the custom origin. GitHub and preview profiles clear this value and set `VITE_GOOGLE_DRIVE_ENABLED=false`. The old Testing `GOOGLE_DRIVE_API_KEY` secret is not used by production profiles.

The Vite key is necessarily visible to browser users. Restrict its APIs and website origins, and manage the project's shared download quota. Never put a service account key, OAuth client secret, or user token in a Vite environment variable.

## Private access configuration

1. Use separate Google Cloud projects for development/testing and production. Configure a Google OAuth consent app and a **Web application** OAuth client in each appropriate project; enable both Drive API and Picker API there.
2. Register `https://colmapview.opsiclear.com` for production or `http://localhost:5173` in the separate testing project. Google's token model uses a popup and needs no application redirect endpoint or client secret.
3. Declare only `https://www.googleapis.com/auth/drive.file` in Data Access. It permits access to files selected through Picker or created by ColmapView. The app does not request `drive.readonly` or full-Drive access.
4. Set local `VITE_GOOGLE_DRIVE_CLIENT_ID` for development and GitHub Actions repository variable `CUSTOM_GOOGLE_DRIVE_CLIENT_ID` for the separate production web OAuth client.
5. Set local `VITE_GOOGLE_DRIVE_APP_ID` and production repository variable `CUSTOM_GOOGLE_DRIVE_APP_ID` to the appropriate project's **numeric project number**, not its project ID or OAuth client ID. Picker needs this app ID to associate the selected file with the same project as the token and API key.
6. In Testing, add eligible Google accounts as test users. Test sign-in, Picker selection, cancellation, and private ZIP/TAR loading. The existing mixed-origin Testing client is not established as production-ready.
7. Before general public availability, complete the production project, DNS Domain-property verification for `opsiclear.com`, homepage/privacy/terms, branding, and audience setup and any review Google requires. Google's current domain guide requires DNS ownership; the older prepared GitHub URL-prefix HTML file is insufficient. Google's scope reference classifies `drive.file` as non-sensitive, so this sole scope does not require restricted-scope verification or its security assessment. This does not establish Google approval or remove other production requirements.

Example public browser configuration for local development:

```dotenv
VITE_GOOGLE_DRIVE_API_KEY=your-referrer-restricted-api-key
VITE_GOOGLE_DRIVE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
VITE_GOOGLE_DRIVE_APP_ID=your-numeric-project-number
```

Local development on a loopback origin retains configuration-based access when the flag is omitted; explicit `false` disables it. Hosted production requires strict `VITE_GOOGLE_DRIVE_ENABLED=true` and the exact `VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN=https://colmapview.opsiclear.com`, set by the custom build profile. Malformed flags/origins and every other hosted origin disable Drive.

Picker selects one file. Its view accepts ZIP, TAR, gzip, bzip2, and xz MIME types, ZIP/compressed-TAR aliases, and `application/octet-stream` for generically labeled archives. The selected filename must have one of the accepted extensions listed above. The loader validates the file metadata and checks the ZIP signature for `.zip` files; TAR and compressed TAR use the existing libarchive parser, preserving V7, USTAR, and PAX support. The app uses the validated file ID, name, and optional resource key from Picker rather than trusting a provider-supplied download URL. The Drive publisher still creates ZIP output only.

Local Vite development uses `Cross-Origin-Opener-Policy: same-origin-allow-popups` when the Google client ID is configured, so Google's popup can return its result. This disables optional SharedArrayBuffer acceleration, matching the normal GitHub Pages runtime. Other hosts must also allow communication with the OAuth popup rather than forcing `same-origin` isolation.

If private sign-in or Picker is not configured, the account dialog explains that limitation and keeps configured public URL loading available. Permission denial, Picker cancellation, expired sessions, incorrect origin/API configuration, disabled downloads, and download quotas produce actionable errors. The owner must accept Google's required User Data Policy during initial OAuth setup. Disconnect forgets local credentials; revoke the grant separately through Google Account connections.

References: [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Google Picker setup](https://developers.google.com/workspace/drive/picker/guides/overview), [Google's browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Drive resource keys](https://developers.google.com/workspace/drive/api/guides/resource-keys).
