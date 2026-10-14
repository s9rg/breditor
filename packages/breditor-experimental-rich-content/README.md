# Breditor experimental rich content owner

This opt-in package connects a single-user Rust owner to a browser. It supports
rich paragraphs/headings/lists, table and image commands, logical selections,
exact undo/redo, semantic clipboard interchange and replay-proved local recovery.
It does not yet include a DOM editing surface, upload provider or collaboration
transport. The default Breditor editor and its bootstrap/ABI contracts are unchanged.

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
no partial state. A supplied expected revision must match the current managed
observation exactly. Read encoding is separate from successful mutation;
`documentJson`, `view`, `clipboard` and `checkpointJson` do not mutate content.
Dispose owners/profiles explicitly. Disposing a profile does not invalidate
editors already created from it.

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
belong to the future input controller.

Checkpoint recovery validates all retained forward/inverse recipes and restores
the redo branch with fresh owner tokens. This is local history, not selective
collaborative undo. Encoding a checkpoint is not a durable-storage acknowledgement.
Host asset bytes and pending uploads are stored separately.
