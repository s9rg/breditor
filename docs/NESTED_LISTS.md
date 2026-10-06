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
needs Wasm/browser admission before browser-facing use.

`WrapNestedListAction` wraps consecutive selected bare blocks and changes only
selected items' marker families, rebuilding nested sections in source-path order.
Matching numbered lists retain their starts; newly numbered sections use the
configured start. Unselected split suffixes retain their original ordinals.
Descendants keep their hierarchy and change markers only if their own leading
blocks are selected. Cross-level/backward/end-exclusive selections, activation,
exact text-block preservation and V7 recovery have matrix coverage; exact-tree
fixtures check child-section splits and numbering. Final node/fanout failures
leave the document, selection, pending formats and history untouched.

`UnwrapNestedListAction` removes membership from selected leading blocks at any
depth, producing exact bare root blocks. Unselected blocks retain their markers.
An ancestor splits at an extracted descendant: earlier children stay attached,
and subsequent sections rise as separate lists so no content crosses the selected
block. Split ordered sections retain their original first ordinal. This is
explicit removal, not one-level outdent. Endpoint/direction matrices, exact-tree
numbering fixtures, V7 recovery and final-root-fanout rejection cover the action.

`CompiledEditorProfile::try_compile_nested_list_profile` now assembles the
opt-in Rust command graph: nested text/paste/Enter/deletion, inline extension
formatting, heading conversion, wrapping/removal and indent/outdent. Existing
format intent identities are preserved. New nesting intents are
`breditor/indent-list-items` and `breditor/outdent-list-items`, with matching
`breditor/control-...` state IDs and priority-zero blocking bindings.
Sixteen built-in controls plus extension controls fit the unchanged ceilings.
Tests exercise real engine routing, state derivation, V7 recovery, reserved IDs,
maximum extension counts and flat-profile isolation.
`CheckpointedEditorEngine::try_new_v7` explicitly selects nested session
admission: every candidate and both history branches must encode before
publication. Earlier constructors retain their existing codecs. The regression
checks an over-budget paste leaves state, observation, cached checkpoint bytes
and a reusable redo branch untouched. Wasm/browser profile integration remains
outstanding.

The Wasm crate now has an explicit `experimental-nested-lists` feature.
`fromBootstrapJsonV5` selects the nested compiled profile, and the V7 document
and session factories retain checkpoint-before-publication semantics. String
input admits the nested typing/paste contracts; state/document exports retain
their existing structural JSON versions and nested commands/intents export V7
commits. Bridge tests cover a real child list, fresh-owner redo, old-bootstrap
rejection and old-session-factory rejection. This does not rebuild or qualify
the shipping bundles, and browser nested projection/rendering remains unfinished.

The browser now has an internal owned `NestedListDocumentProjection`: recursive
list/item sections plus a depth-first directory of real AST block paths.
Closed records, ordinal ranges, aggregate node/property budgets, per-container
fanout and actual nested depth are checked before ownership is granted. Text
content uses the existing profile-bound validation proof; no base/flat renderer
can mistake the nested projection for its own type. Tests cover immutable copies,
empty/malformed sections, cycles, exact depth boundaries and 12,000 valid blocks
distributed across lists. Wasm projection consumption, DOM rendering, selection,
clipboard and public owner wiring remain unfinished.

`consumeNestedListSemanticProjection` now consumes the list-capable generated
view through the existing guarded handle lifecycle. A recursive preorder proof
checks every list/item edge, metadata sentinel, leading block and final node
count before inline data is admitted. Tests exercise nested paths, empty items,
alias/missing/extra/unreachable nodes, contradictory metadata and exactly-once
cleanup. These are adapter tests; packaged generated-Wasm integration and
projection-update consumption still require qualification.

Internal `NestedListRangeSelection` validates owned snapshot-bound endpoints
using bounded recursive AST lookup. It preserves anchor/focus affinity, derives
direction from logical block order and aggregate UTF-16 offsets, admits empty
block boundaries and rejects wrapper paths or scalar-interior text positions.
Tests cover backward nested ranges and coincident text/child encodings. Native
DOM mapping and generated selection-handle consumption remain separate work.

Generated nested selection handles now have explicit consumption and scalar
encoding entry points. Recursive preorder counting includes every wrapper but
only exposes text blocks/runs as selectable nodes. Exact owner/snapshot binding,
direction, affinity and captured cleanup use the shared lifecycle checks.
Tests cover nested scalar round trips, stale snapshots, wrapper rejection,
direction mismatch, asynchronous rejection and exactly-once cleanup.
DOM selection mapping remains outstanding.

Nested generated projection updates now consume their owned result through the
shared guarded handle lifecycle. `NestedListProjectionUpdate` independently
proves complete recursive root-subtree equality before granting reuse; changes
to descendant text, formatting, headings, child sections or numbering cannot
hide behind an unchanged-root claim. Root splices retain only exact equal
prefix/suffix subtrees, while explicit root changes require a full rebuild.
Consecutive snapshots and exact profile ownership are mandatory. Tests cover
deep edits, moved suffix indices, invalid no-change claims and exactly-once
parent/child cleanup, including an outer owner's captured destructor.
This supplies the update proof; recursive DOM rendering and public owner wiring
are still pending and no packaged/native qualification is implied.

The renderer now has an explicit internal `renderNestedList` entry point. It
builds recursive list sections, preserves ordered starts and maps actual AST
paths through all wrapper levels. Canonical validation checks the entire nested
DOM and both private maps, including unmapped inline wrappers and empty-block
placeholders; deep text, numbering, attribute and child-shape drift invalidate
the handle. DOM resource accounting includes every nested list/item wrapper.
Dedicated release/ownership checks keep base and flat handle admission separate.
Unit tests cover nested markup, deep path round trips and drift invalidation.
Incremental nested rendering, composition leases, DOM selection integration and
packaged/native browser qualification remain outstanding.

`updateNestedList` now installs verified recursive updates through the shared
host transaction guards. Unchanged whole-root subtrees retain DOM identity;
moving a root rebinds every descendant AST path. Broad impacts and canonical
DOM drift trigger a full rebuild. Stale handles and foreign renderers are
rejected before mutation, and construction failures leave the current subtree
usable for retry. Unit tests exercise moved deep paths, root/drift fallback,
superseded handles, foreign ownership and failed-construction recovery.
Composition leases and DOM selection integration remain separate work.

Nested DOM point mapping now translates validated semantic endpoints to native
nodes/offsets and back. Outer root/list/item edges normalize to the first or
last descendant block, not merely the leading block of the final item. Interior
wrapper boundaries remain ambiguous and are rejected. Empty placeholders and
inert inline wrappers normalize explicitly; foreign nodes and UTF-16 positions
inside a scalar are rejected. Unit tests round-trip every scalar and text-block
boundary in a recursive fixture. Native range direction, selection echoes,
composition leases and public event-controller integration remain pending.

An explicit `BreditorNestedListDomSelectionBridge` now shares the native
selection transaction machinery without widening the base/flat bridge gates.
It reads and writes nested ranges, preserves backward anchor/focus order and
exact programmatic affinities, suppresses one matching programmatic echo, and
rejects stale projection selections. Tests cover backward cross-level ranges,
deep empty-block carets and clearing selection. These are jsdom integration
checks, not native Safari/Chrome or physical IME qualification; event-controller
and composition wiring still remain.

Recursive renderers now expose distinct nested composition leases. While leased,
canonical handles and AST maps are unavailable, but exact renderer/host ownership
remains provable without interpreting provisional native DOM. Restoration uses
the shared guarded installation path; detached construction failure leaves the
lease retryable, and successful restoration or discard prevents reuse. Tests
cover deep provisional text, foreign renderer rejection, canonical restoration,
construction failure and discard. This is ownership infrastructure only: nested
composition reconciliation and event delivery are not yet wired or IME-qualified.

`reconcileNestedListCompositionDom` now checks recursive list/item structure,
ordered starts and every non-target block before recovering a bounded replacement
from one selected text block. Prefix/suffix checks and the existing Unicode,
text/node and dynamic-attribute budgets still apply. Tests recover a deep
replacement and reject changed parent text, numbering, missing child sections
and altered surrounding text. Cross-block composition remains rejected by the
shared reconciliation contract; event delivery and physical IME qualification
are still pending. Synthetic Japanese text in a test is not native IME evidence.

Nested input target ranges now have an owned immutable `NestedListTargetRange`
contract and `mapDomNestedListTargetRange` native adapter. The shared native
range capture checks host ownership and DOM ordering before converting endpoints
to recursive AST paths. Backward semantic targets, forged ownership and stale
render handles are rejected. A cross-level native Range test verifies exact
endpoints. Live beforeinput/event-controller delivery remains outstanding.

Nested editor command requests now have separate issued delivery-token ownership,
exact render/projection/epoch/authority correlation, owned selection snapshots
and native action IDs matching the Rust nested profile. Canonical requests reuse
the existing command/string/JSON bounds while rejecting nested tokens on legacy
base and flat request paths. Tests check foreign selections, forged tokens,
wrong epochs/authorities and valid recursive text requests. Queue, generated
command adapter and event-controller integration are not yet complete.

`BreditorNestedListCommandQueue` now applies nested-only request admission to
the shared bounded synchronous FIFO. Its composition lease port checks the exact
captured executor and mode. Tests cover non-recursive reentrant ordering,
terminal executor uncertainty without replay, exclusive single-use leased
delivery and rejection through legacy queue admission. This does not yet wire
the nested generated command adapter or live event controller.

Nested composition delivery tokens now distinguish exact canonical opening from
connected provisional-DOM settlement. They retain exact selection identity,
epoch, session and hidden adapter authority, with a separate nested mode in the
ownership registry. Tests verify legacy-mode rejection, forged-token rejection,
stale epochs and host disconnection. Settlement matching deliberately does not
prove uninterrupted renderer ownership or spend a token; the adapter must pair
it with the renderer lease and enforce single use when integration is wired.

Nested plain-text export and clipboard serialization now use recursive reading
order with one LF between text blocks, preserving empty blocks. Clipboard
selection endpoints retain their actual AST coordinates and support either
direction; exact renderer-bound presentation ownership is required for inline
HTML. Existing Unicode/output budgets apply. Tests cover cross-level forward
and backward fragments, empty descendants, emoji byte counts and forged or
unbound selection rejection. Markers/indentation are intentionally absent:
this is text interchange, not structural rich paste. Native copy/cut event
delivery and the adapter's lossless document export remain separate work.

The browser Document V2 payload validator now accepts recursive sections only
under an explicit V7 durable contract. Item-leading block shape, list families,
ordinal ranges, per-container fanout, depth and aggregate node/property/text
budgets are checked before admission. V5/V6 remain closed to nested sections.
Tests cover valid nesting, malformed items/starts and the exact depth boundary.
This is document validation only; nested projection correlation, V7 browser
session validation and generated command-adapter wiring remain unfinished.

`documentJsonMatchesNestedListProjection` now correlates a validated V7 document
against an owned recursive projection: root grouping, list family/start, item
order, child-section topology and complete text-block formats/ranks all take
part. The schema selector and fingerprint must match. Tests reject equal-text
structural changes, numbering/family changes, changed child text, old durable
modes and lookalike projections. Browser V7 session-history validation and
adapter publication are still pending.

Initial V7 history-operation preflight now validates guarded reframing, nested
text splices and inline-format rewrites against the Rust wire shapes. It checks
complete guarded trees, preserved block order/topology and scalar-safe splice
offsets at real nested paths. Tests cover valid deep splices and rejected scalar
splits, wrong paths, reordered text blocks and structural format changes.
Structural text replacement is not yet admitted here, and this helper is not
yet connected to V7 session admission. Static preflight does not replace Rust
replay or inverse validation.

Structural V7 replacement preflight now checks exact root guards, ordered nested
endpoints, scalar boundaries, text-block-only insertions and canonical empty
paragraph layout slots with the derived slot count. Inserted fragment sequences
use the Rust codec's larger per-container fragment bound while preserving total
node/property/text limits; published document fanout stays unchanged. Tests
cover malformed/reversed replacements and fragment sequences above 10,000
blocks, including aggregate-node rejection. All four nested tags now have static
preflight, but session integration and Rust replay qualification remain pending.

Browser Session V7 static admission now requires State V3/Document V2 and routes
the four nested operation tags through their dedicated preflight (older V5 tags
retain their existing checks; flat V6 tags are not added to V7). History-base
property accounting traverses every nested list section. Tests cover nested
selection paths and both undo/redo cursor branches, rejecting wrong state
versions, null operations, flat tags and scalar-splitting splices. This validates
wire structure and lower-bound budgets only; Rust replay/inverse proof remains
mandatory before a restored engine can be published. Packed integration remains
unfinished.

IndexedDB checkpoint storage now admits explicit version 7 bindings. V6 and V7
records in the same slot cannot be loaded through each other's bindings; exact
owner tokens, optimistic generation conflicts and digest checks remain in force.
Storage tests cover V7 competing writers and corrupted records without rewriting
their retained bytes. This storage layer treats checkpoint text as opaque;
semantic validation and Rust replay are still required by the adapter before
engine restoration. This is not an end-to-end recovery qualification.

Explicit nested beforeinput and keyboard translators now use nested-only command
admission and Rust action IDs through the shared syntax mapper. Tests cover
typing, backward/forward deletion, Enter fallback, composition routing and
legacy translation rejection. Existing controller selection capture remains
base/flat-only until nested controller wiring is implemented. Tab/Shift-Tab
indent/outdent capability routing and live native delivery remain pending.

Nested clipboard request builders now admit nested-only cut deletion and plain-text
paste with a closed-before history boundary. Tests cover Japanese text, the source
paragraph ceiling, invalid Unicode, forged delivery and rejection by legacy
builders. Live clipboard-controller integration remains pending;
these request tests are not native clipboard qualification.

The explicit `BreditorNestedListWasmCommandAdapter` now uses the shared command
ownership/publication state machine with nested-only delivery capabilities and
V7 durable admission. It dispatches recursive projection updates, deep scalar
selections, full render recovery, plain-text/document export and composition
lease restoration through their nested implementations. Legacy and flat
constructors do not enable this mode. The existing composition controller shares
the result-capability type but is not yet wired for nested native events.

Adapter tests exercise simulated generated selection/edit/undo/redo results,
exactly-once handle cleanup, stale and foreign requests, disabled commands,
fault quarantine, composition refinement/recovery/failure and recursive document
export correlation (including rejection of same-text reparenting). These prove
browser adapter dispatch and ownership, not Rust execution or native IME behavior.
Public editor owner, native controllers, toolbar and packed consumer
qualification still need integration before release readiness.

Explicit nested bootstrap/preflight now selects profile format V5 and engine
codec V7, including session restoration. Its initial projection reader captures
recursive list metadata and transfers the engine, observation and generation
owners only after validation and cleanup succeed. Bootstrap tests use simulated
generated handles with actual child-list paths; they cover startup, restore,
metadata preflight, missing/async factories, malformed projections, cleanup
failures and cross-mode rejection. Flat startup does not even inspect optional
nested APIs. This is not yet a packed generated-Wasm or native browser test.

The explicit nested clipboard controller now connects nested selection capture,
serialization and cut/paste commands to the adapter-owned queue. It retains the
shared transfer/cancellation checks, exclusive queue lease, stale-DOM guards and
one-use input echo suppression. Adapter-backed tests cover backward emoji and
parent/child copy, successful cut/paste, invalid payloads, transfer/cancellation
failure and uncertain execution without retry. Test events and generated results
are simulated; native clipboard qualification and editor/router attachment are
still pending. Paste remains bounded plain text, not structural HTML import.

The explicit nested composition controller now connects deep target-range
refinement, DOM reconciliation, adapter leases and nested command delivery to
the shared composition state machine. Adapter-backed tests preserve backward
selection/affinity, reject cross-item and scalar-splitting targets, restore
canonical DOM after structural drift, cancel without text edits and quarantine
uncertain execution without retry. A simulated Japanese replacement commits
once and suppresses its terminal input echo while releasing the queue lease.
These are synthetic-event/ABI tests, not physical Japanese IME qualification.
Cross-block composition remains rejected; native router/editor attachment is
still pending.

Nested ordinary-event and router facades now connect keyboard/beforeinput,
selection synchronization, clipboard and composition controllers to one host
owner. Tests cover listener priority/disposal, constructor rollback, exclusive
ownership, terminal queue failure and a dispatched DOM text event with deep
target ranges. Unexpected native DOM mutation is restored without replaying the
content command. These tests use jsdom and simulated generated results; public
editor integration, nested toolbar/indent shortcuts and real-browser qualification
remain incomplete.

Nested toolbar request/dispatcher capabilities now preserve the core selection
and use the nested adapter's captured executor under an exclusive queue lease.
Tests cover busy rejection, foreign owners, observer reentrancy, public-method
overrides, disposal and terminal uncertainty. The separate nested manifest adds
Indent/Outdent using the Rust profile's named intents and tracked-state contracts,
with explicit history boundaries. The manifest still needs connection to the
public editor and validation against a real generated nested profile; these are
not yet working toolbar buttons in the running demo.

`BreditorBrowserEditor.openNestedLists` now selects the explicit V5-profile/V7
owner throughout startup, rendering, command delivery, toolbar, router and
cleanup. It defaults to the separate nested toolbar manifest and binds storage
to checkpoint version 7. Existing `open` and `openFlatLists` selectors remain
closed. Owner tests cover recursive startup/export with and without a custom
toolbar, exclusive host ownership, abort/failure rollback, invalid selectors,
exact disposal and restoration from a V7 IndexedDB slot. Their engine is a
static simulated startup fixture: real nested action execution, default toolbar
descriptor compatibility and replay recovery still require packed generated-Wasm
qualification. No running demo or shipping bundle has been rebuilt yet.

The isolated nested Wasm candidate now passes generated ABI and TypeScript
consumer checks, retained heading compatibility, and real nested command/recovery
scenarios under Node and five runs each in Chromium, Firefox and WebKit. These
exercise indent/outdent, deep Unicode typing/plain-text paste, V7 commit export,
exact document/selection undo and redo, and a fresh profile restoring a checkpoint
with redo available. V6 restoration rejects that checkpoint. Candidate
`target/nested-list-candidate-5Um68E` has Wasm SHA-256
`93d04f43c3b922e0faac254850900764794eb69d6ffc4d823e2499a94784829a`.
The build verifies shipping Wasm/browser trees remain unchanged. This is raw-Wasm
qualification, not editor DOM, toolbar, native clipboard or IME qualification;
it does not resolve the older intermittent WebKit fault. Reproduce with
`node scripts/build-experimental-nested-list.mjs` (Cargo and wasm-bindgen on PATH).

The real generated candidate also passes the integrated browser owner scenario
in Chromium, Firefox and WebKit: default 16-button toolbar startup, DOM-driven
selection, toolbar indent/outdent, deep emoji typing, exact document and selection
undo/redo, and fresh-owner V7 checkpoint restoration with pending redo. Disposal
clears owned DOM. These are source-integrated browser tests using synthetic
selection/input/click events, not packed-consumer or physical input qualification.
Run `node scripts/check-experimental-nested-list-browsers.mjs target/nested-list-candidate-5Um68E`.

The integrated scenario also verifies host-configured primary-I/primary-Shift-I
nesting shortcuts, primary-Z/primary-Shift-Z history, repeat suppression and
composition bypass across all three engines. These chords are test configuration,
not new default bindings. Tab remains native; availability-aware Tab/Shift-Tab
nesting is still pending. Deep multiline plain-text paste (with conflicting HTML)
and exact selection/document undo/redo pass through the actual clipboard controller.
Firefox's constructed clipboard event did not retain the supplied transfer data;
the fixture populates and checks the event's actual store before dispatch. This
is synthetic clipboard coverage, not OS clipboard qualification.

Task lists, arbitrary multi-block items, tables, rich HTML paste and collaboration.
Migration of existing flat sessions requires an explicit, separately tested path.
