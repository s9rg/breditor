# Rich tables: column resize handles and nested-table policy

This note covers two parts of the `advanced-tables` V1 parity entry: accessible
column resize handles, and the explicit nested-table policy. Table captions
exist in rich V4 only (one trailing caption paragraph per
table; see [RICH_LANGUAGE_V4.md](RICH_LANGUAGE_V4.md), Slice 6). Table/cell
presentation panels and broader rich paste are separate work.

## Horizontal table scrolling

Local and shared editor mounts accept `scrollableTables: true`. Wide tables
then stay inside the editor with a horizontal viewport. Use the Left and
Right controls, a scrollbar, or a touch gesture. The buttons also accept
Left and Right arrow keys. A render following an edit, resize or remote publication retains the
table's scroll offset when the table still exists. The setting is view-only
and has no effect on saved documents or copied table content.

## Column resize handles

`mountRichTableColumnResize(overlay, host, {commit})` from
`@breditor/experimental-rich-content` (re-exported by `@breditor/collaboration`
as `mountSharedTableColumnResize`) adds one handle at the right edge of every
visible table column. You opt in to it. Editors that don't call it are
unchanged.

```ts
import {mountRichTableColumnResize, richTableColumnResizeCommit} from "@breditor/experimental-rich-content";
const resize = mountRichTableColumnResize(overlayHost, dom, {commit: richTableColumnResizeCommit(dom)});
// shared editor:
import {mountSharedTableColumnResize, sharedTableColumnResizeCommit} from "@breditor/collaboration";
const shared = mountSharedTableColumnResize(overlayHost, sharedDom, {commit: sharedTableColumnResizeCommit(sharedDom)});
// later, before disposing the editor:
resize.dispose();
```

### Host and ownership

- `host` is a structural port that `RichDomEditor` and the shared DOM editor
  already satisfy: `surface`, `writingState()`, `subscribeWriting()` and
  `view()`. Handles read column geometry from `view().tables`. They read
  rendered table rectangles only to place themselves.
- `overlay` must be an unused element in the same document, outside editable
  content (mounting inside the surface throws). Handles are placed in an
  absolutely positioned layer that is measured in viewport coordinates, so the
  overlay can sit anywhere, for example as a sibling of the editor root. The
  layer repositions on every publication notification, window resize,
  document scroll and surface `ResizeObserver` callback.
- Handles never change editor DOM. All width changes go through the
  existing action API:
  - local owner: one `{kind:"resizeTableColumn", data:{table, column, width}}`
    sent through `dom.execute(command, false, revision)`;
  - shared owner: one `{commands:[{kind:"resize_column", data:{block, column, width}}]}`
    sent through `dom.execute(dispatch, false, revision)`.

  `revision` is the publication current at commit time. The Rust
  `ResizeColumn` action also records the width it expected, so a stale target is
  rejected rather than overwritten.

### Pointer drag

- `pointerdown` (primary button) captures the pointer and focuses the handle.
- `pointermove` changes only an overlay guide line, a width badge and the
  handle's `aria-valuetext`. Nothing is published while dragging. The pixel
  delta is divided by the rendered-to-model scale, so the width stays correct
  when the table is shrunk by `max-width`.
- `pointerup` publishes **exactly one** width command, which makes one Undo step
  and, in shared rooms, one causal operation. Nothing is published if the width
  did not change.
- Widths are rounded and clamped to the admitted Rust domain
  `RICH_TABLE_COLUMN_WIDTH_MIN..RICH_TABLE_COLUMN_WIDTH_MAX` (32..4096 logical
  pixels, `ResizeColumn::capture`).
- A drag is cancelled without publishing on:
  - `Escape`, handled on the handle or in a capturing document listener;
  - handle blur or window blur;
  - `pointercancel` or `lostpointercapture`;
  - the editor becoming read-only, composing or closed;
  - any publication, local or remote, that changes the dragged table's rows,
    columns, widths or hidden state, or removes the table.

  `options.onCancel(reason)` reports the reason. Publications that don't touch
  the table (for example remote typing elsewhere) leave the drag running, and
  the commit then uses the newer revision.

### Keyboard and accessibility

Each handle is a focusable `role="separator"` with `aria-orientation="vertical"`,
`aria-valuenow` (the committed width), `aria-valuemin="32"`, `aria-valuemax="4096"`,
`aria-valuetext` (for example "160 pixels") and an `aria-label` of the form
"Resize column 2 of 3" (`options.label` overrides it).

| Key | Effect |
| --- | --- |
| ArrowLeft / ArrowRight | −/+ `step` (default 8 px) |
| Shift+Arrow, PageDown / PageUp | −/+ `largeStep` (default 64 px) |
| Home / End | minimum 32 / maximum 4096 |
| Escape | cancels an active pointer drag |

Each accepted key publishes one command, so it is one Undo step, as with any
value control. Keys that would not change the width publish nothing.
Publishing with `focus=false` keeps keyboard focus on the handle, and handles
are reused across renders by `(table, column)` identity, so focus survives
the commit.

While the editor is busy or composing, handles show `aria-disabled="true"` and
publish nothing. Read-only editors and hidden tables get no handles.

### Lifetime

`dispose()` cancels any drag, unsubscribes, disconnects observers and removes
the layer. It never disposes the editor. Call it before disposing or replacing
the editor. `cancel()` cancels an active drag. `preview()` returns the
in-progress `{table, column, start, width}` or `null`.

## Nested-table policy

Nested tables are **intentionally unsupported** in the admitted rich grammar.
This is a deliberate product boundary, not an accidental omission. The rules
below describe what happens today, and they are tested.

1. **Grammar.** A `breditor/table` may not contain another `breditor/table` at
   any depth. Intermediate cell content such as quotes, list items or task
   bodies does not change this. Native schema validation
   reports `document.nested_table` ("tables cannot contain tables",
   `crates/breditor-core/src/schema/rich_content_validation.rs`).
2. **Local actions.** `insert_table`, table cell paste and flow paste check
   for nested tables before publishing. An action that would nest a table is
   rejected as a whole, and the document and history are unchanged.
3. **HTML import** (`@breditor/interchange`). A `<table>` anywhere inside a
   table cell's flow rejects the **whole** import with `unsupported-content`
   before native admission. The nested table is not flattened to text, the
   inner table is not lifted out, and the outer table is not imported partially.
   See `packages/breditor-interchange/src/html_import.ts` (`insideTable`) and
   `tests/nested_table_policy.test.ts`.
4. **Markdown import.** GFM pipe tables cannot nest. Markdown is rendered to
   sanitized HTML and goes through the same importer, so raw HTML nested
   tables inside Markdown are rejected the same way.
5. **Browser paste.** When a DOM editor has a `clipboardInterchange` adapter,
   pasting foreign HTML or Markdown that contains a nested table is rejected
   ("Clipboard HTML conversion was rejected"). The error goes to the status
   line and `onError`, and the document is unchanged. Nothing falls back to
   plain text silently. Without an adapter, only `text/plain` is read, so
   no structure is imported. Breditor's own clipboard format cannot carry a
   nested table, because it is built from admitted documents.
6. **Collaboration.** Concurrent moves can combine into a placement that would
   nest one table inside another. The shared placement resolver keeps both
   subtrees: it either suspends the ancestor move or shows the inner table at
   a reserved root occurrence. No content is dropped (see
   `RICH_CONTENT_AND_COLLABORATION.md`).
7. **Export.** HTML and Markdown export never produce nested tables, because the
   model cannot hold them.

Supporting nested tables later would mean changing the grammar, the native
geometry, merge and selection model, the clipboard format, interchange, and
shared placement, together under a new versioned rich language. It cannot be
added in the importer alone.
