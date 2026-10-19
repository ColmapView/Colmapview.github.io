# Publish datasets to Google Drive

Load a COLMAP reconstruction with its original images, then choose **Share → Google Drive** in the viewer toolbar.

1. **Sign in** with Google and allow ColmapView to create and manage the files it creates in Drive.
2. Choose a ZIP file name. Files are saved in **My Drive**.
3. **Access → Anyone with the link** is the default. Choose **Private** to restrict access. ColmapView enables reader access after verifying the upload. An organization's sharing policy can prevent this step.
4. Click **Save private dataset** or **Publish shared dataset**. After completion, copy the viewer link or open the file in Drive. Loading another dataset returns the dialog to a new form, clearing a finished publication's link or a stopped one's status; editing the model also clears a finished publication's link.

Public viewer links to supported Drive archives need no sign-in when the viewer's Drive API key is configured. For a private archive, select **Sign in** in the loading panel's Drive account control, then select the file in Google's file picker. If already connected, select **Choose file**. The recipient must already have permission to download it; a viewer URL alone does not grant access. Loading supports ZIP and TAR, including compressed TAR; publication creates ZIP output only. Loading and publishing share one tab-only connection requesting `drive.file`. Sign-in never starts an upload. Disconnect or Sign out ends that connection for both workflows.

After the upload is verified, ColmapView creates a ColmapView Hub link with the current-view thumbnail and metadata where the Hub is enabled: a short name when the ZIP is shared with anyone with the link, an unguessable one when it is private. The result shows the Share link and a private delete link. If the Hub request fails, **Retry Hub link** retries only that step; it never repeats the Drive upload. Reopening the dialog keeps the completed result, and after a new dataset or an edit resets it, the Previous upload block keeps the Hub link.

## Dataset contents

The ZIP contains the current COLMAP reconstruction in binary format, original images, available masks, the active splat, and embedded `colmapview.yaml` settings. Pending reconstruction transforms are applied to exported COLMAP data, with the splat transform and current viewer settings saved for reopening. Apply pending image deletions before publishing.

**Images → Original files** preserves image bytes and metadata by default. Choose **JPEG (85% quality)** to encode lossy copies at full resolution before uploading. This removes source image metadata and makes transparent pixels white. COLMAP image names and mask references are updated together; masks and splats retain their original bytes. One worker converts one image at a time, preserving the model's pixel coordinates even for EXIF-oriented sources. JPEG, PNG, WebP, GIF, BMP, and TIFF sources are supported when the browser can decode them, up to 64 megapixels and 128 MiB per image. Unsupported files stop preparation so you can switch back to originals.

Publication copies the active splat, rather than every catalogued splat. Originals from local files, archives, and remote URLs are supported. Private Hugging Face source assets require the existing repository read connection; dataset files are pinned to a commit before copying, while files in Hugging Face model or Space repositories are copied unpinned, like other hosts' files. The source repository and its visibility are unchanged.

The complete ZIP must fit the Drive publisher's **2 GiB** archive limit. With original images, Hugging Face's listed file sizes can reject an oversized dataset before image downloads. JPEG copies are checked against their encoded sizes, including ZIP overhead; packaging stops at the limit. Individual source images and masks retain the existing **128 MiB** publication limit; the exported COLMAP files and the splat are bounded only by the ZIP. On hosts without a file listing, masks are treated as absent when every mask name of the first 8 images answers 404, as in the viewer. A host that answers 403 for missing files, or blocks the response, is asked for each image's mask. ZIP entries use stored bytes after any selected JPEG conversion. Packing uses browser Blob parts and streams one entry at a time; the finished archive is retained in this tab while uploading or retrying.

## Progress and recovery

Keep the browser tab open. Closing the dialog leaves publication running; reopen it with **Share → Google Drive**. Closing or reloading the tab loses its upload state and authentication.

Uploads go directly to Google's API using resumable chunks. Retry checks the server's acknowledged position and the file's size and checksum. A pre-generated file ID and publication marker bind retries to the same file. Reconnect the same Google account if sign-in expires. Loading another dataset cancels the current publication and requires a new one. Editing the model or marking images for deletion cancels it only while the ZIP is being prepared; a built ZIP keeps uploading, as on Hugging Face.

**Cancel upload** stops transfers. A completed file or sharing change may remain in Drive, so review its Drive link before starting another publication. ColmapView does not automatically delete files. Every new publication creates a new file; existing Drive datasets are not overwritten.

The recovery dialog shows a Drive file link after Google confirms that the file exists. If the upload failed before that confirmation, use **Check upload and retry** to reconcile its status.

## Deployment configuration

Use the separate development or production Google Cloud project and web OAuth client described in [Drive loading setup](google-drive-loading.md). Hosted Drive publication is enabled only at `https://colmapview.opsiclear.com`; GitHub and Pages previews offer an explicit link there. Enable **Google Drive API**, register the exact custom JavaScript origin, and configure the production `CUSTOM_GOOGLE_DRIVE_CLIENT_ID` repository variable. Private archive reopening also needs **Google Picker API**, `CUSTOM_GOOGLE_DRIVE_APP_ID` (the same project's numeric number), and `CUSTOM_GOOGLE_DRIVE_API_KEY`. The custom build maps these to their `VITE_` values and explicitly enables Drive only at that origin. No separate publication flag, backend, relay, or OAuth client secret is required. Local development uses the existing `VITE_` settings. See [dual-host deployment](dual-hosting.md).

Declare only `https://www.googleapis.com/auth/drive.file` in the OAuth consent app's **Data Access** settings. Sign-in from either loading or publishing requests this scope; an existing connection is reused. It grants access to app-created or user-selected files; it does not request full Drive write access. Loading uses the same per-file scope with Google Picker rather than broad read access. Google's scope reference classifies `drive.file` as non-sensitive, avoiding restricted-scope verification for this integration.

**Live setup, 2026-10-06 UTC, baseline `c517`:** the separate production project is External / Production; Google confirms scope verification is not required and branding is verified and shown to users. Real production consent and private ZIP publication passed, with receipt verification of size, MD5, operation ownership and `shared=false`. A fresh page reopened the private viewer link through sign-in and native Picker, loading one camera, two images and one point with both 4 × 3 JPEG gallery images decoded; Picker frames were disposed. The release gate is now enabled. Use real decodable photo originals for this rehearsal; mock mask PNG/hash fixtures are unsuitable. See the [dated handoff and optional live checklist](dual-hosting.md#optional-live-provider-checklist). The separate development project remains Testing.

Add eligible accounts as test users while the OAuth app is in testing mode. Google requires account selection and consent to grant file access. Tokens stay in tab memory and are never included in the ZIP, copied links, or browser storage. Sign out clears the publishing token and cancels an active transfer.

Test accounts can see Google's **Google hasn't verified this app** warning with a **Continue** button before the permission screen. This indicates a development app; it does not mean a Drive file was uploaded. The app's production status and required verification must be configured before offering sign-in to everyone. See [Google's OAuth app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

Configure the production repository secret `CUSTOM_GOOGLE_DRIVE_API_KEY` as described in the loading guide so shared viewer links can open anonymously on the custom host. The key is public browser configuration and must be restricted to Drive API, Picker API, the custom host's referrers and `https://docs.google.com/*` for Picker. The old Testing repository settings are not inherited by production profiles.

References: [Drive authorization scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads).
