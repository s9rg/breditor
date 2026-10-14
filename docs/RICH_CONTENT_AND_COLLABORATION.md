# Breditor rich content and offline collaboration plan

Status: implementation authorized October 13, 2026; replication feasibility is
the first checkpoint. Japanese IME and spoken VoiceOver qualification are
deferred at the user's request, not reported as passing. Existing formats and
shipping packages remain unchanged. It extends the requested scope to tables, images and
full collaboration in one interoperable editor. Implementation checkpoints are
not permission to reduce collaboration to an online-only demo.

Implemented checkpoints include an isolated, pinned Rust/Wasm replication
coordinator, feature-gated rich geometry/image values, a separate sealed rich
AST and stable-ID directory, and the first guarded local metadata actions. The
rich-AST/local-operation checkpoint is still in progress. The
[reproducible checks and remaining gates](../experiments/collaboration/README.md)
separate tested contracts from the still-unimplemented editor, relay and asset
storage. The default packages, schemas and codecs remain unchanged.

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
inverses and support all-or-nothing groups. They are not wired into existing
session/history codecs. Dependent steps are captured against staged snapshots;
stale targets and tighter host limits reject publication. The core still needs
structural CRUD, node/grid selections, position mapping and durable rich recipes
before checkpoint 3 can exit.

Plan new rich-document, session and collaboration envelopes where that directory
and geometry require them. Freeze their exact names/numbers before exposing the
shipping rich session/sync API; do not reinterpret V7. The existing generic
fingerprint-bearing Document V2 envelope currently carries research AST fixtures,
not a newly declared shipping session/sync protocol. A semantic export and a
collaboration backup are different products: the former preserves content/geometry, while the latter
also preserves causal identity, pending work and durable selective history.

## Replication engine decision

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
The next focused session should finish rich structural CRUD, node/grid selection
and durable local recipes, then connect the same semantic planners to the
replication adapter. Schedule the full release after the remaining measured
integration gates. Production follows
combined qualification and a real pilot, not the existence of three toolbar buttons.
The accepted Breditor-side WebKit repair remains in the baseline; document the
historical engine/owner risk without restarting that investigation as the main task.
