# Breditor shared rich editor

An opt-in browser coordinator for the exclusive Rust shared owner. It connects
the existing rich renderer to causal text, tables, images, lists, semantic
clipboard and writer-local Undo/Redo. The DOM and TypeScript never own a second
replicated document.

This private workspace is an integration checkpoint, not a published package.
The matching generated owner currently comes from the isolated collaboration
fixture; a generic compiled-profile factory and optional Rust crate promotion
remain required for application distribution. The default Breditor packages and
their Wasm graph are unchanged.

## Owner contract

`new SharedRichEditor(raw, options)` transfers exclusive ownership of a matching
generated Rust owner. Its descriptor must identify ABI 1, shared model 9 and
journal 10. Never mutate, free or transfer `raw` again. Disposing the coordinator
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

`checkpointJson()` preserves the original seed/join, ordered imports, commands,
selective history, causal UI anchors and future operation identities. Restore
only under the same exclusively leased writer. It is not a portable content
import or permission to clone a live writer. Earlier shared models and journals
are incompatible with the current source-routing and caption-choice contract.

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
room, canonical decimal writer and V9 family both before and after restoration;
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
The sample demo uses a separate `breditor-shared-demo-sessions-v10` database.
Existing V8/V9 databases are preserved, not upgraded, overwritten or silently
treated as document-only imports. Resume old journals with their matching old
owner until an explicit migration workflow exists.

The full collaboration goal still includes a permission-aware network relay,
presence, server-authorized writer leases, cross-host
asset providers and general placement-conflict/cycle normalization. The bounded
journal rebuild is a correctness reference, not a production throughput claim.
See the repository collaboration plan and private owner contracts for limits.
