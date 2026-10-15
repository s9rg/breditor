# Breditor experimental rich content owner

This opt-in package connects a single-user Rust owner to a browser. It supports
rich paragraphs/headings/lists, table and image commands, logical selections,
exact undo/redo, semantic clipboard interchange and replay-proved local recovery.
It includes a DOM editing surface, expandable toolbar and a combined local demo.
Optional durable asset and local-session stores are included; uploads require
an explicit host provider. Shared rich replication and collaboration transport
remain implementation gates. The default Breditor editor and its bootstrap/ABI
contracts are unchanged.

Build and test the matching module from the repository root:

```sh
node scripts/check-rich-browser.mjs
```

This writes only private target artifacts and this package's opt-in `dist`.
The package is private; publishing is not authorized. Release packaging and size
qualification remain separate from functional checks.

## Create and use a local owner

Initialize the bundled opt-in Wasm module once, then pass that exact module to
the profile factory. Do not mix generated classes from different module heaps.
Profile-bootstrap V6 contains the same closed typed extension declarations as
V2–V5 but explicitly selects the rich grammar. Rich content uses fingerprint-bearing
Document V2; local restart history uses `breditor/rich-local-session` V1.
Document and format property/object keys must be sorted and unique, and format
arrays sorted by kind. Use canonical Rust exports for imported content. Typed
command drafts construct these invariants rather than accepting unchecked HTML.
Public TypeScript requests use the closed `RichCommand` union and exported typed
flow, table, image and clipboard drafts. Raw JSON strings remain available for
integrators that need the exact boundary, with the same Rust validation.

```js
import init, * as wasm from '@breditor/experimental-rich-content/wasm';
import {compileRichProfile} from '@breditor/experimental-rich-content';

await init();
const profile = compileRichProfile(wasm, JSON.stringify({
  format: 'breditor/profile-bootstrap', formatVersion: 6,
  schema: {name: 'example/rich-editor', version: 1}, extensions: []
}));
const binding = profile.descriptor();
const document = JSON.stringify({
  format: 'breditor/document', formatVersion: 2,
  schema: binding.schema, schemaFingerprint: binding.schemaFingerprint,
  root: {kind: 'element', type: 'breditor/document', entityId: null,
    properties: {'breditor/document-id': 'document-one'}, children: [
      {kind: 'element', type: 'breditor/paragraph', entityId: null,
        properties: {'breditor/block-id': 'paragraph-one'}, children: []}
    ]}
});
const editor = profile.createEditor(document, '100');
editor.execute({kind: 'setSelection', selection: {kind: 'text',
  anchor: {block: 'paragraph-one', offset: '0', affinity: 'after'},
  focus: {block: 'paragraph-one', offset: '0', affinity: 'after'}
}});
editor.execute({kind: 'insertPlainText', text: 'Hello 🙂'});
const prepared = editor.view();
editor.execute({kind: 'undo'}, prepared.revision);
const restored = profile.restoreEditor(editor.checkpointJson());
restored.execute({kind: 'redo'});
restored.dispose();
editor.dispose();
profile.dispose();
```

`execute` returns `content`, `selection`, `typing`, `undo`, `redo` or `unchanged`.
Failures throw `RichCommandError` with a stable payload-redacting code and publish
no partial state. A supplied expected content revision must match the current
owner revision; the wrapper manages the raw Rust observation authority. Revision
strings do not freeze selection or pending formats, so asynchronous commands
should carry explicit stable targets rather than assume an earlier caret.
Read encoding is separate from successful mutation;
`documentJson`, `view`, `clipboard` and `checkpointJson` do not mutate content.
Dispose owners/profiles explicitly. Disposing a profile does not invalidate
editors already created from it.

## Mount the browser editor

```js
import {mountRichEditor, defaultToolbar} from '@breditor/experimental-rich-content';

const surface = mountRichEditor(document.querySelector('#editor'), {
  core: editor,
  toolbar: defaultToolbar,
  resolveAsset: ({asset}) => ownedAssetUrls.get(asset),
  onChange: (view, outcome) => showRevision(view.revision, outcome),
  onError: error => showError(error)
});
// The surface now owns editor exclusively. Do not execute directly on editor.
surface.execute({kind: 'undo'});
surface.dispose(); // Unmounts and releases the transferred Rust owner.
```

The renderer uses the admitted Rust AST and Rust-derived table geometry. Merged
cells retain separate editable source bodies. Select cell, then Shift-select a
second cell to select a grid rectangle; Enter returns to cell text. Node/grid
selection does not become an incidental browser caret when the surface focuses.

Toolbar controls are declarative and replaceable; custom commands use the same
bounded serial coordinator. Reentrant host callbacks queue work instead of
publishing inside an existing publication. Asynchronous hosts can pass an exact
observed revision to `surface.execute(command, focus, revision)`.

Input uses UTF-16 stable block coordinates. Explicit replacement/deletion targets
preserve the actual pre-edit caret in history. Selected Enter and whole-flow
paste split/replace/insert as one atomic undo group, not several staged owner edits.
Composition temporarily keeps native DOM stable, then commits one text diff;
canceling drains queued work too. Each ordinary input event remains one undo
group; typing coalescing and physical IME qualification are not complete.

Copy/Cut supply structured content and plain text to the event's data store.
Cut checks that the supplied plain text was retained before deleting content.
This is not an OS durable clipboard acknowledgement. File paste/drop calls the
optional `onFiles(files, stablePosition)` host hook; no upload is silently started.
Asset resolution is host-owned and never persists DOM URLs into the document.

After building, `node experiments/rich-browser/serve.mjs` serves the interactive
demo at `http://127.0.0.1:49773/demo`. Session export/import restores the exact local
undo/redo branch; the sample's owned raster assets are separate from that JSON.
The demo does not send document data or asset bytes to a server. It now saves
the exact session in IndexedDB, scoped to the current tab, and restores that
session and retained image bytes on reload. A production offline app shell is
not included; the offline test supplies a cached shell through the test harness.

## Durable file images and optional uploads

```js
import {RichAssetStore, insertImageFiles, mountRichEditor}
  from '@breditor/experimental-rich-content';

const assets = await RichAssetStore.open('my-app/assets', {
  onChange: record => showUploadState(record)
});
const surface = mountRichEditor(root, {
  core: owner,
  resolveAsset: ({asset}) => assets.resolve(asset),
  onFiles: async (files, position) => {
    await insertImageFiles(surface, assets, files, position);
  }
});
// Run explicitly when the host has network access and upload authority.
await assets.flush(async (record, blob, signal) => {
  return uploadToYourAssetService(record.asset, blob, signal);
});
```

PNG, JPEG and WebP bytes, declared MIME, encoded size, header dimensions and
browser decoding are checked before storage. Defaults are 10 MiB per file,
32 megapixels, 16,384 pixels per dimension and 100 MiB retained bytes; hosts can
tighten them. These are functional guardrails, not distribution/performance
qualification. Stored payloads are ArrayBuffers: the tested WebKit runtime rejects
Blob/File-backed IndexedDB records. Blobs and object URLs are reconstructed for
rendering/upload and never embedded in document JSON.

Asset IDs are SHA-256 hashes of immutable bytes. Deduplication and the total byte
budget update atomically; `ingest` resolves only after transaction completion.
`insertImageFiles` stores every admitted file before one Rust `insertBlocks` group
at a cloned stable position. A missing/deleted target fails without partial image
insertion; accepted bytes remain recoverable. One insertion accepts 1–16 files.

Queue states are pending, failed, cancelled and uploaded. `retry` and `cancel`
are explicit host actions and retain bytes. Late receipts are guarded by an
upload epoch; completion updates only asset storage, never image identity,
generation, metadata or document history. Deletion/replacement cannot be undone
by an upload completion. An uploader must be idempotent by asset ID: a crash can
occur after its remote write but before the local receipt is committed. Web Locks
serialize live tabs where available, but are not a durable exactly-once protocol.
The host is responsible for authorization, provider deadlines and remote asset
resolution for other peers. No uploader runs without an explicit `flush` call.

`blob`, `list` and `get` expose retained bytes/metadata for host recovery. `close`
aborts this owner's live work, revokes its object URLs and closes its connection;
it does not delete assets. No garbage collection is implemented because history,
offline peers and backups may still reference them. Session JSON is not a portable
asset-byte backup.

`cacheRemote(asset, blob, storageRef)` admits a downloaded raster through the
same decode/dimension/digest checks, then verifies the expected content key
before any storage transaction. A newly cached remote record starts uploaded,
not pending; an existing local record keeps its status and cancellation epoch.
This prevents download/re-upload loops and late downloads overriding a cancel.
The transport still owns authorization, response bounds and durable receipt
validation. The optional collaboration package supplies `SharedRelayAssets`
for its reference Rust host. The read-only rendering subpath also exports
`refreshAssets(surface, options)` for image-only retries without rebuilding text.

## Optional exact local checkpoint persistence

`RichLocalSessionStore.open(name)` stores exact checkpoint strings with a 16 MiB
ceiling and a bounded serial write queue (64 writes, 32 MiB pending bytes).
`save` resolves after its IndexedDB transaction completes; `flush` waits for the
last scheduled write. Replay-admit `load()` through the matching rich profile
before mounting an owner. Await `flush` before closing if the last write matters.
Use a distinct store name per exclusive local editor; this helper does not lease
writers, merge tabs, persist collaboration state or acknowledge a server save.

## Command construction

Basic commands use exact fields: `setSelection` has `selection` (or null),
`insertPlainText` has `text`, `setHeading` has `block` and nullable `level`, and
`setPendingFormats` has `formats`. Undo, redo and deleteSelection have only kind.
Null pending formats means derivation; an empty array means explicit plain text.

Other commands have exactly `{kind, data}`. Each command has a separately named
Rust decoder under `crates/breditor-wasm/src/rich_editor/command`; the public
functional tests demonstrate every action's exact fields. Commands cover whole
table/image insertion/removal; row/column insertion/removal/moves; header intent,
merge/split and resize; alt/caption/asset replacement; flow insertion/replacement;
heading/list conversion, indent/outdent and text/item split/join; explicit inline
formatting; logical grid navigation; and inline/flow/grid clipboard paste.

Drafts contain typed host-owned IDs and bodies, not HTML or asset bytes. Cells
have a nonempty flow body; list items begin with text; image captions are one
paragraph; no table may occur beneath another table. Formatting literals use
the canonical `text.formats` JSON array encoded as `formatsJson`. Format sets
must match the compiled schema and active limits.

Text offsets, replica IDs, counters, priorities and revisions are canonical
decimal strings, never coerced browser numbers. Structural insertion addresses
stable parents and direct-child before anchors. Host IDs must be fresh across
historical deletions, not merely absent from the current document.

## Clipboard and recovery boundaries

`clipboard()` returns null for no selection/collapsed text, otherwise a transfer
with `kind`, `structuredJson` and `plainText`. Structured payloads use
`breditor/rich-clipboard` V1. Copying a merged rectangle retains every base body
and current active span, not inactive merge history. Plain table text is quoted
TSV; images contribute alt/caption text, not asset URLs.

Inline paste replaces supported text ranges. Flow paste inserts newly identified
blocks at an explicit stable position. Grid paste requires an exactly matching
merge-closed rectangle. Flow/grid paste supply one unique `allocation.prefix`
per authored paste plus exact `replica`, `counter` and `lamport` strings. Consumed
namespaces remain consumed even when publication fails. Assets retain immutable
references while copied image nodes receive fresh binding generations.

Current range planners cover one text block, direct sibling flow or sibling
leading list heads. Arbitrary cross-cell/container ranges are rejected. Grid
navigation stops at table boundaries without silently creating rows. Each content
command creates one local undo unit; typing coalescing and native IME handling
remain qualification work. The browser controller stages composition, but tests
using synthetic composition events do not establish physical IME support.

Checkpoint recovery validates all retained forward/inverse recipes and restores
the redo branch with fresh owner tokens. This is local history, not selective
collaborative undo. Encoding a checkpoint is not a durable-storage acknowledgement.
Host asset bytes and pending uploads are stored separately by the optional asset
store. Shared causal state, selective undo, presence and relay persistence remain
separate implementation gates.
