# External rich content interchange

External HTML and Markdown adapters will convert foreign content into the
existing Rust semantic clipboard. The native construction and export validation
bridge is implemented in local and shared owners. HTML/Markdown parsing,
sanitization, Office fixtures and browser opt-in integration remain unfinished.
Default Copy/Paste behavior and all stored document/history formats are unchanged.

## Native admission contract

The separate `supportsClipboardInterchange()` capability requires native version
`1` and both pure methods. Older owners remain usable, but the bridge refuses
without that exact capability; it never invents a fallback.

- `admitClipboardRoot(kind, rootJson)` admits an external adapter's source
  content and returns `RichClipboardTransfer`.
- `validateClipboard(clipboardJson)` revalidates content for an exporter under
  the owner's exact active schema, returning the same transfer shape.

The transfer is the existing `breditor/rich-clipboard-transfer` version 1:
`kind`, `structuredJson` and exact `plainText`. Its structured content remains
the existing fingerprint-bearing `breditor/rich-clipboard` envelope. There is
no new persisted interchange, history or synchronization protocol.

A source root uses the existing strict node record grammar. It must be a
`breditor/document` with the neutral document identity `breditor-clipboard`.
The adapter declares `text`, `flow` or `grid`; Rust does not guess or repair its
kind. Rust supplies the receiving schema binding and validates all formats,
properties, identities, content shape, table geometry and semantic merge state.
Unsupported schema features reject instead of being silently removed.

Schema admission is not foreign-content sanitization. For example, standard
inline V1 stores bounded link strings; the safe rendering policy filters their
emitted attributes. The foreign adapter and exporter must independently apply
the URL allowlist and report removed links. This bridge deliberately does not
reinterpret the existing link schema or claim that every admitted literal is
safe to emit as HTML.

The input root must fit both the independent 1 MiB clipboard budget and the
active document JSON budget. The allocation preflight runs before owned record
decoding; node, depth, text, properties and format ceilings stay active. The
complete encoded clipboard, including its schema envelope, must also fit the
clipboard budget before admission returns. Invalid drafts return no fragment.

Admission does not normalize a foreign document or make its identities fresh.
Destination IDs and merge priorities are still allocated by the existing paste
plan. The host must reserve a fresh paste prefix even after failure or Undo.
Admission and validation are pure in read-only mode too: document, selection,
pending formats, revision, checkpoint, peer frame and history are unchanged.

No image bytes are loaded, fetched, decoded or uploaded by either method.
Existing immutable asset references remain references. The future foreign
adapter must resolve image sources through an explicit host asset policy before
constructing an admitted image; copying an untrusted URL is not asset ownership.

## Paste and loss reporting

An admitted transfer is source content, not edit authority. The controller must
capture its target revision, prepare the import, then submit one existing
guarded native paste action. A changed target or failed rich insertion rejects
atomically. It must not be retried as plain text without an explicit policy.

For rich blocks pasted into a caption or code block, the approved policy is to
insert text and report formatting loss. The existing native
`projectClipboardText(selection, clipboardJson, revision)` read derives the
text and loss categories before the guarded text edit. The controller reports
losses only after that edit succeeds. Prose retains structured paste; inline
fragments retain their existing rich-paste contract rather than entering this
flow/grid conversion path. Empty or oversized projections still reject.

Foreign conversion losses and destination losses are separate. The future
adapter must report discarded or approximated source content, including
unsupported CSS/layout, unsafe markup/URLs, unresolved images and table or
caption transformations. A successful clipboard admission does not establish
that the foreign conversion was lossless.

## Remaining adapter work

The separate opt-in adapter must parse inert bounded trees, never attach input
markup to the editing DOM, and emit only allowlisted semantic content. It must
bound parser construction and traversal, not only validate the final tree.
HTML export must escape text and attribute values and apply a safe URL and
asset policy. Markdown must name its supported dialect and report features
that dialect cannot represent. Both directions still pass native admission;
there is no second TypeScript editing document.

Fixtures must cover realistic Word list/style markup, Google Docs wrappers and
Excel tables, including mixed formatting, Unicode, nested lists, merged cells,
captions and asset references. Supported content must survive import/export;
unsupported content must have an explicit loss or rejection result. Browser
clipboard integration must be opt-in, preserve the current defaults, and retain
one-group Undo/Redo, exact reload and shared offline recovery.

## Functional checkpoint

The [native interchange checkpoint](qualification/2026-10-16-clipboard-interchange.json)
covers the Rust construction/validation bridge through actual paired local and
shared application Wasm and compiled SDK facades. Its six content shapes are
mixed inline text, a merged table, an image/caption, a grid fragment, a nested
list and the complete rich root. Both explicit and natural history modes are
tested. Complete checkpoints are compared after recovery and future Undo/Redo,
including previous runtimes; no checkpoint fields are excluded.

The local/shared AST comparison excludes only newly authored merge priority
words, whose owners differ. The native bridge does not qualify foreign parsing,
system clipboard or release readiness.
