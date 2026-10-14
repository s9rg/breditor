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
not browser clipboard event handlers.

This owner provides single-user history, not collaborative selective undo.
Atomic text replacement now supports same-block, direct-sibling flow and sibling
leading-list-head ranges. It retains the first block's identity/kind and the
last block's formatted suffix, checks only the final aggregate content budget,
maps preserved suffix/deleted positions and restores exact selections through
history. Sibling-list replacement retains the final item's trailing media.
Plain typing derives range style from the logical start and collapsed style from
focus affinity. Arbitrary cross-cell/container ranges and typing-group policy
remain implementation work.

## Grid navigation and structured clipboard

`navigate_grid.rs` provides pure logical arrows, next/previous displayed cell,
row start/end, table start/end and directional extension. Tab visits each
presentation master once in current row-major order. Arrows step outside the
current span while retaining the logical focus row/column, including covered
cells. Extension preserves anchor order and resolves complete merged closure.
Boundaries are explicit results; no row, placeholder or ID is invented.
Navigation publication uses selection-only history semantics and preserves redo.
Physical keys, bidi layout and focus transfer remain browser policy.

`RichClipboardJsonCodec` defines `breditor/rich-clipboard` version 1, with explicit
text, flow and grid kinds. Its schema-bound Document V2 wrapper has a neutral
clipboard document ID. Copy supports scalar-aligned inline ranges, partial
direct-sibling flow ranges, partial sibling leading list heads, whole rich flow
nodes and merge-closed grids. List ordinals and rich item tails remain intact.
Grid copy retains every base-cell body, header flag, column width and active span,
including image alt, size and caption content. Arbitrary cross-container text
copy is still explicitly unsupported, not flattened into a guessed fragment.

Clipboard geometry is a semantic copy of current active spans, recaptured over
the copied axes. Inactive/retracted merge history is excluded; this envelope is
not a collaboration backup. Wire IDs are source identities. Paste preparation
requires a host allocator for fresh block/table/axis/image/merge identities and
image binding generations, plus newly authored merge priority. Immutable asset
references stay unchanged. Syntax, source reuse and duplicate new IDs are checked
before drafts escape; historical namespace allocation and target admission are
independent requirements. IDs consumed by failed preparation must never be reused.

The default outer clipboard budget is 1 MiB; embedded document/resource limits
also apply. Plain fallback uses reading-order text without list markers and quoted
TSV for tables; images contribute alt/caption rather than URLs. It is not the
lossless rich channel. HTML/custom-flavor browser events, asset resolution and
file paste/drop are still integration work. Grid paste requires an exactly
matching merge-closed target; growing a target is an explicit structural command,
never implicit crop/tiling or automatic repair.

## Local rich recovery

The opt-in `RichSessionJsonCodec` uses the separate
`breditor/rich-local-session` version 1 family; it does not reinterpret V7 or
define a shared-update protocol. A fingerprint-bearing Document V2 holds the
retained baseline. Chronological entries carry guarded element rewrites and
saved before/after selection, pending formats and exact decimal revisions.
The checkpoint retains current metadata, the undo/redo cursor and entry capacity.
Text offsets also use exact decimal strings, not coerced JavaScript numbers.

Every retained entry and inverse is replayed under the receiving host's active
schema and limits before recovery returns a new exclusive owner. Current metadata
is admitted against the content at the saved cursor. Old process-local snapshots
cannot publish to the recovered owner. New edits can branch recovered history,
and disabled/evicted history is not recreated.

Recipes retain the smallest single changed element branch; groups affecting
several siblings can retain a parent or root. This is exact local restart history,
not a replication adapter or selective undo. The default checkpoint budget is
16 MiB and 1000 retained entries, independently of document limits and runtime
entry capacity. Encoding and decoding are bounded; production storage, write
acknowledgement, compaction and measured replay cost remain separate work.
Raster bytes and upload state are not embedded in this content checkpoint.

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

These are opt-in local primitives with a separate local recovery codec, not
collaborative inverse recipes. The generic fingerprint-bearing Document V2 codec
carries rich ASTs; shipping rich-session/sync contracts remain a
separate gate. No legacy Operation/session codec gains these action variants.

## Rich owner browser checkpoint

`node scripts/check-rich-browser.mjs` passed on October 14, 2026:

- 12 native public rich-owner workflows, 10 atomic range workflows and 2 canonical
  format-literal codec contracts.
- 43 existing Wasm unit tests, the retained projection contract and 21 legacy
  Wasm boundary tests with both default and opt-in feature sets. The rich-only
  integration target explicitly requires its feature and is absent by default.
- Strict native/wasm32 Clippy and generated TypeScript declarations, including
  closed per-command request types and decimal-string coordinates.
- 105 tests against the assembled `@breditor/experimental-rich-content` package:
  35 workflows each in Chromium, Firefox and WebKit (11 owner, 13 DOM, 7 asset,
  2 persistence and 2 combined demo). These cover table/image
  CRUD, axes/moves/merge/split/header/resize/clear/navigation, rich flow/nested lists,
  Enter, inline and typed-extension formatting, mixed sibling range replacement,
  fresh clipboard identities/spans, guarded publication and exact recovered history.
- Repeated Unicode typing and restored undo/redo branches, including an actual
  page reload from a host-saved checkpoint.
- Trusted keyboard/pointer input, live table/image controls, expandable toolbar,
  rich cell/caption editing, atomic selected Enter/whole-flow paste, exact caret
  undo, event clipboard paths and synthetic composition/cancellation.
- The interactive `/demo` renders owned raster assets and exports/imports an
  exact local session. The sample assets are not embedded in session JSON.
- Durable PNG/JPEG/WebP admission, content-addressed deduplication and byte
  budgets; explicit upload failure/retry/cancel and stale completion; file
  picker/paste/drop; exact restored image history and retained bytes after deletion.
- Actual session restart with a saved redo cursor, and disconnected cell/file
  editing followed by a cached-shell reload without live resource fetches. The
  harness supplies that shell; no production service worker is included.

The disconnected test blocks live HTTP requests and fulfils the recorded app shell
from memory. It does not use Playwright's global offline switch for the WebKit
file path: that switch also produced `NotReadableError` for a local canvas Blob.
Physical OS network disconnection is not established by this harness. The
Blob/File IndexedDB failure was independently reproduced during ordinary online
asset tests; persisting ArrayBuffers repaired that tested storage path.

The rich-owner Wasm is 4,037,333 bytes, or 1,074,520 bytes under gzip, with SHA-256
`e4ec2dd187fb721e69dd02633067157d3021de1c3d1cba3b866fa667724c6557`.
This opt-in release-mode artifact is not size-qualified for distribution. It has
no Loro dependency and is distinct from the replication fixture below.

The private local npm archive was extracted into a fresh target directory. Its
installed module graph includes the DOM/asset/session modules, paired Wasm,
generated helpers, declarations and licenses. A Node smoke test against that
extracted archive created a real rich owner and restored exact future undo/redo;
all browser/asset exports were present. This is packaging evidence, not publication
or distribution-size qualification.

Browser checks exercise the real public owner and typed command API, not a
JavaScript content model. The matching package includes wasm-bindgen's generated
helper modules. Its default editor ABI remains 5; rich ABI 1 uses explicit
bootstrap V6. Local assets and checkpoint persistence are optional host services;
shared rich replication, collaborative persistence and the provider/relay
integration remain implementation work. Event clipboard/composition checks are not native OS
clipboard acknowledgements or physical IME qualification.

## Verified replication fixture checkpoint

On October 14, 2026, the reproducible script passed:

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
- 10 local rich checkpoint/recovery workflows, including every mixed history
  cursor, current metadata, edits after restart, entry eviction and exact u64 revisions.
- 6 merged-grid navigation workflows covering Tab order, focus lanes, directional
  closure, explicit edges, reordered axes and metadata-only redo preservation.
- 11 structured rich clipboard workflows covering canonical interchange, partial
  text/list ranges, merged partitions, media, fresh identity allocation and reload history.
- 27 retained native collaboration/history contracts and 57 shared rich-AST
  contracts with actual Document V2 materialization and selective history.
- 147 Chromium/Firefox/WebKit tests, including 24 partition schedules per engine
  and 72 generated-Wasm shared-AST/selection tests. The explicit test list includes
  `rich-replica.spec.mjs` and `rich-selection.spec.mjs`; the old 75-test configuration
  did not exercise those shared families.
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
- Native rich checkpoints restored in Wasm at all 11 positions of the ten-group
  rich list/media history, with exact future undo/redo, current metadata and
  rejection of old live-owner observation tokens.
- Five repeated rich recovery runs per browser engine passed with exact Wasm JSON
  transport and independent in-browser parse/stringify agreement.
- A four-group clipboard workflow with grid, image, whole-table and formatted
  inline paste matches native/Wasm through restored undo/redo. A 3×4 table created
  by actual axis commands proves merged-cell navigation and retained focus lanes.

The tested fixture Wasm is 7,682,786 bytes, or 2,085,607 bytes under gzip, with
SHA-256 `122d4dd84004435f6350e375b0da09d94d65014ddff551d59d3f629b081262b2`.
This is a release-mode feasibility build, not a size-tuned shipping artifact or
an accepted shipping size budget.

## Shared rich AST checkpoint

The new `rich_replica::RichReplica` owns the CRDT and publishes an immutable,
schema-admitted rich AST. Genesis is decomposed once; ongoing text, formatting,
metadata, move and deletion actions use stable primitives, not root replacements.
Every action has its own documented Rust file. The Wasm `RichReplicaProbe` uses
the same coordinator and exact Document V2 export.

Native checks cover concurrent cell/caption edits; generic typed format literals,
including a declared Link value; paired image alt/size; column widths; independent
row/column deletions; later remote node/column placements surviving Undo/Redo;
hidden-subtree text/metadata recovery; authored text in normalized empty flow;
failed-group isolation; stale causal-version rejection before target/JSON admission;
original room/schema/model/engine envelope checks before engine import; and exact
future selective-history operation identities
after restart. Browser checks exercise the real generated module, including an
actual page reload from the same-writer journal.

Shared commands now create whole paragraphs/headings, lists, tables and images,
including rich descendants, from schema-admitted Document V2 element records.
These records are decomposed once; they are not shared root replacements. Fresh
block/table/image identities are checked against retained historical definitions,
including definitions hidden by Undo. New rows and columns own their visibility
claims, so Undo hides the creator's contribution without deleting remote text.
Independently created axes derive one stable cell at their intersection. A derived
cell supports text, rich flow children and per-source-cell header contributions.

Shared merge/split commands reuse the original Rust capture, rectangle closure
and overlap rules. Each shared merge action owns an independent intent record with its actual
authored causal stamp. Splits own retractions of observed overlaps, including
known losing intents; unknown concurrent merges remain eligible. Undoing one
writer's split cannot retract another writer's split. Covered cell bodies are
never flattened, and headers require the complete merged source-cell set. Interior
row/column creation expands a merge under the existing stable-axis rules.

The new-column width regression reproduces the container-activation failure:
without permanent canonical width containers, Undo of A's resize hides B's later
640-pixel contribution and reveals the initial 240-pixel width. Preparing those
containers outside user history fixes the failure. Native and generated-Wasm
tests retain B's width through both A's Undo and Redo.

Two reproduced native tree-undo behaviors determined the design. Deletion Undo
can recreate physical nodes, so stable block metadata/text must outlive physical
tree IDs. Native move Undo can override a later remote move, so semantic moves
select writer-owned ordered occurrences instead. Deletion contributions combine
by active presence, not by the last shared boolean: undoing A's deletion cannot
retract B's independent deletion. Caption/cell text and paired metadata are
separate from those structural effects.

The shared rich journal is a private V3 family with 1,000 events, 16 MiB serialized
bytes and 1 MiB imported engine frames. Its independently bounded causal view is
4 MiB; the AST additionally obeys the supplied core limits. Normalization IDs use
architecture-independent length-prefixed SHA-256 inputs under the reserved
`breditor-virtual:` prefix. Seed imports with that prefix are not yet supported
as portable recovery branches. Rebuild/compaction and decoder-work budgets are
still provisional. V1/V2 shared journals are rejected rather than silently replayed
without their required causal UI/history metadata. Local rich editor
recovery and the shipping contracts are unchanged.

`breditor/rich-replica-update` V1 binds the document ID, complete schema selector
and fingerprint, model revision 2 and pinned Loro 1.16.2 codec before importing
its opaque bytes. The engine payload is capped at 1 MiB; the current JSON envelope
uses a byte array and has an independent 5 MiB ceiling. Binding checks are not
authentication or a writer lease. The reference relay must supply those checks.
`apply_at` guards exact canonical causal versions; it does not freeze local UI
or history metadata. `observe` and the guarded APIs additionally bind local
selection, pending formats, history and the exact live owner publication. Serialized
revision/version strings are not mutation authority; restored owners receive new
opaque observation tokens.

Shared text selections now retain causal anchors and original insertion affinity.
Node selections keep stable flow IDs; grids keep directional table/row/column IDs
and use Rust-derived merged closure. Deletion fallback chooses surviving original
axes, never an unrelated concurrently inserted axis. Clearing exposes an explicit
reason. Capturing an empty derived paragraph's selection activates no shared
container, and local selection/pending-format changes leave updates and redo intact.

Each history action owns before/after causal selection and pending-format recipes.
Undo/Redo restores that action's recipe rather than the current mouse caret.
Native text recreation reproduced a caret moving from offset 2 to the paragraph's
end. A cursor-only delta projection now repairs recreated character references
with Breditor's affinity rules; the engine still authors all content inverses.
The adapter uses the pinned, already-transitive `loro-internal` delta API without
unsafe access or a dependency source patch. Production promotion must review this
engine-specific boundary and its work/memory budgets.

`insert_plain_text` respects complete pending or affinity-derived formats and
publishes the advanced caret in one content history group. An empty pending array
explicitly types plain text rather than inheriting a neighbouring Strong mark.
The Wasm boundary exposes independently disposable opaque observations, guarded
dispatch, selection, pending formats, typing and history. Its JSON view includes
decimal offsets/revisions, causal version words and original Rust table/grid geometry.

Shared creation allows up to 64 flow records per command and 1,000 initial format
annotations per text block. A table retains at most 256 historical merge identities,
including identities hidden by Undo. These independent prototype ceilings require
the later compaction and workload pass; visible geometry limits alone do not
describe retained causal storage.

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

The opt-in rich owner ABI 1 and explicit bootstrap V6 now expose typed local
commands, history/recovery and semantic clipboard reads/pastes in the actual
`breditor-wasm` crate. The separate
`@breditor/experimental-rich-content` wrapper and DOM editor manage exclusive
Wasm ownership, an expandable toolbar and optional exact revision guards.
`node scripts/check-rich-browser.mjs` builds and
checks this matching pair without widening the default packages.

Remaining rich-AST work includes arbitrary cross-cell/container range planners.
Complete shared paragraph/list/range planner coverage and
cycle/conflict normalization remain implementation gates. The shared browser
coordinator, collaborative IndexedDB/leases and authorized reference
relay/presence/asset-provider integration are also unfinished. The fixture
exchanges engine bytes in one test host;
it does not implement a production transport or an end-user collaborative editor.
Structured shared clipboard must allocate history-free primitives and authored
merge stamps, rather than copy local history through the creation record API.
Physical Japanese IME and spoken VoiceOver are deferred at the user's request.

Follow-up Firefox large-object comparisons reported zero path/grid coordinates
as `NaN`, including a native-expected zero in an axis test. Recovery and axis
checks now compare the actual Wasm JSON wire with independent browser parsing;
the axis check also verifies finite numbers before test-protocol transport. Five
recovery repeats per engine and five axis repeats in Firefox agreed. The earlier
object-comparison mismatch's origin is not established, and these passing runs
are not an upstream browser repair claim.

The pinned Wasm normal/build closure contains 139 packages. Loro's facade is MIT,
but `im 15.1.0`, `bitmaps 2.1.0` and `sized-chunks 0.6.5` declare `MPL-2.0+`.
The closure also includes BSL-1.0 and mandatory Unicode-3.0 terms. Optional
package notices and exact upstream source references must be completed and
reviewed before distribution; this checkpoint does not certify packaging
compliance. Existing shipping-package notice inventories remain unchanged.
