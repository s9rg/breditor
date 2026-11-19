# Local block drag handle

`mountRichBlockDrag(editor, options)` from `@breditor/experimental-rich-content` adds the
same opt-in block drag handle as the shared editor (see
[SHARED_BLOCK_DRAG.md](SHARED_BLOCK_DRAG.md)) to a single-user `RichDomEditor`.

```ts
import {mountRichEditor, mountRichBlockDrag} from "@breditor/experimental-rich-content";
const editor = mountRichEditor(host, {core});
const drag = mountRichBlockDrag(editor, {policy: "sibling-v1"});
// later
drag.dispose();
```

Editors that do not call it behave exactly as before: no handle, no extra listeners, and
no reserved shortcut.

## Native action

The local owner has one general structural move, `MoveBlock`
(`crates/breditor-core/src/rich_content/actions/move_block.rs`). It is exposed through
the Wasm command boundary and the `RichCommand` union as:

```ts
{kind: "moveBlock", data: {block: string, parent: string | null, before: string | null}}
```

- `block` is moved with its whole subtree and keeps its block ID and every descendant
  ID. Nothing is copied, deleted or re-inserted.
- `parent` is the destination container's block ID, or `null` for the document root.
  `before` is a direct child of that container, or `null` to append.
- Only the lowest common ancestor of the source and destination containers is
  rewritten, under an exact source guard. The result is then fully re-admitted against
  the active schema and host limits.

Capture refuses, with a typed `RichActionError`:

| Error | Meaning |
| --- | --- |
| `MissingTarget` | The block, parent or before-anchor does not exist. |
| `MoveSource` | The block is a table row or cell, an image caption, or another child outside a known container. Rows and columns keep their own axis moves. |
| `MoveCycle` | The destination is the block itself or inside its subtree. |
| `MoveAnchor` | The before-anchor is not a direct child of the destination. |
| `FlowParent` | The destination is not a container (document, blockquote, list or task item, table cell, bullet/ordered list, task list). |
| `FlowWouldBeEmpty` | The source container would be left with no children. |
| `MoveItemLead` | A list or task item would no longer start with a paragraph or heading. |

Child-grammar violations (a paragraph directly in a list, a list item in flow, a task
item in a bullet list, a table in a table cell) are refused by the full schema
admission when the action is applied. In every case nothing is published.

A move to the block's current position (`before` equal to itself or to its next
sibling, or appending the last child) is an admitted no-op: `Unchanged`, no history.

## History and selection

- One accepted move is one local history group. Undo restores the exact previous
  tree, every ID and the selection saved before the move; Redo restores the moved
  tree and the selection after it. The durable session checkpoint replays the same
  history.
- The selection is mapped by stable IDs, so a caret inside the moved block stays on the
  same block and offset.
- Read-only owners refuse the command (`breditor_rich.read_only`). Other refusals use
  `breditor_rich.command_rejected`, or `breditor_rich.command_json` for a malformed
  payload.

## UI

The handle, drop indicator, keyboard move mode, `sibling-v1`/`flow-v1` policies,
`editorShortcut` option, busy/composing refusal, rejection reasons and announcements
are identical to the shared handle. Both editors use one implementation,
`mountRichBlockDragPort(port, options)`, behind a small host port
(`RichBlockDragPort`). It supplies the surface, a presentation model, the editor
state, closing the typing group, and one guarded `dispatch(move, focus, revision)`. The
shared adapter lowers a move to `move_block`; the local adapter lowers it to
`moveBlock`. The planner (`resolveRichBlockMove`, `resolveRichBlockStep`,
`richBlockDropTargets`, `richSelectionBlock`, `richHandleBlock`, `isMovableBlock`) is
exported from both the package root and `@breditor/experimental-rich-content/rendering`.

A native refusal is reported as `onReject({reason: "native"})`. Unlike the shared
editor, the local `RichDomEditor.execute` throws the refusal to its caller instead of
reporting it to `onError`, so the handle catches it and only announces it.

## Not covered

The same limits as the shared handle apply: no drag between editors or from outside the
editor, no multi-block moves, no auto-scroll.
