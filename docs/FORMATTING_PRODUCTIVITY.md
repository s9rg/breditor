# Formatting productivity: special characters, case change, format painter and named presets

Status: implemented opt-in contract for the unpublished `0.3.0-alpha.22` source
checkpoint (local and shared rich editors)

Opt-in toolbar tools compared against CKEditor 5's
[special characters](https://ckeditor.com/docs/ckeditor5/latest/features/special-characters.html),
[case change](https://ckeditor.com/docs/ckeditor5/latest/features/case-change.html),
[format painter](https://ckeditor.com/docs/ckeditor5/latest/features/format-painter.html),
[style](https://ckeditor.com/docs/ckeditor5/latest/features/style.html) (inline styles) and
[highlight](https://ckeditor.com/docs/ckeditor5/latest/features/highlight.html).
Every edit is an existing or new **native** command with exact history (one Undo
step per user action); local and shared editors behave the same; the default
toolbars, documents, checkpoints and profile descriptors are unchanged unless a
host adds the controls.

```js
import {createRichToolbarV4,createFormattingProductivityToolbar} from "@breditor/experimental-rich-content";
const toolbar=[...createRichToolbarV4(core,presentation),...createFormattingProductivityToolbar(core,presentation,{
  specialCharacters:{categories:[{id:"emoji",label:"Emoji",characters:[{character:"👍",name:"Thumbs up"}]}],order:["text"]},
  caseChange:{locale:"tr",titleMinorWords:["a","an","the","of"]},
  namedPresets:{styles:[{id:"big-red",label:"Big red",marks:["bold"],textColor:"#FF0000",textSize:24}],highlights:richDefaultHighlightPresets},
})];
// Shared owners: createSharedFormattingProductivityToolbar(sharedCore,presentation,options) from @breditor/collaboration.
```

Options: `specialCharacters` (`false` omits; otherwise catalog options),
`caseChange` (`false`; `locale`, `titleMinorWords`, `shortcut:false` drops
Shift+F3), `formatPainter` (`false`; `shortcuts:false` drops Mod+Alt+C/V) and
`namedPresets` (default off; `{styles,highlights}` registry, see below).
Case change is included only when the owner reports `supportsCaseChange()`; the
painter and the named-preset dropdowns only when it reads native selection
formats (`supportsSelectionFormatting()`).

| Control id | Kind | Command |
| --- | --- | --- |
| `special-characters` | panel (picker) | local `insertPlainText` at a caret / `replaceTextRange` over a range; shared `type` / `replace` |
| `case-upper`, `case-lower`, `case-title` | buttons | local `changeSelectionCase`; shared `change_selection_case` |
| `format-painter` | toggle button (`aria-pressed`) | local `changeSelectionFormats`; shared `changeSelectionFormats` |
| `named-styles`, `highlight-presets` | dropdown (select field + Apply) | local `changeSelectionFormats`; shared `changeSelectionFormats` |

## Special characters

A searchable picker in a toolbar panel. Built-in categories: `currency`,
`mathematical`, `arrows`, `latin` and `text` (typography, quotes, spaces). The
picker has a search field (matches every term against the localized name, the
English name, the `U+XXXX` code point and the character), a category choice and
an ARIA `grid` with one roving tab stop: arrows, Home/End, Ctrl+Home/End,
PageUp/PageDown, ArrowUp from the first row back to search, ArrowDown from search
into the grid, Enter/Space inserts. A polite live region reports the match count.
Each cell's accessible name is "name (U+XXXX)". Mod+Alt+S opens the picker from
the editing surface; Escape closes it and returns focus to the editor.

Insertion is ordinary native text input: one history group, the caret's
effective (pending) formats apply exactly as for typed text, and a range is
replaced. The intent is refused unless the text is a character of the mounted
catalog.

Host categories are validated and frozen by `createSpecialCharacterCatalog`:
category ids match `[a-z][a-z0-9-]{0,31}`, labels and names are nonempty
single-line strings (64/128 characters), a character is 1–16 UTF-16 units of
well-formed text without control characters, unique within its category; at
most 32 categories, 1,024 characters per category and 4,096 in total. An
existing id (built-in or earlier) appends characters, like CKEditor's
`addItems`; `order` lists category ids first (unknown ids reject); `builtIn:false`
drops the built-in set.

Localization: picker chrome uses the UI catalog strings
`specialCharactersSearch`, `specialCharactersCategory`, `specialCharactersAll`,
`specialCharactersGrid`, `specialCharactersCount(One)`, `specialCharactersEmpty`
and `specialCharacterItem`. Names come from the new `RichUiOptions.specialCharacters`
entry: `{categories:{currency:"Währung"},characters:{"€":"Eurozeichen"}}`. Toolbar
labels use the ordinary `controls` catalog by control id.

## Case change

`changeSelectionCase` is a native Rust command (`RichLocalSession::change_selection_case`,
Wasm command kind `changeSelectionCase`, capability `caseChangeVersion()=="1"`,
TS `supportsCaseChange()`), available in every rich language. Intent:
`{"change":"upper"|"lower"|"title"|"cycle","locale"?:tag,"titleMinorWords"?:[word…]}`
(strict JSON, at most 256 minor words of 1–32 bytes of letters/apostrophes).

- **Scope.** A range (text, node or grid selection) changes every selected text
  block through native selection coverage; a collapsed caret changes its whole
  block (CKEditor behavior). Code blocks and captions are text and are included.
- **Unicode mapping.** Full default Unicode case mapping: `ß`→`SS`, `ﬁ`→`FI`,
  Greek final sigma when lowercasing (context is the whole block; case-ignorable
  characters are approximated by apostrophes, periods, colons, the middle dot,
  soft hyphen and combining diacritics U+0300–U+036F), and titlecase digraphs
  (`ǆ`→`ǅ`), ligatures (`ß`→`Ss`, `ﬁ`→`Fi`) and Greek iota-subscript capitals.
- **Locale.** Mapping is locale-independent unless the request names a locale.
  A `tr` or `az` primary subtag enables Turkic dotted/dotless i (`i`↔`İ`,
  `ı`↔`I`); every other well-formed tag uses the default mapping (Lithuanian
  dot retention is not implemented). The run's `breditor/text-language` format is
  deliberately not consulted: the explicit request is the single source of truth.
- **Title Case.** UAX #29 words of the whole block: each word's first cased
  letter is titlecased and the rest lowercased (acronyms are not preserved).
  Minor words stay lowercase except as the first or last word of the block or
  after `.`, `!`, `?`, `:`, an em dash or a line break. The default English list
  is CKEditor's documented example: a, an, and, as, at, but, by, en, for, if, in,
  nor, of, on, or, per, the, to, via, vs. `titleMinorWords:[]` disables it.
- **Shift+F3** sends `cycle`; Rust resolves it from the selected text:
  UPPER → lower → Title → UPPER; mixed text becomes UPPER.

**Formats and identities.** The plan is a set of checked semantic splices over
the exact source (the native search replacement plan). Each splice is a maximal
run of changed scalars inside one format run and receives that run's exact
format set, so formats, property maps, block identities and structure are
preserved and a length change cannot shift text across a run boundary. Unchanged
scalars (spaces, digits, already-correct letters) are never rewritten, which also
keeps their shared character identities. More than 4,096 splices fall back to one
splice per changed run interval; beyond the native replacement budget the request
is refused atomically.

**Mentions** are never altered: a mention's text is its immutable `@label`
snapshot, so mention runs are skipped (an all-mention selection is unchanged).

**History.** One candidate, one history group with a recovered forward/inverse
rewrite (exactly like Replace All); Undo/Redo and Session Checkpoint replay the
recipe, never the mapping. A request that changes nothing publishes nothing. The
selection keeps its direction and affinities and still covers the changed text
(offsets move with length changes); a caret keeps its offset in its block.

**Shared.** `RichReplica::change_selection_case_json_guarded` (Wasm
`change_selection_case`, `case_change_version()`) plans with the same native
function against the shared projection and lowers each splice to the existing
`ReplaceTextRange` command carrying the run's formats, in descending order, as one
guarded dispatch: one writer-local Undo step, staged result checked against the
complete core candidate before adoption. No new replicated command or merge rule
exists; concurrent edits converge through existing range semantics. A peer's
insertion survives the case change and its Undo; because a changed scalar is a
deleted and re-inserted character (a text CRDT cannot change a character in
place), Undo restores fresh characters and a concurrent insertion directly next
to a changed word may then order on the other side of that word. Unchanged
scalars keep their identities, so insertions next to them stay put.
The document-selection family is refused.

## Format painter

Follows CKEditor: copies **inline text formatting only**—the standard inline
formats the presentation renders (bold, italic, underline, strike, inline code,
sub/superscript, text and background color, text size, font family). Links,
mentions and text language are content/semantics and are never copied or
painted; block layout is not painted. Named presets are not a format of their
own, so the painter copies the typed formats a preset produced, never the preset.

- Click the button: copy the formats that are uniform at the caret or across the
  selection; the button becomes `aria-pressed=true` (single use).
- Click twice quickly (double-click, within 500 ms): repeated (sticky) mode.
- Apply by selecting text with the pointer (applied when the pointer is
  released; a plain click does not apply) or with Mod+Alt+V (also at a caret,
  where it sets the pending typing formats). Single-use mode turns off after one
  application.
- Escape in the editor, or the button again, cancels. Mod+Alt+C copies.

Applying is one native `changeSelectionFormats` request (one Undo step): set each
copied format that differs and remove every other painted kind present in the
target. Nothing is published when the target already matches. Painter state is
presentation state of the control instance; it never enters the document,
history, checkpoints or shared frames. Announcements (`formatPainterCopied`,
`formatPainterSticky`, `formatPainterApplied`, `formatPainterCancelled`,
`formatPainterNothing`) use a polite status next to the button.

Mod+Alt shortcuts match the physical key (`KeyboardEvent.code`) and ignore
AltGraph, so AltGr text input keeps working.

## Toolbar hook-ups

`RichControlPresentation` gains two optional members used by these tools and
available to other opt-in controls: `panel(body, port)` (a custom panel body
instead of fields; `port.apply(fields)` runs the owner's command path) and
`attach(port)` (one editing-surface attachment per surface; `port.run(fields)`
syncs the native selection and runs the command path, `port.activate()` acts like
the button). Local and shared coordinators pass their surface to
`mountToolbarControl`. Existing controls are unaffected.

## Named styles and highlight presets

Catalog case `named-formatting-presets@1`. A host registers **named inline
styles** ("Big red", "Code-ish") and **highlight presets** ("Yellow marker",
"Red pen"). A preset is only a validated, frozen bundle of the existing typed
standard-profile formats; it has no document identity, so the document,
history, checkpoints, interchange and the shared protocol are unchanged.

```js
namedPresets:{
  styles:[{id:"big-red",label:"Big red",marks:["bold"],textColor:"#FF0000",textSize:24},
          {id:"code-ish",label:"Code-ish",marks:["code"],fontFamily:"mono"}],
  highlights:richDefaultHighlightPresets, // or the host's own list
}
```

**Registry** (`createNamedFormatPresetRegistry`, also run by the toolbar
factories; any error is a `TypeError` naming the entry). Plain objects only, no
accessors or unknown keys. Each preset: `id` matching `[a-z][a-z0-9-]{0,31}`,
unique within its group, `remove` reserved; `label` a nonempty single line of at
most 64 characters (the host localizes it); and at least one of `marks` (`bold`,
`italic`, `underline`, `strike`, `code`, `subscript`, `superscript`; no repeats,
not both scripts), `textColor`/`backgroundColor` (`#RRGGBB`, RGB24), `textSize`
(integer pixels 8–96) and `fontFamily` (`system`, `sans`, `serif`, `mono`).
Links, mentions, text language and block formats cannot be part of a preset. At
most 32 presets per group. Every preset format must be rendered by the mounted
inline presentation. `richDefaultHighlightPresets` (four markers and two pens,
CKEditor's defaults) is exported but never installed implicitly.

**Controls.** Each nonempty group adds one dropdown with the existing toolbar
control contract (a `details` panel, one `select` field `preset`, an Apply
button, Escape/Enter, stale-draft guard): `named-styles` and
`highlight-presets`. The select lists the group's presets and a final
**remove** choice ("Remove named style" / "Remove highlight"). Control,
field and option labels (including `remove`) are localized through
`RichUiOptions.controls`, for example
`{"named-styles":{label:"Formatvorlagen",fields:{preset:{options:{remove:"Formatvorlage entfernen"}}}}}`.

**State** is derived from Rust: each preset kind is read with the native
`selectionFormatState` (covering a range, node and grid selection, or the
caret's effective formats). A preset is *active* when every format it sets is
uniform with exactly its value; *mixed* when one of its formats covers only part
of the selection or a kind it sets has mixed values; otherwise inactive. The
dropdown reads `uniform` with the first active preset selected, `mixed` (with
the mixed hint) when no preset is active but one is mixed, otherwise `unset`;
`unavailable` (disabled) when no kind can be formatted there. Read-only owners
and document selections disable the dropdowns.

**Apply** is one native `changeSelectionFormats` request: one selection-format
change and one Undo step, locally and in shared editors (shared: one guarded
writer-local dispatch). It sets each preset format the selection does not
already carry exactly, removing the opposite script first; all other formats
are kept, so presets of different kinds compose (CKEditor styles also stack),
and a preset of the same kind replaces the value (one highlight replaces
another). At a caret it sets the pending typing formats. Nothing is published
when the selection already matches. Ineligible content inside a range (for
example a non-text node) is handled by native selection coverage exactly like
the standard format controls; a selection with no formattable text is
unavailable and stays unchanged.

**Remove** (the remove choice) removes, for every preset of that group that is
active or mixed, each kind it sets whose state matches the preset's value or is
mixed — again as one `changeSelectionFormats` request and one Undo step. A kind
uniformly carrying a different value (the author's own red text) is kept;
because the native read reports only that a kind is mixed, not which values it
holds, a mixed kind is removed as a whole. Nothing is published when no preset
is present.

**Interchange.** The result is ordinary typed formats, so it exports, reopens,
replays from a checkpoint and merges exactly like formats applied with the
individual standard controls; reopening a document never needs the registry.

## Tests

- Rust: `crates/breditor-core/tests/rich_case_change.rs` and unit tests in
  `rich_content/case_change/mapping.rs` (Unicode, Turkic, title rules, runs,
  mentions, selection mapping, Undo/Redo, checkpoint replay, V1/V3 owners, bad
  requests, read-only); `crates/breditor-collaboration/tests/shared_case_change_contracts.rs`
  (one Undo step, mentions, cycle, V1 rooms, convergence with concurrent typing,
  writer-local Undo, checkpoint restore).
- Vitest: `packages/breditor-experimental-rich-content/tests/formatting_productivity.test.ts`
  (including the named-preset registry, state derivation, apply/remove intents
  and the local adapter) and `packages/breditor-editor/tests/shared_formatting_productivity.test.ts`.
- Browser: `experiments/rich-browser/formatting-productivity.spec.mjs`,
  `experiments/rich-browser/named-formatting-presets.spec.mjs` and
  `experiments/shared-browser/formatting-productivity.spec.mjs`.
