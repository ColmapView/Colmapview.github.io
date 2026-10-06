# Publish datasets to Google Drive

Load a COLMAP reconstruction with its original images, then click the **Google Drive** icon in the viewer toolbar's Capture group.

1. **Sign in** with Google and allow ColmapView to create and manage the files it creates in Drive.
2. Choose a ZIP file name. Files are saved privately in **My Drive** by default.
3. Optionally select **Anyone with the link can view** to publish a shared dataset. ColmapView enables reader access after verifying the upload. An organization's sharing policy can prevent this step.
4. Click **Save private dataset** or **Publish shared dataset**. After completion, copy the viewer link or open the file in Drive.

Public viewer links to supported Drive archives need no sign-in when the viewer's Drive API key is configured. For a private archive, use the loading panel's Drive account control to sign in and **Choose archive from Drive** through Google Picker. The recipient must already have permission to download it; a viewer URL alone does not grant access. Loading supports ZIP and TAR, including compressed TAR; publication creates ZIP output only. Loading and publishing keep separate local sessions, both requesting only `drive.file`.

## Dataset contents

The ZIP contains the current COLMAP reconstruction in binary format, original images, available masks, the active splat, and embedded `colmapview.yaml` settings. Pending reconstruction transforms are applied to exported COLMAP data, with the splat transform and current viewer settings saved for reopening. Apply pending image deletions before publishing.

Publication copies the active splat, rather than every catalogued splat. Originals from local files, archives, and remote URLs are supported. Private Hugging Face source assets require the existing repository read connection; their revision is pinned before copying. The source repository and its visibility are unchanged.

The complete ZIP must fit the viewer's **2 GiB** archive limit. Individual non-splat files retain the existing **128 MiB** publication limit. ZIP entries are stored without recompressing images or splats. Packing uses browser Blob parts and streams one entry at a time; the finished archive is retained in this tab while uploading or retrying.

## Progress and recovery

Keep the browser tab open. Closing the dialog leaves publication running; reopen it with the Drive toolbar icon. Closing or reloading the tab loses its upload state and authentication.

Uploads go directly to Google's API using resumable chunks. Retry checks the server's acknowledged position and the file's size and checksum. A pre-generated file ID and publication marker bind retries to the same file. Reconnect the same Google account if sign-in expires. Changing the reconstruction cancels the current publication and requires a new one.

**Cancel upload** stops transfers. A completed file or sharing change may remain in Drive, so review its Drive link before starting another publication. ColmapView does not automatically delete files. Every new publication creates a new file; existing Drive datasets are not overwritten.

The recovery dialog shows a Drive file link after Google confirms that the file exists. If the upload failed before that confirmation, use **Check upload and retry** to reconcile its status.

## Deployment configuration

Use the separate development or production Google Cloud project and web OAuth client described in [Drive loading setup](google-drive-loading.md). Hosted Drive publication is enabled only at `https://colmapview.opsiclear.com`; GitHub and Pages previews offer an explicit link there. Enable **Google Drive API**, register the exact custom JavaScript origin, and configure the production `CUSTOM_GOOGLE_DRIVE_CLIENT_ID` repository variable. Private archive reopening also needs **Google Picker API**, `CUSTOM_GOOGLE_DRIVE_APP_ID` (the same project's numeric number), and `CUSTOM_GOOGLE_DRIVE_API_KEY`. The custom build maps these to their `VITE_` values and explicitly enables Drive only at that origin. No separate publication flag, backend, relay, or OAuth client secret is required. Local development uses the existing `VITE_` settings. See [dual-host deployment](dual-hosting.md).

Declare only `https://www.googleapis.com/auth/drive.file` in the OAuth consent app's **Data Access** settings. Publishing requests this scope when the user clicks Sign in. It grants access to app-created or user-selected files; it does not request full Drive write access. Loading uses the same per-file scope with Google Picker rather than broad read access. Google's scope reference classifies `drive.file` as non-sensitive, avoiding restricted-scope verification for this integration; production configuration and any required branding review remain pending.

Add eligible accounts as test users while the OAuth app is in testing mode. Google requires account selection and consent to grant file access. Tokens stay in tab memory and are never included in the ZIP, copied links, or browser storage. Sign out clears the publishing token and cancels an active transfer.

Test accounts can see Google's **Google hasn't verified this app** warning with a **Continue** button before the permission screen. This indicates a development app; it does not mean a Drive file was uploaded. The app's production status and required verification must be configured before offering sign-in to everyone. See [Google's OAuth app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

Configure the production repository secret `CUSTOM_GOOGLE_DRIVE_API_KEY` as described in the loading guide so shared viewer links can open anonymously on the custom host. The key is public browser configuration and must be restricted to Drive API, Picker API, the custom host's referrers and `https://docs.google.com/*` for Picker. The old Testing repository settings are not inherited by production profiles.

References: [Drive authorization scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads).
