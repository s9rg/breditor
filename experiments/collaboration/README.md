# Breditor collaboration feasibility checkpoint

This isolated experimental Rust workspace exercises ownership, recovery and rich-content
contracts before introducing a CRDT dependency into shipping Breditor packages.
It pins `loro = 1.16.2` and `wasm-bindgen = 0.2.127`, and exercises the actual
opt-in `breditor-core::rich_content` values in matching WebAssembly.
The collaboration workspace overrides `loro-internal` with the retained 1.16.2
source and a narrow deterministic-history patch. See
[patch provenance and scope](vendor/BREDITOR_PATCH.md). Shipping packages do not
use this override.

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
shared replication now has a separate opt-in browser coordinator and exact
IndexedDB recovery. Provider/relay integration remains implementation work.
Event clipboard/composition checks are not native OS
clipboard acknowledgements or physical IME qualification.

## Verified replication fixture checkpoint

The engine-ordering regression has a failing unpatched baseline and passing
patched checks. Three direct contracts cover tied container identities, map keys
and pending text marks. The complete script also verifies paragraph, heading, range and list
history across native/Wasm restoration with exact future operations and journals.
This repairs the isolated history-authoring contract, not the historical WebKit
runtime fault or the unfinished end-user collaboration workflow.

On October 15, 2026, the reproducible script passed:

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
- 12 structured rich clipboard workflows covering canonical interchange, partial
  text/list ranges, merged partitions, media, fresh identity allocation and reload history.
- 27 retained native collaboration/history contracts and 124 shared rich-AST
  contracts with actual Document V2 materialization and selective history.
- 23 isolated text-flow contracts covering original-source split/join, logical
  range edits, offline typing, causal boundary carets and selective routing history.
- 3 direct engine history contracts that fail on the unpatched pinned dependency.
- 3 native comparison-framing tests and 2 Node transport checks, including a
  real input pipe deliberately left open after its complete request frame.
- At the preceding clipboard checkpoint, 309 Chromium/Firefox/WebKit tests, including 24 partition schedules per engine,
  201 shared-AST/selection/paragraph/heading/range/list/clipboard tests, 24 text-flow lowerer checks
  and 9 direct engine-ordering checks.
  The explicit test list includes `rich-replica.spec.mjs`, `rich-selection.spec.mjs`,
  `rich-paragraphs.spec.mjs`, `rich-headings.spec.mjs`, `rich-ranges.spec.mjs`,
  `rich-lists.spec.mjs`, `rich-clipboard.spec.mjs` and `text-flow.spec.mjs`;
  the old 75-test configuration did not exercise these additional families.
- Strict native and wasm32 Clippy checks and both Rust workspace formatting checks.
- At the preceding clipboard checkpoint, after independently regenerating the native vectors, five repeats of each
  engine-ordering, combined clipboard journal, explicit-header intent and empty-flow
  caret/history regression passed in every browser engine: 90 additional checks.
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
- Fourteen shared clipboard contracts cover immutable reads, complete inline styles,
  fresh table/image identities, actual merge clocks, concurrent grid replacements,
  clear/undo, explicit same-value headers, conditional empty-flow paragraphs,
  causal carets and exact same-writer restart. Ten matching browser workflows per
  engine include a combined native journal with fresh table/image/grid paste,
  offline original-body edits, reload and exact future clear/Undo/Redo operations.

## Shared browser integration and causal source repair

`node scripts/check-shared-browser.mjs` builds the matching private Wasm owner,
native vectors and optional browser modules, checks their generated declaration
contract and runs the combined DOM/session/demo matrix in Chromium, Firefox and
WebKit. The new `@breditor/experimental-collaboration` package adopts exclusive
Rust ownership; it does not introduce a JavaScript CRDT or mutable shared AST.
Its read-only renderer dependency is the additive `experimental-rich-content/rendering`
subpath. The default package entry points remain unchanged.

The coordinator connects shared table/list/image controls, native input and
selection, source-preserving selected-flow paste, semantic clipboard and file
paste/drop to the guarded Rust actions. Remote updates have bounded queues and
explicit admission receipts. Background rendering cannot move another editor's
native caret. Synthetic composition holds remote publication until its one Rust
commit; this is functional event-path evidence, not physical IME qualification.

Selected-flow paste exposed a native source-routing defect, independent of the
historical WebKit runtime issue. Reproduction: seed `ab🙂cd`, split at UTF-16
offset 2 while an offline writer appends `!` at original offset 6, then exchange
updates. Loro can leave the concurrent EOF append outside the split's expanded
annotation, incorrectly projecting it into the left paragraph. The failing
native regression is `unobserved_append_at_original_source_end_follows_an_interior_split`.

Model 7 follows the preceding active source interval only for unmarked characters
absent from the routing action's causal past. Character IDs and the action's
version vector distinguish an unseen append from restored original text; nearby
observed text resets continuation. The independent
`restored_original_text_does_not_inherit_a_nearby_unrelated_fragment` contract
guards that distinction. Rich paste now deletes the selection, splits retained
sources and publishes fresh flow in one Undo group using distinct actual causal
stamps for its dependent phases. Journal V8 and model 7 explicitly reject older
interpretations rather than silently replaying different source ownership.

`SharedPersistentSession` acquires an origin-wide room/writer Web Lock before
reading or restoring a journal. Factory/admission failure releases the lock;
another tab cannot bypass exclusion by choosing a different database. Complete
journals persist on completed IndexedDB transactions with one in-flight and one
coalesced pending write. Saved/pending/failed states, explicit retry and final
flush distinguish local durability from relay acknowledgement. A reproduced
retry race now waits for the failed attempt to settle before restarting the
newest checkpoint. Abrupt tab loss restores the last completed write, not an
unacknowledged in-memory edit. Cross-device writer authorization is still a
reference-relay responsibility.

The interactive `/demo` on `experiments/shared-browser/serve.mjs` uses two durable
writers with disconnect/reconnect, automatic local save, exact reload history,
journal export and host image bytes. No external service receives document data.
The host is not the authenticated reference relay. See the optional package
README for the adoption, queue, toolbar, clipboard, asset and lifecycle contracts.

The October 15 integration check passed all 177 private native contracts, native
and wasm32 Clippy, actual generated-owner TypeScript declarations and 51 combined
browser tests (17 per engine). The existing single-user rich-owner matrix also
passed all 105 cases with its unchanged Wasm hash. The new browser families cover
native input, table growth/moves/merge/header/clear/split, nested lists/headings,
selected rich paste, captions and paired image metadata, durable raster paste/drop,
bounded remote queues, cross-tab writer exclusion, quota failure/retry and actual
page reload with exact future history. These are functional workflows, not a
claim of exhaustive adversarial, accessibility or physical input qualification.

Five additional repeats of the selected-flow clipboard repair, exact native
selected-flow replay, quota retry and combined demo passed in every engine:
60 focused integration checks. The unbounded single-process 309-case matrix was not fully green:
both an overlapping-jobs run and a standalone run finished 308/309, each timing
out in WebKit navigation before the same test's editing setup. The first trace
recorded no HTTP events; the affected test then passed five isolated repeats.
The traces are preserved under the ignored
`target/collaboration-browser-evidence/shared-session-navigation-timeout` and
`shared-session-navigation-timeout-isolated` directories. No timeout, assertion
or retry setting was relaxed.

An independent empty-page control completed 63 fresh WebKit contexts and timed
out opening context 64, without loading Breditor, any editor JavaScript, a
network resource or Wasm. Reproduce with
`node scripts/diagnose-webkit-context-lifetime.mjs` (a nonzero exit records the
control failure). This reproduces a browser/automation lifecycle boundary, not
an editor operation or proof about the separate historical runtime fault.

The canonical `check-collaboration-browser.mjs` runner now starts a fresh WebKit
process for each configured test file. Chromium and Firefox still run their full
configured matrix. Two schedule tests verify every configured file is retained
exactly once per engine and reject missing/duplicate/glob plans. This is bounded
test-process isolation, not a retry, timeout increase or editor workaround. The
underlying WebKit startup reliability gate remains open; these functional checks
do not establish a repair for the historical WebKit runtime issue.

With this coverage-preserving process isolation, all 309 collaboration browser
cases passed: 206 Chromium/Firefox cases plus all 103 WebKit cases in the ten
configured files. Together with the 51 combined integration cases and the 105
unchanged single-user cases, the functional checkpoint passes 465 browser cases.
The 60 focused integration repeats, five isolated paragraph-replay repeats and
two browser-run coverage-plan tests also passed. The empty-page lifecycle control
remains an expected failing diagnostic, not a passing editor test.

`node scripts/check-shared-package.mjs` packs both optional packages locally and
installs them into a fresh offline consumer without workspace links. Installed
imports and declarations, renderer exports, licenses, and future Undo/Redo through
the matching real Wasm owner pass. The private owner fixture remains an external
test input; the archive does not disguise it as a generic shipping factory.

The current fixture Wasm is 8,694,353 bytes, or 2,363,664 bytes under gzip, with
SHA-256 `db8887a6852473bbac8eee7607cb54a204fc9a13fc5c4f971e707b918a3f7007`.
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

The shared rich journal is a private V11 family with 1,000 events, 16 MiB serialized
bytes and 1 MiB imported engine frames. Its independently bounded causal view is
4 MiB; the AST additionally obeys the supplied core limits. Normalization IDs use
architecture-independent length-prefixed SHA-256 inputs under the reserved
`breditor-virtual:` prefix. Seed imports with that prefix are not yet supported
as portable recovery branches. Rebuild/compaction and decoder-work budgets are
still provisional. V1–V10 shared journals are rejected rather than silently replayed
without source-based routing, causal UI/history metadata, deterministic engine
history authoring, sequential command priorities, retained normalization origins and
causal ownership of unmarked concurrent source appends, owned caption choices,
retained creation-time characters, request-basis semantic priority and acyclic
placement resolution with implicit derived-cell ancestry. Local rich editor
recovery and the shipping contracts are unchanged.

`breditor/rich-replica-update` V1 binds the document ID, complete schema selector
and fingerprint, model revision 10 and the explicit engine build tag
`1.16.2+breditor.deterministic-history.1` before importing
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
The cursor adapter uses the pinned, already-transitive `loro-internal` delta API
without unsafe access. Deterministic engine authoring separately uses the narrow
retained-source patch described above. Production promotion must review these
engine-specific boundaries and their work/memory budgets.

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

## Shared selected range replacement

`rich_replica::actions::ReplaceTextRange` admits the core's immutable semantic
preview and verifies the exact materialized result before publication. It supports
one text block, direct sibling flows and sibling leading list heads. The first
block keeps its identity and kind; selected intermediate media/subtrees are hidden
with writer-owned deletion contributions. Retained tails from the last list item
move into the first item without rebuilding them. Arbitrary cross-cell/container
ranges remain rejected.

Only observed selected characters are deleted. Joining the last source into the
first preserves its original character identities and rich suffix formats;
offline insertions in that source survive delivery and selective Undo/Redo. Rich
inserted runs declare complete desired formats, including explicit plain text.
Selected `insert_plain_text` derives formats at the logical start, replaces once,
collapses to the insertion end and saves the original directional selection for
Undo. Empty input deletes a noncollapsed range.

Earlier creation/split commands and later formatting can compose in the same
atomic group. Each semantic command now has its own causal stamp and, when needed,
annotation claim, so later formatting outranks every run inserted by an earlier command.
The group still has one history identity and one Undo boundary. The retained
engine ordering patch makes retraction of these separate claims deterministic.
The current private model is revision 8 and its journal is V9; shipping formats
are unchanged.

Preparation reserves canonical deletion/placement containers outside user history
for known metadata identities, bounded at 20,000. It scans retained metadata;
that is a correctness-reference cost, not a production latency guarantee. One
range accepts at most 1,000 input runs, 64 KiB of inserted text and 1,000 format
contributions, in addition to the independent core/causal/journal limits.

Eleven native contracts cover rich runs, retained suffixes, sibling media,
numbered-list tails, cell/caption typing, selective history, exact restart,
composed groups and atomic rejection. Browser contracts also restore a native
journal after page reload and compare full future causal operations, views and
journals rather than opaque binary packing.

## Shared list commands

Seven independently named Rust actions now wrap/unwrap rich flow, set list kind,
indent/outdent item intervals and split/join items. Each obtains an admitted core
semantic preview and verifies the exact final materialized AST before publishing.
Fresh wrapper/item definitions and canonical containers are infrastructure;
writer-owned births, placements, style and removals form one selective history
group. Existing text, images, tables and nested lists move by stable identity.
No list action copies existing body text into a replacement container.

Kind and numbered start are one paired `list-kind` contribution. Concurrent
presentation changes and masked Undo retain each writer's own intent. Indent
either supplies an explicitly identified compatible nested list or appends to an
existing one. Outdent preserves numbered suffix ordinals and the core's depth-first
order, including flow following a nested list. Item Enter routes original suffix
characters into a fresh head and moves the rich tail. Adjacent-item join combines
leading text only when the left item has no rich tail; otherwise the right head
remains a later body block after that tail. Offline text follows its original source.

A synthesized empty paragraph uses a canonical retained occurrence when a
list operation reparents it. Its identity is bound to its original document,
cell or item normalization slot. Independent writers retaining that same paragraph
share one occurrence, not duplicate peer-local tree births. At its origin it stays
conditional on the parent's fallback rule; relocation renders it as ordinary
structure. If the slot is occupied elsewhere or hidden, normalization chooses a
fresh deterministic spare without reusing hidden text. Undoing older surrounding
edits therefore does not leak an extra empty paragraph into the restored state.
Selecting an empty paragraph still activates no content containers.

Preparation and structural directories are bounded at 20,000 metadata/nodes.
Wrap takes at most 1,000 item identities; a normalization family has at most 1,000
spare slots. These are independent prototype ceilings, not production latency or
compaction guarantees. List preparation currently scans retained metadata and
reserves canonical fields and conditional item fallback slots before the atomic
group. A preceding head deletion or fresh item split can therefore synthesize
a head that a later unlist step reparents within the same Undo boundary. These
reserved slots do not render beside intact heads or leak into older Undo states.
Invalid shapes or ordinals, unused fresh identities and later-command failures
reject the complete group without publishing partial content or history.

Sixteen native contracts cover media order, numbered prefix/tails, nesting and
promotion, source-preserving item boundaries, concurrent presentation, independent
empty-head retention, derived cells, spare-slot history, composed groups and no-ops.
Browser contracts include native journal restoration after reload with exact
future operations and full journals, including history that predates a retained
normalization slot. The shared DOM coordinator now exposes these actions;
general placement-conflict normalization remains an implementation gate.

## Shared image caption choices

`SetImageCaption` has its own action file and reuses the core whole-caption
capture/admission contract. Its required `caption` field is one fresh paragraph
draft or explicit null. Missing fields, reused historical identities, headings,
nested flow, invalid formats and caller-supplied clocks reject atomically. Each
new paragraph decomposes into the usual independently retained text sources;
ordinary typing does not replace the caption node or its character identities.

The shared `image-caption` field selects a retained paragraph ID or explicit
absence. It is not an AST/text register and never changes the asset/generation,
alt/decorative pair or dimensions. Concurrent replacements select one visible
choice; retracting its author's contribution reveals the next active caption or
the original. Nonselected sources, including edits made while hidden, remain in
causal state and exact history. Explicit absence owns intent even if already
absent. Generic insertion/movement of a paragraph into an admitted empty image
authors the same choice instead of bypassing it.

The pre-fix regression used only existing commands: clear an image's caption,
let two disconnected writers each insert a fresh paragraph, then exchange their
accepted updates. The merged two-caption image failed schema admission. The
owned choice now projects one caption without rejecting either writer's source.
Thirteen native contracts additionally cover metadata independence, rich formats,
offline original-caption edits, causal selection recovery, composed
image/caption/typing groups, exact future history, explicit absence and moves,
retained seed provenance, remote joins and three-writer typing.

The caption checkpoint changed the private shared projection to model 9 and journal V10. Older
shared frames/journals reject explicitly; existing shipping codecs, local rich
history and image schema are unchanged. It introduced a separate V10 sample
database while preserving old V8/V9 data. The subsequent cycle checkpoint below
advances the owner and demo to model 10/journal V11. No implicit journal migration
or document-only recovery is performed.

The caption checkpoint passes 190 private native tests, native/wasm32 Clippy,
the generated-owner and installed-consumer TypeScript contracts, and 69
combined browser cases (23 per engine). Five caption cases per engine cover
concurrent insertion, live toolbar removal/recreation and typing, strict/stale
admission and a real page reload from an independent native caption journal.
One journal compares eight future causal operation sets, complete views and
exact journals after redo, typing, removal, undo and repeated redo. Package
consumer verification uses actual installed archives and the real Wasm owner.

Creation Redo also has an independent native/Wasm reload vector. The original
regression creates `A🙂`, undoes creation, receives an offline `Remote ` prefix,
then redoes creation. Native text deletion/reinsertion puts `A🙂` before that
prefix at the collapsed gap; a separate engine-only control reproduces this.
Creation now prepares original characters outside history and gates them on
the creator's owned birth. Independent insertion-provenance annotations prevent
inherited seed ownership from hiding remote characters, including interior
typing by a third writer and text retained through a remote paragraph join.
Native delete/Undo can restore seed provenance without erasing its ownership.
No AST replacement or vendored-engine change implements this repair.

The first command's semantic causal stamp is captured before immutable
preparation; longer initial text cannot artificially win a concurrent caption
choice. Later steps in a batch retain their actual sequential causal stamps.
Ordinary text deletion/Redo still uses the native engine's rebased gap behavior;
this creation repair does not claim a different general text-Redo tie policy.

## Shared placement cycle repair

Two separately valid offline moves can close a structural cycle: A nests its
root list inside B's item while B nests its root list inside A's item. Previously
the selected placement graph had no reachable root; both lists disappeared
behind the normalized empty paragraph even though their causal data survived.
This reproduces in native Rust and the generated Wasm owner without browser
input or timing dependencies.

The private model 10/journal V11 resolver now selects a complete acyclic forest
before AST traversal. It suspends the lowest-priority authored edge in a cycle
and tries that node's next contribution or immutable origin. Priority is the
existing causal stamp with stable block-ID tie-breaking. It does not retract an
intent, change its priority, write a repair operation or discard an immutable
origin. Selective Undo can expose a previously suspended move. Original sibling
occurrences still determine ordering, and normalization is independent of update
delivery order. A local move into its own visible subtree rejects atomically.

Derived table cells have no authored occurrence, so activating their metadata
also retains the immutable row parent. Cycle detection includes that implicit
edge. The cell remains axis-derived; no competing tree occurrence or user Undo
step is created. One placement projection is shared by a complete AST
materialization. The resolver bounds the metadata directory at 20,000 owners,
each owner's placement contributions at 1,000 and all candidates at 100,000;
production work/compaction budgets remain open.

Six native contracts cover reciprocal cycles in both writer/delivery orders,
three-writer cycles, repeated exact-history recovery, masked Undo/Redo, local
descendant rejection, combined table/list/media moves, and a newly derived axis
cell. Four browser cases per engine cover mounted editors, independent native
journal reload/future causal operations, local guard preservation and the
implicit-cell cycle. Grammar conflicts involving concurrent kind changes and
moves remain separate work; this resolver establishes acyclicity, not arbitrary
schema-conflict normalization. Older private journals require their matching
owner, and the demo preserves V8/V9/V10 databases under their old names.

This checkpoint passes all 196 private native tests, native/wasm32 Clippy, the
generated-owner and installed-consumer TypeScript contracts, all 81 combined
shared-browser cases and all 309 legacy browser cases across Chromium, Firefox
and WebKit. The broad check also passes the 703 default core tests, 1,217 opt-in
core tests, rich action/clipboard/recovery contracts and 137 doctests. Package
consumers install actual local archives and run future history through the real
Wasm owner. These are functional checks, not physical IME/accessibility,
adversarial decoder, performance or production-release qualification.

## Shared semantic clipboard

`copy_clipboard_guarded` reads the current admitted selection into the original
bounded `breditor/rich-clipboard` V1 envelope and plain Unicode text. A caret
copies nothing. Copy changes neither shared content, selection, pending formats,
history, redo nor the live observation. Stale or foreign observations reject first.

`paste_clipboard_guarded` takes an explicit text, grid or stable flow target.
Inline paste uses complete source formats and one advanced-caret history recipe.
Flow paste rekeys every block, table, axis, image, asset generation and merge;
immutable asset references remain unchanged. The additive core
`RichClipboardFragment::rekeyed` returns an admitted semantic tree without an
intermediate local edit or weakening the nonempty-document schema rule.
Grid paste requires an exactly matching merge-closed rectangle, keeps its axes
and column widths, and retains every covered source-cell body independently.
There is no implicit crop, tiling or axis growth.

The named `PasteBlocks`, `PasteTableCells` and `ClearTableCells` actions lower
core-admitted results to independently owned births, placements, observed-body
deletions, header choices, merge records and retractions. They never replace a
shared table/root payload or import local history. New merge records use the
actual authored action stamp; clocks used to admit clipboard rekeying are discarded.
New table defaults contain no merge history. Inactive source records/retractions
are not accepted as semantic flow. Clear preserves axes, headers and merges and
creates explicit fresh empty paragraphs, including covered cells.
Whole-flow paste also retains an implicit empty root/cell paragraph when the
core insertion semantics keep it. Its canonical occurrence and causal caret
survive the new content, Undo, Redo and same-writer restoration; a conditional
fallback is not silently dropped when pasted content makes the container nonempty.

An explicit header choice owns intent even when the visible value was already
equal. `None` preserves the target's header without authoring a competing choice.
Concurrent pastes keep both independently authored bodies in deterministic order;
undo hides only its writer's fresh content and retracts its observed-body deletion.
Edits to a replaced original body remain causal state and reappear when all
replacements hiding it are undone. Clipboard copying never deletes asset bytes.

The private Wasm owner exposes guarded `copy_clipboard` and `paste_clipboard`.
Paste accepts a closed request with the semantic fragment, explicit target and
ordered typed host-allocated IDs. Its outer request limit is 5 MiB and 20,000 IDs;
the clipboard envelope independently remains capped at 1 MiB. All reservations,
including unused ones, remain consumed by the host on failure. A stale guard is
checked before parsing or ID admission. Other existing action, geometry and
historical-state limits still apply. The optional shared DOM adapter now connects
these operations to browser events; this does not acknowledge the OS clipboard
or import cross-host asset bytes.
Clipboard parents, axes and targets must already be visible when the group is
prepared; a batch that first creates a target or changes the required grid shape
can reject atomically. Use an explicitly admitted target publication rather than
assuming general sequential clipboard planning over not-yet-visible geometry.
Preparation currently scans the target table to reserve canonical body/header
fields outside history; it is not yet optimized to scan only the pasted rectangle.

## Shared heading conversion

`rich_replica::actions::SetHeading` reuses core capture/admission and verifies the
exact materialized semantic preview. Kind and rank are one writer-owned field;
paragraph conversion removes the heading rank. It never replaces text containers,
character identities, formats or structural placement. Concurrent ranks resolve
by the existing causal priority, and masked Undo retracts only its own intent.
Invalid ranks and attempts to make image captions headings reject the complete staged group.
An already-matching kind/rank is a no-op, including selection/history/causal state.

Visible normalized empty paragraphs can own the same intent without registering
an authored tree occurrence. Infrastructure metadata is prepared outside history;
only the kind contribution is undoable. An empty heading remains explicit when
another block appears, including through a concurrent writer. Undo removes that
claim but retains independently authored text. Axis-derived cells and newly split
right paragraphs use the same command. Selection identity survives conversion;
pending formats clear when the caret's effective block kind changes and restore
with that action's history recipe.

Nine native contracts cover exact restart history, all correlated kind/rank
fields, concurrent winners and masked history, offline cell/caption edits,
normalized empty flow, derived cells and composed split/type groups. Browser
contracts exercise all six ranks, concurrent delivery orders, atomic rejection
and real page reload from a native journal with future operation/journal equality.
No-op conversion also preserves an earlier selection-relocation outcome and its
live observation; the complete owner state remains unchanged.

## Text fragments for shared paragraph boundaries

`RichReplica` now uses `rich_replica::text_flow` for every text action, removing the assumption that a
paragraph owns one text container. A paragraph instead owns an ordered tree of
stable fragments. Every rendered chunk records its original source, scalar-aligned
UTF-16 interval, fragment ID and typed formats. Split assigns existing characters
to a new fragment and moves following fragment subtrees; join attaches the whole
right text root to the left. Neither operation deletes, copies or reinserts those
characters. Offline edits retain their source identities and follow the selected
fragment placement. Deletion and formatting route logical ranges back to the
original intervals, including reordered intervals in the same source.

Definitions and canonical containers are prepared outside user history. Cut,
placement and ownership contributions are recorded inside the explicit action
group, so selective Undo cannot erase another writer's owned typing. Concurrent
join edges are selected in descending causal priority; an edge that would close
a cycle falls back to an older placement. The result is a deterministic forest
whose character-bearing fragments each occur once. This normalization applies to
the new text-flow graph, not the still-unfinished general AST placement conflict
normalizer.

Each root has a separate empty insertion fragment. Typing into an empty half of
a split cannot leak into its sibling. Causal cut records handle empty/end splits
without adding sentinel characters. A captured After caret can follow an unseen
cut while a caret clicked at the same left boundary after observing the cut stays
there. A regression reproduced an observed left-end After caret resolving to the
right paragraph at zero. End carets now retain both a character binding and a
floating edge scoped to that character's current fragment: right-side typing
cannot pull the observed left caret across the seam, while an unobserved original
end still follows the split and subsequent typing. Anchor witnesses and all
source identities survive engine export/import.

The real `split_text_block` and `join_text_blocks` commands capture and admit the
original Rust core actions, then compare their materialized result with that
immutable semantic preview. Structural births, placements and source routing
belong to one explicit history group. Caption splitting, invalid scalar cuts,
wrong ranks and cross-parent joins reject without publishing content, UI,
history or stale-guard changes. Earlier creations can declare text targets for
later steps: one group can insert text, split, type into the new paragraph and
join it again. Split chooses its current parent and source after prior commands,
including a preceding move. A reserved tail fragment binds to one actual source;
empty right paragraphs have their own canonical source. Active cuts also retain
an empty normalization paragraph when a split creates a second empty paragraph.

Native undo reproduced a retained fragment attribute on an offline-inserted
character after removing that attribute from the original characters. Inherited
attributes therefore do not prove that their action is still active. Explicit
writer-owned activation claims now gate both fragment and format annotations.
Undo retracts the claim globally; Redo restores its original priority. This keeps
offline text in its correct paragraph when a split is undone and removes undone
formatting from inherited inserted text without deleting that text. One claim
belongs to each semantic command, while the complete batch retains one history
identity. Sequential command stamps preserve later-command priority; the retained
engine patch orders activation-field deletions deterministically during native
undo. Source-aware history repairs both the floating
caret and its end binding when native history
recreates character IDs. A full materialization builds one shared source index
rather than rescanning every source separately for each paragraph.

Unobserved insertions exactly at a cut inherit the engine's fragment annotation
at both edges; observed insertions explicitly select their logical paragraph.
This seam policy does not promise that a concurrent insertion uses a remote
writer's not-yet-observed paragraph choice.

The lowerer has separate documented files for split, join, insert, delete and
format. Prepared actions reject stale engine versions before writing. They must
run on a disposable staged document: they do not themselves provide atomic AST
publication, schema admission, transport authorization or durable undo-stack
recovery. `RichReplica` supplies the atomic publication, core grammar admission,
paired source-cursor repair and private V7 recovery with exact effect checks around them.
Transport authorization remains a host responsibility.

Native and Wasm opaque engine exports may encode map-value dictionaries in a
different order while retaining identical causal operations and state. The
paragraph recovery vector therefore compares complete decoded operation JSON,
version vectors, materialized state and exact private journals at each future
history step. It separately verifies native-frame import and Wasm-frame
round-trip. Raw engine packing is not a canonical document/version format.

The native comparison helper accepts one bounded, newline-terminated JSON
request. A captured process sample reproduced the old helper waiting for stdin
EOF before any engine import, while its synchronous caller blocked the browser
test deadline. Three Rust framing tests and an actual still-open-pipe Node test
cover that boundary. Browser callers now use asynchronous execution with a
15-second timeout, bounded output and exact result-count/name checks. This test
transport is separate from the shared editor protocol.

The lowerer independently caps 20,000 graph nodes, 50,000 placement sites,
20,000 source runs, 100,000 projected attributes, 1,000 cut owners and 10,000 cut
contributions. Sources and indexes are rebuilt for each operation; these ceilings
do not establish production latency, memory or compaction budgets.

Twenty-one native contracts exercise scalar cuts, source-preserving split/rejoin,
offline typing/formatting, concurrent cuts/joins, reversed source order, empty
paragraphs, causal boundary carets, selective history and export/import. Eight
closed scenarios also run through the actual compiled Wasm lowerer and compare
with independently generated native JSON. Seventeen additional contracts exercise
the actual shared paragraph commands, including concurrent cuts in both writer/
delivery orders, inherited-annotation undo, independent source containers,
normalized cells, new axis-derived cells and exact restored future history.
Selection and pending-format normalization occurs once after the complete atomic
group, not after intermediate commands. Original-axis deletion fallback does not
select a row first created by the same group.
The Wasm probe exposes these commands through guarded dispatch, now connected
to the opt-in shared browser coordinator. Private shared model revision 10 and journal V11
replace the earlier experimental model; shipping schemas/codecs are unchanged.

## Limits and remaining gates

These are provisional probe limits, not public editor guarantees: 1,000 journal
entries; 16 MiB serialized journal; 1 MiB opaque engine update in a 5 MiB JSON
envelope; 4 MiB deep causal state (with independent core document limits);
64 ordered command steps; 64 KiB per inline/range text insertion; 10,000
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
Placement cycles now normalize without hiding either subtree, including
axis-derived cell ancestry. General grammar conflicts involving concurrent kind
changes and placements remain an implementation gate.
Cross-device writer authorization and reference
relay/presence/asset-provider integration are also unfinished. The fixture
exchanges engine bytes in one test host;
it does not implement a production transport or an end-user collaborative editor.
Shared semantic clipboard planning now allocates history-free primitives and
authors merge stamps, rather than copying local history through the creation API.
The separate `@breditor/experimental-collaboration` package connects those
operations to shared browser clipboard events and the existing read-only renderer.
Physical Japanese IME and spoken VoiceOver are deferred at the user's request.

Follow-up Firefox large-object comparisons reported zero path/grid coordinates
as `NaN` or `Infinity`, including native-expected zeros and an actual local-history
path. The failing flow/local traces are retained in the ignored
`target/collaboration-browser-evidence` directory. Rich action/axis/flow/navigation/
clipboard fixtures now share exact JSON-wire transport with independent browser
parsing and finite-number checks before test-protocol transport. Recovery uses
the same JSON-wire strategy. Five recovery repeats per engine, five Firefox axis
repeats, and five repeats of each Firefox local/flow fixture agreed. The original
large-object mismatch's origin is not established; these tests do not establish
an upstream browser repair.

The pinned Wasm normal/build closure contains 139 packages. Loro's facade is MIT,
but `im 15.1.0`, `bitmaps 2.1.0` and `sized-chunks 0.6.5` declare `MPL-2.0+`.
The closure also includes BSL-1.0 and mandatory Unicode-3.0 terms. Optional
package notices and exact upstream source references must be completed and
reviewed before distribution; this checkpoint does not certify packaging
compliance. Existing shipping-package notice inventories remain unchanged.
