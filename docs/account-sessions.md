# Remembered connections

The custom deployment at `https://colmapview.opsiclear.com` can restore Google Drive, Hugging Face and explicitly remembered S3-compatible connections across reloads and tabs. GitHub Pages and isolated previews keep their existing authentication behavior and never send `/auth/` requests. The feature requires both the custom build flag and an enabled, configured session service; an unavailable service falls back to the existing tab-only flows.

## Browser behavior

On startup the viewer checks `/auth/session`. The reply contains capabilities and connection metadata, never credentials. Remote startup loads wait for restoration; local files do not. Access tokens stay in tab memory and renew before authenticated requests when the provider supplied a refresh token. Reconnection remains necessary after expiry, revocation, or a nonrenewable provider token. Remembering authentication does not resume an interrupted upload after closing the tab.

Drive Open with verifies that the restored Google subject matches Drive's account hint before loading the selected file. Without a matching connection it navigates to one authorization flow and returns to that file. Cancellation returns to an explicit retry control rather than restarting authorization. The launch hint is untrusted input; only the verified Google identity authorizes its use. File access remains `drive.file`; only Add to Google Drive adds `drive.install`. `openid` identifies the account without requesting email or profile access.

Hugging Face stores viewing and publishing authorizations separately. Startup restores reading; opening the publisher can restore an already granted publication connection. The server's view flow requests `openid profile read-repos`; publication adds `contribute-repos`. It stores the username required by repository operations, but drops other profile fields. Provider refresh-token support must be checked with the configured application: an advertised refresh grant does not guarantee that every authorization issues one.

Bucket credentials stay tab-only unless the user checks **Remember this connection**. That choice sends the configured root, region and scoped credentials to the session service for encrypted storage. Restored browsers receive settings and short-lived presigned URLs, never the access-key secret. Downloads, uploads and multipart cleanup still go directly to the bucket. Read-only saved connections require an explicit **Enable uploads** action before signing writes. Use bucket-scoped keys; bucket CORS must allow the viewer's origin and the required methods and response headers.

Disconnect deletes the corresponding server records and clears this tab's connection. It does not delete provider files or revoke the provider's authorization grant. Already issued access tokens and presigned URLs can remain valid until their own expiry; other open tabs can retain an access token in memory. Revoke access in the provider's account settings when immediate provider-wide revocation is required. Clearing cookies alone loses this browser's association but leaves encrypted records until their expiry.

## Server contract

The Hub Worker hosts a separate `/auth/*` service backed by one SQLite Durable Object per browser session. Account records do not enter the Hub's public card records or gallery. It uses a random, signed `__Host-colmapview_session` cookie (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`) with a maximum 30-day lifetime. Only the session ID is in the cookie. Credentials and OAuth transactions are encrypted using AES-GCM with a separate HKDF-derived key and authenticated context binding each record to its object and purpose. An alarm removes expired records.

Every token and mutation endpoint requires same-origin JSON, an exact Origin and `X-ColmapView-Session: 1`; it sends no CORS authorization headers. OAuth uses authorization-code PKCE, state, nonce, exact callback addresses, verified OIDC signatures and browser-bound, single-use transactions. Return addresses are restricted to viewer entry paths. Popup notifications contain a transaction ID and status, never tokens. Cancellation and disconnection revisions prevent late callbacks or refreshes from recreating forgotten credentials. Refreshes are coalesced per connection inside its Durable Object.

The service fetches only fixed provider token, JWKS and userinfo endpoints, with response-size and time limits. It never fetches dataset or bucket URLs. Auth responses are uncacheable and carry a no-referrer policy; application code never logs authentication errors or credentials. Worker invocation logging is disabled to avoid recording OAuth callback query strings. Infrastructure-level processing remains covered by Cloudflare's policy.

This is a token-mediating backend: the browser receives short-lived Google/HF access tokens to keep large transfers direct. It is not a full file proxy and does not isolate those access tokens from malicious same-origin JavaScript. Maintain the site's script and dependency protections accordingly. No ColmapView password, email profile or cross-device user database is introduced.

## Deployment and rollback

See the Hub repository's `docs/account-sessions.md` for provisioning and secret installation. Register these exact callback URLs on the corresponding confidential OAuth clients:

- Google: `https://colmapview.opsiclear.com/auth/google/callback`
- Hugging Face: `https://colmapview.opsiclear.com/auth/hf/callback`

Keep existing browser client registrations and callbacks for the fallback and GitHub builds. The custom frontend's public Google client ID must match the server Google client ID so Drive file grants and Picker use the same application. Never supply a provider client secret or `AUTH_KEY` to Vite, Pages build variables, deployment metadata, or screenshots.

Deploy the service with `AUTH_ENABLED=false`, provision its secrets and callbacks, then deploy the viewer and updated privacy policy. Enable only configured providers and run real consent, refresh, reload, new-tab, Drive Open with, cancellation and disconnect checks before reporting the feature live. The custom profile sets `VITE_ACCOUNT_SESSIONS_ENABLED=true`; other hosted profiles force it off. A backend capability remains false when its configuration is missing. Set `AUTH_ENABLED=false` to stop remembered restoration and return clients to the existing tab-only flows. Do not remove the Durable Object class or migration while old objects still need their expiry alarms.

## Validation

Focused tests cover cookie integrity, CSRF, encrypted record isolation, OIDC signatures and nonce, refresh rotation/revocation, cancellation, single-use callbacks, account matching, expiry, concurrent refresh/disconnect, bounded bucket signing, permission upgrades, in-memory tokens and exact popup-origin/transaction checks. Compiled-artifact tests cover automatic Drive restoration and the unsupported-host boundary. These fixtures verify application behavior; they do not establish that a provider's production callback or secret is configured.
