# HTML source view

This document sets the compatibility scope for the V1 parity gap
`html-source-and-email` and describes the opt-in source view that implements
part of it.

## Compatibility scope

Breditor edits one canonical, schema-bound Rust document. HTML is a conversion
format, not the document. The source view is a different way to show and edit
that document. It never becomes a second source of truth.

### What the source view is

- A text view of the current document, produced by the explicit interchange
  adapter's sanitized semantic HTML export (`@breditor/interchange`,
  `bounded-semantic-html-v1`).
- A plain `<textarea>` where you can edit that text. The source is never put
  into a `contenteditable` element, and it is never parsed into the live page
  with `innerHTML`.
- An import path that runs the edited text through the same bounded HTML import
  and Rust clipboard admission as rich paste. It shows a loss report before
  anything changes, and it applies the result as one existing whole-document
  rich paste.

### What the source view is not

The source view does not round-trip arbitrary HTML or CSS. These are out of
scope, and the reasons are deliberate:

| Not supported | Why |
| --- | --- |
| Arbitrary HTML and CSS round trip | The document is a closed schema. Markup without a schema meaning cannot be stored without becoming an untyped side channel next to Rust history, collaboration and validation. The import keeps the allowlisted semantics and reports everything else as a loss. |
| Full-page `<html>`, `<head>`, `<title>`, `<meta>`, `<link>`, `<base>` | The editor owns a document body, not a page. Page metadata belongs to the host application. The import ignores it: `<title>`, `<meta>` and `<base>` leave no notice (producers emit them on every copy), while a stylesheet `<link>` reports `unsupported-style`. |
| Email layout markup (nested layout tables, `bgcolor`, `cellpadding`, `valign`, conditional comments, layout CSS such as padding) | Email layout is presentation for a specific client, not document structure. The import keeps only what has a schema meaning: a layout table becomes an ordinary content table, and `width`, `align` and font family map to column width, block alignment and font family. Everything else is dropped and reported. Hosts that send email should render it from the canonical document with their own template. |
| Scripts, event handler attributes (`onclick`, `onerror`, …), `javascript:` and other unsafe URLs, forms, `<iframe>`, `<object>`, `<embed>` | Executable or embedded content must never become trusted editor state. The import removes it and reports the removal. |
| Stylesheets kept as CSS | `<style>` rules and `style` attributes are not stored. Supported declarations are resolved into semantic formatting (for example a text color) and the rest are reported as `unsupported-style`. |
| Keeping an unsupported attribute, class or id | Attributes have no schema meaning. The import drops them and reports `unsupported-attribute`. |

These limits apply to every editor family. A host that needs full HTML or email
fidelity should store that HTML outside the editor and treat Breditor's export
as one input to its own renderer.

## Opt-in source view

The source view is available for the explicit document-selection editor
(`selectionEditing: "document-v1"`) that is mounted with an explicit
`clipboardInterchange` adapter. Only that family has the whole-document rich
paste command. The ordinary editor family, and shared or collaborative editors,
don't have a source view yet.

Nothing changes for editors that don't opt in. The demo pages don't mount it.

### Vanilla

```ts
import {mountDocumentRichEditor,mountRichSourceView} from "@breditor/experimental-rich-content";
import {createRichInterchange} from "@breditor/interchange";

const editor = mountDocumentRichEditor(host, {core, selectionEditing: "document-v1", clipboardInterchange: createRichInterchange(core)});
const source = mountRichSourceView(panelHost, editor.documentSource());
```

### SDK and React

```ts
import {openLocalDocumentEditor,mountSourceView} from "@breditor/editor";

const editor = await openLocalDocumentEditor({host, selectionEditing: "document-v1", clipboardInterchange: core => createRichInterchange(core)});
const source = mountSourceView(panelHost, editor.source());
```

```tsx
import {BreditorSourceView} from "@breditor/editor/react";

<BreditorSourceView editor={editor.source()} onApply={outcome => …} onError={error => …}/>
```

The panel host must be separate from the editing surface. Disposing the panel
releases only the panel. It never disposes the editor.

## How it works

### Open and export

`readDocumentSource()` selects the whole document if it isn't already selected.
This is a selection-only publication, not a content change and not an Undo step.
It then reads `copyDocument()` and passes the native clipboard JSON to the
adapter's `exportHtml`. The result is a frozen read with:

- `revision`: the guard for everything that follows,
- `html`: the sanitized semantic HTML, which the panel puts into the textarea as
  its `value`,
- `losses`: what the export could not represent (for example an image without a
  host `exportImage` mapping).

Export losses are shown in the review report, because applying any edited source
drops that content from the document.

### Edit

You edit plain text. Every edit invalidates an earlier review, so **Apply** is
disabled until you review again. A size counter shows the UTF-8 byte count
against the 1 MiB limit.

### Review: the loss report

`previewDocumentSource(source, read)` makes no changes. It:

1. refuses when the editor is disposed, busy, composing, read-only or at a
   different revision from the read,
2. refuses a source over 1 MiB of UTF-8 without parsing it (the same
   `sourceBytes` limit the adapter and the clipboard string budget use); the
   adapter still enforces its own node, depth, table and style limits,
3. treats a source that is byte-identical to the export as unchanged, so that
   applying it is a no-op,
4. otherwise imports it with `importHtml(source, {kind: "flow"})`. This runs the
   bounded parser, allowlist and Rust `admitClipboardRoot` admission.

The preview reports `applicable`, an interchange `error` code when the import is
refused, and the aggregated `losses` (`removed-content`,
`unsupported-attribute`, `unsupported-element`, `unsupported-style`,
`unsafe-link`, `image-reference`, …). The panel shows each loss as text with
`textContent`. No source text, URL or CSS is echoed.

The admitted clipboard JSON stays private to the host that issued the preview.
The preview object carries no mutation authority.

### Apply: one command, one Undo step

`applyDocumentSource(preview)` accepts only a preview from the same host, once.
It checks again that the editor is idle, writable and still at the revision
captured when the view opened. If that check fails, it refuses with:

> The document changed after the source view opened (revision A, now B).
> Nothing was applied; reload the source to edit the current document.

The panel also notices the change through `subscribeSource`. It disables
**Apply**, shows the message and offers **Reload source**, which discards the
edits and exports the current document.

When the checks pass, the host calls the coordinator's existing
`pasteDocumentClipboard(clipboardJson, revision)`. That is the same guarded
whole-document rich paste that a paste over a document selection uses. Rust
validates the observation, re-keys every identity under a fresh reserved
namespace, replaces the document, and records it as one Undo group.

Whole-document flow paste always appends one fresh empty paragraph, and the
export shows that paragraph as `<p></p>`. To keep export, edit and apply stable,
the import drops exactly one trailing empty paragraph from the source before
parsing.

**Cancel** discards the source and the review and closes the view.

### Read-only

A read-only editor opens a view-only source. The textarea is `readOnly`,
**Review** and **Apply** are hidden, and the host refuses preview and apply with
"This document is read-only; its source can be viewed but not applied". Rust
read-only enforcement still refuses the paste on its own.

## Known limits

- Any revision change after the view opens makes it stale. That includes a
  selection change in the editor and a read-only toggle. This is conservative on
  purpose: the native guard is the publication revision.
- Opening the view selects the whole document.
- Images need the adapter's `resolveImage` and `exportImage` host hooks.
  Without them, exported images are reported as `image-reference` and come back
  as text.
- Applying a source that changed only in content the export cannot show still
  replaces those parts with their exported form. Review the export losses before
  applying.

## Evidence

- `packages/breditor-editor/tests/source_view.test.ts` (jsdom): runs the real
  `@breditor/interchange` sanitizer over a stubbed native owner. It covers
  export, edit and apply as one paste and one Undo step; script, style, handler,
  iframe and unsafe-link stripping reported before any mutation; full-page
  metadata and email layout attributes that are not kept; refusal on a
  stale revision; the read-only view; the size limit before parsing; no-op for
  unchanged source; Cancel; refusal of a foreign or reused preview; and adapter
  and host requirements.
- `packages/breditor-editor/tests/source_view_react.test.tsx`: the React wrapper
  borrows the panel and disposes only the panel.
- `experiments/rich-browser/source-view.spec.mjs` (Chromium, Firefox, WebKit):
  release Wasm document owner, real bounded adapter, real input. It covers
  executable content that never runs or persists, one Undo step, a stable
  re-apply, a stale refusal, the read-only view and the size limit.
