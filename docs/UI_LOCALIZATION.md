# Editor chrome localization and UI direction

Status: opt-in browser presentation. It adds no document format, history family,
command, saved setting or Rust capability. English stays the default, and an
editor mounted without a catalog produces the same DOM and strings as before.

## Two separate directions

Breditor keeps **UI language/direction** and **content direction** apart:

| Concern | Set by | Applies to |
| --- | --- | --- |
| UI language and direction | `ui.lang`, `ui.direction` | Chrome only: the editor toolbar and status line, the selection toolbar and context menu, the slash-command menu, the column-resize badge, the block drag layer, and the opt-in panels (search, writing tools, fullscreen controls, review/comments, named versions, suggestions) |
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
  notices: {"unsafe-link": "روابط غير آمنة"},
  refusals: {"breditor_rich.read_only": "المستند للقراءة فقط."},
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
- `notices` relabels interchange notice codes (`richUiNoticeCodes`: the foreign
  HTML/Markdown loss codes such as `unsafe-link` and `markdown-feature`, and the
  caption/code paste losses such as `inline-formatting`). Unknown codes reject.
  Without an entry a code displays as itself, exactly as before.
- `refusals` maps stable refusal codes (`breditor_rich.read_only`,
  `breditor_rich.search_query`, relay codes such as `permission_denied`, …) to
  end-user messages for status lines. Keys are lowercase dotted codes; see
  [Developer and end-user messages](#developer-and-end-user-messages).

### Validation

`resolveRichUi(options)` (the SDK re-exports it as `resolveUiLocale`) validates
once and returns a frozen `RichUiLocale`; mount and SDK open functions call it
before any DOM, runtime or host work, so a bad catalog leaves the host
untouched.

- Plain objects only; at most 256 entries per map (`strings` may hold every
  known key), 32 keywords per slash item.
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

`RichContextUiHost`, `RichSlashCommandHost`, `RichTableColumnResizeHost`,
`RichSearchHost`, `RichWritingToolsHost` and `RichFullscreenHost` gain an optional
`uiLocale()`. Every DOM coordinator implements it (so `editor.search()`,
`editor.writing()` and `editor.fullscreen()` carry it); custom ports that omit it
keep the English defaults. `createRichSlashCommands(controls, picks, ui)` accepts
the locale so a custom provider can filter on localized labels.

### Panels

| Panel | Keys | Catalog comes from |
| --- | --- | --- |
| `mountRichSearchPanel` / `BreditorSearchPanel` | `search*`, `panel*` | the search host's `uiLocale()` (`label` option still wins for the accessible name) |
| `mountRichWritingTools` / `BreditorWritingTools` (counts, outline) | `writing*`, `panel*` | the writing host's `uiLocale()` (`label` option still wins) |
| `mountRichFullscreenControls` / `BreditorFullscreenControls` | `fullscreen*` | `controller.uiLocale()`, which `createRichFullscreen` forwards from its host (`enterLabel`/`exitLabel` still win) |
| `mountSharedReviewPanel` / `BreditorSharedReviewPanel` (comments, original quotes, named versions) | `review*`, `version*`, `sync*` | the `ui` option, normally `editor.uiLocale()`; nested suggestion controls inherit it |
| `mountSharedSuggestionPanel` / `BreditorSharedSuggestionPanel` | `suggest*`, `sync*` | the `ui` option, normally `editor.uiLocale()` |
| Status lines of both editors (clipboard interchange, caption/code paste) | `clipboard*`, `pasteTarget*`, `notices` | the editor's own catalog |

The review and suggestion panels borrow a native facade rather than an editor,
so they take the catalog explicitly:
`mountSharedReviewPanel(host, core, {policy, ui: editor.uiLocale()})`. React
components pass it in `initialOptions.ui`; their "could not start" alerts use
the same catalog. The standard suggestion actions
(`standardSharedSuggestionActions`) are relabelled, including their fields and
choices; host-supplied actions keep their own labels. Several English defaults
are bare state codes (`syncReady: "ready"`, `reviewStateOpen: "open"`) because
that is what those panels displayed before.

Composite status lines are built from small templates rather than string
concatenation: `panelStatusPart` (`{status} · {part}`) appends a qualifier,
`panelSentences` (`{first} {second}`) appends a sentence, and
`panelListSeparator` / `panelGroupSeparator` join lists, so a translation can
reorder or re-punctuate them.

The English defaults are pinned: `packages/breditor-editor/tests/__baseline__`
holds every panel's markup across its states as recorded before the catalog
existed, and `ui_locale_panels_baseline.test.ts` replays the same scenarios with no
catalog and with an explicit empty one and requires byte equality.

Document-derived values shown in chrome (outline headings, comment authors and
text, original quotes) are wrapped in `<bdi>` when the catalog names a direction,
so an English heading keeps its own direction inside RTL chrome. Without a
catalog direction the markup is unchanged.

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
- Panels are flex rows, grids and lists inside a `dir="rtl"` root, so the search
  fields, buttons and writing-tools counts lay out from the right, and outline
  entries align to the inline start. Tab order is the logical DOM order (Find,
  then the options, then Replace with, then the buttons) whatever the visual
  mirroring.
- Lists keep logical keyboard order: in the writing-tools outline ArrowDown/Up
  move to the next/previous heading in document order and Home/End to the
  first/last, under LTR and RTL alike; Left/Right are left to the browser. The
  search panel has no result list: Enter and Shift+Enter in Find (and the
  Next/Previous buttons) move through matches in document order.

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

The same suite mounts the search panel and writing tools under an Arabic RTL
catalog and checks the mirrored layout, logical Tab order, catalog status lines
(including a mapped native refusal code), `<bdi>` isolation of an English
heading, and outline arrow keys driving the real Rust selection.

## Developer and end-user messages

Breditor keeps two audiences apart:

- **Thrown errors are for developers and stay English.** `Error.message` of API
  misuse, native refusals (`RichCommandError` and relay errors carry a stable
  `code`) and panel refusals is never translated, so logs, `onError` callbacks
  and bug reports stay greppable.
- **Status lines are for end users.** Every editor and panel status line goes
  through `RichUiLocale.describe(error, otherwise)`:
  1. a panel refusal created with `richUiError(key)` (for example "Search
     actions wait for the current editor operation or composition") shows the
     catalog text for its key; its thrown message is the English default;
  2. otherwise an error whose stable `code` (or whose message is itself a code)
     has a `refusals` entry shows that entry;
  3. otherwise the English `Error.message` is shown, as before.
- **Interchange notices** keep their stable codes in `onInterchange` reports;
  the status line labels them through `notices` (`RichUiLocale.notice(code)`).

With no catalog, steps 1 and 2 reproduce the English text byte for byte, so the
default output is unchanged. Locales and panel refusals are recognized across
copies of the module (registered symbols), so a locale from one bundle works
with panels from another.

## Not covered

- Text-part language in rich V1–V3: those languages have no inline `lang`
  format. The unreleased candidate rich V4 adds the native
  `breditor/text-language` format (`lang` on spans, a **Language** toolbar
  control and HTML `lang` interchange), locally and in shared V4; see
  [RICH_LANGUAGE_V4.md](RICH_LANGUAGE_V4.md) and
  [SHARED_RICH_V4.md](SHARED_RICH_V4.md).
- Translations: only English ships. The Arabic catalog in
  `packages/breditor-editor/tests/ui_locale_ar.ts` is test-only.
- Thrown `Error.message` text stays English by design (see above). Native
  refusals without a `refusals` entry, and host-adapter errors without a stable
  code, still show their English message in status lines; `refusals` has no
  shipped translations because the code set is open-ended.
- Raw host data shown verbatim stays as supplied: JSON comparison/preview blocks
  in the review and suggestion panels (only their `notice` sentence is
  localized), revision outbox status strings, and identifiers.
- The HTML source view's loss list (`mountRichSourceView`) keeps its own English
  descriptions and is not wired to the catalog.
- In Playwright's Firefox, non-layout characters arrive as IME composition, and a
  slash session ends on composition by design.

## AI and language tools

The opt-in rewrite review and language-check panels read their labels, buttons
and status messages from the editor catalog through separate `ai*` and `lang*` keys (a block kept in
`ui_locale_ai.ts`, merged into `RichUiStrings`), and take the catalog's chrome
`dir`/`lang`. Provider and document text are never translated; the "Editor
closed" notice and API-misuse errors stay English, as elsewhere. See
[AI_AND_LANGUAGE_TOOLS.md](AI_AND_LANGUAGE_TOOLS.md).
