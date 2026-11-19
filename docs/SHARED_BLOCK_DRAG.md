# Shared block drag handle

`mountSharedBlockDrag(editor, options)` from `@breditor/collaboration` adds an opt-in
block drag handle to a mounted `SharedDomEditor`. It sits on top of the existing
typed `move_block` shared command. It does not add a new mutation path.

```ts
import {mountSharedEditor, mountSharedBlockDrag} from "@breditor/collaboration";
const editor = mountSharedEditor(host, {core});
const drag = mountSharedBlockDrag(editor, {policy: "sibling-v1"});
// later
drag.dispose();
```

Editors that do not call it behave exactly as before: no handle, no extra listeners, and
no reserved shortcut.

## Mutation contract

- Every accepted pointer drop or keyboard move sends exactly one
  `{commands: [{kind: "move_block", data: {block, parent, before}}]}` dispatch through
  `SharedDomEditor.execute`. The moved block keeps its block ID. Nothing is copied,
  deleted or re-inserted, and the DOM is never edited directly.
- The dispatch is guarded by the revision of the publication the move was planned
  from. A stale plan gets `stale_observation` and nothing is published.
- Rust `MoveBlock` stays the final authority. It rejects a missing source, a
  destination inside the source subtree, a before-anchor in another parent, and any
  result that breaks the rich grammar. It stages the whole group and adopts it only if
  every part succeeds, so a refusal is never a partial change. The handle reports the
  refusal as `onReject({reason: "native"})`, and the editor's own `onError` and status
  line still receive the error.
- One accepted move is one native publication, so one Undo step reverses it. Under
  `typing-v1` history the handle closes the open typing group first, so a move never
  merges into typed text.

## Semantic drop targets

A drop target is `{anchor, side: "before" | "after"}` on a rendered block.
`resolveSharedBlockMove(model, block, target, policy)` turns it into the existing
command or a typed rejection:

| Result | Meaning |
| --- | --- |
| `move` | Ready-to-dispatch `move_block` with the final `parent`/`before`. |
| `unchanged` | The drop would keep the current position. Nothing is dispatched. |
| `rejected: cyclic` | The anchor is inside the moved block's subtree. |
| `rejected: cross_container` | `sibling-v1` only: the anchor is in a different container. |
| `rejected: grammar` | The destination container does not admit this block type. For example, a paragraph cannot go directly into a list, a list item cannot go into a flow container, and a table cannot go into a table cell. |
| `rejected: empties_source` | The move would leave its source container with no children (all containers require at least one). |
| `rejected: item_lead` | A list or task item would no longer start with a paragraph or heading. |
| `rejected: not_movable` / `invalid_target` | The block or anchor is a table row or cell (use the row and column axis moves), an image caption, or another block outside a known container. |
| `rejected: read_only` / `unknown_block` / `boundary` | Read-only view, a missing ID, or a keyboard step at the edge of its container. |

Policies:

- `sibling-v1` (default) reorders a block only inside its current container.
- `flow-v1` also offers grammar-legal moves between flow containers: the document,
  blockquotes, list and task item bodies, and table cells. A table cannot be moved into
  a table cell.

The planner mirrors the closed V1 and V2 child grammars. Any rule it does not model
is still enforced by Rust, as described above.

During a pointer drag, the resolver starts at the deepest rendered block under the
pointer and works outward. It uses the first ancestor that admits the drop. For
example, when you drag a top-level paragraph over a paragraph inside a blockquote,
under `sibling-v1` it resolves to "before/after the blockquote".

## UI

- **Handle.** One floating `button.breditor-block-drag-handle` follows the hovered
  block, or the caret's block when the editor or handle gets focus. On the lead line
  of a list or task item, the handle stands for the whole item. It is hidden while the
  editor is read-only.
- **Drop cursor.** `.breditor-block-drop-indicator` is a horizontal line on the
  before or after edge of the resolved anchor. It has
  `data-state="valid" | "invalid"`, and the layer gets
  `data-drop-rejected="<reason>"` over a refused target. You can theme it with
  `--breditor-drop-color` and `--breditor-drop-invalid-color`.
- **Pointer.** Press the handle and move the pointer. Release to drop. Escape or
  `pointercancel` cancels the drag.
- **Keyboard on the focused handle.** The handle comes after the surface in tab order.
  - Enter or Space picks the block up (`aria-pressed="true"`).
  - The arrow keys and Home/End cycle through every admitted destination in document
    order, as listed by `sharedBlockDropTargets`, and show the drop cursor.
  - Enter or Space drops the block. Escape or blur cancels.
  - Alt+Shift+ArrowUp/ArrowDown moves the block one sibling slot.
  - Escape outside move mode returns focus to the editor.
- **Keyboard in the editor surface.** Alt+Shift+ArrowUp/ArrowDown moves the caret's
  block one sibling slot. This shortcut is reserved only while the handle is mounted.
  No existing shared or rich keymap binds it (Alt+PageUp/PageDown is flow navigation).
  On macOS it does replace the native Option+Shift+Up/Down "extend selection to
  paragraph" shortcut, so `editorShortcut: false` leaves those keys to the browser; the
  same keys on the focused handle keep working.
- **Busy editors.** A move requested while the editor is busy or composing is refused
  (`onReject` with `native`), never queued: a queued plan would be stale by the time
  the current work publishes. Success is reported only after the revision advanced.
- **Announcements.** Results are announced through a polite `role="status"` live
  region inside the layer.

## Not covered

- Native drag-and-drop of blocks between editors, and from or to outside the editor.
  File drop keeps its existing `onFiles` path.
- Moving several selected blocks at once.
- Auto-scrolling while dragging near the viewport edge.

The single-user `@breditor/experimental-rich-content` owner has the same handle through
`mountRichBlockDrag`, backed by the local `moveBlock` action. See
[BLOCK_DRAG.md](BLOCK_DRAG.md). Both editors share one handle and planner
implementation behind `mountRichBlockDragPort`; this package's `Shared*` exports are
thin adapters that keep their existing names and the `move_block` command.
