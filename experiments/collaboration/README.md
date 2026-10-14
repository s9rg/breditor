# Breditor collaboration feasibility checkpoint

This isolated experimental Rust workspace exercises ownership, recovery and rich-content
contracts before introducing a CRDT dependency into shipping Breditor packages.
It pins `loro = 1.16.2` and `wasm-bindgen = 0.2.127`, and exercises the actual
opt-in `breditor-core::rich_content` values in matching WebAssembly.

Run from the repository root:

```sh
node scripts/check-collaboration-feasibility.mjs
```

Rust 1.98, the `wasm32-unknown-unknown` target, matching wasm-bindgen CLI, repository
Node dependencies and installed Playwright engines are required. The script uses
private output under `target/collaboration-*`, runs native/Wasm lints, default
and structural core regressions, native contracts, a native-generated journal
vector and Chromium/Firefox/WebKit checks. It never publishes or changes the
default package entry points. `BREDITOR_CARGO` and `BREDITOR_WASM_BINDGEN` can
select explicit tool binaries.

## Recovery and selective ownership

The ordered journal records authored commands, imported engine bytes, undo/redo
outcomes and directional selection metadata. Recovery re-executes local commands
with the original exclusively leased writer. Every authored/replayed undo/redo
step must reproduce the saved operation identities, causal dependencies and
effects. A snapshot or import plus `record_new_checkpoint()` is not sufficient
for mixed history: that route left a local character behind when a prior undo
was transformed as though subsequent local imports were remote edits.

Canonical keyed cell/image/column container activation is committed outside user
undo. Undoing an activation marker otherwise hid a different author's surviving
cell text. Its scaffold remains after user content is undone; retention and
collection need a separate policy.

Metadata uses immutable per-action contributions, not one shared field whose
inverse can erase another writer's later value. Strong-format annotations use
the same ownership rule over replicated text items. A deterministic view selects
the highest active `(causal Lamport, numeric writer, action counter)` contribution.
Priority is checked against the referenced causal operation. Undo retracts only
the local contribution; redo reactivates its original priority. A masked undo
still retracts that contribution, so undoing a second author's winner cannot
unexpectedly revive a value the first author already undid.

The coordinator stages a complete recovered candidate before adopting it.
Invalid steps/imports preserve published values, causal state, selection and
history. Exact duplicate import bytes do not consume another journal entry.
Body selection keeps anchor/focus order, stable text identities and insertion
affinity. Every UTF-16 boundary is checked by conversion and round trip; half
surrogates and coerced/wrapped JavaScript values are rejected.

## Rich core contracts

`experimental-rich-content` adds distinct checked content identities, stable
table axes, non-destructive merge overlays and image asset bindings. It does not
widen existing schemas, reinterpret EntityId or change legacy codecs.

The separate `CompiledSchema::try_compile_rich_content_profile` factory now
admits rich blocks through the existing immutable AST. Compiler contract 6
binds rich-rule revision 1, including closed metadata, stable-ID uniqueness,
cell-axis correspondence, image binding and the ancestor-aware table exclusion.
Contracts 1–5 and their editing capabilities remain unchanged.

Merge capture retains full original axis context. Resolution sorts by descending
numeric causal priority, then exact merge identity bytes as the final tie-break.
Overlaps deactivate losing regions without flattening source-cell content.
New axes strictly between surviving boundaries expand a region; boundary
insertions remain outside. Original member reordering or movement of an old
outside axis into the interval deactivates the region. Deleted masters select
the first surviving row/column pair. Empty axes hide a table without repair writes.
Splitting retracts observed region identities and restores base-cell visibility.

Image node, immutable asset and binding generation are distinct. Paired display
dimensions and explicit decorative/nondecorative alt intent are checked values.
Completion matching cannot change a deleted node or a replaced asset binding.
Matching an upload token updates host status, not document insertion/history.
This is not validation of raster bytes or implementation of an upload provider.

## Rich AST and local actions

`RichDocument` adds a typed identity directory over one immutable `Document`;
it does not maintain a second content tree. Block IDs are document-unique,
table/image IDs are unique within their separate typed domains, and row/column
IDs are scoped to their table. Directory paths change when nodes move and belong
only to one snapshot. IDs must not be reused by an author after deletion;
admission establishes snapshot uniqueness, not a historical allocation registry.
Cloning a rich snapshot shares both its AST and its immutable identity directory;
the directory is rebuilt only for a newly admitted tree.

Tables retain every current base-cell body, column widths, header flags and
canonical merge/retraction records. Merge records preserve their original axis
contexts and exact decimal u64 causal words. Derived spans are never authored
properties. Empty axes remain hidden retained table state. An image owns an
opaque asset ID and generation, explicit alt/decorative intent, optional paired
size and zero or one ordinary paragraph caption. DOM URLs, upload status and
unknown properties are rejected.

Semantic AST admission does not authenticate a merge's causal stamp. The shared
adapter must verify provenance against replicated operations before materializing
accepted shared records. Generic `DocumentLimits` additionally constrain aggregate
properties, nodes, depth and text: a per-table maximum is not a promise that every
shape at that maximum fits the default document budget.

The first guarded local actions live in individually documented files:
`resize_image.rs`, `set_image_alt.rs` and `resize_table_column.rs`. They resolve
stable targets in the current snapshot, validate active schema/resource policy,
preserve unrelated content and return exact guarded inverses. Image actions
guard the captured binding; column actions guard their own captured width.
`apply_batch` stages the entire bounded group, emits inverse actions in undo
order and publishes no result after a late failure. Dependent actions must be
captured against the preceding staged snapshot, not blindly against one old tree.

`insert_table_row.rs`, `delete_table_row.rs`, `insert_table_column.rs` and
`delete_table_column.rs` add guarded local axis editing. Typed row/column/cell
drafts provide explicit IDs and rich bodies, not fabricated empty-cell IDs.
Insertion checks stable anchors and exact axis correspondence; per-row column
draft order is irrelevant, but missing/extra/duplicate rows fail admission.
Deleting the final axis retains the table as hidden state. Merge intent remains
unchanged, and inverse actions retain original bodies, headers, widths and assets.
Structural actions guard the whole captured table: a later table edit makes an
old action or inverse stale, instead of allowing it to erase newer content.

Whole table/image creation and removal use typed drafts and stable flow parents
with direct-child before-anchors. Removing a sole child requires an explicitly
owned replacement block. Image drafts carry semantic asset bindings and an
optional paragraph caption, never URLs or upload state.

Individually named actions now also support row/column moves, merge/split, grid
header intent, image asset/generation replacement and whole-caption changes.
Moves retain cell bodies, IDs and widths; the original merge context determines
whether a reordered region remains valid. Merge/split retract observed
geometrically overlapping intents, including known losing overlaps, so a split
does not immediately revive one of them. Base-cell bodies remain unchanged.
Asset replacement preserves the image ID, alt, size and caption; old upload
tokens become stale. Ordinary caption typing uses the rich text actions below.

## Rich text editing and local owner

`insert_text.rs`, `delete_text.rs` and `replace_text.rs` edit canonical fragments
inside stable paragraphs/headings, including cells, lists and captions. Offsets
are checked aggregate UTF-16 scalar boundaries; text and formats remain exact.
`set_inline_format.rs` sets/removes one semantic format over a nonempty range,
coalescing equal-format runs. `set_heading.rs` converts paragraphs/headings or
changes rank while preserving the block ID, text, formats and logical selection.
Parent admission keeps captions paragraph-only.

Paragraph split/join and rich list wrap/unwrap, kind changes, indent/outdent and
item split/join preserve stable IDs, formats and media ordering. Partial list
extraction retains explicit suffix IDs and ordered-list starts. Fragment
insertion/replacement accepts rich block drafts rather than flattening content.

Text and boundary edits retain witnessed before/after content and exact maps.
Edit/group selection mapping composes those maps in authored order, including
changes of text-block identity, and validates
the resulting scalar positions against the final tree. Direct structural rebasing
still rejects changed text without the required witnesses. Deleted positions
cannot be recovered by guessing an inverse offset; history retains both selections.

`RichLocalSession` is the exclusive runtime owner of rich content, logical
selection, pending caret formats, publication revision and bounded chronological history. One dispatch
is one explicit undo unit. Publication requires a current, same-owner opaque
snapshot; stale work is rejected even for no-ops. Failed actions, selection
updates and replay publish no partial state. Selection/typing-state publication
creates no undo entry and preserves redo; a new content group branches history.
Groups whose final content and metadata are unchanged are true no-ops.
Undo/redo re-executes the guarded recipes, verifies the exact resulting AST and
restores saved selection and pending-format values instead of reverse deletion
fallback. Plain typing derives formats from caret affinity unless an explicit
pending override is present; an empty override means plain text.

Typed multicell paste replaces independent base-cell bodies, with explicit
header and relative merge intent, over an exactly matching merge-closed target.
Grid clearing uses explicitly owned empty-block IDs and retains geometry and
headers. Both operations have exact local inverses; these are core primitives,
not a browser clipboard codec or controller.

This owner is single-user runtime history, not durable restart or collaborative
selective undo. Durable rich session codecs, typing-group policy, arbitrary
cross-block text replacement and browser command integration remain implementation work.

## Rich selection contracts

The separate `RichSelection` family supports directional text ranges, flow-node
selection and rectangular grid selection. It is bound to an exact immutable
source tree, including document ID and schema fingerprint. A newer snapshot must
use an edit/group mapping before resolution; an independently decoded equal tree
is valid. Node paths remain rendering coordinates, never persistent identities.

Text points name a stable paragraph/heading and checked aggregate UTF-16 offset.
Scalar boundaries, empty paragraphs, direction and run-seam affinity are explicit.
Grid endpoints retain base-cell IDs and direction, while the visible rectangle
expands to a fixed point over every touched merged cell. Copy/render consumers
receive all selected base bodies and unique presentation masters, not half a merge.

Deletion mapping prefers surviving original-axis neighbours. A deleted collapsed
grid relocates both endpoints together. A text caret uses the preceding block end
or following block start according to affinity. Hidden tables, absent neighbours
and image-only cells without a text target produce explicit clearing reasons.
Structural-only mapping rejects changed text in a surviving block; admitted text
edits provide their own witnessed maps and shared text needs causal anchors.
Local history retains before/after
selections to restore exact undo: reverse deletion fallback cannot infer the original.

These are opt-in local primitives and a runtime owner, not collaborative inverse
recipes or a durable rich session. The generic fingerprint-bearing Document V2 codec carries
research AST fixtures only; new shipping rich-session/sync contracts remain a
separate gate. No legacy Operation/session codec gains these action variants.

## Verified checkpoint

On October 13, 2026, the reproducible script passed:

- 703 default core unit tests and 1,217 opt-in core unit tests.
- 11 rich-content contract tests, including 256 seeded merge schedules.
- 29 rich-AST/action tests, including 256 seeded axis-order/roundtrip cases,
  typed-format admission, stale guards, atomic groups and exact local undo/redo.
- 19 table-action/selection contracts, including 256 seeded row/column deletion
  schedules, merge closure, deleted-caret fallback and exact inverse bytes.
- 13 functional table/image workflows covering whole-node CRUD, moves,
  merge/split/header, captions, asset replacement and mixed group undo/redo.
- 16 rich text/runtime-owner workflows covering cell/caption edits, formatting,
  heading conversion, witnessed maps, grouped history, pending formats and exact saved selections.
- 16 rich flow/list/fragment and multicell paste/clear workflows, including media
  ordering, partial numbered-list extraction and exact local inverses.
- 27 native collaboration/history contracts.
- 66 Chromium/Firefox/WebKit tests, including 24 partition schedules per engine.
- Strict native and wasm32 Clippy checks and both Rust workspace formatting checks.
- 137 Rust documentation tests.
- Native-to-Wasm restoration with exact future operation identities, including
  formatting and writer IDs above JavaScript's safe-integer range.
- Exact native/Wasm rich-AST exports, cell/image identity directories and grouped
  local action/inverse/redo bytes, including all four axis edits and mapped rich
  selections and 11 whole-node/move/merge/split/header/image feature cases.
  The rich schema fingerprint has a locked vector.
- A real six-action rich local-owner group with cell/caption typing, formatting,
  heading conversion, header and resize; moved selections, exact undo/redo,
  no-op redo preservation and stale queued-work rejection match native/Wasm.
- A ten-group rich paragraph/list/media workflow and independent multicell
  paste/clear workflows match native/Wasm, including caret identity changes,
  pending formats, complete undo/redo and retained source-cell partitions.

The tested fixture Wasm is 6,001,848 bytes, or 1,674,889 bytes under gzip, with
SHA-256 `45e6cc6647a990590b7285334ab6fb68d01ea88e1839d8527f8c0f98bf3cd0a0`.
This is a release-mode feasibility build, not a size-tuned shipping artifact or
an accepted shipping size budget.

## Limits and remaining gates

These are provisional probe limits, not public editor guarantees: 1,000 journal
entries; 16 MiB serialized journal; 1 MiB imported frame; 2 MiB replicated and
materialized views; 64 ordered command steps; 64 KiB inserted text; 10,000
formatted runs; 1,000 annotations per run and 50,000 total projected annotations.
Geometry additionally caps 256 rows, 128 columns, 4,096 cells and 256 merge records.
All independent limits apply. Hosts can tighten the core geometry ceilings.

The candidate is reconstructed from the whole journal for each mutation. That is
a correctness reference, not production throughput or compaction. Frame/view
limits do not establish adversarial decoder memory/time bounds. Writer-collision
checks are not authentication. The journal resumes an exclusively leased writer;
it is not a portable backup import or permission to clone an active writer.

Remaining rich-AST work includes durable rich history/recipes, arbitrary
cross-block text replacement, grid navigation and structured clipboard
interchange with fresh-ID allocation. Shared tree/AST
materialization, toolbar/input/clipboard controllers,
IndexedDB durability, upload queues and the authorized reference relay remain
implementation gates. The fixture exchanges engine bytes in one test host;
it does not implement a production transport or an end-user collaborative editor.
Physical Japanese IME and spoken VoiceOver are deferred at the user's request.

The pinned Wasm normal/build closure contains 139 packages. Loro's facade is MIT,
but `im 15.1.0`, `bitmaps 2.1.0` and `sized-chunks 0.6.5` declare `MPL-2.0+`.
The closure also includes BSL-1.0 and mandatory Unicode-3.0 terms. Optional
package notices and exact upstream source references must be completed and
reviewed before distribution; this checkpoint does not certify packaging
compliance. Existing shipping-package notice inventories remain unchanged.
