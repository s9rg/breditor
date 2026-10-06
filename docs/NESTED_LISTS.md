# Nested lists: experimental implementation contract

Status: Rust editing and persistence implementation in progress. Not enabled in the browser or current
opt-in flat-list package. This work does not resolve the intermittent WebKit fault.

## Document shape

A list contains one or more items. Each item contains exactly one leading
paragraph or heading, followed by zero or more child lists. Child lists may use
different marker families and explicit ordered starts. Empty lists, items without
a leading block, and blocks interleaved after child lists are invalid. Existing
document depth, node, child-count and ordinal limits apply at every level.

The experimental nested schema has a different fingerprint. Flat-list admission
and editing capabilities remain unchanged; flat operations must reject nested
schemas. Document JSON admission does not imply session/history compatibility.
No silent migration or fallback to flat traversal is permitted.

## Next checkpoints

1. Add a nesting-aware item-path and selection resolver. Test mixed marker types,
   heading items, empty blocks, emoji, backward ranges and end-exclusive ranges.
2. Implement `indent_list_items.rs`: move a contiguous sibling run beneath its
   preceding sibling, carrying all descendants. Disable for the first item,
   incompatible selection scopes, or depth-budget overflow. Preserve source
   marker family/start; merge only when numbering and family are compatible.
3. Implement `outdent_list_items.rs`: lift a contiguous sibling run one level.
   Preserve following-sibling order by attaching the trailing run beneath the
   last lifted item. At root level disable outdent; Remove list remains explicit.
4. Each structural edit is atomic and has exact inverse, selection mapping and
   replay coverage. Preserve inline formats, heading ranks, descendants and
   explicit ordered starts. Rejected edits leave state/history untouched.
5. Qualify nested text insertion/deletion, Enter, Backspace, formatting, plain-text
   clipboard, projection, rendering, recovery and codecs before browser exposure.
6. Add expandable-toolbar Indent/Outdent actions. Handle Tab/Shift+Tab only inside
   an editable list when the action is enabled; otherwise retain focus navigation.
   Verify physical keyboard and accessibility behavior separately.

Each action belongs in its own named, documented file. Every checkpoint requires
focused failure cases and regression tests; no shipping bundle rebuild or release
claim until end-to-end support is qualified.

## Implemented

- Feature-gated `CompiledSchema::try_compile_nested_list_profile` for admission.
- Separate grammar module and tests for recursive admission, invalid shapes,
  document round-trip, resource limits, distinct fingerprints and rejection by
  existing flat-operation capability checks.
- Snapshot-local sibling selection resolver, including backward/end-exclusive
  ranges, empty items and scalar-boundary validation. It grants no editing
  authority and rejects cross-container selections.
- Experimental `NestedListReframe` primitive with complete root-subtree guards,
  exact depth-first block preservation, schema/limit validation, inverse and
  point relocation. Session transactions and undo/redo support the operation;
  full durable session/replay integration remains required before browser exposure.
- `OperationJsonCodecV7` explicitly admits nested reframes, with schema-fingerprint
  binding, bounded raw-tree preflight and canonical encoding. Older formats stay
  closed. V7 transaction requests and replay-proved commits now use this payload
  language. Session checkpoint V7 reconstructs history and proves derived inverses.
  Core recovery tests cover indent/outdent at every cursor using fresh schema
  contexts. Packed Wasm/browser reload and recovery qualification remains open.
- Rust `IndentListItemsAction` moves a sibling run with descendants, preserves
  ordered starts, merges compatible trailing child sections, and previews the
  complete result against limits before preparing one history unit.
- Rust `OutdentListItemsAction` lifts sibling runs one level and attaches trailing
  siblings and later child-list sections beneath the last lifted item, preserving
  reading order. Promoted items inherit destination markers; retained numbered
  sections preserve explicit starts. Root outdent is disabled. Both actions share
  guarded atomic planning; browser registration remains outstanding.

## Release gate

The goal is fully tested end-to-end nested lists, not schema admission alone.
All six checkpoints above must be completed before a release-ready claim.
Require atomic failure tests, inverse/replay and selection mapping properties,
existing flat/default regression suites, packed-consumer tests, all three browser
engines, recovery compatibility checks, and native keyboard/input/accessibility
qualification. The unresolved intermittent WebKit fault remains an explicit risk;
green bounded reruns alone do not close it. No push or publication is authorized.

## Deferred

Nested text work in progress: `NestedListTextSplice` supports scalar-aligned
replacement under arbitrary admitted item nesting while guarding the containing
root and preserving wrappers. V7 operation and session persistence support this
primitive; mixed indent/text/outdent histories are tested at every cursor.
`InsertNestedListTextAction` now supports same- and cross-block typing with format inheritance,
exact caret placement and merged typing history. Nested toggle/set/clear inline
formatting now traverses selected blocks in depth-first order, retains directional
logical endpoints, and supports pending formats at carets. Multi-block formatting
uses `NestedListFormatRewrite`: one guarded root-span operation with final-result
validation, exact inverse, aggregate-offset relocation and V7 recovery. The
near-node-limit regression proves a growing block and a shrinking block can be
formatted together without requiring a larger intermediate document or one
operation per block. V1–V6 remain closed to this operation. Browser integration
remains outstanding.

`NestedListTextReplace` now supplies the structural primitive for those actions.
It accepts real nested block paths, inserted text-block fragments and an explicit
container template. Canonical empty paragraphs are template slots; all result
blocks are consumed exactly once in depth-first order. List/item metadata is
explicit, not inferred. Complete source roots are guarded, prefix/suffix text and
unselected blocks are retained, and the same-type inverse must reconstruct the
exact original roots. V7 persists this recipe; old codecs reject it. Tests cover
nested splits retaining descendants, cross-descendant replacement, stale guards,
scalar-boundary rejection, descendant caret relocation and session undo/redo.
Fragment-sequence decoding is bounded by the total-node budget rather than a
single container's fanout, while final document fanout remains strictly checked.
`InsertNestedListBreakAction` now connects same- and cross-block Enter to this primitive:
splits retain descendants beneath the right item, empty nested items outdent once,
and empty root items exit with child sections promoted and following ordered
starts retained. Bare empty headings become paragraphs. Registration is opt-in Rust
only; the browser profile and toolbar/keyboard wiring remain unfinished.

Cross-block typing, Enter and `DeleteNestedListSelectionAction` share an explicit
retention policy. The left location survives. Later selected leading blocks and
empty containers are removed. Surviving child sections of a removed item attach
to the preceding retained sibling; when none exists, they rise one level as
separate sections. Marker families and starts remain explicit. Retained items
within one list renumber naturally; a retained suffix starting a separate section
keeps its original ordinal. Enter puts surviving descendants beneath its right
item. The operation independently proves text-block order and exact inversion.

Nested Backspace/forward Delete now share Unicode grapheme segmentation with
existing text actions. Scalar-aligned extended selections remain exact; carets
inside a grapheme are disabled. First-item Backspace outdents one level, or lifts
a root item into its unchanged bare block with child sections promoted and the
following ordered start preserved. Other boundaries join adjacent depth-first
blocks using the retention policy above. Forward Delete does not outdent.
Newly formed graphemes at joins snap the caret forward for Backspace and backward
for Delete. Directional text edits merge by direction; structural outdents/lifts
are independent undo events. Document boundaries are disabled. These are opt-in
Rust actions; browser input bindings and native qualification remain open.

`InsertNestedListPlainTextAction` now accepts the existing bounded, non-empty
plain-text contract. CRLF/CR/LF normalize to sibling blocks/items at the spatial
start location; blank lines remain blank items, never implicit list exits.
The first block retains the left kind, interior blocks are paragraphs, and the
last block retains the right kind only when suffix text survives. Surviving
descendants move beneath the last inserted item. Pending/focus formats at carets
or the first selected run's formats apply to inserted text; pending formats are
consumed. Paste is one independent undo unit, with exact V7 session recovery.
Tests cover all endpoint pairs in a mixed nested document, reverse selections,
blank lines, numbering, headings, node/text/fanout/ordinal rejection and pending
format restoration. Browser Copy/Cut serialization and paste binding are still
unimplemented for the nested profile.

`SetNestedListBlockKindAction` converts touched paragraphs/headings at arbitrary
nesting depths in one guarded V7 replacement. A later endpoint at offset zero
is excluded; collapsed empty blocks are included. List containers, starts, text,
formats, exact selection encoding and pending formats remain unchanged.
Toolbar activation distinguishes active, mixed and inactive selections, and
already-matching selections are disabled. An independent tree oracle covers
all endpoint pairs, both directions and multiple heading targets, with session
recovery and property-budget checks. The nested compiled command profile still
needs marker conversion/removal before browser-facing integration.

Task lists, arbitrary multi-block items, tables, rich HTML paste and collaboration.
Migration of existing flat sessions requires an explicit, separately tested path.
