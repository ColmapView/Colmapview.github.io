# Share a public dataset on Hub

Choose **Share → Share on Hub** for a loaded remote dataset, or **Share on Hub** in a completed public upload. The form uses the existing upload dialog: preview and three fields, stacked on phones. Review its title, optional description and optional license, consent to public discovery, complete the bot check and submit. Dataset files stay at the source provider. Never submit a private link or information you do not want public.

Automatic upload share links remain unlisted. This explicit action can add a card to the catalog's **Shared on Hub** section. A click opens the dataset directly in the viewer; the information control shows metadata. Community entries load asynchronously, separately from curated search and filters.

Hub shares open the native viewer at `/s/<id>` or a curated scene's `/s/d/<code>`.
The address stays short through loading and reloads; view settings can still be
shared in its fragment. The Hub supplies inert startup data to the current custom
viewer, and the browser downloads source files and authenticates normally. Loading
another dataset releases the previous short address. Embed code and new upload
links use the ordinary viewer root rather than reusing an existing scene's ID.

Local files must be uploaded first. Applied edits or pending deletions require a fresh upload before listing the changed dataset. Completed public uploads retain their exact source, preview and metadata. Private or unconfirmed upload results do not offer the button; a private source supplied through the generic URL flow cannot bypass backend verification.

The Hub requires a server-validated Turnstile response and enforces request limits. Existing curated manifests can be checked through its static asset binding. Public, ungated Hugging Face native models can pass bounded metadata and first-record checks; their source is pinned to the checked revision. This is not a complete scene/photo load test, a malware scan or confirmation of license rights. Drive, bucket, archive and other sources requiring full inspection are submitted for operator review, without arbitrary server fetches. They appear only after approval. The pending result includes a submission ID and does not claim a published link.

Public records include the source/viewer URL, supplied metadata, a small JPEG preview, creation time, verification information and ownership hashes. The Hub receives no provider login token or bucket key. Ask info@opsiclear.com to remove a listing or pending submission, providing its link or ID. Removing it does not remove provider files or copies already fetched elsewhere. See [privacy](../public/privacy.html#publishing).

The feature is available only on Hub-enabled hosts and stays disabled until the Hub's real Turnstile configuration is installed. A disabled configuration shows a short unavailable message and cannot submit. The backend setup, verification boundaries and operator commands are documented in the Hub repository's `docs/publication.md`. Deploy the Hub before releasing this viewer feature.
