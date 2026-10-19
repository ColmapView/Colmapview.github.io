# Loading Hugging Face datasets

> Connection update, October 19, 2026: the custom host now includes an optional [remembered connection service](account-sessions.md). It uses confidential OAuth callbacks, an essential session cookie and encrypted server credentials for at most 30 days. Its Google flow adds `openid` to identify the account; HF viewing and publication use separate authorizations. The browser-only setup and dated live evidence below describe the previous flow; they do not prove that the new server callbacks or refresh tokens have passed a live check. Provider setup and explicit production enablement are still required.


Public dataset links work without signing in. To open a private dataset:

1. Select the **🤗 Hugging Face** account icon next to **Upload configuration** in **Load Dataset**.
2. Select **Sign in with Hugging Face** and approve the requested access: repository read access and, where publishing is enabled, permission to create datasets and write to the ones ColmapView creates. For an organization-owned dataset, also authorize that organization; your account must already be allowed to read the repo.
3. Select **Load URL** and paste the dataset, revision/folder, manifest, or archive URL.

For example: `https://huggingface.co/datasets/you/private-scene`, a `/tree/main/project` folder, or a `/blob/main/scene.zip` archive. Pinned revisions and encoded branch names are preserved. A private manifest can reference files in the same repo at a different pinned revision.

The signed-in session applies to discovery, reconstruction files, ZIP/TAR and other supported archives, saved viewer settings, images, masks, and splat files. Images and masks still load lazily. Tokens stay in the tab's memory and are sent only in request headers to the exact Hugging Face dataset read endpoints. They are absent from viewer links, manifests, logs, and persisted viewer state. Authenticated downloads bypass the browser's HTTP cache; downloaded viewer assets use the existing in-memory caches. Hub storage redirects use their signed download URLs, with the browser removing the OAuth authorization header on a different origin.

Public reads remain anonymous, including checks for optional files a public repo does not have. After a successful authenticated read, subsequent files from that repo use the current session directly. Disconnecting, reconnecting, or token expiry invalidates that routing hint. A failed repository access check leaves the current dataset and caches intact.

Shared links to private datasets still require each recipient to sign in with an account that can read the repository. Reloading the page requires signing in again. The account **Disconnect** button forgets the local token; it does not remove an already downloaded scene. When the sign-in expires (after about 8 hours), the **🤗** button in the viewer toolbar signs in again, so the open scene keeps loading private images. With publishing enabled, that button opens the publishing dialog, which has its own **Sign in** button.

If a private shared link opens while signed out, the viewer returns to **Load Dataset** after the access check fails. Select the **🤗** account icon and sign in, then select **Retry shared link** in the same dialog. The retry opens the same link, with its view and settings, without reloading the page, which would end the sign-in.

## Viewer setup

Use the existing public OAuth app and static `hf-callback.html` callback described in [publishing setup](hugging-face-publishing.md). Add **`read-repos`** to the OAuth app's allowed scopes. Existing users must sign in again to grant that additional permission. No client secret or download relay is needed. See the [official OAuth scope documentation](https://huggingface.co/docs/hub/oauth).

To enable private viewing while leaving publishing disabled, put these public settings in the ignored `.env.local` file:

```dotenv
VITE_HF_AUTH_ENABLED=true
VITE_HF_PUBLISH_ENABLED=false
VITE_HF_OAUTH_CLIENT_ID=your-public-client-id
VITE_HF_OAUTH_REDIRECT_URI=http://localhost:5173/hf-callback.html
```

This configuration requests `openid profile read-repos`. When `VITE_HF_PUBLISH_ENABLED=true`, sign-in is also enabled and requests `contribute-repos` for the existing publication feature. Read-only sessions cannot perform publication.

Restart Vite after changing environment variables. For GitHub Pages, set repository variable **`HF_AUTH_ENABLED=true`** for release builds (`/latest/` and versioned directories) or **`HF_DEV_AUTH_ENABLED=true`** for `/dev/` builds, together with `HF_OAUTH_CLIENT_ID`/`HF_OAUTH_REDIRECT_URI` or `HF_DEV_OAUTH_CLIENT_ID`/`HF_DEV_OAUTH_REDIRECT_URI`. `HF_PUBLISH_ENABLED` and `HF_DEV_PUBLISH_ENABLED` control publication independently. Publishing also enables sign-in, so the `*_AUTH_ENABLED` flags matter only for read-only viewing while publishing is off. Settings take effect on the next build. The custom host uses its own `CUSTOM_HF_*` settings (see [dual hosting](dual-hosting.md)); isolated previews never enable sign-in.

If repository access is denied, check the connected account, its repo membership, and any organization permission granted in the consent screen. Signed out, Hugging Face answers for a missing repository exactly as for a private one, so also check the URL. Gated datasets are reported as gated. Expired or rejected credentials require signing in again; credentials are never embedded in a pasted URL.
