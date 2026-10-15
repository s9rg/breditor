# Breditor shared rich editor

An opt-in browser coordinator for the exclusive Rust shared owner. It connects
the existing rich renderer to causal text, tables, images, lists, semantic
clipboard and writer-local Undo/Redo. The DOM and TypeScript never own a second
replicated document.

This private workspace is an integration checkpoint, not a published package.
The matching generated module currently comes from the isolated collaboration
build. Its configurable shared-profile factory compiles application-selected
schemas and typed formats; optional Rust/Wasm crate promotion remains required
for application distribution. The default Breditor packages and
their Wasm graph are unchanged.

## Configurable shared profile

`compileSharedProfile(wasm, configuration)` calls the matching Rust
`SharedRichProfile.from_configuration_json` factory. The configuration is the
original closed `breditor/shared-rich-profile` V1 shape, not a production V6
bootstrap, document, update or journal. It declares `schema: {name, version}`,
an `extensions` array and optional tightened `limits`.

Each extension declares its exact `id`, `dependencies`, `conflicts` and `formats`.
A format declares `kind`, positive `revision` and `properties`. Each property has
a qualified `name`, `presence` (`required` or `optional`) and `valueType`.
Types are `boolean`, `integer` with explicit nullable `minimum`/`maximum`, or
`string` with `minimumUtf8Bytes`/`maximumUtf8Bytes`. Empty properties declare no
typed properties. Extension relationships, reserved names, duplicate ownership,
property domains and the complete fingerprint are proved by the existing core
compiler. A caller-supplied fingerprint is not accepted as a schema declaration.

The factory offers `create(documentJson, writer)`, `join_frame(room, writer,
frame)` and `restore(room, journal)`. These return independently owned generated
writers suitable for `SharedRichEditor` or `SharedPersistentSession` callbacks.
Acquire the appropriate exclusive writer lease before calling them. Free the
factory after those callbacks finish; existing writers keep their own compiled
codec and remain usable. Its descriptor includes exact schema, ABI/model/history
and all document budgets. No room, shared state or history belongs to the factory.

Configuration is limited to 1 MiB, 64 extensions, 64 dependencies/conflicts per
extension, 255 formats per extension and 32 properties per format, with the
underlying aggregate compiler limits also enforced. Collection parsing stops at
the limit before constructing an oversized typed collection. All twelve existing
`DocumentLimits` settings may be lowered but not widened. Those limits apply to
create, local edits, incoming changes and journal recovery; they are not a new
network work/compaction budget. Unknown/duplicate configuration fields reject.

Custom inline formats survive shared text, clipboard and exact history. The
renderer uses safe spans by default; `inlineTag` can choose its supported safe
inline tags. Configuration carries no executable callbacks, arbitrary block
registrations or action-routing IDs: shared commands address format literals
directly. The sealed table/image/nested-flow grammar remains unchanged.

## Owner contract

`new SharedRichEditor(raw, options)` transfers exclusive ownership of a matching
generated Rust owner. Its descriptor must identify ABI 1, shared model 11 and
journal 12. Never mutate, free or transfer `raw` again. Disposing the coordinator
frees its observation and owner and rejects every pending remote receipt.

`view()` returns a detached immutable-publication snapshot. `dispatch`, `select`,
`type`, `replace`, `paste`, `pasteAtText`, `navigate`, `undo` and `redo` always use
the current opaque Rust observation. An optional exact `revision` rejects work
prepared from an older publication before command serialization. Rust still
validates the complete staged command group and all IDs, geometry and values.

`updateFrame()` exports the room/schema/model/engine-bound causal frame;
`receiveFrame(frame)` resolves after Rust admission, not after persistence or a
server acknowledgement. Publication callbacks cannot publish reentrantly.
Callback exceptions cannot rewind content already committed by Rust.

`holdRemotes()` returns an idempotent release function. Input queues and staged
composition use it so incoming updates do not invalidate a half-completed local
action. The remote queue allows at most 64 frames and 8 MiB in aggregate, with a
5 MiB per-frame JSON ceiling. Hosts can tighten those limits. Invalid queued
frames reject independently; valid successors continue. There is no silent drop
or unbounded catchup queue.

`receiveFrame(frame, {signal})` can cancel a frame while it is still queued.
Cancellation releases its byte/frame budget and does not decode, publish or add
history. It cannot undo a synchronous Rust admission that already completed.
Dispose and admission remove the abort listener. Reconnect uses this boundary to
stop old connection callbacks, including frames held during composition.

`checkpointJson()` preserves the original seed/join, ordered imports, commands,
selective history, causal UI anchors and future operation identities. Restore
only under the same exclusively leased writer. It is not a portable content
import or permission to clone a live writer. Earlier shared models and journals
are incompatible with the current source-routing, caption-choice, creation
provenance and placement-forest contracts.

## Single writer relay transport

`supportsWriterTransport()` detects the matching optional Rust capability.
`writerGroups(after, revision?)` returns an immutable-publication batch of complete
local action/Undo/Redo groups starting at an acknowledged author counter. It
does not export other writers' operations or UI-only changes. A multi-command
dispatch remains one group; history recovery reconstructs the same boundaries
from the existing journal. No transport cache is persisted or substituted for
the original replay proof. Mid-group/future counters reject; a stale optional
publication revision rejects before counter admission.

`after` is an exact decimal engine author counter, not a document publication
revision or text offset. `writerClock(writer)` reads its applied exclusive end
and canonical operation-prefix digest. Batches use original
`breditor/shared-writer-groups` V1, with at most 64 opaque group strings and 8 MiB.
Follow `through` while `hasMore` is true. A single group uses
`breditor/shared-writer-group` V1, capped at 1 MiB of engine bytes and 5 MiB of JSON.
Each binds room, schema, model, engine, writer, start/end, required foreign applied
counters, payload digest, previous-prefix digest and canonical group digest.
Canonical operation hashes do not treat variable binary packing as identity.

These group strings are outbound relay input, not arguments to `receiveFrame`.
Full-state `updateFrame`/`receiveFrame` remain the separate trusted-server catchup
path. Genesis is explicitly tagged for a dedicated creation-authority handshake;
an ordinary edit cannot rewrite room initialization even if its header value
would remain unchanged. Account roles and writer leases are not proved by a
writer ID or digest.

The Rust relay boundary offers `prepare_writer_group(authenticated_writer,
frame)`, returning an unpublished candidate, exact duplicate receipt, or missing
dependencies. Unknown dependencies stay outside the live engine/history; a
partially integrated or invalid group cannot poison another author's next
admission. Actual engine origins/ranges and full integration are checked. Old
known ranges must match canonical lineage; divergent same-writer history rejects.

`PreparedWriterGroup` exposes immutable candidate content/checkpoint/receipt.
The host holds its room serialization lock, authenticates the account and current
lease, persists the accepted record durably, then calls guarded
`commit_writer_group`. A preparation, integrated receipt or socket write is not
a disk acknowledgement. The core guard rejects stale or foreign candidates.
The isolated repository `experiments/relay` now supplies durable append/receipt
storage, account roles, writer leases and an optional account-authenticated
loopback WebSocket host. Browser-to-process tests exercise real Wasm groups and
server/page restart. The separate native admission test bridge is still not a
listening server or authenticator. The browser reconnect adapter below now uses
that host; the bounded import worker and public deployment qualification remain
work.
ABI 1, shared model 11, journal V12 and default shipping graphs remain unchanged.

## Packaged relay reconnect

`registerSharedRelayWriter` allocates a writer online before first authoring.
Pass `endpoint` (`ws:`/`wss:` without credentials/query/fragment), authenticated
`principal`, `room`, `getToken(signal)` and `saveIdentity(identity)`. The account
bearer token comes from the callback; the returned writer resume credential is a
different secret. `saveIdentity` must finish durable host storage before the
helper returns. If it fails, no editor is created and the unused allocation is
not recycled. Keep this record outside portable documents/journals and protect
it as an application credential. The helper returns an opaque catchup frame and
profile descriptor; the matching Rust profile still owns join admission.
This adapter uses the reference host's 64-character lowercase-hex account and
resume tokens. OAuth/JWT login adapters and public TLS deployment are not supplied.

```ts
const registration = await registerSharedRelayWriter({
  endpoint, principal, room, getToken,
  saveIdentity: identity => credentialStore.save(identity),
});
const {identity} = registration;
const session = await SharedPersistentSession.open({
  database, room, writer: identity.writer,
  create: () => profile.join_frame(room, identity.writer, registration.frame),
  restore: journal => profile.restore(room, journal),
});
const sync = new SharedRelaySync(session.core, {
  identity, getToken, autoConnect: false,
  persistLocal: () => session.flush(),
  onState: state => showSaveState(state, session.state()),
});
await sync.connect();
await sync.flush();
```

On later offline boots, load the separate identity and reopen the same exact
journal through `SharedPersistentSession`; do not allocate another writer or
replace missing history with a fresh AST. Construct sync offline if needed, then
connect when the host can authenticate. Server-allocated editors join the host's
existing seed; they do not use `profile.create` to submit another genesis. New
room creation remains a host-authorized workflow.

One `SharedRelaySync` may attach to a core at a time. It verifies schema/ABI/model
bindings, checks the server's exact writer prefix against native local history,
resumes the writer, checks the prefix again, then admits catchup through the
existing safe remote queue. A server-ahead or divergent same-writer journal
rejects before import rather than becoming this writer's fabricated local
history. Only complete native action groups are submitted, never full multi-
author updates. Canonical receipts must match the actual sent group and native
prefix; socket writes and pending-dependency responses do not advance saved state.

`persistLocal`, when configured, must resolve only after this core's complete
current journal is durable. The send pump captures an author end before awaiting
it; typing during that save waits for a later ticket. A rejected save stops
publication as `local-save-failed`. After repairing/retrying storage, explicit
`connect()` retries the send pump without discarding the core. Without this
callback, transient in-memory editing is supported, but local durability remains
unknown rather than being reported as saved.

State separates exact decimal `localThrough`, `locallyDurableThrough` and
`serverThrough`, plus the canonical server prefix and original receipt sequence
when known. These are authored-operation ends, not complete local journal/UI
revisions; use the persistent session's save state for that distinction.
`waitingFor` exposes bounded missing author/dependency ends. A later server
catchup retries pending work even if the local CRDT already contained those
operations. No pending group is silently treated as acknowledged.

`flush()` waits for the author end captured by that call, not future typing or
all peers. It is bounded at 30 seconds and allows at most 16 waiting calls.
Previously acknowledged work stays known when offline; new offline writes do
not become server durable. `disconnect()` deliberately stops networking and
cancels queued old-connection frames. `connect()` is also the explicit retry
after a permission regrant or writer takeover. Transient network/storage failures
reconnect with bounded backoff; `denied`, `fenced` and incompatible history stop
automatic reconnect so a client cannot repeatedly steal a writer back.

The transport retains at most one pending latest full-state frame in addition
to one active core admission, coalesces superseded trusted snapshots, caps eight
RPCs and socket buffered bytes at 8 MiB, and accepts 6 MiB wire messages. Default
request/token/open timeout is 10 seconds (configurable 100 ms–30 seconds).
Reconnect defaults to 500 ms–30 seconds (configurable minimum at least 50 ms).
State/error callbacks run outside native publication and expose no credentials.
Cancelling initial catchup invalidates its startup promise and socket; an
immediate new connect starts a new lifecycle rather than reusing that promise.

`sync.dispose()` stops networking only. Save/close its persistent session next,
then dispose the mounted DOM editor, which owns its core. Permission loss,
lease replacement and transport disposal never delete a local journal or
dispose an independently owned core. Network presence, cross-host assets,
pixel overlays, combined network-demo integration and optional Rust/Wasm
distribution promotion remain separate gates.

This checkpoint passes 189 combined browser cases (63 in each engine), 229
native editor contracts, 12 native relay tests, strict native/Wasm lints,
generated/installed TypeScript and offline archive runtime checks. The unchanged
legacy Rust/Wasm suite has a prior complete 309-browser-case pass: 498 browser
cases across both matrices. The expanded unisolated shared run passed 188/189
and stalled in WebKit `page.goto` before editor/test code. The canonical runner
now isolates every WebKit file, matching the existing legacy runner; all 189
cases then pass with no retries or altered deadlines/assertions. Three runner
guards prove complete file coverage and exact, non-overlapping filters. This
does not establish a repair of the historical process-lifetime WebKit fault.

## Ephemeral causal presence

`core.presenceFrame()` captures the exact current Rust observation into an opaque
`breditor/shared-rich-presence` V1 packet. `core.resolvePresence(frame)` is a
read-only mapping into the current text/node/grid selection family. Neither call
imports document operations, publishes UI, consumes Undo/Redo or changes the live
observation. Text ranges retain direction, UTF-16 scalar alignment, affinity and
original source routing through split/join/history. Structural deletion uses the
existing explicit clearing/fallback rules. Missing applied causal dependencies
return `pending` until content arrives, rather than guessing numeric offsets.
Explicit absence clears without waiting for unrelated document catchup.

Presence packets bind room, originating writer, schema fingerprint (including
schema identity), shared model and exact engine revision. They contain causal
anchors, not account credentials, display metadata or shared-document payloads.
The separate limit is 256 KiB and at most 1,024 canonical decimal causal clocks.
`supportsPresence()` detects this additive capability; older matching owners
can still use ordinary editing, but presence methods reject as unavailable.
No model, journal or existing owner ABI is reinterpreted.

`new SharedPresence(core, options)` manages the latest opaque packet for each
host-announced peer. Call `announce({writer, session, label, palette?})` only from
the host's authenticated connection/lease metadata. Then call
`receive(writer, session, sequence, frame)`. Sequences are exact decimal strings,
including above the JavaScript safe-integer range. Replaced sessions fence late
packets and old disconnects. Duplicate/out-of-order packets do not refresh expiry
or revive an expired selection. `remove(writer, session)` removes a current peer;
`sweep()` expires packet/display bytes but retains its high sequence until the
host removes or replaces that session.

Defaults are 64 peers, 2 MiB of latest packet bytes and 30-second receipt-based
expiry; host settings may tighten these bounds. A monotonic clock and optional
manual expiry support deterministic tests. Causal publications remap retained
presence automatically, including pending-to-resolved transitions. Membership
and packet mutations reject reentrant callbacks; content-driven notifications
drain through a bounded publication loop. Errors cannot rewind admitted content.
`view()` returns detached peer snapshots. Disposing presence does not dispose its
independently owned editor. Presence is never sent through `receiveFrame`, the
durable journal queue or the upload queue.

The combined demo shows semantic peer selections in a separate output above each
editor, with connection-scoped sessions and heartbeats. These outputs do not
change native selections or document DOM content. Pixel cursor/range overlays
and a network-authenticated presence transport remain integration work. The
same-page demo establishes neither account authorization nor a server lease.

## DOM and toolbar

`mountSharedEditor(root, {core, ...options})` mounts the real owner. The default
toolbar supplies headings, bold, nested lists, table creation, row/column CRUD
and moves, merge/split, headers, widths and image metadata/replacement/removal.
Hosts can replace or extend the typed `SharedToolbarControl[]` without bypassing
Rust admission. Existing captions and cell bodies use the same text actions as
paragraphs. Commands also expose whole-node moves. `set_image_caption` creates,
replaces or removes a complete caption through an explicit writer-owned choice.
The required `caption` field is a fresh `SharedParagraph` or null; omitted values,
headings and nested flow reject. Use `paragraph(freshId, text)` to build a caption.
Ordinary caption typing uses source-preserving text commands, not whole-caption
replacement. The toolbar exposes Add caption and Remove caption.

Concurrent replacements keep both paragraph sources and display one deterministic
choice. Undo retracts only the author's choice; it can reveal the other caption
or the original caption, including text edited while hidden. Explicit null owns
absence even if already absent. Generic paragraph insertion/movement into an
admitted empty image uses the same choice, so concurrent valid insertions do not
produce an invalid two-caption image. Asset identity, generation, alt and size
remain independent.

Creation Undo hides the creator's initial text without deleting its original
characters. Redo reveals that same seed around offline edits, so an offline
prefix keeps its position. Later typing has independent provenance, including
after the new paragraph is joined into another one. Normal text deletion/Redo
continues to use the native engine's rebased gap policy.

Concurrent placement cycles suspend the lowest-priority authored edge and expose
its next retained placement or immutable origin. Both subtrees remain reachable;
Undo can reveal a suspended move. Axis-derived cells retain their implicit row
ancestry without becoming authored occurrences. Local moves into their own
descendants reject without publication. Kind/move conflicts keep the selected
kind and use the highest compatible retained placement. If an immutable origin
is incompatible, a real root occurrence reserved outside history keeps the same
flow block visible. This is not a subtree copy or a new authored repair. Root
before-anchors and later moves address that occurrence normally. Nested-table
conflicts suspend an ancestor move or expose the inner table's reserved root.
Hidden/deleted/unborn content and nonselected captions do not escape merely
because an invisible parent relationship is incompatible. Invalid local moves
still reject atomically; conflict normalization is not an input repair API.

The controller maps native selections and beforeinput targets, stages composition
as one source-preserving replacement, and does not restore a background editor's
selection into another editor. Queue length is bounded at 128 prepared actions.
Synthetic composition checks do not qualify a physical OS input method.

Copy/Cut write plain text and `application/x-breditor-rich+json`; Cut requires
the event store to retain the plain text first. Paste captures the event-scoped
strings synchronously. Empty and unsupported transfers cannot delete a selected
range. Flow paste at a text selection is one Undo group: selection deletion,
source split and fresh rich insertion retain original suffix character IDs.
Clipboard identities are allocated by the Rust namespace helper; a consumed
prefix must never be reused, including after a failed admission.

## Host assets and files

Supply `resolveAsset(binding)` and optional `onFiles(files, position, revision)`.
`insertSharedImageFiles(core, store, files, position, revision)` works with the
existing `RichAssetStore`: it persists validated raster bytes before one guarded
shared insertion, supports 1–16 files and leaves durable bytes intact when an
insertion fails or becomes stale. Paste and drop share that path. Uploads remain
an explicit host action; document commands contain immutable asset references,
not byte payloads or upload completion clocks.

## Reproducible checks and demo

From the repository root:

```sh
node scripts/check-shared-browser.mjs
node scripts/check-shared-package.mjs
node experiments/shared-browser/serve.mjs
```

Open `http://127.0.0.1:49774/demo` after the check builds matching artifacts. Two
Rust writers can edit, disconnect, reconnect, reload and export their exact journals.
The host exchanges updates within that page only and keeps causal journals and
image bytes in local IndexedDB. It sends no document data to an external service.
The first check includes the isolated offline package-consumer check; the second
command can rerun that packaging proof without rebuilding matching artifacts.

## Durable shared sessions

`SharedPersistentSession.open({database, room, writer, create, restore})` obtains
an exclusive Web Lock before loading or restoring the exact writer journal.
The lock is scoped to the origin, room and writer, independently of the database
name. Another tab cannot restore the same active writer through a different
store. Browsers without Web Locks reject recovery rather than opening a clone.
Server-side writer authorization remains a separate requirement across devices
or origins.

The callbacks return matching generated Rust owners. `restore` must use native
journal replay, not a document-only import. The session checks the journal's
room, canonical decimal writer and V12 family both before and after restoration;
Rust checks the causal operations, schema and history. Factory/admission failures
release the lock without replacing the durable checkpoint.

Every publication captures an exact complete checkpoint. One write can be in
flight and one newer complete checkpoint pending; superseded complete snapshots
can coalesce without dropping any events inside the latest journal. `state()`
distinguishes saved, pending, failed and closed. `flush()` acknowledges completed
IndexedDB transactions, not network delivery or uploaded assets. Failed writes
remain explicit; `retry()` captures the newest complete journal after the prior
attempt settles. `close()` flushes, stops the owner, then releases the lock; a
failed close retains the owner and lock for retry. `discardAndClose()` explicitly
abandons unsaved in-memory work but preserves the last durable journal. Do not
dispose the mounted editor before closing its persistent session when a final
durable save is required. Abrupt tab loss releases the Web Lock automatically
and recovers the last completed transaction, not an unacknowledged in-flight edit.
The sample demo uses the configurable factory and a separate
`breditor-shared-demo-application-v12` database. The prior fixed-profile V12
database is preserved rather than silently rebound to an application schema.
Existing V8/V9/V10/V11 databases are preserved, not upgraded, overwritten or silently
treated as document-only imports. Resume old journals with their matching old
owner until an explicit migration workflow exists.

The full collaboration goal still includes combined network-demo integration,
network presence and cross-host asset providers. The package now supplies its
own typed reconnect coordinator; the lower-level browser socket fixture remains
test/admin support. The bounded
journal rebuild is a correctness reference, not a production throughput claim.
See the repository collaboration plan and private owner contracts for limits.
