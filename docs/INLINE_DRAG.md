# Inline drag-and-drop

The local `RichDomEditor` (`@breditor/experimental-rich-content`) and the shared
`SharedDomEditor` (`@breditor/collaboration`) both handle native drag-and-drop of selected
inline content. It is always on; there is nothing to mount. Both editors use one
implementation, `mountRichTextDragPort(port)`, behind a small host port
(`RichTextDragPort`), exported from the package root and from
`@breditor/experimental-rich-content/rendering`.

The browser never edits the editable DOM on a drop: every drop over the surface is
prevented, and the result is published through the Rust owner.

## Dragging out

`dragstart` on a non-collapsed selection clears the browser's own serialization and writes
exactly the flavors Copy writes for that selection: `text/plain`,
`application/x-breditor-rich+json`, and `text/html`/`text/markdown` when a clipboard
interchange adapter is configured. A drag with nothing to copy is refused. A read-only
editor allows only `copy` (`effectAllowed="copy"`), so content can be dragged out of it but
never moved.

## Drop cursor

While content is dragged over the surface, `.breditor-text-drop-cursor` is a caret-like
vertical line at the resolved drop position. It is `aria-hidden="true"` and `inert`, and
it never takes focus or pointer events. Its position comes from
`document.caretPositionFromPoint` (or `caretRangeFromPoint`), mapped through the same DOM
projection as the selection (`richTextDropPoint`). A point over a mention chip snaps to the
chip's nearer edge. Other non-editable islands, such as images and task checkboxes, are not
targets.

The cursor has `data-state="valid" | "invalid"` and, over a refused target,
`data-drop-rejected="<reason>"`. Theme it with `--breditor-drop-color` and
`--breditor-drop-invalid-color` (shared with the block drag handle). Over a refused target
the browser shows its no-drop cursor (`dropEffect="none"`).

## Drops inside the same editor

A drag that started in this editor and drops in this editor is planned by
`resolveRichTextDrop(model, selection, target, effect)`:

| Result | Meaning |
| --- | --- |
| `drop` | A move or copy of the source range to the target. |
| `unchanged` | A move to either edge of its own source. Nothing is published. |
| `rejected: inside_source` | The target lies strictly inside the dragged range. |
| `rejected: source` | The selection is not one nonempty range inside one text block. Multi-block, node, grid and document selections can be dragged out, but not moved inside the editor. |
| `rejected: not_editable` | The pointer is not over editable text. |
| `rejected: incompatible` | Formatted text into a code block. |
| `rejected: read_only` | The editor is read-only. |

**Move or copy.** A drop is a move by default. Holding Alt/Option on Apple platforms, or
Ctrl elsewhere, makes it a copy (`richTextDropEffect`).

**Typing groups.** Under `typing-v1` history the open typing group is closed first, and the
drop is planned against that fresh publication, so a drop never merges into typed text.

**Local editor.** The drop is one guarded native command, at the planned revision:

```ts
{kind: "dropText", data: {source: <text selection>, target: <point>, effect: "move" | "copy"}}
```

The Rust session method `RichLocalSession::drop_text`
(`crates/breditor-core/src/rich_content/local_session/drop_text.rs`) plans two existing
`ReplaceTextRange` actions: delete the source, then insert the source's exact `TextFragment`
at the target. The second is captured against the staged post-deletion snapshot. Both are
dispatched as one group, so a move is one Undo step, never a copy and delete in two
history entries. Every run keeps its formats. A mention moves whole, with its entity
reference, and is never re-read from a clipboard or re-allocated. The dropped text is
selected afterwards. The command refuses a collapsed or multi-block source, or a target
inside the source, with `breditor_rich.text_drop`. Grammar, mention, restricted-editing and
read-only rules are enforced by the ordinary admission, and every refusal publishes nothing.

**Shared editor.** The drop is lowered by `sharedTextDrop` to one guarded shared batch at
the planned revision:

```ts
{commands: [
  {kind: "replace_text_range", data: {anchor: start, focus: end, runs: []}},       // move only
  {kind: "replace_text_range", data: {anchor: target, focus: target, runs: [...]}}, // exact source runs
 ], selectionUpdate: {kind: "set", value: <the dropped range>}}
```

The target offset is mapped through the deletion exactly as the local command maps it.
Rust stages the commands in order and adopts the group only if every part is admitted. It
is one writer-local Undo step. A concurrent remote edit either arrives before the drop
(and the source selection and model are mapped through it) or after it (and the existing
range semantics converge). A stale plan gets `stale_observation`, and nothing is
published. No new replicated command or merge rule is added.

## Drops from outside

A drop that did not start in this editor goes through the ordinary paste path. This
includes other applications and other Breditor editors on the same page. The caret is
placed at the drop position, then the same code that handles `paste` reads the
`DataTransfer` (private rich JSON, the configured HTML/Markdown interchange, or plain
text). A read-only editor refuses foreign drops. Files keep the existing file-drop
behaviour (`onFiles` / `onDocumentFiles`).

## Browsers

The rich browser spec `experiments/rich-browser/text-drag.spec.mjs` drives real mouse drags
against the release Wasm owner in Chromium, Firefox and WebKit (Playwright's builds): a
move with one Undo step, a modifier copy, and a refused drop into the source. Chromium on
macOS starts a text-selection drag only after the press is held briefly, so the spec waits
before moving. No engine needed a fallback. Native Safari, touch-initiated drag (iPadOS
and Android) and assistive-technology drag were not tested.

## Not covered

- Moving multi-block selections, node or grid selections, or whole documents by drag
  inside the editor. They can be dragged out as a copy. Use the block drag handle
  ([BLOCK_DRAG.md](BLOCK_DRAG.md), [SHARED_BLOCK_DRAG.md](SHARED_BLOCK_DRAG.md)) to move
  whole blocks.
- Moving between two editors. The target treats it as a foreign drop (paste), and the
  source keeps its content.
- Auto-scrolling while dragging is left to the browser.
- Keyboard equivalent: Cut and Paste.
