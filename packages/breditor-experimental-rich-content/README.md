# Breditor experimental rich content owner

This opt-in package connects a single-user Rust owner to a browser. It supports
rich paragraphs/headings/lists, table and image commands, logical selections,
exact undo/redo, semantic clipboard interchange and replay-proved local recovery.
It includes a DOM editing surface, expandable toolbar and a combined local demo.
Optional durable asset and local-session stores are included; uploads require
an explicit host provider. Shared editing and the reference relay live in the
sibling collaboration package. The default Breditor editor and its bootstrap/ABI
contracts are unchanged.

Build and test the matching module from the repository root:

```sh
node scripts/check-rich-browser.mjs
```

This writes private target artifacts and the opt-in `dist`, and rebuilds the
paired `@breditor/browser` JavaScript presentation helpers. It does not rebuild
or replace the default Wasm package. `scripts/build-rich-runtime.mjs` also builds
the exact local rich Wasm before shared-package assembly; installed consumers
check the local factory and its catalog API rather than trusting a warm output
folder. A failed compilation or binding generation stops before copying a stale
runtime into the package.
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

`{kind: 'insertHardBreak'}` is a no-payload command that replaces the current
supported text selection with one LF in one Undo group. It retains logical-start
typing formats and does not split a block. Shift+Enter uses this contract; ordinary
Enter remains structural outside code. Explicit `compileStructuralRichProfileV2`
and `compileStandardStructuralRichProfileV2` accept bootstrap V7 for blockquotes,
plain code, rules and tasks; ordinary factories retain V6/V1. The standard V2
factory uses standard inline V1 and `createStructuralRichToolbarV2`. V2 descriptors
add `richLanguageVersion: 2` and `taskStructureVersion: 1`; older V2 runtimes
without the matching task commands reject before owner creation. No saved
document or checkpoint is migrated.

V2 typed commands include the separate wrap/unwrap, code/language, rule and task
operations. Task split creates an unchecked right item and retains the left state
and exact rich tail; join keeps left completion, with both original states in its
inverse. Checkboxes submit explicit native checked values. Task-specific indent
and outdent preserve completion and complete bodies; a fresh nested/suffix ID is
required only when a new container is necessary. Browser Enter selects a separate
empty-exit action only for a collapsed empty head with no rich tail. Nested exit
promotes one level; top-level exit retains the same prose block and keeps removed
completion metadata in Undo. The same Indent/Outdent controls and prose
Tab/Shift+Tab prepare these commands. Checkbox Tab navigation, code and composing
keys have no implicit task-indent meaning. Explicit split commands still split.
Code has no inline
formats and its conversion form requires a declared formatting-loss policy.
Partial code/prose joins reject. Shared V2, complete atomic navigation, code-exit
shortcuts and external rich interchange remain open.

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

## Schema bound inline presentation

`profile.inlineCatalogJson()` reads the original `breditor/inline-format-catalog`
V1 record from the compiled Rust schema. It includes exact schema identity,
format revisions and typed property domains, not document content or a schema
proof. A local and shared owner can use the same `createRichInlinePresentation`
compiler and `inlinePresentation` option:

```js
import {createRichInlinePresentation} from '@breditor/experimental-rich-content';

// Complete renderer for the earlier extensions: [] profile.
const inlinePresentation = createRichInlinePresentation(profile.inlineCatalogJson(), {
  recipes: [{formatKind: 'breditor/strong', element: 'strong'}]
});
```

Extension profiles need exactly one compatible recipe per admitted format. The
compiler reuses the default editor's checked tag/order and safe-Link, RGB24 color
and integer-token policies through `@breditor/browser/presentation`. Tags and
attributes are closed; arbitrary HTML, CSS and executable callbacks are not
presentation declarations. Integer tokens need host CSS. Schema mismatch rejects
before mounting changes the host; unsafe stored Link values become inert anchors
without changing their canonical Rust value. Declarations are detached and frozen.
The legacy `inlineTag` option remains separate and cannot be combined with this
compiled presentation. The opt-in standard toolbar below uses this same binding.

`editor.inlineFormatState(formatKind)` reads Rust-derived state without changing
the document, selection, pending typing formats, history or publication guard.
The read includes its exact schema binding and queried kind. Its `state` is
`unavailable`, `unset`, `uniform` with the complete semantic format, or `mixed`
with `presentEverywhere`. Different Link URLs can be mixed while every character
still has a Link. Partial presence is a different mixed state. A collapsed caret
uses focus affinity and an explicit pending override, including `[]` for plain
typing. Unknown kinds reject instead of appearing absent. Empty selected fragments
and node/grid selections are unavailable; this query does not broaden command
selection support. Raw local observations retain their frozen read after later
edits. The result is not action authority; mutations still need their normal guard.
The complete JSON read is limited to 64 KiB. An oversized uniform value fails
explicitly; it is never truncated or reported as an absent format.

## Standard inline profile version 1

`compileStandardRichProfileV1(wasm, bootstrapJson)` explicitly installs the
Rust-owned `breditor-inline/standard@1` extension before resolving the V6
application extension graph. The ordinary `compileRichProfile` constructor
still installs no preset. Application extensions can depend on the standard
extension; duplicate identities or format claims reject instead of overriding it.

```js
import {
  compileStandardRichProfileV1, createStandardRichInlinePresentationV1
} from '@breditor/experimental-rich-content';

const standard = compileStandardRichProfileV1(wasm, JSON.stringify({
  format: 'breditor/profile-bootstrap', formatVersion: 6,
  schema: {name: 'example/standard-editor', version: 1}, extensions: []
}));
const inlinePresentation = createStandardRichInlinePresentationV1(
  standard.inlineCatalogJson()
);
```

Create the document using `standard.descriptor()` and pass the presentation to
`mountRichEditor`. A plain-profile document or checkpoint has a different schema
fingerprint; changing constructors is not a migration and must not be implemented
by overwriting a saved fingerprint. Owners already created from a factory remain
valid after the factory is disposed.

The twelve V1 formats have fixed semantic identities and domains:

- Bold, italic, underline, strike, inline code, subscript and superscript are
  property-free. Bold retains the existing `breditor/strong` identity.
- Link requires `breditor-inline/href` (1–2048 UTF-8 bytes) and the Boolean
  `breditor-inline/new-window`. The existing closed HTTP(S) render policy keeps
  unsafe schema-valid strings as inert data.
- Text and background color require integer `breditor-inline/rgb24` in
  `0..=16777215`; renderers emit only canonical RGB styles.
- Text size requires integer `breditor-inline/pixels` in `8..=96`; rendering
  emits a canonical pixel size, not document-provided CSS text.
- Font family requires integer `breditor-inline/family`: 1 system, 2 sans-serif,
  3 serif, 4 monospace. These are font-stack presets, not embedded/downloaded fonts.

`standardInlineKindsV1` and `standardInlinePropertiesV1` expose the names for typed
commands. Native hosts can compose `standard_inline_extension_v1()` into their
own extension set. The manifest contains no action callbacks or DOM policy.
Subscript and superscript are independent admitted literals; changing one does
not silently remove the other. The standard toolbar switches scripts with an explicit group.

The standard renderer pins every standard format revision to 1. Additional
application recipes use its optional second argument, an ordinary complete
`{recipes: [...]}` declaration for those extra formats. Complete coverage and
all existing inert-manifest guards still apply. Both mounted controllers include
the fixed font CSS; standalone render hosts can apply `standardInlineStylesV1`.
An incompatible preset needs a new explicit version rather than changing V1.

## Standard inline toolbar

`createStandardRichToolbarV1(core, inlinePresentation)` returns the existing
structural controls plus the twelve standard inline formats, reset actions and
Clear standard formatting. Pass it as the `toolbar` option alongside the same
`core` and `inlinePresentation`. The returned declarations can be filtered or
reordered; ordinary profile constructors and the default toolbar are unchanged.
The factory checks the compiled presentation and matching Rust capabilities
before mounting. An older Wasm module rejects rather than silently losing state.
Standard controls are bound to that owner; mounting them with another owner
rejects before changing the host. Custom owner-neutral controls remain reusable.

Rust supplies active, mixed and unavailable state. Color, size, font and Link
fields show a blank mixed value rather than choosing one of the selected values.
Ordinary set-format commands replace the complete property map. A mixed Link form
also supports an explicit field-only patch: leave URL blank to keep each existing
URL, or target blank to keep each existing target. Every selected character must
already carry a Link for a partial patch. Supplying both fields creates/replaces
complete links; Unlink removes them. The separate `changeInlineFormats` command
accepts `{kind:'patch', formatsJson, properties}` with one complete admitted
template and a nonempty unique list of property names. Only named fields are
copied to existing per-run values, while other properties and formats survive.
`supportsInlinePropertyPatches()` reports the additive native capability; the
original standard-controls version stays 1. The original `setInlineFormat`
command remains set/remove-only. A missing format or invalid target rejects the
complete transaction. See `docs/RICH_INLINE_PROPERTY_PATCHES.md` in the repository.
Links accept only absolute credential-free HTTP(S) URLs without whitespace.
Stored schema-valid unsafe strings remain inert until explicitly replaced.

Cmd/Ctrl-B, I and U toggle marks; Cmd/Ctrl-Shift-X toggles strike and Cmd/Ctrl-K
opens Link. Alt-modified shortcuts are not intercepted. Enter submits a field;
Escape discards its draft and returns focus to the editor. A dirty form rejects
if content, selection, pending styles or history changed after editing began,
including selection-only changes with unchanged document bytes. Escape resets it to current state.
The draft stamp is only a UI comparison; Rust observations still authorize writes.

`core.caretFormats()` reads the exact effective caret format set, including custom
formats and focus affinity. It rejects a non-caret or output beyond 64 KiB without
truncation. Standard caret controls preserve those custom formats; Clear standard
formatting removes only the standard kinds. Range controls use one compound
history group. Subscript/Superscript explicitly remove the opposite kind in that
group, without changing the underlying schema's independent-literal contract.
Resetting absent formats is a true no-op that preserves history and pending state.
Existing command/document budgets apply; oversized selections reject rather than truncate.
Typing at a browser target matching the current caret uses ordinary typing and
retains pending styles; distinct replacement targets retain their range semantics.

Custom controls can add `fields`, `read` and `shortcut`. Field IDs map to strings
in the optional third `command(context, value, fields)` argument. Existing
single-field/two-argument controls remain supported; a widget admits at most
eight fields. Context/floating menus,
natural typing coalescing and foreign interchange remain separate work.

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

### Compound inline formatting

`changeInlineFormats` applies several explicit format changes across text
intervals in one guarded publication and one content Undo unit. It is separate
from `setInlineFormat`, which still accepts exactly one format change.
For an explicitly selected standard profile:

```js
editor.execute({kind: 'changeInlineFormats', data: {
  changes: [
    {kind: 'set', formatsJson: JSON.stringify([
      {type: 'breditor-inline/subscript', properties: {}}
    ])},
    {kind: 'remove', format: 'breditor-inline/superscript'}
  ],
  targets: [{block: 'paragraph-one', start: '0', end: '4'}]
}});
```

Each set contains exactly one schema-admitted literal. Changes must be nonempty
and use distinct declared kinds; a set and removal of the same kind is rejected.
Targets must be nonempty, contain each block once, and specify nonempty,
scalar-aligned UTF-16 intervals in paragraph/heading text blocks, including cell
bodies and captions.
Targets are explicit; this command does not infer them from the selection or
change collapsed-caret pending formats.

Changes are simultaneous within each selected run, so their array order does
not affect the result. Only the final format set is admitted: switching from
one format to another works even at a one-format-per-run limit. Unchanged kinds,
text, block identities and selection endpoints are retained. A late failure in
another target leaves the document, selection, pending state and history intact.

Each target consumes one action regardless of how many format kinds change.
Target count must fit the active operation ceiling (1,024 by default). Unique
declared kinds bound the change count by the compiled schema; existing
format/document limits and the 1 MiB command envelope still apply. Empty,
duplicate, unknown and oversized requests
reject rather than being truncated. Native hosts use
`SetInlineFormat::capture_changes` with their normal guarded apply/dispatch.
The existing local checkpoint representation remains unchanged, including exact
future Undo/Redo after restore. This is not a new replicated command or a general
cross-container replacement contract.

Raw rich Wasm execution now validates its exact observation before parsing the
request. Native `RichLocalSession::validate_observation` offers the same read-only
preflight. Dispatch still checks the guard again; preflight does not rotate it
or turn an observation into a reusable permit.

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
