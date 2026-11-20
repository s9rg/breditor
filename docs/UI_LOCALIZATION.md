# Editor chrome localization and UI direction

Status: opt-in browser presentation. It adds no document format, history family,
command, saved setting or Rust capability. English stays the default, and an
editor mounted without a catalog produces the same DOM and strings as before.

## Two separate directions

Breditor keeps **UI language/direction** and **content direction** apart:

| Concern | Set by | Applies to |
| --- | --- | --- |
| UI language and direction | `ui.lang`, `ui.direction` | Chrome only: the editor toolbar and status line, the selection toolbar and context menu, the slash-command menu, the column-resize badge, the block drag layer |
| Content direction | Each text block's existing layout direction (`breditor/block-direction`: `ltr`, `rtl`, `auto`), else inherited from the host page | The editing surface and rendered blocks |

`ui.direction` and `ui.lang` are written as `dir`/`lang` on chrome elements only.
The editor root, the editing surface (`role="textbox"`) and rendered blocks never
receive them, so an Arabic UI does not turn English content right-to-left and an
English UI does not flatten an RTL block. Blocks with a layout direction keep
rendering `dir` exactly as before. Blocks without one inherit from the surface's
ancestors, that is from the host page, as before.

A host that sets `<html dir="rtl">` for its whole application changes the
inherited direction of blocks without an explicit layout direction. That is
the host page's choice; the catalog never does it.

## Catalog shape

```ts
import type {RichUiOptions} from "@breditor/experimental-rich-content";
const ui: RichUiOptions = {
  lang: "ar", direction: "rtl",
  strings: {richToolbarLabel: "تنسيق النص", controlApply: "تطبيق {label}", slashCount: "الأوامر المتاحة: {count}"},
  controls: {bold: {label: "عريض"}, link: {label: "رابط", fields: {href: {label: "عنوان الرابط"}}}},
  slashItems: {"heading-1": {label: "عنوان 1", keywords: ["h1"]}},
};
```

- `strings` is a partial `RichUiStrings` override of `richUiStringsEn`. Every key
  is typed; unknown keys reject. Keys cover the editor and shared editor labels
  and status lines, toolbar widget text (`Apply {label}`, `{label} formatting`,
  `Choose…`, `Mixed`, the mixed-value hint), selection toolbar and context menu
  names, slash-command menu name/status/errors, column separator names and
  values, and block drag labels, help and announcements (including every move
  rejection reason).
- `controls` relabels admitted toolbar controls by their stable control id:
  `label`, `mixedHint`, and for controls with `fields`, each field's `label`,
  `placeholder` and select option labels keyed by the existing option value.
  The same localized widget is used by the toolbar, the selection toolbar and the
  context menu. Entries for ids the mounted toolbar does not admit are inert, so
  one catalog serves the original, structural and layout toolbars; a field or
  option an admitted control does not have rejects. Single-value controls
  (`type: "text" | "number"`) take only `label`. Hosts that build their own
  controls pass their own labels instead.
- `slashItems` relabels the standard slash items (`standardRichSlashPicks` ids)
  with `label`, `description` and `keywords`. Filtering uses the localized label
  and keywords; the stable id still matches, so `"hea"` finds the heading items in
  any language.

### Validation

`resolveRichUi(options)` (the SDK re-exports it as `resolveUiLocale`) validates
once and returns a frozen `RichUiLocale`; mount and SDK open functions call it
before any DOM, runtime or host work, so a bad catalog leaves the host
untouched.

- Plain objects only; at most 256 entries per map, 32 keywords per slash item.
- Every string is non-empty after trimming, at most 512 UTF-16 code units, with
  no C0/DEL control characters other than tab and line feed.
- `lang` is a BCP 47 shaped tag; `direction` is `ltr` or `rtl`.
- Templates are **plural-free and select-free**. A template may use only the
  `{name}` placeholders listed for its key (for example `{count}` in
  `slashCount`, `{index}`/`{count}` in `blockDragPosition`); any other brace
  rejects. Placeholders may be omitted or reordered. Values are inserted
  verbatim in one pass, so a value containing `{label}` is never re-expanded.
- The only count split is `slashCountOne` versus `slashCount`, which mirrors the
  existing English output. Languages with more plural categories should phrase
  counts without agreement (for example "Commands available: {count}").

Explicit per-tool `label` options (context UI `label`, slash `label`, block drag
`label`, column resize `label(index, count)`) still win over the catalog.

## Wiring

| Surface | Option | Tools pick it up from |
| --- | --- | --- |
| `mountRichEditor`, `mountDocumentRichEditor` | `ui` | `editor.uiLocale()` |
| `mountSharedEditor`, `mountSharedDocumentEditor` | `ui` | `editor.uiLocale()` |
| SDK `openLocalEditor`, `openLocalDocumentEditor`, `openSharedEditor`, `openSharedDocumentEditor` (and search variants) | `ui` | `editor.uiLocale()`; `mountSlashCommands(editor, …)` forwards it |
| React `BreditorEditor`, `BreditorDocumentEditor`, `BreditorSharedEditor`, `BreditorSharedDocumentEditor` | `initialOptions.ui` | same as above |

`RichContextUiHost`, `RichSlashCommandHost` and `RichTableColumnResizeHost` gain an
optional `uiLocale()`. Every DOM coordinator implements it; custom ports that omit
it keep the English defaults. `createRichSlashCommands(controls, picks, ui)`
accepts the locale so a custom provider can filter on localized labels.

Like `label`, `ui` is a startup option: it is read once when the editor mounts.
Changing languages means reopening the editor (the React components already
treat `initialOptions` as startup-only).

## Mirroring

Under `ui.direction: "rtl"`:

- Toolbars are flex rows inside a `dir="rtl"` element, so the first control sits
  at the right; menu items align to `start`.
- The context menu opens toward inline-start: its right edge meets the pointer
  or selection anchor. The slash menu extends left from the caret.
- In the floating selection toolbar, ArrowLeft moves to the next control and
  ArrowRight to the previous one.

Content-geometry tools follow the **content** direction instead:

- Column separators read the rendered table's computed direction. A
  right-to-left table lays column 1 out on the right, pointer drags toward the
  left widen a column, and ArrowLeft widens while ArrowRight narrows.
- The block drag handle sits in the inline-start gutter of the hovered block's
  computed direction (right of an RTL block).

The chrome placement checks read the nearest explicit `dir` attribute. A host
page that is itself `dir="rtl"` therefore gets the mirrored menu placement even
without a catalog; left-to-right pages are unchanged.

## Mixed-direction text

Text is retained as Unicode scalar sequences; Rust offsets stay logical. The
browser keeps native bidi caret movement (arrow keys move visually), and the
editor maps each native caret and range back to logical Rust offsets. The rich
browser suite (`experiments/rich-browser/localization.spec.mjs`) checks in
Chromium, Firefox and WebKit that after every arrow and Shift+arrow step in a
paragraph mixing Latin and Arabic runs the Rust selection equals the native
selection, and that a Rust selection over an Arabic run paints the exact native
range and is replaced by typing.

## Not covered

- Text-part language in rich V1–V3: those languages have no inline `lang`
  format. The unreleased local-only candidate rich V4 adds the native
  `breditor/text-language` format (`lang` on spans, a **Language** toolbar
  control and HTML `lang` interchange); see
  [RICH_LANGUAGE_V4.md](RICH_LANGUAGE_V4.md). Shared editing stays on V3.
- Translations: only English ships. The Arabic catalog in
  `packages/breditor-editor/tests/ui_locale_ar.ts` is test-only.
- Error messages thrown for API misuse, Rust/native refusals passed through as
  `Error.message`, and clipboard interchange notices stay English.
- Other opt-in panels (search, writing tools, fullscreen controls, review and
  suggestion panels) are not wired to the catalog yet.
- In Playwright's Firefox, non-layout characters arrive as IME composition, and a
  slash session ends on composition by design.

## AI and language tools

The opt-in rewrite review and language-check panels read their labels, buttons
and status messages from the editor catalog through separate `ai*` and `lang*` keys (a block kept in
`ui_locale_ai.ts`, merged into `RichUiStrings`), and take the catalog's chrome
`dir`/`lang`. Provider and document text are never translated; the "Editor
closed" notice and API-misuse errors stay English, as elsewhere. See
[AI_AND_LANGUAGE_TOOLS.md](AI_AND_LANGUAGE_TOOLS.md).
