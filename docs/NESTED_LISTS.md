# Nested lists: experimental implementation contract

Status: implemented behind experimental Rust/Wasm features and a separate private
`@breditor/experimental-nested-lists` package. Generated-Wasm, integrated-browser
and installed-package automated checks pass; this is not release readiness.
Default shipping bundles and the existing flat-list package remain unchanged.
The historical intermittent WebKit fault is unresolved.

Remaining release gates: physical keyboard/IME and spoken screen-reader
qualification; size and large-document performance qualification; resolution of
the WebKit risk. Native clipboard observations cover the older `Skv8uP` archive
in Safari and Chrome, within the scope recorded below; they do not qualify the
latest `VTFj93` candidate. The
implementation log below is chronological: older pending notes are superseded
only where a later checkpoint explicitly supplies matching evidence.

Latest automated candidate: `target/nested-list-opt-in-VTFj93`, archive SHA-256
`cdf2b46b9353756d7675927b62eb47849280104b85f27fd09bbe76a67ee57377`.
Its installed Node/types and Chromium/Firefox/WebKit checks pass. Native
qualification has not transferred to this candidate.

Most recent archive with native observations: `target/nested-list-opt-in-Skv8uP`, archive SHA-256
`2a6e34b69ab028fc8f2e20327b2581baef4e531adc1461a133dbabe1548b3af7`.
Its installed Node/types and Chromium/Firefox/WebKit checks pass. The
[current native record](qualification/2026-10-11-current-native-lists.json)
adds Safari nesting/clipboard and Chrome cross-item cut/undo observations for
this archive. Older native records still apply only to their identified archive.
The [source-proof checkpoint](qualification/2026-10-11-nested-capture-source-proof.json)
records the current Rust change and its limits; no latency improvement is claimed.
The [capture-reuse qualification record](qualification/2026-10-06-nested-list-capture-reuse.json)
records the complete Rust suite, generated and installed-package checks across
three browser engines, and 900 diagnostic WebKit cycles without a new fault.
The [native-browser record](qualification/2026-10-06-nested-list-vqq3up-native-safari.json)
records Safari nesting and clipboard checks plus forward/backward cross-item
Chrome cut/undo with exact DOM and selection restoration. These records do not
qualify physical IME, spoken VoiceOver, size/latency acceptance, or a fix for the
historical WebKit fault. Those gates remain open; this is not a release approval.

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

## Required behavior

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

The separately named private package `@breditor/experimental-nested-lists` now
assembles from an admitted experimental browser/Wasm pair. Its external offline
consumer passes strict TypeScript, Node initialization/export-boundary checks and
Chromium/Firefox/WebKit tests for nested descendants, indent/outdent, toolbar
conversion, undo and V7 restore/redo. The same pair retains the default consumer
smoke. A wrong toolbar re-export path was caught by the first TypeScript consumer,
fixed, and covered by a regression test; the failed archive is not qualified.
The passing archive is `target/nested-list-opt-in-r2RCEd` (SHA-256
`d5d67895264aa4cdf57da1c45a7b7f7bdbf58c9b9e78513bf4fe9782fab49f2c`),
from `target/nested-list-packages-uSbUD5/qualification.json`.
It is 951,470 bytes compressed and 4,145,455 bytes unpacked. Default size ceilings
are exceeded; size qualification remains false. Shipping artifact trees are
unchanged, publication is disabled, and native-input/WebKit release gates remain.

Post-package hygiene checks: browser source and test TypeScript pass, all 2,062
browser tests (54 files) pass, and the nested feature's 1,187 core / 58 Wasm bridge
unit tests pass. Strict all-targets Clippy found test-only issues (unchecked cast,
panic-based static name construction, redundant closures/borrows and naming),
which were corrected; five long exact-state/history scenarios carry narrowly
scoped, explained length-lint exceptions. Strict Clippy now passes with warnings
denied, and rustfmt check passes. This does not replace the outstanding release
gates listed above.

The isolated Tab policy now classifies genuine Tab/Shift-Tab through shared DOM
intrinsics, honors disabled shortcuts/composition/modifiers, leaves every
non-enabled Rust availability native, and suppresses repeated enabled nesting.
It is not wired into event delivery yet. Integration must synchronize the actual
DOM selection before querying availability (selectionchange may arrive later),
then revalidate the current owner/render before cancellation and dispatch. Cached
toolbar availability cannot authorize this path. No current Tab behavior changes
are claimed by the policy-only checkpoint.

Tab/Shift-Tab is now connected only to the nested router. It synchronizes the
current DOM range under an exclusive queue lease, reacquires admission, reads
Rust action availability, revalidates selection/owner/render and only then cancels
the event and dispatches the intent. Disabled states, bare paragraphs, modified
keys, composition and host-disabled shortcuts retain native behavior. Enabled
repeats are consumed without another structural command. Integrated real-Wasm
checks pass in Chromium/Firefox/WebKit, including caret moves without a preceding
selectionchange, first-item/root-outdent fallback, descendants, exact undo, and
repeat suppression. The earlier opt-in archive predates this integration and must
be rebuilt/requalified; these synthetic event tests do not prove physical keyboard
focus navigation or assistive-technology behavior.

Focused Tab failure tests now cover foreign queues, an occupied lease, core
selection errors, uncertain delivery without retry, reentrant selection observers
and disposal during their callback. Core non-stale rejection may leave the adapter
live while the queue faults; Tab correctly reports delivery failure and does not
query availability or execute a content action. Browser totals are 2,084 passing
tests with type checks passing. The refreshed external pair and single-package
consumer also pass Node/TypeScript and Chromium/Firefox/WebKit, now including
Tab/Shift-Tab. Current archive: `target/nested-list-opt-in-HwqlQN`, SHA-256
`d7013694776c667101629799224fc3fdb2c0e52074b07bb38d535b0ec21e1426`,
954,091 compressed bytes, from `target/nested-list-packages-fwwKqY`.
Shipping trees remain unchanged and size/publication qualification remains false.

Installed-package keyboard qualification now additionally uses Playwright's
browser-dispatched keys, asserting that observed key events are trusted rather
than script-dispatched. Chromium/Firefox/WebKit pass Tab/Shift-Tab nesting, actual
text input, undo/redo, Enter/Backspace split-and-join with exact descendant
restoration, and disabled-indent focus navigation to a trailing text input.
An initial trailing-button focus assertion failed only in WebKit (the event left
the editor but did not focus that button); a text-input focus target passes in
all engines. Button focus preference behavior remains outside this check. Exact
artifact stays `nested-list-opt-in-HwqlQN`; the current consumer report identifies
`breditor-opt-in-consumer-fMmjHw`. This is browser automation, not physical keyboard,
OS IME, native clipboard, VoiceOver or resolution of the older WebKit fault.

The old WebKit fault reproduced on the retained original flat package at 500
items/repetition 48 during selection synchronization. Queue diagnostics captured
`TypeError: Wasm projection update is invalid`; router diagnostics show a faulted
adapter and `command_queue.executor_threw`. The reproduction record is
`docs/qualification/2026-10-05-webkit-projection-update-reproduction.json`.
This identifies the failing boundary, not the root cause or a fix. A disposable
diagnostic now preserves the validator error before the generic exception.

Further retained-package runs narrowed one failure path to `paragraphsEqual`:
item 410 was a level-2 heading whose left/right logged fields matched, and both
containing snapshots serialized identically. Another run failed earlier during
paragraph-shape validation. These are unresolved observations, not proof of an
engine defect. Single-read shape diagnostics and comparison-result diagnostics
now preserve the original rejection behavior in disposable test bundles only.
The first field-instrumented run passed 300 owner cycles; that does not establish
a fix. Exact reports and follow-up results are recorded in the reproduction JSON
above. No production validation has been weakened.

The captured heading inequality path now has a narrow compatibility mitigation:
`paragraphsEqual` uses `Object.is` for heading ranks (equivalent for admitted
undefined/1–6 values). The retained candidate passed 900 instrumented and 900
lean owner cycles across six fresh WebKit sessions. Current source passes type
checks, 2,085 browser tests, and isolated nested-package consumers in Chromium,
Firefox and WebKit (`target/nested-list-packages-DC9v8R/qualification.json`).
Shipping artifacts are unchanged. The independent paragraph-shape rejection,
native qualification, size and large-document performance remain open; this is
not a claim that all WebKit faults or release requirements are resolved.

The refreshed single-package archive is `target/nested-list-opt-in-Y46CEx`,
SHA-256 `54a8d9c384888c7163342c38e108dfb92d8966f456542866622e05240128934b`,
954,099 compressed bytes. Its external consumer passes Node/types and all three
browsers, including trusted keyboard nesting, text input, split/join, history and
disabled-indent focus navigation. It remains private and not release-qualified.

The post-fix repeated nested baseline completed 81 owner cycles over nine fresh
browser sessions without another agent-started test workload running alongside it.
Exact document/selection/edit/history/recovery assertions passed. For 500 root
items with nested descendants, the three per-session median edit times were
109.2/112.3/113.5 ms Chromium, 362/363/361 ms Firefox and 250/234/259 ms WebKit.
This confirms the large-document latency concern; it is not a performance pass.
Report: `breditor-nested-list-consumer-kWZhAE/performance-ghGBbf/measurement.json`
under the system temporary directory; SHA-256
`c39e8663c73e772e79654f55b4eed68c98733711cf258425e453ee20622c5f9d`.

A topology-preserving text refresh now retains nested list/item/block elements
when root positions, tags, numbering and recursive item/section counts are
unchanged. It prepares changed paragraph children off-DOM and uses the existing
guarded install/rollback path; unchanged paragraphs and descendants retain their
nodes with fresh snapshot-local maps. Structural/tag/numbering changes still
rebuild, and drift/full-impact handling is unchanged. Type checks and 2,089 browser
tests pass, including empty-block mapping and rollback after a write throws.
The isolated package pair `target/nested-list-packages-TpYaIw` passes all three
browser consumers and default smoke checks. A post-change performance measurement
and refreshed single-package keyboard qualification are still required; no speedup
or release readiness is claimed from these correctness tests.

The follow-up baseline on `nested-list-packages-TpYaIw` did not establish a
speedup and failed a WebKit correctness assertion at `100 items, repetition 0:
editMs`. Retained report: `breditor-nested-list-consumer-RBqXwA/performance-0I9ZzF/measurement.json`,
SHA-256 `c5a90cdad620592f040328075ea5d1b8355a6588a00f6f156582a9e1ed37994a`.
The original assertion did not identify which value differed; bounded fixture
diagnostics now include the assertion label, actual/expected values and selection
context for an edited-block mismatch. This failure must be resolved before
qualifying the refresh. Source inspection also shows nested text operations are
not recognized by the Wasm narrow text-impact classifier, so full-root fallback
may bypass this renderer optimization; a classifier regression test is needed
before widening its impact reporting.

The diagnostic repeat reproduced a faulted owner during WebKit redo at
`500 items, repetition 2: redoMs`, retained in
`breditor-nested-list-consumer-RBqXwA/performance-u1PDnb/measurement.json`
(SHA-256 `cc457c4c367757262bacab38273f1bcc7118c38dd9f85081929b2b3b1e8a0faf`).
History failures now include the owner's status/reason in fixture diagnostics.
This remains unresolved and is not assumed to share the heading-equality cause.

A failing Rust regression confirmed nested text splices fell through to full-root
impact. The opt-in Wasm classifier now reports a conservative containing-root
span only when every operation is a nested text splice with a text change.
Default builds and structural/mixed fallbacks remain unchanged. The browser still
independently verifies the unaffected roots. Native tests cover deep targeting,
untouched roots and exact inverse restoration. A freshly compiled Wasm candidate
and browser/package requalification are required before claiming the renderer
refresh path is exercised by actual editing or improves latency.

Rebuilt candidate `target/nested-list-candidate-ORMbAS` now passes the generated
API/TypeScript checks, Node and Chromium/Firefox/WebKit scenarios. The integrated
owner scenario explicitly asserts retained list and paragraph identities through
real-Wasm deep typing, undo and redo. Wasm SHA-256:
`09d3a7fae5fe47fb79be65ba38579e1605ba55f08bf1f52bd3ff9c5dde36c620`.
Its external package pair `target/nested-list-packages-X9tiVj` passes all three
browser consumers and default smoke checks, with shipping artifacts unchanged.
The repeated post-classifier timing run is in progress; real path activation is
now established, but speedup and intermittent-fault resolution are not.

The repeated post-classifier run completed all 81 owner correctness cycles over
nine fresh browser sessions. At 500 root items, per-session median edits were
97.4/101.6/98.1 ms Chromium, 347/352/363 ms Firefox, and 229/220/226 ms WebKit.
Compared with the earlier baseline, this is a modest improvement in Chromium and
WebKit, not a latency-budget pass; Firefox and selection costs remain substantial.
Report: `breditor-nested-list-consumer-ibvkuR/performance-g8ik5d/measurement.json`,
SHA-256 `090e391c8b8781904e5f1e6258a1bfd951fa358510ca0ace51e6edc1952c1310`.
These passing cycles do not close the previously captured intermittent faults.

Latest single-package candidate: `target/nested-list-opt-in-k3OedF`, archive
SHA-256 `f3609a0e24b69a6c824b7950cc485e8b2630651674d8a38ce7ef7c2e50a41909`,
955,008 compressed bytes. External Node/types and Chromium/Firefox/WebKit checks,
including trusted keyboard nesting, split/join, typing and history, pass against
this exact archive. It is private, not published, and not size/native/release
qualified. The default shipping bundles remain unchanged.

Two further current-package WebKit repeats each completed 90 correctness cycles
over ten fresh browser sessions. The ordinary run is
`breditor-nested-list-consumer-ibvkuR/performance-CH1ZI7/measurement.json`
(SHA-256 `01baf8e6f72f9ced94d9b2556cbe33de955bd008cc6aed0a76dd8e5235c647ac`).
The bounded queue/router/projection-rejection diagnostic run is
`breditor-nested-list-consumer-ibvkuR/performance-9bnd85/measurement.json`
(SHA-256 `fd7622855f374bff48ff77a237c237ce2b775879333b2766e5cc5f6a181f1086`).
All 18 diagnostic regression tests passed, including the WebKit positive control.
Diagnostic transforms apply only to a disposable bundle and are not release
timing evidence. Profiling, alternate scheduling and larger owner counts remain
guarded off in the nested runner. Neither clean repeat closes the previously
captured intermittent faults; native, size and latency qualification remain open.

Rust projection-impact regression coverage also checks a single transaction
editing deep paragraphs in two disjoint roots, in both operation orders, using
Japanese text and a supplementary-plane emoji. Forward, inverse and replay
report the conservative root span; intervening/trailing roots remain equal and
undo/replay restore exact documents. All 60 nested-feature Wasm Rust tests pass.

The retained pre-classifier package `target/nested-list-packages-TpYaIw` reproduced
the nested redo fault with bounded rejection diagnostics: WebKit run index 5,
500 items, repetition 2, `redoMs`. The owner fault is `toolbarDispatchFailed`;
the captured underlying rejection is `projection.invalid_update`, followed by
the queue executor throwing `TypeError: Wasm projection update is invalid`.
This narrows the next investigation to projection conversion/update validation,
not an assumed DOM rollback or toolbar button bug. The exact failed validation
branch is not yet captured. Report:
`breditor-nested-list-consumer-RBqXwA/performance-e8QUkx/measurement.json`, SHA-256
`ee3f6d89d49550d16c498063346179e97d86441375e77b782c88d3ab1025488e`.
The current package's clean repeats do not establish resolution of this fault.

The nested diagnostic runner now labels rejection expressions in both
`wasm_projection_adapter` and `nested_list_projection_update`, requiring each
module to be transformed exactly once. Failure identities and logger exceptions
are regression-tested (18 tests pass; the opt-in browser positive control was
not run in this invocation). The first branch-labeled retained-package repeat
completed 90 cycles without a rejection; report
`breditor-nested-list-consumer-RBqXwA/performance-ShGZVn/measurement.json`.
This is additional instrumentation, not a fix or a closed intermittent issue.

A second branch-labeled repeat also completed 90 cycles across ten sessions:
`breditor-nested-list-consumer-RBqXwA/performance-BOZunU/measurement.json`, SHA-256
`1a63a7e2a9e551d6c95e28d5f44d523d792483ee7ed8360f81b438f0a9c18f1d`.
No rejection branch was captured in either labeled repeat. Instrumentation can
change execution timing; these results cannot supersede the earlier reproduced
redo failure. Native qualification remains separate from the consumer fixture's
automated `keyboardProbe` mode, which keeps the editor alive for interaction but
does not itself prove OS input, clipboard or spoken accessibility behavior.

Installed Chrome UI check against the unchanged single-package consumer
`breditor-opt-in-consumer-4uZyOP` (`nested-list-opt-in-k3OedF`): clicking Second
then sending Tab nests it beneath First with Deep preserved; Shift+Tab restores
the original hierarchy. Toolbar Undo restores nesting and Redo restores the
outdented hierarchy. Clicking First disables Indent/Outdent; Tab moves focus to
the After editor input without changing list structure. These were browser-tool
key presses and UI observations, not physical-keyboard, clipboard, IME or spoken
screen-reader qualification. No OS input/accessibility settings were changed.

Installed Chrome clipboard smoke on that same consumer: selected `Deep 🙂`
with Home/Shift+End and verified the DOM selection; Meta+C then Meta+V into
the outside input produced exactly `Deep 🙂` without a marker. Meta+X emptied
only that nested paragraph; one toolbar Undo restored it. Pasting at its end
produced `Deep 🙂Deep 🙂` once; one Undo restored `Deep 🙂`. These are observed
browser-shortcut results, not synthetic clipboard-event injection, but do not
cover cross-item selections, Safari, physical IME or screen readers. Console
inspection returned one `Could not establish connection. Receiving end does not
exist.` error without an attributable stack; no claim of an error-free console
is made. The editor remained responsive throughout the observed sequence.

Chrome cross-level clipboard check on the same package: selected from the start
of First through the end of its later nested descendant Deep using Shift+ArrowDown
and Shift+End. DOM selection read `First\n\nSecond\n\nDeep 🙂`; native Copy
and Cut clipboard text both read exactly `First\nSecond\nDeep 🙂`. Cut retained
one empty leading ordered item and the unselected heading. One toolbar Undo
restored editor `innerHTML` exactly, including ordered start and child nesting.
This covers one forward cross-level range; reverse ranges and Safari remain open.

The matching backward Chrome range also passed Copy/Cut and one-step Undo.
Undo restored exact `innerHTML` and the observed backward DOM selection:
anchor Deep at UTF-16 offset 7, focus First at offset 0. Clipboard text remained
`First\nSecond\nDeep 🙂` in document order.

Native Safari opened the same immutable package consumer at port 4315. With a
visually verified caret at Second, OS-delivered Tab indented Second and its Deep
subtree beneath First; Shift+Tab restored the original ordered siblings and
nested child. An earlier AX cursor-after selection landed at an unintended
location and Tab moved focus outside; that attempt is not credited as an indent
test. No Safari clipboard, IME or screen-reader qualification is claimed yet.

Subsequent native Safari clipboard smoke passed with OS shortcuts after AX
confirmed the selection: Copy of Deep pasted exactly `Deep 🙂` into the outside
input; Cut emptied the nested paragraph; one toolbar Undo restored the text and
selection. Paste at the collapsed end inserted one copy (`Deep 🙂Deep 🙂`), and
one Undo restored the original. A backward cross-level selection from Deep
through First copied `First\nSecond\nDeep 🙂` (read through the shared clipboard
API), cut down to one empty ordered item, and one Undo restored visible text,
ordered markers 3/4, child nesting and the selected range. Safari verification
here uses native AX/visual observations, not an exact serialized document or
selection-offset comparison. Physical IME and spoken screen-reader checks remain
open; these bounded successes do not close the intermittent WebKit fault.

The nested diagnostic runner now admits 3–30 owners per size only when WebKit
queue diagnostics are enabled (ordinary runs remain at three). A real-fixture
regression proves the transformation changes only the loop bound and preserves
document/redo assertions and final disposal. Nineteen diagnostic tests pass;
the opt-in browser positive control was skipped in this invocation. The first
30-per-size run completed all 90 cycles in one retained-package browser session:
`breditor-nested-list-consumer-RBqXwA/performance-fgdPd1/measurement.json`.
This extends same-page lifetime coverage, not latency qualification or fault
resolution. Profiling and alternate scheduling remain disabled.

Three further 30-per-size diagnostic sessions completed all 270 cycles without
rejection: `breditor-nested-list-consumer-RBqXwA/performance-2pY1t9/measurement.json`,
SHA-256 `e7c609f4b6baf61be49f56ac2e5dc7230a390e2a4e1982447b19119bc702bd5a`.
Longer page lifetime did not reproduce the fault in this bounded trial. The
earlier `performance-e8QUkx` rejection remains authoritative failure evidence;
no production validation changes or release-readiness claim follow from this run.

Native IME setup attempt: temporarily added Japanese–Romaji through System
Settings, but Control+Space did not activate composition in Safari; OS key
presses entered literal `nihon`. This is not an IME pass or an editor IME bug
reproduction. SystemUIServer inspection timed out. Restored Canadian-only input,
input-menu visibility off, Globe action Show Emoji & Symbols, and English
(Canada)-only dictation languages (adding Romaji had also added Japanese there).
Dictation remained off. All restoration values were observed in Settings.

Performance coverage now includes explicit `BREDITOR_PERF_EDIT_TARGET=grandchild`
in addition to the unchanged default root target. It edits a real grandchild
paragraph, retains exact document/selection undo and V7 restore/redo assertions,
records the target per sample and rejects runner/fixture target mismatches.
The final runner passed 27 cycles across Chromium, Firefox and WebKit against
`nested-list-packages-X9tiVj`; report
`breditor-nested-list-consumer-ibvkuR/performance-HysI6a/measurement.json`.
500-root grandchild-edit medians were approximately 97 ms Chromium, 348 ms
Firefox and 214 ms WebKit. These remain measurements, not a latency-budget pass.
All 19 non-opt-in diagnostic regression tests passed after the fixture change.

Chromium CPU profiling is now admitted separately from ordinary measurements
and WebKit queue diagnostics; reports explicitly mark profiling as diagnostic.
The first grandchild-profile run passed all nine correctness cycles. Raw profile:
`breditor-nested-list-consumer-ibvkuR/performance-CRj0aB/chromium-0.cpuprofile`,
SHA-256 `55a3b5edb639f9e251d4bfdf6cb9072f86d1ae491d6a37e381b73b751d1209d9`.
Across the complete 2.22-second fixture lifecycle, largest named JavaScript
self-time samples included nativeChildNodes (175 ms), mapNode (148 ms),
selectionIntrinsics (72 ms), and mapExistingNestedListRoot (72 ms). This is not
an edit-only attribution, nor evidence that canonical DOM validation can be
skipped. It directs the next optimization investigation toward repeated DOM
enumeration/map construction while preserving mutation detection and rollback.

Implemented a single-pass paragraph mapper: full native wrapper/attribute/text
validation now retains each validated text leaf for mapping rather than walking
the same run a second time. Canonical document checks and rollback are unchanged.
All 2,090 browser tests and TypeScript checks pass. Isolated package pair
`nested-list-packages-3Zb7rY` passes Chromium/Firefox/WebKit and default-consumer
smokes with shipping trees unchanged. Its grandchild run passes all 27 cycles:
`breditor-nested-list-consumer-pTQSAR/performance-7kQDYa/measurement.json`.
500-root edit medians were 89.7 ms Chromium, 340 ms Firefox and 204 ms WebKit
(previous single-run medians 97/348/214 ms). This is a modest initial improvement,
not a statistically qualified speedup or latency-budget pass. Native testing of
this newer package and refreshed single-package assembly remain outstanding.

Refreshed single-package archive `target/nested-list-opt-in-WNID8x` now passes
external installed Node/types and Chromium/Firefox/WebKit checks, including
trusted-key nesting, typing, Enter/Backspace, history and disabled-indent focus
navigation. Archive SHA-256:
`8c466298da0fc1c3c1ce3751f9bf46089df3b7d3e7c52941171dcbe2cd6e76fa`;
955,010 compressed bytes, 4,159,393 unpacked bytes. Consumer:
`breditor-opt-in-consumer-ajC0iA`. All ten package-contract tests also pass.
Private/unpublished status and default shipping artifacts are unchanged.
Native observations above still refer to the earlier `k3OedF` archive; do not
transfer that evidence to this archive. Size, native and full release gates stay
open.

Renderer rollback coverage now changes both a parent and descendant paragraph
and injects an exception after either write. Both cases restore original HTML
and node identities and invalidate the old handle. All 199 renderer tests pass.

A first nested performance baseline uses 10/100/500 root items, adding a child
and grandchild beneath every tenth item. All 27 measured owner cycles pass exact
document/selection/edit/undo/restore/redo checks. At 500 roots, median edit time
was 109 ms Chromium, 373 ms Firefox, 245 ms WebKit on this machine, including
forced layout. Report: `breditor-nested-list-consumer-zNDGlm/performance-diBCqq/measurement.json`
under the system temporary directory. This run overlapped the old WebKit stress
workload, so timings are diagnostic, not isolated release latency or a budget pass.
Large-document performance remains open.

### Isolated size-profile experiment

The experimental builder accepts `BREDITOR_WASM_SIZE_OPT=s|z` (default `s`),
records the choice on successful qualification and uses a separate Cargo cache
for `z`. The production Cargo profile and shipping artifacts are unchanged.
Invalid values fail before creating build directories.

Candidate `target/nested-list-candidate-ExnSHs` (`z`) compiled successfully and
passed the 24 declaration-checker unit tests, but the actual generated declaration
comparison rejected reordered low-level exports (including count/history getters).
Follow-up comparison proved that all declaration lines, including multiplicity,
were identical to `ORMbAS`; only their ordering differed. The checker now sorts
members only inside `InitOutput`, retaining exact signatures and duplicates.
Regression tests accept reordered exports and reject a duplicate inherited export.

Its Wasm measures 2,005,737 bytes / 546,065 gzip-9 bytes, versus the qualified
`ORMbAS` candidate's 2,302,110 / 630,659 (about 13.4% less compressed). SHA-256:
`e2c4d7932739aba43f4c0d420cc51ac144d827d7ca04ccc8c851313ed9389acb`.
Rebuilt candidate `target/nested-list-candidate-fWc1zx` has the same Wasm hash and
passes all 26 checker tests, generated TypeScript, Node command/history/recovery,
and five raw-Wasm runs plus one integrated editor scenario each in Chromium,
Firefox and WebKit. Shipping trees stayed unchanged. This does not establish
native input or performance qualification; `s` remains the default build profile.
Package-size and release gates remain open.

Installed pair `target/nested-list-packages-fF7veD/qualification.json` also passes
Node/types, three-browser nested checks and default-consumer smokes. All 29
builder-configuration/declaration tests pass. Its grandchild benchmark passes
all 27 exact document/selection/history/recovery cycles, recorded in
`breditor-nested-list-consumer-LCApJ3/performance-wXYi2n/measurement.json`.
500-root edit medians: Chromium 101.9 ms, Firefox 460 ms, WebKit 208 ms.
An immediately following unchanged `s` Firefox control passes nine cycles with
a 336 ms median at 500 roots (`breditor-nested-list-consumer-pTQSAR/performance-M7FA40`).
These limited runs indicate a meaningful size/latency trade-off, not a free
optimization; retain `s` as default. Neither run closes the intermittent WebKit
fault, native-input checks or release performance gate.

Task lists, arbitrary multi-block items, tables, rich HTML paste and collaboration.
Migration of existing flat sessions requires an explicit, separately tested path.

### Deep-edit WebKit diagnostic checkpoint

Current baseline `nested-list-packages-3Zb7rY` completed 270 grandchild-edit
cycles (three fresh WebKit sessions, 30 owners each at 10/100/500 roots), with
exact document/selection undo and fresh-owner redo recovery checks. Report:
`breditor-nested-list-consumer-pTQSAR/performance-ce1Bmr/measurement.json`.
This run used rejection-site labels, not the new subtree snapshot capture.

Disposable diagnostics now also capture bounded before/after subtree excerpts
when nested impact validation rejects a retained root. They keep the original
comparison, short-circuit behavior, return value and terminal failure; tests
check no comparator retry and containment of a throwing logger. All 21 diagnostic
tests pass with the optional real-WebKit exception test enabled.
The extended instrumentation was exercised against retained package `TpYaIw`:
all nine grandchild cycles passed (`breditor-nested-list-consumer-RBqXwA/performance-gJcltf`).
No new reproduction occurred. These diagnostic runs are not latency evidence,
native-input qualification, or closure of the previously recorded WebKit fault.

Nested subtree proof coverage now checks every heading rank (1–6) at grandchild
depth while a root insertion shifts a retained suffix. Independently constructed
equal trees retain both prefix and shifted suffix; changing the deep rank on
either side rejects the claimed impact. Targeted projection-adapter tests pass
145 cases; the full browser suite passes 2,096 tests across 55 files and both
production/test TypeScript checks pass. This adds deterministic validation
coverage, not a reproduction or fix of the intermittent WebKit failure.

### Current single-package native Safari checkpoint

Served the already-built external consumer for `nested-list-opt-in-WNID8x`
(archive SHA-256 `8c466298da0fc1c3c1ce3751f9bf46089df3b7d3e7c52941171dcbe2cd6e76fa`)
at `127.0.0.1:4316/?keyboardProbe`. Native Safari application control observed:
Tab nests `Second` beneath `First` while preserving `Deep 🙂`; Shift-Tab restores
the original structure and ordered markers 3/4. Clicking the visible deep text
and selecting with Command-Left / Command-Shift-Right copies exactly `Deep 🙂`
into the ordinary outside input. Native Cut removes that paragraph's text once;
one toolbar Undo restores it. Native Paste at its end produces `Deep 🙂Deep 🙂`,
and one Undo restores `Deep 🙂` with its list structure intact.

The initial accessibility `selectText` attempt targeted a different range and
is not credited as the intended single-item test. After switching to visible
text clicks and native keyboard selection, the outside input provided the exact
copy observation. The first post-paste accessibility snapshot was transitional;
the subsequent screenshot/tree showed the complete single insertion. These are
OS-generated UI checks, not human physical IME, VoiceOver speech, exact serialized
selection proof, cross-item clipboard qualification, or WebKit fault closure.
No system input/VoiceOver settings were changed.

Follow-up on the same `WNID8x` archive: native Safari backward selection from
the end of `Deep 🙂` through the start of `First`, then Cut, leaves the heading
and one empty ordered item numbered 3. Its system clipboard is exactly
`First\nSecond\nDeep 🙂` (read through the connected Chrome clipboard surface).
One toolbar Undo restores the visible First/Second items, markers 3/4 and nested
Deep bullet. Safari endpoint offsets were not independently observable.

The same installed fixture in Chrome passes both backward and forward cross-item
Cut. Each produces exactly `First\nSecond\nDeep 🙂`, leaves only the heading and
empty ordered item, and restores byte-identical editor `innerHTML` with one Undo.
Read-only DOM inspection confirms restored endpoints: backward anchor Deep at
UTF-16 offset 7 / focus First at 0; forward anchor First at 0 / focus Deep at 7.
These browser/OS-dispatched checks strengthen clipboard/history qualification
for this archive; they do not qualify physical IME or VoiceOver or close the
intermittent WebKit fault.

Mixed Rust impact regression: a deep Unicode text splice plus a disjoint list
reframe that expands one root into two paragraphs must report a full root update,
not the text-only root span. Both operation orders, their inverse transactions
and forward replays pass; inverse/replay documents are exact. All 61
feature-enabled Wasm tests and strict all-target Clippy pass. This protects the
conservative mixed-operation fallback without changing runtime behavior.

Exact retained-bundle replay is now available through
`scripts/replay-nested-list-performance.mjs <measurement.json>`. It accepts only
retained nested performance records under the system temporary directory,
verifies the complete recorded JS/Wasm asset set and hashes, serves the existing
bundle without rebuilding or injecting code, and records ten fresh WebKit
sessions with fixture correctness output and bounded error logs. It stops on the
first failure and does not qualify release performance.

The previously failing `performance-e8QUkx` bundle completed ten exact-byte
replay sessions / 90 owner cycles without a new fault. Evidence:
`performance-e8QUkx/exact-replay-ye4DSj/replay.json` in retained consumer `RBqXwA`.
A separately rebuilt root-edit run with current rejection/subtree diagnostics
also completed 90 cycles (`performance-yCf9af/measurement.json`). Neither result
invalidates the earlier recorded failure. Exact-byte replay is a control for
instrumentation/build differences, not a reproduction, root-cause identification
or fix. The historical WebKit gate remains unresolved.

The installed single-package fixture now formats the descendant `Deep 🙂` via
the Bold toolbar with a backward selection, undoes, exports a V7 checkpoint,
disposes, opens a fresh owner, and redoes. It verifies exact checkpoint identity,
formatted document JSON, nested `<strong>` output, and backward DOM endpoints
(anchor 7 / focus 0); a following Undo restores the original document exactly.
The unchanged `WNID8x` archive passes this extended fixture, Node/types and trusted
keyboard checks in Chromium, Firefox and WebKit. Latest external consumer:
`breditor-opt-in-consumer-1yZSa2`. This closes a packed-consumer formatting/recovery
coverage gap without changing the archive or claiming native IME qualification.

Current single-pass renderer CPU profile (installed pair `3Zb7rY`, grandchild
target) passes all nine correctness cycles. Artifact:
`breditor-nested-list-consumer-pTQSAR/performance-P1IeN0/chromium-0.cpuprofile`,
SHA-256 `05504c94c33343f444efa7a8006fd7692a492c47ec87cbfa6ffbc39fde34a1bf`.
The 2,089.5 ms whole-lifecycle profile attributes approximately 170.9 ms self
time to `nativeChildNodes`, 115.6 ms to `mapNode`, 90.0 ms to recursive nested
mapping and 76.9 ms to selection intrinsics. This is not edit-only attribution
or an uninstrumented latency qualification. Inspection confirms that the second
DOM/map traversal also checks unmapped wrappers/placeholders for stale reverse
mappings; simply deleting it would drop a consistency invariant. Any traversal
consolidation must preserve that negative check as well as mapped-node equality.

Feature-boundary regression audit at source checkpoint `0528c22`: default
`breditor-core --lib` passes 703 tests; default `breditor-wasm --lib` passes 43;
core with `experimental-structural-properties` passes 1,187. These are separate
Cargo invocations with no feature flags in the default runs. The feature-enabled
Wasm suite separately passed 61 tests at `1ad0bc3`. Thus the larger structural
suite count must not be described as default-core coverage. No shipping dist
build or publication was performed. Native speech/IME, release size/latency
criteria and the historical WebKit failure remain unqualified.

Empty native child snapshots now reuse a frozen empty array after (not instead
of) the captured getter, native length read and count validation. No DOM-state
cache is introduced; an element gaining children is observed on the next call.
Tests cover frozen snapshots, later insertion/removal, own-property shadows and
invalid receivers. All 2,098 browser tests and production/test type checks pass.
Isolated pair `nested-list-packages-dIX8SC` passes installed Node/types,
Chromium/Firefox/WebKit and default-consumer checks with shipping trees unchanged.
Its grandchild benchmark passes 27 correctness cycles:
`breditor-nested-list-consumer-IPuQK5/performance-VFmqIY/measurement.json`.
500-root edit medians are 91.1/338/188 ms (Chromium/Firefox/WebKit). This removes
allocations but does not establish a statistically significant latency improvement
or close performance qualification. Existing single-package/native evidence
remains pinned to `WNID8x`, not this newer browser source.

Refreshed opt-in archive `target/nested-list-opt-in-jheBQW` contains the empty
snapshot optimization: SHA-256
`2eb5d942d5a3fad2023ea83262c9e7548a320c044c910d76d3646f0ca715001d`,
955,033 compressed / 4,159,508 unpacked bytes. All ten package-contract tests pass.
External consumer `breditor-opt-in-consumer-2Rpu4N` passes Node/types and all three
browsers, including deep formatting/recovery and trusted keyboard scenarios.
The consumer qualification report now pins the exact adapted fixture and keyboard
driver hashes, on failures as well as success, so newer fixture coverage cannot
be inferred from an old archive-only report. This archive is still private and
unpublished; size, physical/native qualification and WebKit-risk gates remain
open. Prior Safari/Chrome observations remain specific to `WNID8x`.

Selection-fact reads no longer invoke native `rangeCount` twice consecutively:
the first actual fact read itself supplies the receiver brand check. All other
intrinsic-table callers retain their explicit check. Regression coverage rejects
fabricated Selection objects and ignores a shadowed `rangeCount`; the full 2,099
browser tests and type checks pass. Installed pair `nested-list-packages-TVVdTG`
passes Node/types, Chromium/Firefox/WebKit and default-consumer checks; shipping
trees are unchanged. This reduces redundant native calls but has no separately
proven latency improvement yet. Latest single-archive evidence still refers to
`jheBQW`, before this source-only optimization.

Latest ordinary grandchild run passes 27 cycles on `TVVdTG`:
`breditor-nested-list-consumer-P0t5NM/performance-p0pFYF/measurement.json`.
500-root edit medians 89.8/335/196 ms do not establish a meaningful improvement
from the selection getter change.

Enabled the existing operation-scoped Firefox profiler for nested fixtures,
explicitly marking those reports diagnostic. Its seven summarizer tests pass;
the actual run passes nine correctness cycles and captures all 60 expected marks.
Profile: `performance-t6BM3f/firefox-0.gecko-profile.json` in consumer `P0t5NM`,
SHA-256 `2c9cce1c8b75891b095aa356af420629629938139b3cb1193f571226f05d2b61`.
For the three 500-root edit spans, action-state reads appear in 240/401,
269/438 and 249/410 samples, while canonical DOM/map checks appear in 105/401,
117/438 and 106/410. These are inclusive sampled stacks, not additive self-time
or uninstrumented timings. The next performance investigation should prioritize
action availability computation rather than assume DOM traversal is dominant.

At checkpoint `d3f3bb6`, a fresh symbol-bearing Firefox candidate confirms
action-state refresh in approximately 60–62% of sampled 500-root edit stacks;
nested heading/paragraph action evaluation accounts for 35–37% (overlapping
inclusive stacks). Its executable sections differ from the normal candidate,
so those names must not be used to relabel earlier unnamed profiles. See
`qualification/2026-10-06-nested-list-firefox-symbol-profile.json`.

`NestedListTextReplace::capture` now retains the reconstruction just checked by
its constructor instead of deriving it again during context validation. This
does not retain a proof across calls: source/result schema and resource limits,
independent inverse reconstruction, and apply-time validation are unchanged.
Default-core 703 tests, feature-core 1,187 unit tests, strict all-target core
Clippy and isolated Wasm/package browser checks pass. The full integration
command was still running when the checkpoint record was created.

The current separately installed opt-in archive is `nested-list-opt-in-VqQ3UP`,
SHA-256 `4c00fa7bfff6956e68ab7a667399d188369034feb8e6b96ca6e637729a268464`.
Node/types and Chromium/Firefox/WebKit consumer checks pass, including trusted
keyboard events and deep backward-selection formatting/history/recovery. Earlier
native Safari/Chrome evidence does not automatically qualify this new archive.
The 27-cycle timing run overlapped Rust verification and is correctness evidence,
not a reliable speed comparison. Full details and remaining gates are in
`qualification/2026-10-06-nested-list-capture-reuse.json`. Nothing was published;
shipping artifact trees remain unchanged and WebKit/native/size/latency gates
remain open.

The complete feature-enabled core command subsequently exited successfully,
including all integration binaries and 136 documentation tests. A bounded WebKit
diagnostic run of the same installed candidate completed ten fresh sessions,
30 owners at each of 10/100/500 roots per session: 900 root-edit/history/recovery
cycles, no captured diagnostics. The retained report hash is in the capture-reuse
qualification record. This is a clean stress observation, not an explanation or
closure of the historical intermittent fault; no performance claim is made from
the diagnostic run.

Diagnostic projection catch sites now retain bounded original exception text
and stack before returning the unchanged rejection. This closes an observability
gap between a failed equality check and an unexpected thrown exception; it is
not a production fallback or a fix for the historical fault. All 23 diagnostic
tests pass, including the WebKit exception test and checks against hostile
loggers/error objects. An instrumented current-candidate smoke run passes nine
root-edit/history/recovery cycles (`fgjS5V/performance-2HUVLk/measurement.json`).

### October 11: durable failed-run retention

Failed performance measurements now copy their exact report, HTML and asset
inventory to `target/nested-list-reproductions/failure-*`. The report is preserved
byte-for-byte; a separate manifest binds its hash and the HTML hash. Asset hashes
remain bound by the original report. Replay accepts validated durable bundles
without rebuilding them, checks hashes before and after execution, and rejects
linked files or unexpected assets. Temporary consumers may be cleaned by macOS;
the new retention does not recover old missing bundles or resolve the fault.

Unit checks cover source deletion, changed reports/HTML/assets, unexpected files
and linked assets. A deliberately synthetic fixture also passes ten real WebKit
replay sessions after source deletion. This is replay-plumbing evidence only,
not editor reliability evidence. The current single opt-in archive is 955,556
compressed bytes and 4,159,936 unpacked bytes; size acceptance remains open.

### October 11: mixed history and deep WebKit checks

The installed consumer now exercises indent, emoji insertion, heading conversion
and outdent in one history. At each cursor from four to zero it disposes the owner,
reopens the exact checkpoint, checks byte-identical checkpoint export, then checks
every remaining redo and undo against independently retained document, selection
and pending-format states. Descendants and heading content are checked explicitly.
The current archive passes this expanded fixture and keyboard driver in Chromium,
Firefox and WebKit. Its fixture hash differs from the previous qualification;
earlier reports do not claim this expanded coverage.

A separate deep-target WebKit stress run passes 270 cycles in three fresh browser
sessions, with no captured diagnostics. New diagnostic-only nested comparator
labels identify failed operands without rereading snapshots or retrying equality.
Proxy-read traces, results and paragraph-comparison counts match the uninstrumented
real compiled comparator, including a throwing logger. An installed-editor WebKit
smoke run passes nine cycles with the enhanced diagnostics. These are not a root
cause or fix for the intermittent fault, nor release timing/native-input evidence.

The current archive also passes observed Safari native nesting, single-item
Copy/Cut/Paste and Undo checks. Chrome forward/backward cross-item native Cut
produces exact plain-text newlines; browser-dispatched Control-Z restores the
exact DOM and directional endpoints. The native Chrome Control-Z wrapper had no
observed effect, so physical shortcut qualification is not claimed. No OS settings
were changed and neither Japanese IME nor spoken VoiceOver was qualified.

### October 11: bounded selection traversal

Nested formatting/kind selection capture now prunes subtrees outside the logical
range and bounds each ancestor's child-index interval before allocating paths.
Ancestors are retained even when they sort before the range start. An independent
depth-first oracle checks every endpoint pair and child interval in a nested tree;
all 1,189 feature-core unit tests and strict core library/test Clippy pass. Isolated
generated Wasm and installed-package checks pass in all three browser engines,
including mixed-history recovery. No ABI, schema, codec or shipping artifact changes
are made by this optimization.

The final candidate is `nested-list-candidate-nChfBd`, installed pair
`nested-list-packages-MmJ9rC`. It is not yet the separately assembled/native-qualified
archive identified above. Ordinary sequential Firefox grandchild trials measured
500-item edit medians of 373 ms for this candidate and 363 ms for the control,
with overlapping ranges. This does not demonstrate a latency improvement or
qualify release performance. The broader full-plan reconstruction cost remains.

One preceding trial timed out during Firefox launch before the editor loaded.
Its exact report and bundle were retained at
`target/nested-list-reproductions/failure-jsJ64u`; hash verification passes. A fresh
editor-free Firefox launch then succeeded in 567 ms, followed by the successful
retry. This is an intermittent startup observation, not the historical WebKit
projection fault. Future measurement failures include their launch/setup/navigation/
execution/assertion stage so infrastructure and editor failures remain distinct.

### October 11: exact nested wrapper reuse

Nested text-layout reconstruction now reuses a same-position immutable source
wrapper only when its kind, identity, properties and every reconstructed child
match exactly. Changed paths receive fresh wrappers; unaffected descendant
branches can retain their allocations. The walk also avoids cloning an
intermediate vector of source children. Source nodes are optimization hints,
never admission proofs: canonical slot checks, grammar validation, source guards,
context/limit validation and inverse checks remain unchanged.

All 1,192 feature-core unit tests pass. Dedicated reuse tests compare against
fresh construction for unchanged, edited, reordered and unrelated source trees,
check allocation sharing, reject foreign identity/properties and extra children,
and retain invalid-layout rejection. Strict library-and-test Clippy passes.
The isolated candidate `nested-list-candidate-7LMpoV` and installed pair
`nested-list-packages-OxsnSQ` pass Node/types and Chromium/Firefox/WebKit checks.
The single archive `nested-list-opt-in-imtO3H` passes independent installed
consumer and browser-dispatched keyboard checks, including exact mixed-history
recovery at every cursor. Its SHA-256 is
`8529f438907c43cb24d9be1d33dbe58d9d1e88a46143ea8b6ded7c64da1e3452`.
It is 956,291 bytes compressed; no size acceptance, native qualification or
latency improvement is implied. Previous native records do not transfer to this
new archive. Shipping bundles and public protocols remain unchanged.

Ordinary sequential Firefox grandchild measurements, with compilation finished,
passed 27 correctness cycles per candidate/control. The 500-item edit medians
were 550 ms for wrapper reuse and 560 ms for the previous bounded-traversal
candidate, with overlapping ranges. This does not establish a stable latency
win; allocation sharing is the only improvement directly proved here. The
[qualification record](qualification/2026-10-11-nested-wrapper-reuse.json)
binds each report and archive. Performance acceptance and the historical WebKit
fault remain open.

### October 11: within-call nested typing reconstruction

Single-block nested text splice validation now returns its reconstructed root
and independently validated synthetic document to application within the same
call. Application no longer rebuilds that result a second time. A source document
can supply its existing proof only for an exactly equal complete synthetic root
under the same compiled schema and limits. The validated result proof can supply
publication only when its complete root equals the final reconstructed document;
untouched sibling roots or different metadata force full validation. No proof is
stored on the operation or passed across contexts. Codec admission, source-guard
ordering and no-op behavior remain unchanged.

All 1,197 feature-core unit tests and final strict library/test Clippy pass.
Dedicated proof tests assert exact allocation/summary reuse, fresh validation of
partial roots and foreign authorities, complete-document budget rejection, and
stale no-op guard rejection. Candidate `nested-list-candidate-Ejgzp2`, installed
pair `nested-list-packages-m25FxW` and single archive `nested-list-opt-in-VTFj93`
pass generated/installed Node/types and all three browser engines, including
mixed-history recovery and browser-dispatched keyboard checks. The archive is
958,099 bytes compressed. Native testing of this archive could not begin because
the Mac was locked; prior native observations do not transfer.

A deep-target diagnostic WebKit run passed 90 edit/history/recovery cycles across
three sessions with no captured diagnostics. It is not timing evidence or a fix
for the historical fault. Ordinary Firefox candidate/control/candidate trials
passed 27 cycles each, with 500-item edit medians of 331/398/423 ms. The apparent
first-trial gain did not survive the reversed-order check, so no reliable latency
improvement or release performance qualification is claimed. The
[reconstruction record](qualification/2026-10-11-nested-splice-reconstruction.json)
binds the archive and reports. Shipping bundles and public protocols are unchanged.

### October 11: frame-independent fixture completion

An ordinary Firefox trial timed out waiting for completion, while its captured
page already reported passed with all nine cases and no page errors. The exact
failed report and bundle are preserved in
`target/nested-list-reproductions/failure-Sfmj7O`; hash verification passes.
The installed Playwright waiter defaults to animation-frame polling. A synthetic
Firefox control reproduces timeout despite completed page state when frame
callbacks are suppressed; 100-ms timer polling completes. The original timeout's
exact scheduling cause is not proven.

Measurement and exact-byte replay now poll the same marker on a timer, retaining
the same deadline and failure propagation. They record the interval, do not retry
failed reads, and do not rewrite failed evidence. Five watcher/retention tests,
including ten synthetic exact-byte WebKit replay sessions, pass; the hardened
two-test watcher regression passes independently. This fixes a demonstrated
completion-watcher failure class, not an editor or historical WebKit projection
fault. See the [watcher record](qualification/2026-10-11-fixture-completion.json).

### October 11: historical package restoration and sleep-interrupted tests

The historical `nested-list-packages-TpYaIw` archives and staged library bytes
survive even though the original temporary consumer is gone. A read-only verifier
checks hashes, sizes, private manifests, canonical target boundaries and linked
entries. `restore-nested-list-consumer.mjs` copies those exact bytes into a new
offline consumer, then reruns Node/types, nested browser checks in three engines
and the base consumer smoke. It never rebuilds libraries, overwrites old records,
or claims recovery of the lost historical failed JavaScript bundle. Fresh fixture
code and the current browser environment are explicit. Restoration passes at
`target/nested-list-restored-X5oVrw`; see the
[restoration record](qualification/2026-10-11-restored-historical-pair.json).

The restored libraries passed 90 uninstrumented root edit/history cycles across
ten fresh WebKit sessions. Higher same-page churn produced timeouts, including
one exact-byte replay timeout after two complete 90-case sessions. New
diagnostic-only phase/case-count markers locate two timeouts after 51 successful
cases, awaiting the timer between owners. Measuring those timers contradicted a
timer-throttling explanation: the pending wait was 1 ms and preceding waits
totaled 350 ms. The scheduler and deadline were not changed.

The host power log and source-report creation/modification times identify actual
system-sleep interruptions. One report spans 924.8 seconds, including 918 seconds
of maintenance sleep, and is written immediately after wake. Two other timeout
reports likewise bracket long sleeps and are written just after wake. All failed
reports/bundles remain preserved and hash-verified; none is rewritten as passed.
This explains the new apparent stalls as interrupted test execution, not the
historical `projection.invalid_update` rejection. That older fault remains open.

Completed marked runs pass 270 cases in three WebKit sessions, about 55 seconds
per session, with no captured rejection. A final nine-case smoke verifies absolute
host timestamps, completed-case markers and wall/monotonic clock accounting. All
34 diagnostic/restoration tests pass, including real Firefox and WebKit positive
controls. Ordinary fixture code remains uninstrumented; marked runs are not
release timing evidence. See the
[sleep-interruption record](qualification/2026-10-11-sleep-interrupted-tests.json).

Reliable further long-running measurements require a continuously awake host.
Temporary process-scoped wake prevention has been requested but not authorized;
no power settings have changed. Native qualification still awaits manual unlock.
The current release candidate remains `nested-list-opt-in-VTFj93`, not the restored
historical pair. No shipping artifact, protocol, push or publication changes occur.

### October 11: numbering and canonical-slot reuse regressions

Test-only coverage now checks every source/target combination of bullet lists
and ordered lists starting at 7 or 19. Results must equal fresh construction;
changed marker families or starts cannot reuse old root metadata. An empty
heading, despite valid rank metadata, cannot replace a canonical empty-paragraph
layout slot. All five focused reuse tests and strict feature-core library/test
Clippy pass. Production code, protocols and shipping artifacts are unchanged.

The feature unit inventory is now 1,199 tests; the completed baseline unit run
covered 1,197, and the focused run includes the two new tests. The baseline full
integration/doctest command remains live at this checkpoint and is not claimed
passed. The [metadata regression record](qualification/2026-10-11-nested-layout-metadata-tests.json)
preserves this distinction. Native, performance and historical WebKit gates remain
open.

### October 11: complete default and feature unit floor

At source checkpoint `f14582f`, the complete default core unit suite passes all
703 tests and the complete feature-enabled core unit suite passes all 1,199,
including the two new layout-metadata regressions. Strict feature-core
library/test Clippy also passes for these sources. The separate baseline full
integration/doctest command remains live; completed harnesses have passed, but
the whole command is not yet claimed successful. Slow harness startup was sampled
at the system loader before test execution; no security or power settings were
changed. The [unit-floor record](qualification/2026-10-11-complete-core-unit-floor.json)
keeps unit completion distinct from integration and release qualification.

### October 12: complete feature core suite

The existing full feature-enabled core command completed with exit code 0,
without restarting it. Its baseline 1,197 unit tests and every enabled integration
harness passed, followed by doctest batches of one and 136 tests. No aggregate
integration-test count is asserted. Production core sources remained unchanged;
the only later core diff adds two layout-reuse regression tests, separately
covered by the complete 1,199-test feature unit run recorded above. The default
703-test unit floor remains separately qualified.

The [full-suite record](qualification/2026-10-12-complete-feature-core-suite.json)
records the terminal result and source-scope distinction. Long wall time is not
editor performance evidence: several quiet harnesses were sampled at native
loader startup before Rust tests ran, then passed. No security or power settings
were changed. This closes the pending feature integration/doctest run, not the
historical WebKit fault, latest-candidate native checks, or size/latency release
gates. No shipping artifacts, push or publication changes occur.
