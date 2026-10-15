# Breditor rich content and offline collaboration plan

Status: implementation authorized October 13, 2026; replication feasibility is
the first checkpoint. Japanese IME and spoken VoiceOver qualification are
deferred at the user's request, not reported as passing. Existing formats and
shipping packages remain unchanged. It extends the requested scope to tables, images and
full collaboration in one interoperable editor. Implementation checkpoints are
not permission to reduce collaboration to an online-only demo.

## Functional completion goal

The active goal is to finish the combined features functionally and prove their
normal workflows with reproducible Rust, Wasm and browser tests. Accessibility,
physical IME and exhaustive edge-case qualification follow in a later pass; the
functional goal does not claim production release qualification.

Work proceeds through these connected exits:

1. Complete rich core commands, text/format/list/caption editing and exact local
   history/reload. Table/image commands must operate on the same cell/block AST.
2. Map those semantic commands to the shared replica and materialize the same
   admitted AST. Prove simultaneous edits, offline merges and selective undo.
3. Connect the opt-in browser editor, toolbar, grid/node selection, keyboard and
   clipboard to the real matching Rust/Wasm owner. No DOM-owned content model.
4. Add durable local persistence, upload queues, presence and the self-hostable
   reference relay. Prove reconnect/reload and expose pending/saved state.
5. Test a combined mixed-content workflow in Chromium, Firefox and WebKit,
   including two collaborators, offline recovery, uploads and undo/redo. Commit
   tested local checkpoints without pushing or publishing.

## Current implementation

Implemented checkpoints include an isolated, pinned Rust/Wasm replication
coordinator, feature-gated rich geometry/image values, a separate sealed rich
AST and stable-ID directory, guarded table/image and rich text/format/heading
actions, rich paragraph/list/fragment editing, multicell paste/clear, merge-aware
grid navigation and original structured clipboard/fresh-ID preparation, a separate
stable text/node/grid selection family, and an exclusive single-user rich runtime
history owner with pending caret formats and replay-proved local recovery. Atomic
text-range replacement now covers one block, direct sibling flow and sibling
leading list heads. A separately gated rich Wasm owner and opt-in browser package
expose these actions, typed construction drafts, a DOM editor, expandable toolbar,
grid/node selection, event clipboard paths and an interactive combined local demo. The
[reproducible checks and remaining gates](../experiments/collaboration/README.md)
separate tested contracts from the remaining shared planner coverage and relay.
The isolated rich replica now decomposes admitted ASTs into shared primitives
and rebuilds the same validated Document V2. Concurrent cell/caption edits,
typed formatting, paired image metadata, writer-owned moves/deletions and exact
selective-history restart have native and generated-Wasm functional checks.
Optional local IndexedDB checkpoints and content-addressed raster bytes now
survive reload; file picker/paste/drop insert only after bytes are durable. The
upload queue has explicit retry/cancel and late-epoch guards, but requires a host
provider and does not constitute shared asset storage. The default packages,
schemas and codecs remain unchanged.

The separate `@breditor/experimental-collaboration` browser coordinator now
adopts the matching shared Rust owner. Its expandable toolbar, input/selection
bridge, semantic clipboard and durable file insertion use the same causal
commands exercised by native tests. Atomic rich paste at a text selection retains
original suffix character IDs and owns one history group. A reproduced native
EOF-append routing defect is repaired by causal character ownership in shared
model 7/journal V8, not by special-casing WebKit or replacing the shared AST.

Shared sessions now save complete journals in IndexedDB and acquire an
origin-wide room/writer Web Lock before restoration. Reload preserves future
selective history; another tab cannot clone that live writer through another
database. Failed storage attempts remain explicit and can retry the latest
complete checkpoint. The combined demo now uses both durable writers and proves
disconnect/reconnect/reload through the real DOM controller. Cross-device
authorization, presence, the network relay and cross-host asset providers remain
separate required integration work.

Shared caption creation/replacement/removal now uses a writer-owned choice of
retained paragraph identity or explicit absence. Two concurrent valid caption
insertions no longer produce an invalid image; the other source stays retained
and can reappear through selective Undo. Ordinary caption typing remains a text
operation, and asset/alt/size fields remain independent. This caption contract
advances the private shared projection/history to model 9/journal V10; older
journals are preserved but require their matching old owner, not an implicit
document-only import.

Creation-time text now retains its character identities outside Undo. Owned
birth visibility hides or reveals that seed; a later writer's text has separate
provenance. This repairs creation Redo reversing the order of an offline prefix
and also preserves remote text after the new paragraph is joined elsewhere.
Initial text length does not raise a concurrent command's semantic priority:
the first command captures its causal stamp before immutable preparation.

The central decision is to design collaboration before adding new structural
operations. Stable content identities, table geometry, image assets, selections
and local undo must agree on one document model. Existing paragraph, heading,
flat-list and nested-list contracts remain supported by their current factories.

## Scope of the combined release

Tables include insertion/removal; row and column insertion, removal and
reordering; header cells; cell and rectangular selections; merge/split;
column resizing; keyboard navigation; and copy, cut and paste of cell ranges.
Cells contain ordinary rich blocks, including headings, nested lists and images.
Nested tables are deliberately excluded from this release, not silently
flattened on import. Existing inline formats remain available inside cells.

Images include host-managed upload and asset resolution, local offline upload
queues, drag/drop and file paste, alt text, captions, resize, replacement,
removal, node selection, clipboard interchange and undo/redo. Initial media
types are PNG, JPEG and WebP. Executable embeds and SVG are not admitted by
pretending they are inert raster images.

Collaboration includes simultaneous text/format/structural editing, offline
changes merged on reconnect, remote cursors and selections, participant
presence, per-replica local undo/redo, reload/restart recovery, durable sync,
permission-aware reconnect and a self-hostable reference server. The same
content is usable in a single-user rich editor without network access.

Comments, suggested edits, end-to-end encryption, formula spreadsheets,
arbitrary HTML embeds, a hosted commercial service and unrestricted P2P are
separate products. Mobile support requires its own input and device gate;
desktop support does not establish it.

## Existing contracts that must change explicitly

`EditorSession` serializes one local state and linear history and rejects stale
transactions. Its exact inverse recipes are not a collaboration transform.
See `crates/breditor-core/src/session/editor_session.rs` and
`DATA_CONTRACT.md` under the local-history boundary.

`NodePath` and projection preorder indices identify positions in one snapshot,
not persistent locations. `Selection` currently contains only a directional
range. Images need node selection; tables need grid selection; collaboration
needs stable anchors that survive other users' changes. See
`crates/breditor-core/src/selection/kind.rs` and `SELECTION_MAPPING.md`.

The sealed nested grammar allows one leading text block and child lists per
item. Its projection union contains text blocks and lists, not arbitrary rich
blocks. A new rich-content profile must not simply make every existing operation
accept a larger grammar. See `schema/nested_list_profile.rs` and the browser's
`nested_list_projection.ts`.

Document V2 already binds content to a complete schema fingerprint. Retain that
property. Freeze existing codecs, profiles, factories and the default shipping
module graph; introduce additive versioned contracts where the language changes.

## One authoritative model per editing mode

In local mode, the validated immutable Rust AST and its local session remain
authoritative. Rich-content operations gain complete source guards, exact
inverses, selection relocation and replay.

In collaborative mode, a Rust-owned CRDT replica is authoritative for shared
content. The immutable Breditor AST is its deterministic, schema-validated
materialized view, not a second independently mutable document. Breditor owns
schema, action meaning, normalization, rendering, interchange and transport
envelopes; a CRDT library provides replication primitives.

The shared model is not a whole-document last-writer-wins register. Text is
replicated as text, metadata as typed values, and structure as stable entities
and ordered relations. A remote edit cannot replace the complete document to
avoid implementing operation mapping.

Local and collaborative sessions share semantic action planners and the rich
projection contract, but use distinct commit/history coordinators. A local
planner may produce guarded AST recipes; a collaborative planner must target
stable entities and anchors. Converting current root replacements directly into
shared JSON replacements is not an acceptable adapter.

All content mutations pass one serialized command coordinator. Network receive,
DOM input, toolbar, undo and asset completion cannot publish reentrantly.
Presence and upload progress use separate ephemeral channels.

### Rich AST and identity directory

The rich AST contains flow blocks: paragraphs, headings, lists, tables and
images. List items have one leading text block followed by further flow blocks,
not the old one-block-only item contract. Cells contain a nonempty flow-block
sequence. The separate rich schema rejects a table anywhere beneath another
table, including one hidden inside a cell's list. An image has optional caption
content restricted to one paragraph. Its bitmap is atomic, while the caption
remains ordinary editable text.

Tables retain the base rectangular cells and a typed merge-region description;
the renderer skips covered cells and presents the merged bodies. The semantic
export must retain the source-cell partition, not flatten all merged content
into one irreversible cell. Row/column widths, headers and merge geometry use
closed typed metadata, never free-form browser attributes.

Materialization produces an immutable AST plus an identity directory mapping
stable blocks/cells/assets and text containers to current paths/run offsets.
Formatting can split AST text runs without changing shared text identity.
Treat shared node IDs separately from existing optional semantic `EntityId`
values; do not repurpose the latter silently as CRDT or authentication identity.

The implemented admission factory is
`CompiledSchema::try_compile_rich_content_profile`. Compiler contract 6 includes
sealed rich-rule revision 1; changes to those semantic laws require a new rule
revision/fingerprint. `RichDocument` indexes the existing immutable AST by block,
table, image and base-cell identities. Blocks are document-unique, table/image
identities occupy separate typed domains, and axes are scoped to their table.
Historical ID allocation remains a host/replication contract: an author must
never reuse a deleted content ID merely because it is absent from the current AST.

Local image-size, alt/decorative and table-column-width actions now return exact
inverses and support all-or-nothing groups. Row/column insertion and deletion
also retain exact inverse subtrees, with whole-table stale guards. Typed drafts
provide explicit IDs and bodies; deleting the final axis retains hidden table
state. Whole table/image insertion/removal now use stable flow parents and
direct-child anchors, with explicit replacement drafts when removing a sole
flow child. Row/column moves retain identities, widths and bodies. Merge/split
retract observed overlapping intents without flattening base-cell content;
header edits affect the complete selected grid. Asset replacement changes the
asset/generation pair while preserving the image and caption. Whole-caption
edits add, replace or remove one explicitly identified paragraph.

These actions are not wired into existing session/history codecs. Dependent
steps are captured against staged snapshots; stale targets and tighter host
limits reject publication. Rich paragraph/heading text insertion, deletion,
replacement and inline formatting now use the same canonical fragments in
cells, lists and captions. Heading conversion retains stable block identity
and text positions. Paragraph and list-item split/join maps also witness changes
of text-block identity. Rich list wrap/unwrap, kind changes, indent/outdent and
partial extraction preserve IDs, numbering and media order. Typed block fragments
and multicell paste/clear retain rich bodies and exact inverses. Structured
clipboard capture and fresh-ID preparation now produce those same typed drafts;
browser event integration remains separate work.

`RichLocalSession` owns synchronous rich content, selection, pending caret formats, revision and bounded
exact runtime history. Dispatch requires a current same-owner observation;
failed work publishes nothing. One explicit group creates one undo unit, while
selection/typing-state changes retain redo. Final-state no-op groups retain the
publication token and history. Replay verifies the exact AST and restores saved
before/after selections and pending formats. Plain typing honors an explicit
pending override or derives run formats from caret affinity. This is single-user
history with a separate local restart codec, not shared selective undo.
Range replacement checks the final admitted tree once, not an oversized temporary
insert-before-delete tree. It retains the first text block's identity/kind, its
prefix and the last text block's formatted suffix. Sibling-list replacement keeps
the final item's trailing rich flow and removes fully selected earlier flow.
Witnessed maps relocate preserved suffix positions and collapsed deleted content;
history restores exact saved selections. Plain range typing derives its style
from the logical start, independent of drag direction. Arbitrary ranges across
different cells/containers remain unsupported.

### Opt in rich Wasm owner

The `breditor-wasm` feature `experimental-rich-content` introduces rich owner ABI
1 and explicit profile-bootstrap version 6. Existing factories, bootstrap versions
1–5 and default ABI 5 keep their meanings. A rich profile compiles the sealed
grammar and typed extension declarations; its descriptor binds the exact schema
fingerprint. Factories create a new exclusive local owner or replay-admit a rich
checkpoint with fresh observation authority.

Each boundary action has its own documented file. Commands carry closed JSON
fields, typed stable IDs, canonical decimal u64 strings and admitted format
literals. Table/image/list/flow drafts supply all identities and rich bodies;
there is no HTML-to-AST or anonymous-cell fallback. Per-command field validation
distinguishes missing fields from present null. Unknown fields and duplicate keys
are rejected before publication. Local merge priorities are caller-supplied
semantic values; this boundary does not authenticate shared authors.

Mutation outcomes and read encoding are separate. Observations expose canonical
Document V2, stable selection, pending formats, history counts and Rust-derived
table geometry through JSON strings. Clipboard reads expose structured content
and plain text; they do not claim that the OS clipboard accepted a write.
Paste commands use fresh host namespaces and newly authored merge priority.

`@breditor/experimental-rich-content` owns the matching Wasm handles, disposes
results, exposes read/execute/recovery and permits an exact revision guard for
work prepared from a prior view. Its DOM coordinator now renders the admitted
AST and geometry, serializes commands, preserves logical node/grid selections,
handles event clipboard paths and stages composition. Explicit input targets
retain the real pre-edit caret; selected Enter and whole-flow paste publish one
atomic history group. Custom toolbar controls and asset resolvers are host hooks.
File paste/drop calls the optional admitted asset host. Its bounded IndexedDB
store keeps SHA-256-addressed PNG/JPEG/WebP payloads as ArrayBuffers, not persisted
Blob/File handles. The tested WebKit runtime rejects the latter before commit.
Local session saves acknowledge transaction completion; the queue uploads only
when the host supplies a provider. Shared replication and exact collaborative
persistence now use a separate optional coordinator; provider/relay integration
remains an implementation step.
`scripts/check-rich-browser.mjs` builds only the
opt-in artifact and runs native plus real generated-Wasm browser workflows.
Synthetic clipboard/composition tests do not certify OS clipboard or physical IME.

### Grid navigation and semantic clipboard

Pure logical grid movement uses the current admitted merge view and stable base
IDs. Tab visits each presentation master once; arrows retain the focus lane
while stepping outside spans. Directional extension preserves anchor order and
closes over touched merges. Table/edge boundaries are explicit host decisions,
not fabricated rows or implicit content edits. Browser bidi/key interpretation
and focus transfer remain integration work.

The separate clipboard family is `breditor/rich-clipboard` version 1, with text,
flow and grid meanings and a schema-bound neutral Document V2 wrapper. Inline,
direct-sibling flow and sibling leading-list-head ranges retain partial endpoint
content, formatting and ordinals. Whole flow nodes retain tables/images/captions;
grids retain independent base bodies, headers, widths and active spans. Arbitrary
cross-container text ranges remain unsupported rather than flattened.

Semantic clipboard tables recapture active current spans over copied axes and
exclude inactive/retracted history. This is not shared causal state or backup.
Before insertion, the host allocates fresh content/axis/image/merge identities,
image binding generations and newly authored merge priority. Immutable asset
references are preserved. The core checks source-ID reuse and duplicate new IDs;
the host still owns historical allocation, and final target admission is atomic.
Failed preparation consumes IDs without publishing a document mutation.

The outer clipboard budget defaults to 1 MiB independently of document limits.
Plain fallback is reading-order text and quoted TSV, without list markers; image
alt/caption content is included without asset URLs. HTML/custom-flavor browser
events, file paste/drop, asset resolution and target-growth commands remain
integration work. Rectangle paste must match the complete merge-closed target;
it never crops or tiles silently.

### Local rich session checkpoint

The opt-in local checkpoint family is `breditor/rich-local-session` version 1.
It embeds a fingerprint-bearing Document V2 baseline, exact guarded branch
recipes and saved before/after metadata, current metadata, history capacity and
the undo/redo cursor. Revisions and aggregate UTF-16 offsets use canonical decimal
u64 strings. Selection records use stable text-block, node and base-cell IDs,
never snapshot paths. Null pending formats means derivation; an empty array means
an explicit plain-text override.

Recovery replays all retained entries and inverses under the active host context,
admits saved selections/formats and restores the content at the chosen cursor.
It issues fresh observation tokens; old live-owner snapshots remain foreign.
New edits after recovery branch history normally. The default outer budgets are
16 MiB and 1000 retained entries; the baseline additionally obeys its Document V2
budget. These limits do not enlarge table or aggregate AST limits.

Local recipes retain the smallest single changed element branch and use a parent
or root when a group changes several siblings. They are exact local restart
recipes, never shared root replacements. Asset bytes, upload status, storage
acknowledgement and causal collaboration history are not part of this envelope.
IndexedDB durability and measured compaction/replay budgets remain integration gates.

`RichSelection` now validates text, node and grid selections against an exact
immutable source tree. Text uses stable block-relative scalar-aligned UTF-16
positions; grids retain directional base-cell endpoints and close the rectangle
over complete merged presentation cells. Edit/group mapping relocates deleted
endpoints to surviving original-axis neighbours or reports an explicit clearing
reason. Direct structural rebasing rejects changed text rather than guessing an
offset; admitted local text actions supply witnessed maps. Local history retains
before/after selections for exact restoration;
a deletion fallback is not reversible by inference. This separate family does not
widen existing Selection/session codecs or provide shared causal text anchors.

Plan collaboration envelopes where that directory and geometry require them.
The separate local session family above is additive; freeze future sync names
and versions before exposing the shipping shared API, and do not reinterpret V7.
The existing fingerprint-bearing Document V2 carries rich ASTs without creating
a new shipping shared-document protocol. A semantic export and a
collaboration backup are different products: the former preserves content/geometry, while the latter
also preserves causal identity, pending work and durable selective history.

## Replication engine decision

### Shared rich AST adapter

`experiments/collaboration/src/rich_replica` now owns a staged rich replica.
Genesis admits one Document V2 under the supplied compiled rich schema, then
decomposes it into stable keyed metadata/text and independently ordered structural
occurrences. Later commands never replace a complete shared AST. Each candidate
rebuilds an immutable AST through `DocumentJsonCodecV2` and `RichDocument`, so the
existing fingerprint, rich grammar, typed formats and identity directory remain
the semantic admission boundary.

Backend tree IDs are not Breditor identities. Loro tree deletion Undo can create
new physical nodes. Metadata therefore lives in mergeable maps keyed by stable
block IDs, with text in separate stable containers. A deleted row/column hides
its cell content; another writer's text or image metadata remains available when
the deletion is retracted.

Native tree-move Undo also failed the required later-remote-move scenario: Undo
moved the node back after another writer had moved it. Shared block and column
moves now insert writer-owned occurrences into replicated sibling orders and
select the highest active placement contribution. Undo retracts this writer's
occurrence/contribution; Redo restores its original causal priority. Logical
descendants follow their stable parent identity without copying text or metadata.
Deletion is an independently owned visibility effect: any surviving deletion
keeps the node/axis hidden, even after another writer undoes its own deletion.

Shared creation separates permanent definitions and canonical containers from
writer-owned births, initial text and marks. Whole paragraphs/headings, lists,
tables and images are admitted before decomposition. Undo hides the creator's
node/axis without erasing remote causal content; Redo restores it. Fresh IDs cannot
replace hidden historical definitions. Independently inserted rows and columns
derive one canonical intersection cell, which supports shared text, rich flow and
header metadata.

Merge/split use the existing core capture and merge-closed rectangle rules.
Each shared merge action owns its own intent and verified authored stamp; each split
owns retractions of observed overlapping intents, including known losers. A split
does not retract an unknown concurrent merge, and Undo cannot remove another
writer's split. Merged headers address all retained source cells. Interior axis
insertions expand spans without flattening cell bodies. Canonical column-width
containers stay outside user history, preventing resize Undo from hiding a later
remote width contribution.

Shared selections now use causal text anchors, stable node IDs and directional
table/row/column grid endpoints. Rust resolves merged closure and safe fallback
to surviving original axes. Empty normalization paragraphs need no shared
container activation just to hold a caret. Selection and pending formats remain
local, preserve redo and do not author content updates.

Before/after selection and typing recipes belong to the original action. History
restores them through concurrent edits rather than saving the mouse caret at Undo
time. Native text recreation reproduced an interior caret returning at the end
after Redo. The cursor-only history delta projection repairs recreated references
using Breditor insertion affinity, while Loro still authors every content inverse.
It uses the exact pinned, already-transitive internal delta API; production
promotion must review that engine-specific boundary and its budgets.

Opaque `SharedObservation` values guard the complete live publication, including
local selection, pending formats and history. Stale/foreign observations reject
before Wasm command JSON admission; restored owners have fresh authority. Shared
caret typing now honors pending/derived formats and advances once in one history
group. Null pending formats derive; an empty array explicitly types plain text.

The private `breditor/rich-replica-journal` V10 reconstructs the original seed/join,
ordered local/import/history events and their exact authored causal effects.
Resume requires the original exclusively leased writer and matching room/schema.
It is separate from local exact-history recovery and is not a portable backup or
a server acknowledgement. The reference rebuilds the journal on each mutation;
compaction and production work budgets are not established by these tests.
V1–V9 shared journals are rejected explicitly; local rich recovery and default
shipping formats remain unchanged.

Shared updates now have an original private `breditor/rich-replica-update` V1
envelope. Room ID, schema selector/fingerprint, model revision 9 and the explicit
engine tag `1.16.2+breditor.deterministic-history.1`
are checked before opaque engine import. The header does not authenticate a
sender or acquire a writer lease; those remain reference-host responsibilities.
Asynchronous content work can use `apply_at` with the exact causal version. This
rejects stale coordinates before target/value admission. Complete queued-work
guards use an opaque observation instead; a content version does not freeze local
selection or history.

The shared text-flow model now represents paragraphs as ordered trees of
stable source fragments. Split assigns character ownership and moves following
subtrees; join reparents a text root. Original text-container and character IDs
are retained, so offline edits need not be copied into a new paragraph. Logical
range deletion/formatting map back to original intervals, even after reordering.
Writer-owned contributions support selective history; descending-priority edge
selection normalizes concurrent text-root joins into a cycle-free forest.
Separate empty fragments and causal cut witnesses distinguish deliberately empty
paragraphs and unseen end splits without synthetic characters.

`RichReplica` now routes all text commands through those sources. Real shared
text-block split/join commands reuse the original core's grammar and compare the
materialized result with its exact semantic preview. Structural births and routing
publish in one action; earlier creations can declare text targets for subsequent
steps in that group. Empty right paragraphs retain their own canonical sources,
and active cuts keep both empty paragraphs in normalized cells. History repairs
both floating source cursors and end bindings after native character recreation.

Native undo left an inherited routing annotation on offline-inserted text after
unmarking the original characters. Explicit action-owned activation now gates
both routing and format annotations, so undoing either retracts its copied marks
without erasing that text. Each semantic command owns its activation claim and
causal priority, while the complete atomic group has one history identity. The
retained engine ordering patch deterministically retracts those separate claims.
Logical selection and pending formats
also normalize at the final group boundary, retaining original-axis fallback
witnesses rather than expanding them to newly created rows.
Actual shared command contracts cover offline edits,
concurrent cuts, composed groups, cross-source joins and exact future history
after restart. The private model is revision 8 and its journal is V9; default
shipping contracts remain unchanged. The opt-in browser DOM coordinator now
connects to the shared owner. See the
[text-fragment contract and limits](../experiments/collaboration/README.md#text-fragments-for-shared-paragraph-boundaries).

Shared heading conversion now captures/adopts the core action and projects one
writer-owned kind/rank contribution without replacing text sources or formats.
Concurrent rank changes and masked Undo use the same selective ownership law as
other fields. Visible normalized paragraphs retain explicit empty heading intent,
including through concurrent flow insertion; undoing the kind does not discard
another writer's text. Image captions remain paragraph-only. Native and browser
checks cover derived cells, newly split targets, exact history/restart and atomic
rejection. The shared DOM toolbar now exposes the same heading commands.

Shared selected-range replacement now reuses the core preview for one text block,
direct sibling flows and sibling leading list heads. It retains original suffix
characters/formats, hides selected intermediate subtrees and reparents surviving
last-item tails without copying their text. Offline edits to retained sources and
hidden media survive selective history. Complete inserted formats, selected plain
typing/deletion, composed creation/split/format groups and exact restored future
operations have native/Wasm contracts. Sequential commands have separate causal
priorities so later formatting reliably wins, while the batch remains one Undo
unit. Preparation scans at most 20,000 retained metadata owners; this reference
implementation has not established production latency. Arbitrary cross-cell/container
replacement remains unfinished.

Shared list commands now wrap/unwrap, change presentation, indent/outdent and
split/join items using admitted core previews. Existing rich bodies move by stable
identity; item boundaries retain original source characters. Numbered tail starts,
nested trailing flow and media reading order follow the core rules. Kind/start
are one writer-owned contribution. Sequential composition, selective history,
offline typing and exact future recovery have native and browser contracts.

Empty normalized heads can become movable list content without changing identity.
Their canonical retained occurrences merge across writers and remain conditional
at their original fallback slot. Relocation or deletion can expose a deterministic
spare; older Undo states do not acquire phantom empty paragraphs. The private
model revision 9/journal V10 includes this normalization change. Preparation scans
the potential item fallback slots before history begins, allowing a head deletion
or fresh split followed by unlisting to remain one atomic action. It also scans
at most 20,000 metadata owners; wrapping accepts at most 1,000 item identities and
each normalization family has at most 1,000 spare slots. Production work and
compaction budgets remain open. These commands now drive the shared browser
toolbar and native Enter paths.

The latest verification also exposed engine diff ordering that authored different
paragraph-history operation identities in native and Wasm despite equal views.
A retained, narrowly patched `loro-internal` 1.16.2 now orders tied containers,
map fields and pending marks explicitly. All three direct regressions fail on
the unmodified registry source and pass with the patch. At that engine-ordering
checkpoint, native/Wasm checks and 309 Chromium/Firefox/WebKit cases passed, including exact restored future
operations/journals. See [patch provenance](../experiments/collaboration/vendor/BREDITOR_PATCH.md).
This repairs engine history authoring, not the historical WebKit runtime fault.
The latest shared-browser integration adds 51 passing combined cases and 60
focused repeats, while the unbounded single-process regression matrix finished 308/309
because of a reproduced WebKit pre-edit navigation timeout. Its traces and five
passing isolated test repeats are retained; the startup reliability gate stays open.
An empty-page control independently stalls at the 64th fresh WebKit context
without loading an editor or Wasm. The functional runner now uses fresh WebKit
processes per configured file, with explicit coverage-plan tests and unchanged
assertions/timeouts/retries; this repairs test isolation, not the underlying engine.
All 309 cases pass with that explicit process isolation. Including the 51 new
combined cases and 105 existing single-user cases, the functional browser
checkpoint passes 465 cases. The empty-page lifecycle diagnostic still fails
independently and does not qualify the underlying WebKit engine for production.

Structured shared clipboard now reuses the original semantic codec and fresh-ID
preparation. Guarded reads preserve UI, observations and redo. Inline paste uses
complete source formats and an advanced-caret history recipe; flow paste allocates
fresh content/image/axis identities while keeping immutable asset references.
Exact merge-closed grid paste retains source partitions and target axes/widths.
Its merge records use actual shared action clocks, not copied local intent clocks.
Clear/cut owns fresh empty bodies without removing headers, axes or merge geometry.
Explicit same-value header choices own intent; an omitted choice preserves the target.
Concurrent replacements retain both writers' bodies and selective Undo restores
original content, including remote edits, only when no active replacement hides it.
The private Wasm clipboard request is capped at 5 MiB and 20,000 typed reserved
identities, with the independent 1 MiB semantic clipboard limit still enforced.
Hosts keep all allocated IDs consumed on failure. The browser shared event adapter
uses the Rust namespace allocator and an atomic source-preserving flow paste;
cross-host asset resolution remains separate integration work.
Placement-conflict/cycle
normalization, server-authorized leases,
presence and relay/provider integration are also unfinished. The full functional
goal is unchanged; this adapter is not an end-user collaboration release.

Candidate under test: Loro 1.16.2 in the isolated
`experiments/collaboration` workspace, before promotion to an optional Rust
`breditor-collab` crate.
It supplies rich text, movable trees/lists and Rust/Wasm support.
[Loro source and feature overview](https://github.com/loro-dev/loro).
This recommendation is an architectural inference, not proof that it meets
Breditor's contracts.

Its undo manager tracks local operations from one peer and processes remote
changes while paused. Explicit grouping is available in the Rust API.
[Rust UndoManager contract](https://docs.rs/loro/latest/loro/struct.UndoManager.html).
Source inspection shows peer-bound stacks and cursor metadata, not a demonstrated
durable stack export/restore contract.
[Undo implementation](https://github.com/loro-dev/loro/blob/main/crates/loro-internal/src/undo.rs).
Do not assume a CRDT snapshot alone restores Breditor's promised undo/redo.

Concurrent creation of ordinary map child containers can hide one child's
content. Loro provides mergeable keyed containers; the Rust facade exposes
`ensure_mergeable_text` and related methods.
[Container creation rules](https://loro.dev/blog/mergeable-containers),
[Rust facade source](https://github.com/loro-dev/loro/blob/main/crates/loro/src/lib.rs).
Two offline peers creating the same logical table cell must be a hard regression.

Alternatives remain available until the feasibility gate closes. Yrs supplies
Rust shared text, maps/arrays/XML and a Yjs-compatible replication foundation;
its integrated shared values cannot simply be reattached elsewhere.
[Yrs contracts](https://docs.rs/yrs/latest/yrs/).
Automerge supplies rich-text marks and block markers.
[Automerge rich text](https://automerge.org/docs/reference/documents/rich-text/).
Their fit for Breditor's movable nested structure and durable undo needs separate
tests, not popularity-based selection. Do not implement a new general CRDT as
an incidental part of this feature expansion.

Before selecting a dependency, pin a released Rust version and exact source,
audit its relevant license/dependencies, test its Wasm build, and measure size
and memory. Main-branch research above is not a reproducible dependency lock.

Reject the candidate if it cannot support any of these without data loss:
concurrent moves with stable identity; Unicode-safe anchor resolution; same-key
offline cell creation; one-action grouping across multiple containers; restart
with selective undo/redo intact; and failed-import isolation without mutating the
published document or invalidating its undo owner. The spike must test actual
Rust APIs, not infer Rust guarantees from the JavaScript wrapper.

## Stable identities and positions

Give document, block, table, row, column, cell, image, replica and logical change
distinct types. A cell identity derives from its table/row/column identities;
indices are only the current display order. A moved block keeps its identity.
Image identity and asset identity are separate: replacing the binary must not
replace the image node or invalidate every collaborator's selection.

Replica allocation is supplied by the host and persisted with exclusive writer
ownership. Tabs, backup restores and cloned browser storage must not share an
actively writing replica/counter stream. Backup import into another installation
creates a new writer identity. The server detects collisions rather than merging
two authors under one counter namespace.

Local undo scope belongs to one editor writer, not every device signed into the
same account. A normal restart resumes that exclusively owned writer and its
history. Restoring a portable backup creates a recovery branch; it must not
overwrite a live room or acquire another writer's identity. Joining an existing
room imports recovered content through a new authored change, with the original
backup/history retained separately. Writer credentials are not part of a portable
document backup. Freeze recovery-branch history semantics in the feasibility gate.

Use primitive strings or checked integer words for IDs and large counters at the
Wasm boundary, not JavaScript floating-point numbers. Replication identities
prove causal identity, not account authorization.

Text selections store stable text anchors plus before/after affinity and preserve
anchor/focus direction. Node selection targets an image/block identity. Grid
selection targets table and row/column identities, not persisted DOM offsets.
Resolve these into snapshot-local Rust/DOM positions at publication time.
Define deterministic fallback for deleted targets and clear pending formatting
when the effective editing context changes. Presence does not create history.

The Rust adapter must explicitly translate the CRDT's text coordinate units to
Breditor's scalar-aligned UTF-16 contract. The Loro Wasm text API documents UTF-16
positions and stable cursors; that does not establish the Rust adapter's behavior.
[Text and cursor API](https://loro.dev/docs/tutorial/text).
Test surrogate pairs, combining marks, ZWJ emoji and boundary affinity.

## Table storage and merge rules

Store ordered row and column identities separately. Store each logical cell's
rich content by its stable row/column pair. Concurrent creation resolves to one
shared cell body; do not let two independently created child containers compete
under an ordinary map key.

Materialization builds a rectangular grid and derives empty cells without
replicating competing repair operations. Editing an empty derived cell activates
its canonical keyed content. Every rendered position maps back to one logical
cell and stable block identity.

Represent merged cells as non-destructive merge-region records over base cells.
The underlying content remains in those cells; the rendered merged cell presents
their blocks in deterministic row/column order. Split restores base-cell visibility
without redistributing or deleting another peer's edits. Typing continues to
target the original logical cell containing its stable anchor.

The opt-in geometry contract processes active merge records in a shared numeric
total order and accepts only non-overlapping
valid rectangles. Losing regions become inactive in the derived view, with an
observable conflict result; their content is retained. Split targets observed
merge identities, not unknown future merges. The order is descending causal
Lamport value, replica ID and counter; the replication adapter must verify the
causal stamps, using one exact numeric/byte ordering,
not wall-clock time or locale-sensitive string comparison. A new merge retracts
the observed old region in the same logical change. Exact merge identity bytes
provide the final tie-break when multiple records share one logical priority.
Capture retains the full original axis context so moving a previously outside
axis inside a region deactivates that intent, rather than treating a move as a
new interior insertion. Inserting axes between a
region's stable boundary anchors expands it; boundary insertions stay outside.
Reordering that makes a region's captured boundary/membership inconsistent
deactivates that region rather than guessing a new rectangle. Golden vectors now
cover ties, deletions, empty axes, receive order and source-cell partitions. The
new rich-document envelope must bind this geometry revision explicitly.

After axis deletion, use surviving captured members as the region's boundaries.
New axes between those boundaries are included; surviving original members must
remain in their captured relative order. If none survive on an axis, or survivors
are reordered outside that interval, the region is inactive. The visible master
is the first surviving row/column pair. A table with no visible row or column is
hidden, not repaired by independently inserting a new row on every replica.
Its underlying cells remain available to history/recovery.

Delete-versus-edit uses an explicit visibility rule: deleting a row/column hides
its cells; a concurrent text edit does not resurrect the axis. Preserve the
hidden content for allowed recovery until an explicit retention policy permits
collection. Undo must retract the local deletion effect without retracting a
different user's independent deletion.

Resizing is a semantic column-width command. Pointer movement is a local preview;
one completed drag creates one undo group. Width is a bounded integer, not
arbitrary CSS. Row/column/header/merge changes must all be atomic logical changes.

## Image content and asset lifecycle

Persist immutable asset references and semantic metadata, never expiring signed
URLs, upload credentials, DOM object URLs or binary data inside every text
operation. Resolve asset references through a host policy. A local demo may use
owned fixture assets; production storage remains an explicit host integration.

Model paired dimensions/crop values atomically so concurrent field updates cannot
produce an incoherent size. Alt text and captions have independent editing
semantics; captions use the same rich-text planner and anchors as other blocks.
Keep loading/error state outside durable document history.

Offline assets are queued durably with a byte budget. Upload failure retains a
recoverable pending reference and exposes retry/cancel. Completion targets the
original image identity and asset generation; it must not reinsert a deleted
image or apply an old upload to its replacement. Canceling one editor does not
delete an asset still referenced by another document or undo history.

Validate file bytes, MIME, encoded size and decoded dimensions. Render admitted
images through a closed recipe and host origin policy. Treat external HTML as
untrusted interchange; do not fetch pasted remote URLs through a server merely
because they appeared in clipboard markup. Use native attributes for alt text,
and distinguish decorative images deliberately.

Asset garbage collection must account for retained history, offline replicas and
backups, not only the visible document. Provide an explicit epoch/retention policy;
do not promise unlimited offline merging while silently discarding its ancestors.

## History, recovery and normalization

Local rich history retains the existing exact rollback/replay discipline, with
new operations and an explicitly versioned codec family. Collaborative undo
undoes only that writer's logical action, rebased against remote edits; it must
not restore an old complete AST over current collaborators' work.

Group typing and IME commits deliberately. Table merge, structural list edits,
image replacement, completed resize and multicell paste each form one group.
Remote edits, presence and upload progress never become local undo entries.

Require durable collaborative undo/redo metadata and stable selection anchors
across restart. A dependency's in-memory manager is insufficient. The feasibility
gate must prove either supported restoration or a Breditor-owned journal that
reconstructs selective effects without undoing remote work. If neither can be
proved, change the design; do not silently clear history to pass a reload test.

The tested journal reconstructs authored commands as local operations, rather
than importing them and declaring a checkpoint. That import shortcut mis-transforms
mixed local/remote history. Canonical shared-container activation stays outside
user undo. Metadata and strong formatting use separately owned action
contributions, so retracting one writer's change cannot remove another writer's
winning value. Redo reactivates the original contribution and priority; it is not
a newly authored override of later remote work. Resource-bounded persistence and
compaction of this journal remain a separate implementation gate.

Back up shared causal state, accepted and pending changes, schema/protocol
bindings, local unsynced work and required asset references. Keep presence out.
Test byte budgets, crash boundaries and recovery before deleting any journal.
Legacy Document V2 snapshots can be imported through an explicit conversion
which assigns stable IDs. Legacy Session V7 history is not automatically
collaboration-aware; keep its backup intact and define an explicit new-history
boundary instead of claiming transparent undo migration.

Normalize structural conflicts with a pure versioned function of shared state.
It must be deterministic and idempotent and preserve recoverable content. Its
synthetic empty blocks have derived stable identities, not independently generated
ones. Invalid or unsupported data is isolated with exportable evidence, never
silently interpreted as an older schema. Avoid normalization writes that bounce
between replicas or make convergence depend on receive order.

## Sync, permissions and browser coordination

Build a reference Rust relay with document-scoped authorization, causal catchup,
durable append, bounded snapshots and ephemeral presence. WebSocket is transport,
not a conflict-resolution algorithm. Separate received, integrated, locally
durable and server-durable acknowledgements. A socket send is not a saved edit.

Use a versioned Breditor envelope binding document, schema fingerprint, shared
model version, CRDT codec version, replica/change identity, dependencies, payload
digest and size. Allow missing dependencies to remain pending, bounded and
observable. Loro import distinguishes integrated and causally pending ranges.
[Sync import contract](https://loro.dev/docs/tutorial/sync).

Authenticate at the server and validate ownership of accepted change origins;
do not trust a client-supplied replica ID as a user identity. Stage updates with
resource and semantic validation before durable acceptance/broadcast. All peers
must agree on the accepted history. Permission loss during offline editing
retains local export/fork recovery and must not silently publish rejected work.
Invalid messages, duplicates, gaps and incompatible versions have distinct states.

The browser coordinator admits remote content only at safe publication boundaries.
During IME composition, buffer remote publication and keep native DOM stable;
then map the committed local change through the pending remote edits. Put an
explicit bound and cancellation/fallback policy on that buffer. A collaborator
deleting the composing block must not lead to dropped text or recursive recovery.

Presence uses stable anchors, rate limits and host-supplied expiry; it is neither
durable content nor a source of truth. Network/provider callbacks cannot mutate
Rust state or rendered DOM outside the coordinator. Table and image toolbar
controls remain declarative and use the same action-state/intent path as text.

## Packages and file ownership

Keep rich-content and collaboration opt-in until the combined release gate passes.
Proposed boundaries are `breditor-core` for semantic contracts/actions,
`breditor-collab` for the Rust replication adapter and coordinator,
`breditor-collab-server` for the reference host, and separate browser rich-content
and collaboration entry points. The browser uses the Rust CRDT in the matching
Wasm module, not a second independent JavaScript CRDT document.

Every semantic action has its own named, documented source file, including
`insert_table.rs`, `delete_table.rs`, `insert_table_row.rs`, `delete_table_row.rs`,
`insert_table_column.rs`, `delete_table_column.rs`, `move_table_row.rs`,
`move_table_column.rs`, `merge_table_cells.rs`, `split_table_cell.rs`,
`resize_table_column.rs`, `set_table_header.rs`, `paste_table_cells.rs`,
`insert_image.rs`, `replace_image.rs`, `resize_image.rs`, `set_image_alt.rs`,
`set_image_caption.rs` and `delete_image.rs`. Upload and networking are host
services, not undocumented Rust action side effects. Shared helpers own geometry,
resource checks and mapping; do not duplicate them in each action.

## Implementation checkpoints and exit gates

1. **Contracts and failure fixtures.** Set the supported rich grammar, identities,
   three selection kinds, table overlap/delete rules, image lifecycle and version
   boundaries. Record concrete scenarios and independent oracles before adapters.
   Exit: review resolves the merge-order and durable-undo design; existing schemas
   remain unchanged. Planning does not add a dependency or change shipped bytes.
2. **Rust replication feasibility.** Pin Loro in an isolated optional crate. Prove
   concurrent text/format/move behavior, same-key offline cell creation, stable
   Unicode anchors, grouped local undo after remote edits and durable restart.
   Measure Wasm size, import limits and memory. Exit: deterministic golden vectors
   and native/Wasm tests pass; select another engine if a required contract fails.
3. **Rich Rust AST and local operations.** Add a new schema and geometry/image
   validation, node/grid selections, independently documented operations/actions,
   inverse/mapping and new durable recipe support. Exit: exact undo/redo and reload
   at every mixed history cursor; malformed/over-budget edits are atomic.
4. **Shared rich model and semantic planners.** Implement tree/text/table/image
   CRDT mapping and pure materialization. Exercise every action in local and
   collaborative mode. Exit: replicas receiving identical accepted change sets
   converge to the same canonical AST; merge conflicts retain recoverable content.
5. **Wasm, rendering and input.** Add closed rich projections and factories,
   image/node and cell/grid mapping, toolbar, resize, keyboard, IME and structured
   interchange. Exit: all three browser engines pass with real matching Wasm and
   no DOM-as-document fallback; legacy factories reject unsupported rich input.
6. **Server, assets and durable reconnect.** Implement authorized sync, server
   acknowledgement, indexed local persistence, upload provider and recovery UI.
   Exit: disconnected replicas survive restart and reconnect, permission changes
   are visible, server crash/replay is exact, and pending uploads never recreate
   deleted images. Test failure paths before any hosted deployment.
7. **Combined qualification.** Run the acceptance suite below on the installed
   combined package, plus full default-package regressions and native checks.
   Exit: measured budgets and support limits accepted; no untriaged reproducible
   data-loss, convergence, history or ownership failure.
8. **Release candidate and pilot.** Produce pinned packages, reference server,
   install/example docs, backup/migration guidance and known-risk notes. Exercise
   a real multi-user integration before production approval. No publishing,
   pushing, external deployment or paid infrastructure without explicit approval.

## Combined acceptance suite

Test the combined system throughout development, not only after three separate
demos appear to work. Check document content, structure, logical selection,
local undo/redo, accepted versions, pending/durable states and asset references;
screenshots alone are insufficient.

- A edits a formatted cell while B inserts a row and C resizes a column; all
  replicas converge, and each undo affects only its own action.
- Two offline peers create/edit the same previously empty cell, then reconnect
  in opposite orders. Both texts survive, with one shared logical cell body.
- Concurrent overlapping cell merges resolve to one valid partition. Splitting
  preserves every base-cell text/image and stable selection anchor.
- A deletes a row while B types in it offline. The agreed visibility rule holds,
  hidden content remains recoverable, and local undo does not retract B's edits.
- Insert a nested list and a captioned image inside a merged cell. Format text,
  resize, split, cross-cell copy/cut/paste, undo/redo and restore every cursor.
- Upload an image offline; delete/replace it before completion; reconnect and
  deliver completions twice or out of order. No wrong image is changed or revived.
- Keep Japanese composition active while another peer edits, moves or deletes
  its block. Commit/cancel and undo behave consistently without recursive recovery.
- Disconnect, edit all three feature classes, close/reopen the browser, recover
  local undo/redo, reconnect and exchange duplicate/reordered/delayed messages.
- Lose write permission while offline. Shared state is not overwritten; local
  work remains exportable and the UI does not label it server-saved.
- Crash the server before and after durable acknowledgement. Clients distinguish
  pending from durable work and converge after exact replay.
- Malformed assets, unsupported schemas, forged origins, oversized updates and
  missing dependencies neither publish partial content nor exhaust an unbounded
  queue. Test authorization with a local reference host, not live third parties.
- Native clipboard and keyboard-only interaction cover node, grid, text and
  presence states on the exact release candidate. Physical Japanese IME and
  spoken VoiceOver are deferred; automated composition/accessibility contracts
  remain part of the implementation tests.

Use deterministic multi-replica schedules, property-based tests and retained seed
replays. Vary delivery order, duplicate delivery, partitions, restart, concurrent
deletion/movement, undo and compaction. Compare semantic exports, not raw CRDT
byte identity, unless the codec itself promises canonical bytes. Offline cursors
and local history intentionally differ between users while shared content converges.

## Performance, limits and production timing

Propose explicit limits for cells, spans, block depth, assets, pending bytes,
presence rate, import work and retained history. Benchmark representative mixed
documents and long offline catchup on native Rust and all three browser engines.
Agree numeric ceilings after the replication spike measures its cost; do not
widen existing shipping budgets silently or present synthetic timings as a SLA.

Starting limits to exercise in the spike, not approved shipping budgets: 256 rows,
128 columns and 4096 base cells per table (all three limits apply), with the
existing aggregate node/depth limits retained. For raster assets, test a 10 MiB
encoded ceiling and a 32-megapixel decoded ceiling, plus bounded total offline
asset storage. Test host-configured lower limits and explicit over-limit states.
Measure CRDT update/snapshot growth, pending-dependency memory and catchup cost
before choosing their independent byte/time ceilings. Presence and uploads must
not consume an unbounded shared content queue.

Development builds use scoped `target/collaboration-*` caches with debug data and
incremental compilation disabled. Check available storage before larger builds;
do not delete user data or unrelated work to make tests pass.

This is a multi-milestone product expansion, not a few-hour production promise.
The rich paragraph/list/range and clipboard planners now drive the opt-in shared
browser coordinator. Shared caption creation/removal now owns an explicit retained
paragraph choice. The next focused sessions should complete general placement
conflict/cycle normalization and the generic shared profile factory, then
integrate the reference relay, presence and host
asset provider. Durable shared causal journals and local asset
bytes now survive reload, but do not supply network acknowledgement or shared
asset hosting. Arbitrary cross-container
text ranges and typing coalescing remain separate support limits. Schedule the full
release after the remaining measured integration gates. Production
follows combined qualification and a real pilot, not the existence of three
toolbar buttons.
The accepted Breditor-side WebKit repair remains in the baseline; document the
historical engine/owner risk without restarting that investigation as the main task.
