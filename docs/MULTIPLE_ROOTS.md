# Multiple editable roots

Status: local editors implemented (opt-in, `experimental-rich-content`); shared
collaboration specified below and deferred.

Comparison target: the CKEditor 5 multi-root editor — one editor with several
editable roots (for example header, content, sidebar), one configuration, one
toolbar, one Undo stack and one data model; per-root `getData({rootName})` and
`setData({root: ...})`; roots added and detached at run time; root attributes;
real-time collaboration across roots. The model selection is always inside one
root.

## Decision: a root set, not a new root node

The rich V4 grammar is frozen, so multiple roots are **not** a new node type.
A multi-root editor is a **root set**: an ordered list of independent rich
documents, each an ordinary V1–V4 document with its own `breditor/document-id`,
owned by its own native `RichLocalSession`, and composed by ONE native owner of
the global history order. Every existing command, read, checkpoint, interchange
and render path works per root unchanged, and default single-root output is
byte-identical (nothing new is reachable without `createRichRootSet`).

| Concern | Rule |
| --- | --- |
| Root identity | Stable, immutable `RichRootId` (`[A-Za-z][A-Za-z0-9_-]{0,63}`), unique within the set, chosen by the host (CKEditor's root name). The root document's own `breditor/document-id` is unchanged and independent. At most 64 roots. |
| Root metadata | Optional accessible `label` (≤ 256 bytes, no control characters) used as the surface's accessible name, and up to 32 string `attributes` (key like a root id, value ≤ 1024 bytes). Metadata is set data persisted in the set checkpoint, never part of a root document or its history. |
| Shared ordering | The root list order is the document order of the set (`addRoot` takes an optional index). Hosts that need an explicit sort key store it as an attribute (e.g. `order`). |
| Data model | One document per root. `getData(id)` is that root's Document V2 JSON; `setData` is the root's existing whole-document commands (one Undo unit in that root). |
| Schema | All roots share one compiled profile (CKEditor: one configuration). The native owner refuses a root from another schema proof. |
| Selection | Exactly one **active root**. Each root keeps its own native selection; only the active root receives focus-routed commands and the shared toolbar. A **cross-root selection is not expressible**: every command addresses one root's document, so a range can never start in one root and end in another. This matches CKEditor (a model selection lives in one root) and keeps every existing selection/coverage/clipboard contract exact. Moving focus to another surface switches the active root; Copy in one root and Paste in another is ordinary clipboard interchange. |
| History | ONE global Undo/Redo order across roots (below). Each Undo unit belongs to exactly one root. |
| Add / remove root | Structural set operations, **not** Undo units in this version. An added root must start with empty history (its units would have no global position). Removing a root drops its units from the global order and returns its final document/checkpoint to the host. CKEditor can make `addRoot`/`detachRoot` undoable; that is a follow-up (it needs a structural journal entry whose inverse re-attaches a root owner). |
| Persistence | One versioned set checkpoint (below) holding every root's unchanged session checkpoint plus the journal; restore re-verifies every count. |
| Interchange | Per root: every existing HTML/Markdown/DOCX/clipboard path takes one root's document. There is no combined export in this version; a host concatenates per-root exports in set order if it needs one. |
| Read-only / restricted editing | Per root, through each root owner's existing policy. |

## One history owner

Each root owner keeps its exact local history (exact inverse/forward records,
natural typing groups, capacity). The set owns only the **order** of those units:
a journal of root ids plus a cursor. For every root `R`, the number of `R`
entries before the cursor always equals `R.undo_depth()`, and the number after it
is at most `R.redo_depth()`.

- **Recording.** Every root owner exposes process-local monotonic counters
  (`RichHistoryProbe`: content commits, typing-group joins, undos, redos). After
  any dispatch on a root the set reconciles it: new units are appended (a commit
  that joined the current typing burst adds none), the global redo branch is
  cleared, capacity eviction drops that root's oldest entries, and undo/redo
  moves the cursor. The probe is never persisted or compared for equality; a
  restored owner starts at zero.
- **Global Undo/Redo.** `undoTarget` names the root owning the newest unit; the
  host runs `undo` in that root (its exact local Undo) and reconciles. The root
  then becomes active and takes focus, so the user sees what was undone. Redo is
  symmetric.
- **New edits clear the global redo branch** in every root, like a single
  document. A root that had redo units keeps them locally, but they are no longer
  reachable through global Redo and disappear at that root's next commit.
- **Typing groups** never span roots: blur closes a root's burst before another
  root is edited (existing boundary), and a group can only extend the global top.
- **Bypass is repaired, not trusted.** If a host undoes a root directly while
  another root owns the newest unit, reconciliation moves that unit to the redo
  side so the invariant still holds.

## Native surfaces

- Core (`crates/breditor-core/src/rich_content/root_set/`): `RichRootId`,
  `RichRootMeta`, `RichRootSet` (the journal coordinator: `add_root`,
  `remove_root`, `set_attributes`, `focus`, `reconcile`, `attach`,
  `undo_target`/`redo_target`, `encode_checkpoint`), `RichRootSetCheckpoint`
  (strict envelope decoder) and `RichMultiRootSession` (an owner holding the root
  sessions: `dispatch(id, command)`, global `undo`/`redo`, `checkpoint`/`restore`).
- Wasm: `BreditorRichRootSet` coordinates separately owned `BreditorRichEditor`
  roots (`rootSetVersion() === "1"`, `addRoot`, `removeRoot`, `setAttributes`,
  `focus`, `reconcile`, `stateJson`, `checkpointJson`, `restore`, `attach`). It
  binds each root id to its owner's identity and refuses calls with another
  editor. Error codes: `breditor_rich.root_id`, `root_metadata`,
  `root_duplicate`, `root_unknown`, `root_limit`, `root_history`,
  `root_set_incomplete`, `root_history_mismatch`, `root_set_checkpoint`,
  `root_owner`.
- TypeScript (`@breditor/experimental-rich-content`): `createRichRootSet(wasm)`,
  `mountRichMultiRootEditor(container, {set, roots, toolbar, editor, onChange})`
  and `restoreRichRootSet(set, profile, envelope)`.

`mountRichMultiRootEditor` mounts one ordinary rich DOM editor per root (each a
`section[data-breditor-root]` with its accessible label) and moves their toolbars
into one shared slot where only the active root's toolbar is visible, so the
shared toolbar always reflects the focused root. Each root's owner is wrapped so
that every dispatch is reconciled synchronously, its view reports the **global**
Undo/Redo depths (Undo is enabled in every toolbar while any root has a unit),
and Undo/Redo (toolbar or keyboard) is routed to the root owning the global unit.
The returned editor offers `getData(id)`, `undo()`, `redo()`, `addRoot`,
`removeRoot`, `setAttributes`, `checkpointJson()` and `dispose()`.

## Set checkpoint

```json
{"format":"breditor/rich-root-set","formatVersion":1,
 "roots":[{"id":"header","label":"Header","attributes":{"order":"1"},
           "history":"explicit","selection":"original","checkpoint":"<root session checkpoint>"}],
 "journal":["header","content","header"],"cursor":2,"active":"header"}
```

Roots are listed in set order. `history` (`explicit` | `typing-v1`) and
`selection` (`original` | `document-v1`) name the existing codec family that
restores the root; the root checkpoint string is unchanged. Decoding is strict
(unknown fields, versions, invalid or duplicate ids, journal or active ids naming
no root, out-of-range cursor are refused). Each restored root is then attached
and must match the journal exactly (`count before cursor == undo depth`, `count
after ≤ redo depth`); the set stays incomplete and unusable until every root is
attached.

## Shared collaboration (specified, deferred)

Chosen design: **one shared V4 room per root plus a client-side journal**, not
one room carrying several roots. A shared room carries exactly one document with
its own replica history, presence and archive; putting several roots in one room
would need a new shared document shape (a root container), which the frozen
grammar and the existing shared crate do not have.

1. Each root is an ordinary shared V4 room (room id derived from the set id and
   root id). Real-time editing, selective writer-local Undo, presence and
   archives work per root unchanged.
2. Each client keeps the same `RichRootSet` journal over its own writer-local
   groups. Shared Undo in a root is selective (it removes only this writer's
   group), so the global order is the client's own chronological order across
   rooms, exactly like CKEditor's per-user Undo across roots.
3. Root membership (add/remove/order/attributes) is replicated through a small
   **set manifest** owned by the relay or a dedicated manifest room, with
   last-writer-wins attributes and add-wins membership; a removed root's room is
   retained (detached), as CKEditor keeps detached roots in the model.

Why deferred: the shared replica Wasm exposes undo/redo counts but no
commit/join probe, so a shared journal cannot yet distinguish a new group from a
merged one without new shared-crate API; and the set manifest is a new
replicated contract (wire format, relay validation, archive inclusion) that the
existing shared crate does not provide. Both are additive; neither needs a
grammar change. Until then, a shared multi-root editor is N independent shared
editors without a common Undo order.

## Not done

- Undoable `addRoot` / `removeRoot` and undoable root attributes.
- Shared multi-root (above).
- Combined whole-set interchange export; cross-root Find/Replace (search runs per
  root).
