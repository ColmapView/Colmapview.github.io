# Connect an agent to an open ColmapView tab

## Discovery from a page URL

The app's initial HTML links to `agent-guide.html` and `llms.txt` under its
deployment base path. Both are static resources readable without JavaScript.
The Agent controls dialog also links to the guide. An agent reading the page can
follow these links to find setup, pairing, tools and operating boundaries.
This is discoverable documentation, not automatic tool installation or consent;
clients must follow the links and support the local MCP connector. For clients
that ignore HTML metadata, give them the `agent-guide.html` URL directly.

The local bridge provides real MCP tools over stdio. The web app opens an
outbound WebSocket to that process after the user pastes a single-use pairing
code. All feature operations run through the existing app command dispatcher.
It does not use computer-use tools, DOM automation, browser debugging, or eval.

## One-time setup

Requires Node.js 20+ and the project's installed development dependencies
(`npm install`). Configure your MCP client to launch:

```json
{
  "mcpServers": {
    "colmapview": {
      "command": "node",
      "args": ["/absolute/path/to/colmap-webview/scripts/mcp/server.mjs"]
    }
  }
}
```

Use your client's own configuration format. For Codex:

```text
codex mcp add colmapview -- node /absolute/path/to/colmap-webview/scripts/mcp/server.mjs
```

The bridge resolves dependencies relative to its own file, so it does not require
the agent's working directory to be the repository. Codex's configuration is
shared with its desktop and IDE clients. See the [official MCP setup](https://developers.openai.com/codex/mcp).
If a running task has not loaded the newly configured tools, reload/restart the
client's MCP connection before starting a new pairing flow.

`npm run mcp` is an alternative launch command when the client sets the repository
as its working directory. Do not launch a separate background server manually:
the MCP client owns the stdio process and its lifetime.

## Each session

1. Open ColmapView. Load a dataset manually or through MCP after pairing.
2. Ask the agent to call `colmap_status`, then `colmap_pair` if disconnected.
3. Paste the returned code into Settings → Agent controls → MCP pairing code.
4. Click Connect MCP. The code includes its port; no port entry is required.
5. The agent calls `colmap_list_features`, then reads or changes supported features.

Codes expire after five minutes and work once. Each MCP process pairs with only
one tab. Different processes choose different available ports by default, so they
do not compete for a fixed port. A code never grants access by appearing in a URL
or being saved in storage. Pairing is explicit and never reconnects automatically.

Stop agent, Disconnect MCP, page navigation/reload, session expiry, or bridge
shutdown closes the connection and revokes access. Session grants last 30 minutes.
Closing the Agent controls dialog does not stop the session.

## Tools

| Tool | Purpose |
| --- | --- |
| `colmap_pair` | Generate the one-use pairing code for the intended tab. |
| `colmap_status` | Check connectivity and the current app session identifier. |
| `colmap_list_features` | Read contracts, schemas, availability and unsupported workflows. |
| `colmap_read_state` | Read settings, transform preview and revisions. |
| `colmap_query_images` | Page through image IDs/names using offset/limit and datasetGeneration. |
| `colmap_set_feature` | Apply `{requestId, feature, input}` through the shared dispatcher. |
| `colmap_undo` | Undo the latest eligible transaction with `{requestId}`. |

For example, start clockwise orbit:

```json
{
  "requestId": "garden-orbit-1",
  "feature": "settings.camera.autoRotateMode",
  "input": { "value": "cw" }
}
```

Use a new request ID with value `off` to stop. `settings.camera.autoRotateSpeed`
controls speed; discover its current input schema before choosing a value.

The relay serializes mutations and reads current revisions when preparing each
new command. The browser remains authoritative and rejects intervening human or
dataset changes. It never blindly retries a stale command. Reuse the *same*
request ID and identical arguments for transport retries; the original prepared
envelope is retained so undo and other mutations cannot execute twice. A new
intent, including retry after reviewing a stale-state error, needs a new ID.

A timeout or disconnection can leave an unknown outcome. Inspect state before
deciding whether to retry. There is no automatic rollback on transport loss.
Settings success means application state was applied, not that a GPU frame has completed.
For `dataset.loadUrl`, pass `{url}` as input using an HTTP(S) dataset URL.
Success only accepts a load job; poll `colmap_read_state` at
`values['dataset.loadUrl']` for the returned job ID and `succeeded`/`failed` status.
Wait for `dataset.loading` to be false before navigating. Loads use the existing
human URL loader, replace data, clear undo history and continue after Stop or
disconnection. They cannot be cancelled/undone and failure can leave changed state.

## Boundaries

- Only the loopback interface `127.0.0.1` is bound. There is no remote relay.
- WebSocket Host and Origin are checked. Default allowed origins are
  `http://localhost:5173`, `http://127.0.0.1:5173`, and `https://colmapview.github.io`.
- `COLMAP_MCP_ORIGINS` can specify a comma-separated explicit origin list for
  another deployment. Do not use wildcards. `COLMAP_MCP_PORT` optionally selects
  a fixed port; its default `0` asks the OS for an available port.
- Pairing secrets contain 128 random bits. Unauthenticated sockets time out;
  repeated failures invalidate a pending code. Frame sizes, pending requests,
  command queues, history and request caches are bounded.
- No arbitrary filesystem reading, JavaScript execution, capture or permanent
  dataset editing is exposed by this bridge. The 81 contracts include URL loading,
  live camera control, image selection/viewing and transform presets;
  pairing adds transport, not access to arbitrary application internals.
- Browser policies may require permission or prevent loopback WebSockets from a
  hosted HTTPS page. Localhost is the validated deployment. No security policy
  is disabled to work around browser restrictions.

## Tests

`npm run test:mcp` tests the relay's origin/authentication and timeout/disconnection
boundaries using real WebSockets. `src/agent/mcpConnection.test.ts` starts a real
stdio MCP server and SDK client, connects the actual app-side transport and store
handlers, and tests discovery, orbit, appearance, transform preview, undo, replay,
concurrency and revocation. Its WebSocket wrapper supplies the browser Origin;
there is no mocked command dispatcher and no UI automation. A complete real-browser
pairing check is separate from this protocol/application integration test.

Validation on 2026-09-07: 3,429 app tests and two Node relay tests pass; lint,
TypeScript and production build pass. The local Codex host has the `colmapview`
stdio connector registered. Already-running tasks may need to reload their MCP
configuration before the new tools are exposed.
