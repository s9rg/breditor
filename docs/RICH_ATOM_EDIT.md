# Whole atom editing

Rust local and shared owners can delete or replace a whole selected image,
visible table or horizontal rule. Rust proves the source, chooses recovery and
publishes content, selection and history together. These methods do not remove
image bytes from an asset store or introduce a new saved action format.

## Deletion and recovery

`plan_atom_deletion` accepts a selection proved against its immutable document
and a logical `FlowMove::Before` or `After`. It prefers the adjacent visible stop
in that direction, then the opposite direction. Text destinations use the same
scalar-aligned UTF-16 boundaries as logical navigation. A neighboring atom can
remain a whole-node selection; typing can replace it, or Enter can create text
beside it. Cells and captions retain their navigation domain boundaries.

The original flow parent must remain usable. Removing its sole child always
requires an explicit replacement paragraph, even if a quote has outer neighbors.
The same applies when the remaining direct siblings contain no visible stop,
such as a quote retaining only hidden tables. The planner walks both logical
edges and checks their actual parent scope. It does not flatten the document,
invent an identity, enter the atom's descendants or relax hidden-table selection.

`delete_atom` on the local owner and `delete_atom_guarded` on a shared owner
accept a host-supplied paragraph identity. It is consumed only when recovery
requires a floor. Otherwise no paragraph is inserted and the identity remains
unused. A floor occupies the atom's original slot with an empty plain caret at
zero. Deletion clears pending typing styles.

Local deletion retains one original `ReplaceBlocks` action and its exact inverse,
including the source's captions, image binding, cell bodies and merge records.
Shared deletion uses the original writer-owned `DeleteBlock`, plus `InsertBlocks`
when a floor is needed, in one selective history group. Another writer's edits
remain causal while hidden and return when the deleting writer undoes the edit.

## Plain replacement and user typing

`replace_atom_plain_text` replaces the whole atom with one fresh paragraph in
the same flow slot. Empty explicit text deliberately creates an empty paragraph.
The final caret is at the input's UTF-16 end, with plain pending formats pinned
for the next key. Unicode is not normalized and no styles are inherited from a
caption, table cell or neighboring run.

`replace_atom_typing_text` is a separate first-key command requiring opt-in native
typing history. A nonempty key starts a new group and never joins an earlier
burst. Subsequent same-caret plain typing can join that group under the existing
clock, format, separator and step limits. Thus replacing an atom and typing the
rest of a word can be undone once. Empty user input proves the atom but publishes
nothing and consumes no identity. Restoring a checkpoint does not restore the
process-local continuation clock.

Local replacement uses an original `ReplaceBlocks` record. Shared replacement
uses original insertion and deletion commands. Creator Undo hides the new
paragraph without erasing a peer's causal text inside it; Redo restores that
text, including after restart. This is the existing owned-birth policy, not an
assertion that local and shared Undo have identical ownership semantics.

## Boundaries and resource limits

Every mutation checks its exact observation and writable policy first. Non-atom
selections, reused replacement identities, invalid text and admission failures
publish nothing. A floor identity must be fresh when used; explicit replacement
always requires a fresh identity. Shared identities cannot reuse historical
definitions, including hidden or undone births.

Shared replacement admits the existing insertion before hiding the source. It
therefore needs transient node and text headroom, even when the final smaller
tree would fit. A tight limit rejects atomically, retaining content, selection,
history, frame and causal version. The local replacement action needs only the
final tree budget. Shared plain replacement also retains the 64 KiB input-byte
ceiling. These limits are explicit; neither owner silently raises host budgets.

## Wasm and browser contracts

Local Wasm advertises `atomEditVersion() === "1"`. Its closed commands are
`deleteAtom { paragraph, movement }`, `replaceAtomPlainText { paragraph, text }`
and `replaceAtomTypingText { paragraph, text, clockMs }`, each under `data`.
Directions are `before` or `after`; clocks are canonical unsigned decimal strings.
The facade exposes optional `supportsAtomEditing()`.

Shared Wasm advertises `atom_edit_version() === "1"` with guarded `delete_atom`,
`replace_atom_plain_text` and `replace_atom_typing_text`. The SDK requires the
exact capability and all three methods. Its corresponding methods are
`deleteAtom`, `replaceAtomPlainText` and `replaceAtomTypingText`, with optional
expected revisions. There is no JavaScript transaction fallback for these APIs.
The flow-navigation capability keeps its original meaning.

V2 stock controllers route selected-atom Backspace, Delete, Cut, plain-text paste,
ordinary printable keys and matching `beforeinput` events to native methods.
Printable-key handling is necessary because logical node selections have no DOM
text range: several engines emit no `beforeinput` in that state. The first-key
handler cancels its default to prevent duplicate input. Composition, modified
keys and focused widgets retain ownership; read-only blocks non-BMP printable
keys as well as ordinary letters. Empty or unsupported paste does not delete a
selection. Structured clipboard placement retains its separate contract.

V1 stock atom behavior is not switched to these new routes. Hosts may explicitly
call the optional native APIs in either rich language. Document, schema, model,
journal, frame and checkpoint versions remain unchanged. Actual pre-capability
Wasm must restore the resulting original recipes and reproduce future history;
an old runtime rejects the new convenience command rather than guessing it.

## Qualification and remaining work

Native contracts live in `rich_atom_edit.rs` and `atom_edit_contracts.rs`; the
research manifest includes the same shared test source. Installed browser cases
are in `experiments/editor-browser/atom-edit.spec.mjs`, including vanilla, React,
selective peer history and restart. `scripts/probe-atom-edit-compatibility.mjs`
compares real previous/current Wasm, not a JavaScript inverse implementation.

The [qualification record](qualification/2026-10-16-atom-edit.json) binds the
477-case SDK and serial 78-case application matrices to the exact installed
archives. `scripts/probe-atom-input-delivery.mjs` compares a pre-repair build with
the repaired build. For a selected image, both owners in all three engines
receive trusted keydown/keypress but no input event in the old build; injecting
`beforeinput` reaches its existing native planner successfully. The repaired
cases insert once through a prevented keydown. This isolates the controller
delivery gap from Rust's edit planning.

Synthetic composition guards do not qualify physical IME replacement of an atom.
Clipboard-event fixtures exercise the editor boundary, not the operating-system
clipboard. Visual/bidirectional arrows, general cross-container ranges, gap/drop
positions, recovery from an already hidden-only document, block properties and
foreign interchange remain separate work. Historical WebKit startup/replay
observations and shared-input latency remain open. This is a functional editing
checkpoint, not V1 release qualification.
