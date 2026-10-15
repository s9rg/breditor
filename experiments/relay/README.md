# Breditor reference relay — durable room authority

This isolated Rust crate implements durable room authority and an optional
loopback WebSocket reference host. It does not change the default editor
dependency graph, private shared model 11, journal V12 or Wasm ABI 1. Do not
expose it as a public untrusted endpoint: the resource-limited import worker,
TLS/deployment qualification and optional distribution
promotion remain separate integration gates.

Run the reproducible functional check from the repository root:

```sh
node scripts/check-relay.mjs
```

The check runs formatting, strict first-party Clippy, one real I/O-failure test,
eight native room contract tests, five asset contracts, three server account/protocol tests, and builds
the actual optional server binary. The native tests use the same rich owner
and single-writer admission used by the Wasm/browser checkpoint; no second CRDT
or simplified document model is substituted.

## Loopback WebSocket host

Build with the optional `server` feature. `scripts/check-relay.mjs` places its
binary in `target/relay-native/debug/breditor-collab-relay`; the separate cache
keeps this workspace's locked native identities out of the editor fixture cache.
The CLI supports:

```text
breditor-collab-relay token
breditor-collab-relay init LOG PROFILE_JSON DOCUMENT_JSON OWNER
breditor-collab-relay serve LOG AUTH_JSON 127.0.0.1:PORT
```

`token` issues a new account bearer token and its digest. Give only the secret to
that account. Host `breditor/relay-auth` V1 configuration contains `accounts`
(`principal`, `tokenHash`: the 32 digest bytes) and an exact `origins` allowlist.
The `formatVersion` is 1. Never put account tokens into URLs, portable editor
journals or source control. Authentication does not grant a room role: only its
initial owner can grant Reader/Editor access. The CLI refuses non-loopback binds;
there is no automatic public deployment, identity provider or TLS configuration.

`GET /health` reports only the live service version. `/ws` requires an allowed
browser Origin and a first-message account authentication within five seconds.
Requests use original `breditor/relay` V1 envelopes with a bounded string `id`
and a `request` tagged by `kind`. Supported kinds are `authenticate`, `register`,
`resume`, `submit`, `sync`, `clock` and owner-only `grant`. A submission contains
an opaque single-writer `group`, not caller-selected writer/account/lease fields.
The active authenticated socket owns the server-side lease capability.

Replies bind the same format/version and request ID. Unsolicited messages use
`id: null`. Successful writes return `kind: durable` with the canonical receipt,
original synced log sequence and duplicate flag. Missing dependencies return
`kind: pending` without durable acceptance. Catchup is a trusted full-state frame;
it must enter the existing browser coordinator's safe remote-publication queue.
Errors expose stable codes rather than credentials, raw engine data or paths.

The host caps 64 live sockets, 6 MiB messages, a bounded socket write buffer and
ten-second sends. A watch notification coalesces changes; it does not queue an
unbounded history of snapshots per slow peer. Blocking native admission and
fsync execute off async I/O threads under the same room lock. Each catchup reads
current permissions and validates an active writer fence. Register/resume also
notify existing sessions: takeover closes the old writer socket before it can
consume another session's same-author future into its local history. This has a
retained failing-before-fix browser reproduction, not just a write-denial test.

`node scripts/check-shared-browser.mjs` builds this actual Rust process and runs
real Wasm clients against it. The Node lifecycle fixture starts/stops Rust and
owns temporary files; it neither authenticates nor merges/acknowledges documents.
The browser socket fixture is test/admin support; the optional browser package
now has its own `SharedRelaySync` reconnect API and durable registration helper. The
interactive `/demo` still exchanges updates only within its own page.
The separate `/network-demo` uses actual native networking. After the full
functional build, run `npm run demo:shared:network`; it opens a private retained
developer room with Alice/Bob accounts, uploaded images and authenticated peer
overlays. The launcher and optional `network_demo` Rust example deliberately
provision these local accounts; they are not public login/provisioning APIs.
The frontend bootstrap includes both demo tokens and must stay loopback-only.

The final integrated check passes 231 shared browser cases and six installed-
archive mixed workflows, the native 229 editor/20 relay contracts and launcher
restart retention. The full regression run also passes all 309 existing
collaboration and 105 local rich browser cases, core suites and doctests.
No default shipping graph, shared model, journal or existing Wasm ABI changes.

## Authenticated raster assets

The CLI opens a separate `LOG.assets` directory beside its room log. Embedders
can instead open `assets::AssetStore` explicitly and pass it to
`server::router_with_assets`; the original `router` has no asset storage side
effect. A store binds the immutable initial configuration, room, owner and seed
journal. It cannot attach to a different authority merely because its document
name matches. Asset operations never append document actions or alter Undo.

`PUT /assets/{sha256:hex}` and `GET /assets/{sha256:hex}` require an exact allowed
Origin, `Authorization: Bearer TOKEN` and `X-Breditor-Principal`. Editor permission
is required to upload; Reader permission suffices to download. The host checks
permission before consuming an upload body and again under the room lock before
publishing bytes. Revocation prevents future transfers, not access to bytes
already cached offline. Digests and URLs are not access credentials. CORS
preflight allows only these methods/headers for configured Origins; no cookies
or public asset listing are supplied.

Native admission verifies the exact encoded digest, PNG/JPEG/WebP signature,
declared dimensions and full raster decode. The exact original bytes are kept,
not a lossy re-encoding. `breditor/relay-asset-receipt` V1 binds asset, MIME, byte
length, width, height and duplicate status. Encoded files are capped at 10 MiB,
dimensions at 16,384, pixels at 32 million, and retained room assets at 1,024 and
256 MiB. Four HTTP asset operations may run concurrently. These are correctness
budgets, not a public-host memory/CPU guarantee: the decoder's allocation limit
is [best effort](https://docs.rs/image/0.25.10/image/struct.Limits.html), and the
resource-limited worker remains a public deployment gate.

The private directory uses an exclusive lock, a room manifest and immutable
`BRASSET1` records. Creation requests Unix directory mode 0700 and file mode 0600.
A complete staging file is synced, atomically hard-linked without overwrite to
its content key, and the directory synced before acknowledgement. Exact retries
revalidate existing bytes without spending the budget twice. An uncertain write
fences the store until reopen. Recovery validates all complete records before
removing only recognized uncommitted staging files; unknown files, corrupt
records and incomplete initial manifests reject without a destructive reset.
Use local filesystem lock/link/sync semantics and back up the log and asset
directory together. Complete unreferenced bytes remain retained for offline
peers, history and backups; no garbage collection is implemented.

Clients may negotiate `capabilities: ["assets"]` during socket authentication.
Only opted-in sessions receive coalesced `assetsChanged` hints after durable
publication. The hint carries no document action or asset list. Current account
permission and writer lease are checked before sending it. A reconnect or a
later GET recovers missed hints; they are not durable upload acknowledgements.

The asset checkpoint passes all 210 combined browser cases (70 each in
Chromium, Firefox and WebKit), including 66 real-process relay/asset cases; 229
native editor contracts; 17 unique native relay tests; strict first-party
native/Wasm lints; generated/installed TypeScript; and the offline installed
package consumer. The earlier full regression check also passed all 309 legacy
browser cases, 703 default core tests, 1,217 opt-in core tests, 137 doctests and
rich integration suites. That is 519 browser cases across both matrices. The
takeover regression failed on the old binary in all three engines, then passed
on the rebuilt fixed service and in the final full matrix. No test retries or
relaxed assertions were introduced.

## Authenticated ephemeral presence

`capabilities: ["presence"]` opts a socket into latest peer snapshots and the
`presence` request (`sequence`, opaque `frame`). Publishing requires the current
authenticated writer lease. Native read-only resolution verifies room/schema/
engine and the frame's actual writer; a payload cannot impersonate another
account or writer. Missing document dependencies may stay pending without
importing content. Snapshots require current Reader permission and validate an
active writer fence when the connection has one.

Peer labels come from authenticated principal metadata. Each resume creates a
different public hash-derived session epoch, not a disclosed lease token.
Sequences are canonical unsigned decimal strings, including values above JS's
safe-integer range. Old/duplicate sequences do not renew expiry. Thirty-second
expiry releases frame/display bytes while retaining the high sequence for that
active session. Role changes, current disconnect and resume remove that epoch;
a stale disconnect cannot clear its successor. Restart clears all presence.
None of these operations append the log, change content or consume history.

The room retains at most 64 active peers, 256 KiB per frame and 2 MiB aggregate
frame bytes, plus at most 1,024 bounded live-session sequence records. Watch
notifications coalesce complete latest snapshots; a five-second tick also
prunes expiry. Presence is best-effort ephemeral state, not durable edit
acknowledgement or an unbounded event stream.

The complete presence checkpoint passes 225 shared browser cases (75 per
engine), including 81 real-process relay/asset/presence cases; 229 native editor
and 20 unique native relay contracts; strict native/Wasm lints; generated and
installed TypeScript; and real-Wasm installed archive runtime checks. All WebKit
files run once in fresh processes, with no retries or altered assertions/deadlines.

## Room and account authority

`Room::create` admits the configured initial Document V2 and creates a new log
without overwriting an existing file. The host-owned seed reserves causal writer
`1`. The immutable initial account owner can durably grant Reader or Editor
roles, or revoke access. The caller must authenticate an account before supplying
its principal to this API; a causal writer string is never an account identity.

Editors register distinct server-allocated writers. Registration persists the
account/writer binding and the SHA-256 digest of a 256-bit OS-random resume
credential before returning the secret. The browser must save this credential
separately from its portable editor journal before authoring. The log never
stores the clear credential or an active connection token. Losing an allocation
reply may leave an unused writer; identities are never recycled.

Resume requires both the same authenticated account and its writer credential.
It creates a new random connection fence and invalidates the previous one.
Restart invalidates every connection fence, but not writer ownership or offline
edits. A stale disconnect cannot release a newer connection. Any role change
fences that account's sessions; a later regrant still requires explicit resume.
Permission rejection does not delete or alter a client's local journal.

## Durable editing and recovery

`Room::admit` validates the active account-bound lease, then uses native
`prepare_writer_group` on an unpublished candidate. Missing causal dependencies
remain pending at the client, outside accepted engine state and the durable log.
Malformed, wrong-author, invalid and forked groups reject before append.

The room appends the exact group, authenticated ownership and canonical receipt,
then calls `sync_all` before committing the candidate or returning a durable
receipt. The caller must serialize the whole room transaction, including grants
and resumes. Socket transmission is not durability. A failed/uncertain write
fences all subsequent reads and transactions until recovery; it does not issue
an acknowledgement that memory alone cannot justify.

Exact retries return the original accepted log sequence and canonical receipt
without appending another record, including after a lost response and restart.
Receipt identity is canonical operations, not possibly different binary packing.
Full multi-author catchup frames are read-authorized server output, not accepted
client write input.

The private `breditor/relay-log` V1 file has bounded records, contiguous sequence
numbers, a previous-record digest, a payload digest and an independently checked
header digest. A damaged length cannot masquerade as an incomplete append. Open
replays every complete record through permission/ownership/native semantic
admission. Only after successful replay can it truncate an incomplete final
record. A corrupt complete record rejects without modifying the file. A complete
append whose reply was lost remains accepted and discoverable by exact retry.

The log is locked exclusively with the standard-library file lock for its open
lifetime. Unix creation requests mode 0600; initial creation syncs the file and
its containing directory. Use an existing host-owned directory and a local
filesystem with working lock/sync semantics. Do not unlink or replace an open
log. These functional tests are not a power-loss certification for every storage
device or network filesystem.

## Tested workflows and limits

The contracts exercise simultaneous offline table width/text and image alt/
caption edits, original server-durable retry receipts, server restart, client
journal restore and selective Undo/Redo through later remote edits. They also
exercise own-stream gaps and foreign dependencies, Reader/Editor/revoked roles,
cross-account writer claims, credential rejection, lease replacement, stale
disconnects, competing log ownership, exact non-overwrite, incomplete header/
payload tails, checksum corruption and plausible corrupt lengths. A real
read-only file handle verifies write-error fencing.

Current correctness budgets are 20 MiB per serialized log record, 256 MiB per
room log, 4,096 total log records, 1,024 registered writers and 1,024 non-owner
role entries. The stricter existing rich owner budgets also apply, including
1,000 journal entries and bounded causal state. These are explicit rejection
limits, not a rolling compaction implementation or throughput/SLA promise.

Remaining release work: import-worker isolation, TLS/deployment qualification,
promotion of the optional Rust/Wasm distribution and a real pilot. The combined
network demo now integrates the functional editor, server, images and presence.
Exhaustive adversarial, physical IME and
accessibility qualification remain deferred as requested.

Implementation references: [standard file locking and sync](https://doc.rust-lang.org/std/fs/struct.File.html),
[OS-backed credential entropy](https://docs.rs/getrandom/0.4.3/getrandom/fn.fill.html),
[Axum WebSockets](https://docs.rs/axum/0.8.9/axum/extract/ws/),
[Tokio task and blocking-work contracts](https://docs.rs/tokio/1.53.3/tokio/).
