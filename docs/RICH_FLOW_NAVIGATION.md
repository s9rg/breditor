# Logical flow navigation and text beside atoms

Native local and shared owners support logical movement between flow stops and
explicit paragraph creation beside selected images, visible tables and horizontal
rules. These are separate commands: moving changes only selection; creating text
is one undoable insertion. Neither changes the original saved formats.

Explicit structural V2 toolbars provide Previous block, Next block, Paragraph
before and Paragraph after. Alt+PageUp / Alt+PageDown request logical movement at
a text edge or from a whole-node selection, including with an empty toolbar.
Enter creates a paragraph after a selected atom; Shift+Enter creates one before.
Ordinary text/code Enter behavior remains unchanged. These shortcuts do not
implement visual line navigation or bidirectional arrow layout.

## Native movement contract

`navigate_flow` checks a selection against its exact immutable document. A
collapsed text caret must be at the requested UTF-16 edge. A whole-node selection
moves outside that entire node; ranged text, grids and interior carets return
`NotApplicable` without discarding either endpoint.

Lists, tasks and quotes are transparent reading-order containers. Images,
visible tables and rules are single stops: movement from outside selects them
instead of entering their caption or cells. Text destinations use offset zero
when moving forward, or their final scalar-aligned UTF-16 boundary and before
affinity when moving backward. Zero-axis hidden tables are skipped, not made
selectable by relaxing native admission.

The nearest table cell, image caption or document is the editing domain. Movement
cannot escape a cell or caption; an explicit domain boundary leaves the source
selection intact. Existing grid and host focus-transfer contracts remain
separate. Traversal follows adjacent siblings and ancestors, then an iterative
destination-edge search. It does not construct a document-wide flattened index
or allocate a frontier containing every child of a wide list.

The guarded local/shared methods publish ordinary native selection state, clear
only context-dependent pending styles and preserve content, causal frames, Undo
and Redo. Read-only owners may navigate. A stale observation rejects before
planning; null, unsupported and boundary requests publish nothing. Existing
browser input-intent fences may separately close a natural typing continuation
before a navigation command.

## Explicit paragraph creation

`insert_paragraph_adjacent` requires a whole image, visible table or rule
selection, writable policy and a fresh valid paragraph ID. Rust derives the gap
immediately before or after the selected atom in its actual flow parent. The
atom, its immutable contents and surrounding sibling order remain intact; the
new plain paragraph receives the caret at zero with no pending style override.
This also supplies reachable text around documents containing only one supported
visible atom. Recovery of a flow containing only hidden tables remains separate.

One original `InsertBlocks` recipe owns the insertion. Code/prose typing before
navigation, paragraph creation and later typing have separate natural history
groups. In collaboration, concurrent paragraphs remain independently owned.
Creator Undo hides its paragraph without erasing another writer's causal text
inside it; Redo restores that text, including after restart. Invalid selections,
duplicate identities and late resource-limit failures publish nothing.

Each guarded Rust command has its own named documented file. The pure planner
is shared by both owners; no browser-side destination or flow transaction
replaces native planning.

## Wasm and SDK capabilities

Local instances expose `flowNavigationVersion() === "1"` and closed commands:

```js
editor.execute({kind: "navigateFlow", data: {movement: "before"}});
editor.execute({
  kind: "insertParagraphAdjacent", data: {paragraph: "fresh-id", side: "after"}
});
```

Shared instances expose `flow_navigation_version() === "1"`, guarded
`navigate_flow` and `insert_paragraph_adjacent`. The SDK routes
`editor.core.navigateFlow("before", revision)` and
`editor.core.insertParagraphAdjacent("fresh-id", "after", revision)` to them.
Missing or nonexact capabilities reject requested commands; there is no
JavaScript placement fallback. Strict local payloads reject unknown, duplicate
and incorrectly typed fields. Shared Wasm checks the observation before parsing
direction and writable policy before planning an insertion.

Original V1 factories and stock keyboard/toolbars remain unchanged. V1 hosts can
explicitly compose `createFlowNavigationControls` from `@breditor/editor`, or
`createSharedFlowNavigationControls` from `@breditor/editor/collaboration`.
Selection-only controls remain available in read-only mode; paragraph controls
do not. Composition and focused native widgets own their own keys.

New histories still contain ordinary text/node selections and insertion actions.
Document, schema, model, journal, frame and checkpoint versions do not change.
Actual pre-capability runtimes restore the resulting histories and continue
editing and Undo/Redo; they cannot execute the new convenience commands.

## Reproduced shortcut repair

The first installed run reproduced six range-preservation failures, in both
owners across Chromium, Firefox and WebKit. Rust refused the reversed range as
specified, but the uncancelled Alt+PageDown default then moved or collapsed the
browser selection. The reserved logical shortcut now cancels its default even
when the native result is unsupported or at a boundary. Widget and composition
guards still precede that routing. The six-case regression checks the exact
reversed range and complete checkpoint before and after the key.

The failed traces and an explicitly stopped premature full run remain in
`target/flow-navigation-qualification`. This repair concerns the editor's event
routing, not the historical intermittent WebKit startup fault.

## Qualification and remaining navigation

Native contracts are in `rich_flow_navigation.rs` and
`flow_navigation_contracts.rs`; the retained research manifest compiles the same
shared tests. Installed consumer scenarios are in
`experiments/editor-browser/flow-navigation.spec.mjs`. Actual old/current Wasm
comparisons use `scripts/probe-flow-navigation-compatibility.mjs`. The
[qualification record](qualification/2026-10-16-flow-navigation.json) binds the
completed 408-case SDK matrix and serial 78-case application matrix to the exact
candidate archives. Its earlier WebKit startup recurrence remains retained;
the completed rerun does not establish an engine repair.

Physical/bidirectional arrows, visual line edges, extended/general selections,
explicit gap/drop selection, typing replacement of selected atoms and complete
atomic deletion/recovery remain separate unfinished contracts. Bounded layout
properties and foreign interchange also remain in the first-two-workstream
goal. The older browser/replay observations and serious shared input latency
are still open; this is not V1 release qualification.
