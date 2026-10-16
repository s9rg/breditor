# Native selection coverage and formatting

Rust derives formatting targets from the current selection across paragraphs,
headings, nested lists, tasks, quotes, table source cells and image captions.
The same native plan drives local and shared owners. JavaScript supplies format
intent, not a list of intervals or a replacement document.

## Coverage and protected domains

`RichSelectionCoverage::capture` requires a selection proved against the exact
immutable source document. It retains AST preorder, structural parent IDs, node
kinds, whole or partial inclusion, scalar-aligned UTF-16 intervals and a checked
selected-character total. It contains no copied text or asset bytes.

Original text ranges keep their original AST-order meaning and direction. A
range endpoint inside a block selects its characters, not its enclosing wrapper;
an intermediate whole node is distinguished from a partially crossed ancestor.
Whole-node coverage includes only that node's subtree. Grid coverage includes
each merge-closed base-cell body once, without including other cells between the
selected cells in AST order. Retained source-cell identities are not replaced by
the visible master-cell identity.

Each record retains its nearest protected domain: ordinary document flow, a
base cell, or an image caption. In the caption read, `domain.image` is the
image **block ID**, not an image resource or asset ID. Caption ownership takes
precedence over the outer cell. Empty text blocks, code and hidden tables remain
visible to the coverage contract; coverage does not relax their editing rules.

`RichSelectionCoverage::document` explicitly covers the complete document,
including leading and trailing atoms. It is a read, not a persisted Select All
selection. A cleared selection has scope `none`, distinct from scope `document`.
An independently decoded equal tree is a valid source; another document,
schema binding or changed tree rejects a retained plan.

## Native formatting intent

`change_selection_formats` on a local session and
`change_selection_formats_guarded` on a shared replica accept one unique change
per format kind. Set replaces the complete typed value. Remove uses the kind of
a complete schema-valid literal. Patch changes only named properties, preserving
each observed value of omitted properties; every selected character must already
carry the patched kind. Duplicate kinds and an empty intent reject.

At a caret, intent changes effective pending formats only and creates no content
history. At a non-caret selection, nonempty text intervals receive the complete
change together in one history unit. Any touched code block rejects the entire
mutation, even when it is empty. Formatting never silently skips selected code.
Unknown properties, stale observations, read-only policy, limits and a late
failure leave content, selection, pending formats and history unchanged.

Local lowering uses original `SetInlineFormat` actions. Shared lowering uses
original `SetFormat` annotations, with removals before sets, and verifies its
complete staged document against the native local semantic preview before live
adoption. Shared history retains the original selective ownership rules: peer
text and foreign formatting survive the author's Undo and restart.

No document, schema fingerprint, shared model, journal, frame or checkpoint
version changes. Older Wasm rejects the new convenience request but can restore
the resulting original saved actions and reproduce future history.

## Wasm and SDK surfaces

Local Wasm advertises `selectionFormattingVersion() === "1"`. Frozen observations
provide `selectionCoverageJson("selection" | "document")` and
`selectionFormatStateJson(kind)`. A frozen read remains bound to its original
document after the live editor changes. The closed local command is:

```ts
const changes = [{
  kind: "set" as const,
  formatsJson: JSON.stringify([{type: "breditor/strong", properties: {}}]),
}];
editor.execute({kind: "changeSelectionFormats", data: {changes}});
```

A patch also supplies `properties`, an array of qualified property names. No
request accepts browser-chosen `targets`.

Shared Wasm supplies `selection_formatting_version`, guarded
`selection_coverage_json`, `selection_format_state_json` and
`change_selection_formats`. The SDK exposes `supportsSelectionFormatting`,
`selectionCoverage`, `selectionFormatState` and `changeSelectionFormats(changes,
expectedRevision?)`. It requires the exact capability and every method; there is
no JavaScript command fallback. Reads are legal in read-only mode.

Coverage reads use `breditor/rich-selection-coverage` version 1. Selection-format
state uses the separate `breditor/rich-selection-format-state` version 1. The
original `breditor/rich-inline-format-state` retains its original Node/Grid
unavailable result. Both state reads retain exact mixed-property values and
schema bindings; neither is mutation authority.

Matching structural V2 stock toolbars use native selection formatting.
`createSelectionRichToolbarV1` and `createSelectionSharedToolbarV1` are explicit
factories for custom hosts, including hosts using the original rich language.
The original standard toolbar factories keep their contracts. V2 controllers
also retain Bold, Italic, Underline, Strike and matching formatting input events
with an empty toolbar. Widget focus, composition and read-only policy take
precedence over those shortcuts.

## Limits and remaining selection work

Coverage JSON has a separate 4 MiB ceiling; format-state reads and JSON intent
have 64 KiB ceilings. Reads fail completely instead of truncating records. Local
formatting retains the context's transaction action ceiling, normally 1,024
nonempty text blocks. Shared lowering retains the original 64-command ceiling;
multiple kinds or mixed-property patches may consume several commands per
block. Its sequential annotation admission may require transient property or
format headroom even when the final preview fits. Hosts must handle refusal;
neither owner silently enlarges a budget or commits a prefix.

Coverage does not change browser selection projection. A native text range uses
AST order; a rendered merged cell can display its retained source bodies in a
different order. The browser's existing cross-cell drag still becomes a Grid
selection. General visual-order ranges, document-wide Select All mutations,
cross-container destructive replacement and gap/drop positions remain separate
contracts. Whole-document coverage alone implements none of those mutations.

## Verification

The core tests cover direction, domains, every pair of fixture text blocks,
surrogate boundaries, stale source proof, strict decoding and read-budget
refusal within default document limits. Local Wasm tests exercise frozen reads
and both original history families. Canonical and same-source research tests
cover merged source bodies, exact restart, pending state, peer preservation,
complete command-limit refusal and late patch failure.

`experiments/editor-browser/selection-formatting.spec.mjs` exercises clean-installed
vanilla and React owners in Chromium, Firefox and WebKit. Its 45 cases check
every intended formatted character, unrelated source cells, captions, mixed
Link patches, keyboard routing, read-only policy, peer editing and exact future
history after reload. `scripts/probe-selection-formatting-compatibility.mjs`
compares actual pre-capability and current Wasm. The
[qualification record](qualification/2026-10-16-selection-formatting.json) binds
all 522 installed SDK cases and 78 serial application cases to the exact
archives, alongside 2,418 root Rust tests, 303 canonical shared tests and
48 cross-version restores with 144 exact future-history comparisons.

This is a selection-formatting checkpoint, not completion of the two V1
workstreams or repair of the historical WebKit reliability observations.
