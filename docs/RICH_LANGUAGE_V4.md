# Rich language V4 (unreleased candidate)

Rich V4 is an explicit, opt-in rich language under construction. It is **not
released**. It is built in five slices; this document records the first two
(ordered-list numbering and text-run language). The remaining slices (image
links, collapsible details/summary blocks and mention entities) will extend this
same language before it is released.

Because each slice changes V4's grammar or rule revision, **the V4 schema
fingerprint changes as later slices land**. No persisted V4 data exists, and
hosts must not store V4 documents, checkpoints or histories until V4 is declared
released. The durable local document store (`RichDocumentSessionStore`) keeps
accepting only rich languages 1–3 for that reason.

## Selection and compatibility

V4 is V3 (structural V2 grammar plus bounded block layout, see
[RICH_BLOCK_LAYOUT.md](RICH_BLOCK_LAYOUT.md)) with the additions below. Rich V1,
V2 and V3 remain byte-exact: their compiled specifications, fingerprints, saved
documents, selectors and defaults are unchanged. V4 never migrates or
reinterprets an older document, and older profiles reject every V4 property.

| Layer | V4 selector |
| --- | --- |
| Rust | `CompiledSchema::try_compile_rich_content_profile_v4`, `rich_content_revision() == Some(4)`, sealed rich rule revision 4 under compiler contract 6 |
| Capability queries | `supports_rich_block_layout()` (V3 and V4), `supports_rich_list_numbering()` and `supports_rich_text_language()` (V4 only) |
| Wasm | explicit profile bootstrap **format 9**: `BreditorRichProfile.fromBootstrapJsonV4` / `fromStandardBootstrapJsonV4`; descriptor `richLanguageVersion: 4`, `taskStructureVersion: 1`, `blockLayoutVersion: 1`, `listNumberingVersion: 1`, `textLanguageVersion: 1`; owner `listNumberingVersion() === "1"` and `textLanguageVersion() === "1"` |
| JavaScript factories | `compileRichProfileV4`, `compileStandardRichProfileV4` (`@breditor/experimental-rich-content`); `createLocalProfileV4`, `profileBootstrapJsonV4` (`@breditor/editor`, schema `breditor-editor/standard@4`) |
| SDK openings | `openLocalEditor({richLanguage: 4})`, `openLocalDocumentEditor({richLanguage: 4, ...})` and both local React components' `initialOptions` |
| Toolbar | `createRichToolbarV4(core, presentation)`: the V3 structural/layout controls plus **List numbering**, **Language** and **Clear language** |

Each factory checks its exact descriptor tuple. A V3 factory refuses a V9
bootstrap and a V4 factory refuses a V8 bootstrap. `createRichToolbarV4`
rejects V1–V3 owners and `createLayoutRichToolbarV3` rejects a V4 owner. An
omitted `richLanguage` still selects language 1; unknown values (5 and above)
are rejected, never mapped to an older language.

### Shared collaboration stays on V3

V4 is local only. The shared collaboration path (`crates/breditor-collaboration`,
`@breditor/collaboration`, the relay and shared SDK/React openings) has no V4
model, journal or configuration. `openSharedEditor`, `openSharedSearchEditor`,
`openSharedDocumentEditor`, `openSharedDocumentSearchEditor` and the shared
React components reject `richLanguage: 4` with the explicit error *"richLanguage
4 is the unreleased local-only candidate; shared editing supports richLanguage
1, 2 or 3"* before claiming the host or initializing Wasm. They never fall back
to V3. Shared interchange owners do not report list numbering or text language,
so imports into a shared owner keep the original `list-numbering` notices and
keep dropping `lang` silently.

## Slice 1: ordered-list numbering (audit gap `list-properties`)

### Property domains

Both properties are optional and belong only to `breditor/ordered-list`. Any
other node kind (bullet/task lists, items, paragraphs) rejects them, and V1–V3
reject them everywhere.

| AST key | Type | Domain |
| --- | --- | --- |
| `breditor/list-style` | integer | 1 decimal, 2 lower-alpha, 3 upper-alpha, 4 lower-roman, 5 upper-roman |
| `breditor/list-reversed` | Boolean | only `true`; not reversed is represented by absence, and `false` is rejected as non-canonical |
| `breditor/start` | integer (existing) | 1 through 2,147,483,647, still required on every ordered list |

Absence of `list-style` means no explicit marker style: the host and user agent
decide, which is decimal in standard HTML. An explicit decimal (1) is distinct
from absence and renders `type="1"`. No property accepts CSS, a counter-style
name or an arbitrary string.

### Semantics

- **Start stays explicit and required**, including for reversed lists. V4 never
  derives it from the item count. A reversed list displays `start, start − 1, …`
  exactly as HTML `<ol reversed start>`; ordinals may reach zero or negative
  values, which browsers render as decimal fallbacks for alphabetic/roman
  styles (CSS counter-style ranges). Editing therefore never becomes invalid
  just because a reversed list gained items.
- **Maximum range.** The existing ceiling `start + items − 1 ≤ 2,147,483,647`
  applies to every ordered list, reversed or not, so toggling `reversed` never
  changes admission.
- **Each list owns its numbering.** A nested list never inherits its ancestor's
  style or reversal: rendering puts `type`/`reversed` only on the list that
  owns them, and an `<ol>` without `type` gets the user-agent decimal style
  rather than its parent's (checked in all three engines). A new nested list
  created by indentation or wrapping starts without numbering properties.
- **Continuation.** When a list is divided (outdent/exit splits a prefix and a
  tail) both parts keep the list's own style and reversal. A reversed tail
  continues counting down (`start − offset`); if that start would fall below 1
  the action is refused rather than clamped. Partial clipboard copies follow
  the same rule (a reversed copy whose first ordinal would be below 1 is an
  unsupported range). A numbered-to-numbered `setListKind` start change keeps
  style and reversal; converting to bullets removes them.
- **Not in V4:** legal multilevel counters (`1.2.3`), per-item `value`
  overrides, custom counter styles, marker suffix/prefix text and per-item
  marker styles. A nested list is numbered independently.

### Native action and commands

`actions::SetListNumbering::capture(document, list, &RichListNumberingPatch)`
patches one admitted ordered list; items, bodies and identities are untouched.
It uses the guarded node-patch precedent of block layout: a full-source guard,
an exact inverse for Undo/Redo, one history group per command, an admitted
exact no-op, read-only refusal and stale-observation refusal. Non-V4 contexts
fail with `RichListNumberingError::Profile`.

`RichListNumberingPatch` distinguishes keep/set/clear for the style, keep or an
explicit Boolean for `reversed` (`false` removes the flag), and keep or one
checked `start`, so a reversal and its start can change in one edit. An
all-keep patch is rejected. `RichListNumberingPatch::clear()` removes both
optional properties and keeps the start. `RichListNumbering::read` returns the
exact admitted values.

The Wasm/TS command is
`{kind: "setListNumbering", data: {list, style?, reversed?, start?}}`: missing
fields keep, `style: null` clears, `reversed: false` removes reversal. The
strict decoder (`codec::decode_rich_list_numbering_command`) rejects unknown or
duplicate fields, `null` for `reversed`/`start`, unknown tokens and a non-V4
context. JavaScript validates the intent to primitives before its JSON
snapshot, so `NaN` or a `toJSON` object cannot become a different change.

### Rendering

The live renderer (`applyListNumbering`) and the inert static renderer
(`renderStaticDocument`) emit `start`, an HTML `type` token (`1`, `a`, `A`, `i`,
`I`) and the boolean `reversed` attribute from admitted values only. The static
renderer validates the same closed domains and has attribute parity with the
live renderer.

The **List numbering** toolbar control targets the ordered list that directly
owns the whole selection (a nested bullet or task list is its own target). It
reads the AST, offers Numbering style (Default plus the five styles), Counting
order (Ascending/Reversed) and Start at, and sends only changed fields.

### Interchange

`@breditor/interchange` reads `supportsListNumbering()` from its owner once at
creation. Local V4 owners report `true`; V1–V3 and shared owners do not.

- **HTML import, V4 owner:** `<ol type="1|a|A|i|I">` and `list-style-type`
  (`decimal`, `lower-alpha`/`lower-latin`, `upper-alpha`/`upper-latin`,
  `lower-roman`, `upper-roman`; CSS wins over the `type` hint) become
  `list-style`; `reversed` becomes `list-reversed` without an
  `unsupported-attribute` notice. A reversed list without `start` gets the
  HTML default start (its item count) stored explicitly. Bullet markers on an
  `<ol>`, unknown `type` tokens and other counter styles report
  `list-numbering`. Word for the web/desktop flat-list reconstruction is
  unchanged and still reports non-decimal numbering.
- **HTML import, V1–V3 owners:** unchanged; `type`, `reversed` and non-decimal
  `list-style-type` drop with the original `list-numbering` (and
  `unsupported-attribute` for `reversed`) notices.
- **HTML export:** `<ol start="N" type="…" reversed>` from admitted values;
  V4 HTML round trips exactly.
- **Markdown export:** decimal lists (absent or explicit decimal) stay
  CommonMark `N.` lists; explicit decimal is not distinguishable from the
  default in Markdown and reimports as the default. Letter, roman and reversed
  lists fall back to safe HTML with a `markdown-feature` notice, and that HTML
  reimports exactly into a V4 owner.

### Tests

- Rust core `tests/rich_list_numbering_v4.rs`: V1/V2/V3 fingerprint locks (V3
  read from the previous actual Wasm runtime), capabilities, admission of every
  value, rejection of out-of-domain/non-canonical/misplaced values and of all
  V4 properties under V1–V3, patch semantics, history groups with Undo/Redo and
  checkpoint restore, read-only/stale/guard/ceiling refusal, strict decoding,
  list rewrites (start change, bullet conversion, reversed tail, indent into an
  existing nested list) and reversed partial copy. Schema unit test: V4 differs
  from V3 only by its rule revision.
- Wasm `tests/rich_list_numbering_v4.rs`: bootstrap 9 selection, old factory
  isolation and fingerprints, set/clear/Undo/Redo/restore, read-only, stale and
  malformed intent.
- TypeScript: rich-content `tests/list_numbering.test.ts` (render, control,
  toolbar binding, factory boundary), editor `tests/static_list_numbering.test.ts`
  (static output, rejection, live parity) and SDK opening tests, interchange
  `tests/list_numbering.test.ts` (per-profile import/export/round trip).
- Playwright `experiments/rich-browser/list-numbering-v4.spec.mjs` in Chromium,
  Firefox and WebKit: real Wasm V4 owner, computed `list-style-type`, toolbar
  control, Undo/Redo/restore, refusals and native interchange admission for V4
  versus V3.

## Slice 2: text-run language (audit gap `localization-and-bidi`, text-part language)

Before this slice, per-run language metadata (`lang` on spans) did not exist in
any rich language (see [UI_LOCALIZATION.md](UI_LOCALIZATION.md)). V4 adds one
native, core-owned inline format so assistive technology, spell checking and
hyphenation can use the right language for a run of text.

### Format and tag grammar

| Item | Value |
| --- | --- |
| Format kind | `breditor/text-language`, revision 1, owned by Breditor (no extension can declare it) |
| Property | `breditor/language-tag`: required string, 2–35 UTF-8 bytes, plus the canonical-tag rule below |
| Profiles | V4 only (plain and standard-inline V4 factories). V1–V3 never declare it and reject it as an unknown format |
| Format budget | V4 reserves one of the 256 inline-format slots, so V4 admits at most 254 extension formats (V1–V3 keep 255) |

The value is a well-formed, bounded subset of RFC 5646 `langtag`. It is
checked syntactically only; there is no IANA registry lookup.

```text
tag      = language ["-" script] ["-" region] *("-" variant)   ; at most 35 bytes
language = 2*3ALPHA / 5*8ALPHA                                  ; lowercase
script   = 4ALPHA                                               ; Titlecase
region   = 2ALPHA / 3DIGIT                                      ; UPPERCASE
variant  = 5*8alphanum / (DIGIT 3alphanum)                      ; lowercase, no duplicates
```

Examples admitted: `en`, `fr-CA`, `zh-Hant-TW`, `es-419`, `de-CH-1996`,
`sl-rozaj-biske`, `art-lojban`, `und`.

Rejected by decision:

- **Extended language subtags** (`zh-yue`): use the primary subtag (`yue`).
- **Extensions** (`de-u-co-phonebk`) and **private use** (`x-…`, `en-x-foo`).
  They carry application-specific meaning that a portable document cannot
  interpret; Word's `x-none` ("do not check spelling") is not a language.
- **Grandfathered irregular tags** (`i-klingon`), the reserved 4-letter
  language length, `_` separators (`en_US`), empty subtags and anything over
  35 bytes.

**Canonical case.** Language lowercase, script titlecase, region uppercase,
variants lowercase. Document admission is **strict**: a stored non-canonical
value (`fr-ca`) is a validation error (`RichContentContract`), so equal tags
always compare equal byte for byte. Every input boundary **canonicalizes case**
first: the native `setTextLanguage` command, the toolbar field and HTML import.
`RichLanguageTag::canonicalize` (Rust) and `canonicalLanguageTagV1`
(`@breditor/browser/presentation`, copied into `@breditor/interchange` with a
parity test) implement the same algorithm; the Rust owner is authoritative.

### Semantics

- **Valued inline format.** Language behaves like text color or font family: a
  character has at most one language, setting a new value replaces the old one
  on the selected characters only, adjacent runs with equal formats merge, and
  typing after a tagged run inherits its language like any other format (clear
  it at the caret to stop that).
- **Direction is independent.** Language never sets or changes block direction
  (`block-direction`), alignment or any other format. An Arabic tag inside a
  left-to-right paragraph leaves the paragraph left to right.
- **Clear formatting keeps language.** The rich toolbar's *Clear standard
  formatting* removes the standard inline V1 kinds only, so it does not remove
  language: language is metadata, not presentation. Use **Clear language**. (The
  native `breditor/clear-inline-formats` action belongs to the base-text
  profiles, not to rich owners.)
- **Code blocks** carry no inline formats: language cannot be set on code-block
  text (refused like other inline formats), converting tagged text to a code
  block follows the existing `rejectFormatted` / `removeFormats` policy, and HTML
  import drops a language on `<pre>` content together with its other formats.

### Native action and commands

`RichLocalSession::set_text_language(snapshot, Option<&RichLanguageTag>)` is one
native selection-format change (`RichSelectionFormatChange::Set` or `Remove` of
`breditor/text-language`) over the native selection, so it reuses the guarded
`SetInlineFormat` actions and their exact inverses:

- a text, node or grid selection changes every covered character in **one
  history group** (exact Undo/Redo, checkpoint restore); an identical value or
  clearing untagged text is an admitted no-op (`Unchanged`);
- a collapsed caret changes **pending typing formats only** (`TypingStateOnly`),
  exactly like other valued formats;
- stale observations, a read-only owner, code selections and non-V4 contexts
  (`RichTextLanguageError::Profile`) are refused without publication.

The generic `changeInlineFormats`, `changeSelectionFormats` and pending-format
commands also accept the format literal, but only with an already canonical tag.

The Wasm/TS command is `{kind: "setTextLanguage", data: {language}}` with a tag
string (any letter case) or `null` to clear. The strict decoder
(`codec::decode_rich_text_language_command`) requires one JSON object with
exactly the `language` field, bounds input to 1 KiB, canonicalizes case and
rejects a malformed tag or a non-V4 context with
`breditor_rich.text_language_intent`. JavaScript snapshots the intent to a
primitive before serializing it. The facade reports `supportsTextLanguage()`;
a V4 profile or owner without `textLanguageVersion` 1 is refused.

### Rendering

The live renderer and the inert static renderer emit
`<span data-rich-format="breditor/text-language" class="breditor-text-language" lang="…">`
through the shared presentation recipe system. The new closed attribute policy
`safeLanguageTagV1` (`@breditor/browser/presentation`) emits only the `lang`
attribute and only for a canonical tag; anything else renders an inert span. It
is bound to its exact `span` + `breditor-text-language` signature and to the
2–35-byte required string property. `createStandardRichInlinePresentationV1`
adds the recipe (`richTextLanguageRecipeV4`) automatically when the catalog
declares the format; a custom `createRichInlinePresentation` manifest for a V4
catalog must include it. The link recipe stays outermost; language wraps the
other formats. CSS `:lang()` selectors therefore match tagged runs.

The V4 toolbar adds **Language** (a text field "Language tag (BCP 47)", at most
35 characters; it shows the uniform current tag, reports mixed selections, and
rejects malformed input before any command) and **Clear language** (enabled when
the selection carries a language). Both are owner-bound and send only
`setTextLanguage`. The UI catalog localizes them through the existing
per-control map (ids `text-language`, `reset-text-language`); no new string
keys are needed.

### Interchange

`@breditor/interchange` reads `supportsTextLanguage()` once at creation. Local V4
owners report `true`; V1–V3 and shared owners do not.

- **HTML import, V4 owner:** `lang` and the equivalent `xml:lang` on **any**
  element (inline or block, including `<body>`) become the language of every
  text run below it, as HTML inheritance does; a block-level value therefore
  tags the block's runs. Tags are stored in canonical case. `lang=""` (unknown)
  removes an inherited language without a notice. A malformed, private-use
  (`x-none`), extension or over-long tag removes the inherited language and
  reports `unsupported-attribute`. With both attributes present `lang` wins and
  a disagreeing `xml:lang` is reported.
- **HTML import, V1–V3 owners:** unchanged; `lang` and `xml:lang` are accepted
  and dropped silently.
- **HTML export:** `<span lang="…">` from admitted canonical tags; V4 HTML round
  trips exactly.
- **Markdown export:** Markdown has no language syntax, so a paragraph, heading
  or table with a tagged run falls back to safe HTML with a `markdown-feature`
  notice; that HTML reimports exactly into a V4 owner.
- **Clipboard:** native copy and paste inside a V4 owner keep the exact format
  through the native clipboard record. A V1–V3 owner refuses a V4 clipboard
  record that carries a language.

### Tests

- Rust core unit test (`rich_content/text_language.rs`): grammar accept/reject
  table with case, length (35 versus 36 bytes) and edge tags. Schema unit test:
  V4 differs from V3 only by its rule revision and the one native format.
- Rust core `tests/rich_text_language_v4.rs`: exact V1–V3 fingerprints and the
  V4 lock for this slice
  (`sha256:65b0ae435b5815cc12431c6d6098f1e115d43047c48db00de71aa98513fd044c`
  for schema `example/layout@1` with the standard inline preset), admission only
  of canonical tags and only in V4, contract violations, set/replace/clear in
  one history group each with Undo/Redo and checkpoint restore, caret pending
  formats, read-only/stale/code/V3 refusal, strict command decoding and native
  clipboard copy/paste.
- Wasm `tests/rich_text_language_v4.rs`: descriptor, catalog domain and owner
  capability; V1–V3 refusal; set/replace/clear/Undo/Redo/restore; caret typing;
  malformed, read-only and stale intent.
- TypeScript: rich-content `tests/text_language.test.ts` (grammar, live render,
  recipe binding, toolbar controls, facade boundary), editor
  `tests/static_text_language.test.ts` (static output, rejection, recipe table
  and DOM parity with the live renderer), interchange `tests/text_language.test.ts`
  (grammar parity, per-profile import/export/round trip, `xml:lang`, invalid
  tags, Markdown fallback).
- Playwright `experiments/rich-browser/text-language-v4.spec.mjs` in Chromium,
  Firefox and WebKit on a real Wasm V4 owner: `lang` in the DOM and `:lang()`
  CSS matching, one Undo group with Undo/Redo/restore, the toolbar field
  (validation, canonicalization, clear), native copy/paste keeping the tag, and
  native interchange admission for V4 versus V3.
