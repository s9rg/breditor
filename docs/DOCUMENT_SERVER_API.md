# Document server API, content injection and webhooks

Status: **opt-in reference relay capability** (`experiments/relay`, feature `server`).
Nothing here is reachable from the existing single-room routers or the `serve`
CLI command. The relay remains loopback-only; the public-relay hardening gate
(import worker isolation, TLS/deployment qualification) still applies.

Comparison targets: Tiptap Document Server REST API (`/api/documents`, JSON/Yjs
reads, PATCH content injection with `append`/`node`/`attrs` modes and
checksum-based `409` conflicts) and webhooks (`X-Hocuspocus-Signature-256`,
2–10 s debounce, optional retries); CKEditor Cloud Services REST API
(documents, comments, server-side editor API) and HMAC-SHA256-signed webhooks.

## Enabling it

```text
breditor-collab-relay serve-documents ROOMS_DIR AUTH_JSON DOCUMENT_API_JSON 127.0.0.1:PORT
```

Embedders use `server::DocumentServer::open(directory, Authentication,
DocumentServerConfiguration)` inside a Tokio runtime and serve
`DocumentServer::router()`. `ROOMS_DIR` holds one room per `NAME.log`
(`NAME`: `[a-z0-9][a-z0-9-]{0,63}`) with its raster store at
`NAME.log.assets`; existing logs are opened at start-up.

`DOCUMENT_API_JSON` is `breditor/relay-document-api` V1. Unknown fields reject.
Every capability defaults to **off**:

```json
{
  "format": "breditor/relay-document-api", "formatVersion": 1,
  "servicePrincipal": "service:documents",
  "creators": ["alice"],
  "administrators": ["ops"],
  "injection": { "enabled": true, "injectors": ["alice"] },
  "limits": { "maxRooms": 64, "maxRequestBytes": 1048576, "maxCommands": 32,
              "concurrentOperations": 4, "deadlineMillis": 10000 },
  "webhooks": {
    "debounceMillis": 2000, "maxAttempts": 5, "retryBaseMillis": 1000,
    "timeoutMillis": 5000, "queueCapacity": 256,
    "endpoints": [{ "id": "crm", "url": "http://127.0.0.1:9000/hooks/breditor",
                    "secret": "at least 32 bytes of host-private secret",
                    "events": ["document.changed", "comment.created",
                               "comment.resolved", "room.created", "room.deleted"] }]
  }
}
```

Limits are clamped to explicit ranges (rooms ≤ 256, body ≤ 4 MiB, commands ≤ 64,
concurrency ≤ 16, deadline 0.1–60 s; ≤ 16 endpoints, 1–10 attempts).

## Authentication and authority

- Every `/documents/v1` call uses the relay's existing account tokens:
  `Authorization: Bearer TOKEN` and `X-Breditor-Principal`. It is a
  server-to-server API: no CORS is offered, and a request that *does* carry an
  `Origin` must match the configured allowlist.
- Authentication never grants a room role. Reads need current Reader access,
  archival and service-access changes need the immutable room owner, creation
  needs the account to be listed in `creators` (it becomes the owner), injection
  needs the account in `injectors` **and** current Editor access, the delivery
  log needs `administrators`.
- At most `concurrentOperations` API calls run at once (`503 busy` otherwise);
  each room transaction is bounded by `deadlineMillis` (`503
  deadline_exceeded`). Bodies above `maxRequestBytes` get `413`.
- Errors are `{ "kind": "error", "code": … }` with the relay's stable codes
  (`permission_denied`, `invalid_request`, `group_rejected`,
  `storage_unavailable`, …) plus `not_found`, `room_exists`, `room_in_use`,
  `stale_revision`, `unsupported_format`, `command_budget`,
  `command_not_injectable`, `injection_disabled`. No token, path or engine
  payload is echoed.

## REST endpoints

| Method | Path | Authority | Result |
|---|---|---|---|
| GET | `/documents/v1/rooms` | any account | rooms the caller can read, with `role` (`owner`/`editor`/`reader`) |
| POST | `/documents/v1/rooms` | `creators` | create a room from a document; `201` |
| GET | `/documents/v1/rooms/{room}` | Reader | canonical snapshot and `revision` |
| DELETE | `/documents/v1/rooms/{room}` | owner | archive (retained, never deleted) |
| GET | `/documents/v1/rooms/{room}/threads` | Reader | materialized comment threads |
| PUT | `/documents/v1/rooms/{room}/service-access` | owner | `{ "editor": bool }` grants/revokes the service principal |
| POST | `/documents/v1/rooms/{room}/injections` | injector + Editor | server-side content injection |
| GET | `/documents/v1/webhooks/deliveries` | `administrators` | bounded delivery log |

Per-room WebSockets and assets keep their original protocol under
`/rooms/{room}/ws` and `/rooms/{room}/assets/{sha256:…}`.

**Create** body: `{ "room", "languageVersion": 1|2|3|4, "standard": bool,
"configuration": <shared-rich-profile>, "document": <Document V2>,
"serviceAccess": bool }`. It calls the same explicit `Room::create*`
constructors as `init`/`init-v2`/`init-v3`/`init-v4` (no grammar inference, no
overwrite). `serviceAccess: true` records an ordinary owner-authored durable
grant of Editor to the service principal; nothing is granted implicitly.

**Snapshot**: `{ "format": "breditor/relay-document-snapshot", "formatVersion": 1,
"room", "documentId", "revision", "writerTransportVersion", "document" }`.
`document` is the room's canonical admitted Document V2 JSON; `revision` is the
exact canonical causal version. Only `?format=json` (the default) exists:
HTML/Markdown/DOCX export lives in the TypeScript `@breditor/interchange`
package and is run by the caller over this JSON, so there is no second Rust
exporter that could drift from it (`406 unsupported_format` otherwise).

**Archive**: refused with `409 room_in_use` while any WebSocket is connected
(owners disconnect editors first rather than having them severed silently).
The room leaves the registry and its log, asset store and service-writer state
move to `ROOMS_DIR/archive/NAME.<nanos>.*`. Consistent with the relay's
retention rule, no bytes are deleted; a host may later remove archives out of
band.

**Threads**: `{ "enabled", "threads": [ReviewThreadView] }` — the native review
lane's materialized view (author, state `open`/`resolved`/`conflicted`,
message versions with their authors, opaque anchors, `hidden`). Reading never
needs a review lease.

## Server-side content injection

```json
POST /documents/v1/rooms/notes/injections
{ "baseRevision": "<revision from a snapshot or webhook>",
  "commands": [
    { "kind": "insert_blocks", "data": { "parent": null, "before": null,
      "nodes": [ { "kind": "element", "type": "breditor/paragraph", "entityId": null,
                   "properties": { "breditor/block-id": "summary" },
                   "children": [ { "kind": "text", "text": "Summary", "formats": [] } ] } ] } },
    { "kind": "replace_text_range", "data": {
      "anchor": { "block": "title", "offset": "0", "affinity": "after" },
      "focus":  { "block": "title", "offset": "5", "affinity": "after" },
      "runs": [ { "text": "Final", "formats": [] } ] } },
    { "kind": "set_heading", "data": { "block": "summary", "level": 2 } } ] }
```

- Commands are the **native shared `Command` wire form** (the same serde
  encoding the Wasm bridge uses), restricted to a reviewed allowlist:
  `insert_blocks`, `replace_text_range`, `insert_text`, `delete_text`,
  `set_heading`, `set_block_layout`, `set_task_checked`, `set_code_language`,
  `set_image_alt`, `delete_block`. All address retained block ids; offsets are
  UTF-16 decimal strings.
- **Stale refusal**: `baseRevision` must equal the room's current revision.
  Otherwise `409 { "code": "stale_revision", "revision": <current> }` and
  nothing changes. The native `apply_at` repeats the same check on the replica.
  This also makes retries safe: a replayed request whose first attempt landed
  is refused as stale, never applied twice.
- **Same native path as an editor**: the service principal owns an ordinary
  registered writer (allocated with `Room::register`, never a reserved or
  forged id). Its replica receives the current catch-up, applies the batch as
  **one** writer-local history group, exports exactly one writer group and the
  room admits it through `Room::admit` — the same permission, lease, native
  validation, budget, durable append + fsync and receipt path as a browser
  submission. Connected editors receive it through the ordinary catch-up
  notification as a remote change; it never enters their Undo history.
- **Attribution**: the durable `Commit` record and the receipt's writer belong
  to the configured `servicePrincipal`; the response is `{ "kind":
  "injected", "author", "revision", "receipt" }` (`"unchanged"` for a no-op).
  The service principal must not be a login account (start-up refuses), and it
  only writes while the owner keeps it at Editor; revocation stops injection.
- **Custody**: the service writer's resume credential and replica journal live
  in `NAME.service.json` (mode 0600, atomic replace + directory sync), exactly
  like a browser keeps its credential and journal. Restart resumes the same
  writer. An injection that fails after local application discards the
  in-memory replica and reloads the last durable journal. If the stored
  journal and the durable writer clock ever disagree (for example a crash after
  admission but before saving), the service rotates to a freshly registered
  writer; it also rotates every 256 injections to bound replay. Rotations use
  ordinary writer registrations, so the per-account writer budget (32 for a
  non-owner) bounds a room's lifetime injection count at roughly 8,000 —
  a documented reference budget, not a compaction scheme.
- An outcome is unknown only if the deadline expires after admission began;
  re-read the snapshot (a retry with the old revision is refused as stale).

## Webhooks

- Events: `document.changed` (debounced: after a change the observer waits
  `debounceMillis`, coalesces everything that arrived meanwhile and sends the
  latest `revision` only if it differs from the last one sent),
  `comment.created` (per new message: `threadId`, `messageId`, `author`,
  `threadCreated`), `comment.resolved` (`threadId`), `room.created`
  (`createdBy`), `room.deleted` (`archived`).
- Body: `{ "format": "breditor/relay-webhook", "formatVersion": 1, "id",
  "event", "occurredAt", "room", "data" }`. Payloads carry identifiers and
  revisions only — never document or comment content; receivers fetch content
  through the authenticated REST API (which also supplies the `baseRevision`
  for a follow-up injection).
- Headers: `x-breditor-webhook-id`, `x-breditor-webhook-event`,
  `x-breditor-webhook-attempt` and `x-breditor-signature: t=<unix>,v1=<hex>`
  where `v1 = HMAC-SHA256(secret, "<t>.<raw body>")`, recomputed per attempt.
  Receivers verify with `server::verify_webhook_signature(secret, header, body,
  now, tolerance)` (constant-time; reject `|now − t| > tolerance`, e.g. 300 s)
  and drop repeated delivery ids within the window to defeat replay.
- Delivery never blocks the relay: observers run off the hot path on the same
  coalescing watch channels as sockets, emitting enqueues into a bounded
  per-endpoint queue (`queueCapacity`; overflow is logged as `dropped`), and one
  worker per endpoint posts sequentially with `timeoutMillis` per attempt and
  exponential backoff `retryBaseMillis · 2^(attempt−1)` (capped at 5 min) up to
  `maxAttempts`. 2xx is success.
- Delivery log: the last 512 attempts (`delivery`, `endpoint`, `event`,
  `attempt`, `outcome` = `delivered`/`retrying`/`abandoned`/`dropped`, `status`,
  `at`), administrator-only. Secrets are never logged.
- Endpoints are host configuration, never caller input, and must be plain
  `http://host[:port]/path` (no credentials in URLs, no redirects followed).
  Use a local TLS-terminating forwarder for HTTPS receivers; outbound TLS is
  part of the deployment gate. Delivery state is in memory: a restart loses
  queued retries (receivers can reconcile from the REST snapshot).

## Tests

`experiments/relay/tests/document_server_api.rs` (feature `server`):
authentication/authorization/limit refusals; canonical snapshots; injection
converging with a real WebSocket client replica (which also submits its own
concurrent edit), stale refusal and no double-apply on retry, Undo isolation;
service-writer resume across restart, revocation, invalid native intent;
signed, debounced, retried and logged webhooks to a local receiver, a dead
endpoint abandoned without blocking, comment created/resolved through the
native review lane, and archival. Unit tests cover configuration parsing, URL
validation and HMAC (RFC 4231 vectors).

## Not done

No JWT/identity-provider integration, version endpoints over this API, bulk
import/export, HTML/Markdown export in Rust, injection of suggestions (routing
server edits into the review/suggestion lane), durable webhook queues, outbound
TLS, or per-room injection idempotency keys beyond the stale-revision rule.
The client-side agent tool contract is a separate piece of work.
