# Rich language V4 (unreleased candidate)

Rich V4 is an explicit, opt-in rich language under construction. It is **not
released**. It is built in eight slices, all recorded here: ordered-list
numbering, text-run language, image links, collapsible sections, mention
entities, table captions, page breaks and bookmarks with internal links.

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
| Capability queries | `supports_rich_block_layout()` (V3 and V4), `supports_rich_list_numbering()`, `supports_rich_text_language()`, `supports_rich_image_links()`, `supports_rich_details()`, `supports_rich_mentions()`, `supports_rich_table_captions()`, `supports_rich_page_breaks()` and `supports_rich_bookmarks()` (V4 only) |
| Wasm | explicit profile bootstrap **format 9**: `BreditorRichProfile.fromBootstrapJsonV4` / `fromStandardBootstrapJsonV4`; descriptor `richLanguageVersion: 4`, `taskStructureVersion: 1`, `blockLayoutVersion: 1`, `listNumberingVersion: 1`, `textLanguageVersion: 1`, `imageLinkVersion: 1`, `detailsVersion: 1`, `mentionVersion: 1`, `tableCaptionVersion: 1`, `pageBreakVersion: 1`, `bookmarkVersion: 1`; owner `listNumberingVersion()`, `textLanguageVersion()`, `imageLinkVersion()`, `detailsVersion()`, `mentionVersion()`, `tableCaptionVersion()`, `pageBreakVersion()` and `bookmarkVersion()` all `"1"` |
| JavaScript factories | `compileRichProfileV4`, `compileStandardRichProfileV4` (`@breditor/experimental-rich-content`); `createLocalProfileV4`, `profileBootstrapJsonV4` (`@breditor/editor`, schema `breditor-editor/standard@4`) |
| SDK openings | `openLocalEditor({richLanguage: 4})`, `openLocalDocumentEditor({richLanguage: 4, ...})` and both local React components' `initialOptions` |
| Toolbar | `createRichToolbarV4(core, presentation)`: the V3 structural/layout controls plus **List numbering**, **Language**, **Clear language**, **Image link**, **Remove image link**, **Collapsible section**, **Remove collapsible section**, **Expand/Collapse section**, **Table caption**, **Page break**, **Bookmark**, **Remove bookmark** and **Link to bookmark** |

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
to V3. Shared interchange owners do not report list numbering, text language, image
links, sections, mentions or table captions, so imports into a shared owner keep the original `list-numbering` notices,
keep dropping `lang` silently, keep the original image-link and `<details>` conversion,
import mention spans as plain `@label` text, keep converting `<caption>` to flow before the table, keep
reporting forced page-break CSS as `unsupported-style` and keep dropping element ids and
`#fragment` links (no bookmarks).

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
  `list-numbering`. Word desktop `mso-list` markers (`a.`, `A.`, `i.`, `I.`,
  with `.` or `)`) and Word for the web items whose `list-style-type` is one of
  these styles with `%N.`/`%N)` level text become `list-style` with their start
  and no notice; parenthesized, compound or unprovable formats keep the closest
  style and still report `list-numbering` (see the interchange package guide).
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
  current V4 lock (see slice 3), admission only
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

## Slice 3: image links (audit gap `advanced-images`, image links)

Before this slice no rich language could link an image: HTML import silently
dropped the `<a href>` around an `<img>`. V4 adds an optional link to the
`breditor/image` node itself. Only image links are in scope; inline/wrapped
layouts, drag handles, responsive variants and remote-URL ingestion remain open
gaps of `advanced-images`.

### Property domains

| AST key | Type | Domain |
| --- | --- | --- |
| `breditor/image-href` | string | one canonical absolute HTTP(S) URL in the closed subset below, at most 2,048 bytes |
| `breditor/image-link-new-window` | Boolean | only `true`, and only with an `image-href`; same window is represented by absence |

Both properties belong only to `breditor/image`. V1–V3 reject them everywhere.
V4 records the changed image property contract as **persisted type revision 2
of `breditor/image`** (V1–V3 keep revision 1), which is why the V4 fingerprint
changes with this slice.

**Accessible name.** A link needs an accessible name and a linked image's name
is its alternative text. A decorative image (`decorative: true`, empty alt) can
therefore never carry a link: admission rejects the combination (a
`RichContentContract` violation), `SetImageLink` refuses it with
`RichImageLinkError::Decorative`, and making a linked image decorative
(`setImageAlt` decorative, or the *Decorative image* toolbar control) is
refused by native admission. Remove the link first.

### URL policy (shared with inline links)

The policy is the inline link policy `safeLinkV1` (`breditor-inline/link`):
HTTP or HTTPS only (no `mailto:`, `javascript:`, `data:` or relative URLs), no
credentials, no raw whitespace, controls or backslashes, at most 2,048 UTF-8
bytes, WHATWG canonical spelling. Image links add **canonical storage**: the
stored value must already be its own WHATWG serialization, and Rust enforces a
closed fixed-point subset of it (`rich_content/image_link.rs`,
`RichImageHref::try_new`):

```text
href      = ("http" / "https") "://" host [":" port] path ["?" query] ["#" fragment]
host      = ipv4 / domain              ; lowercase a-z 0-9 - _ labels, none empty, no trailing dot;
                                       ; a numeric final label must be a canonical dotted IPv4
port      = 0-65535, no leading zero, never the scheme default (80 / 443)
path      = "/" segments               ; no ".", "..", "%2e" dot segments
pchar     = ALPHA / DIGIT / "-._~!$&'()*+,;=:@" / %HH
query     = *(pchar / "/" / "?") except "'"
fragment  = *(pchar / "/" / "?")
```

IPv6 hosts, raw `"<>`^{}|` and similar characters (which a browser keeps or
escapes differently) are outside the subset and rejected rather than repaired.
Internationalized hosts use their `xn--` spelling; punycode validity itself is
checked by the browser canonicalizer at input boundaries, and a value the
renderer cannot canonicalize renders without a link.

Every input boundary canonicalizes with the unchanged `safeLinkV1` canonicalizer
first and then requires the subset: `canonicalImageLinkHrefV1` /
`isImageLinkHrefV1` / `imageLinkRenderAttributesV1`
(`@breditor/browser/presentation`, reusing `resolveInlineFormatRenderAttributes`
with a `safeLinkV1` policy), `canonicalImageLinkHref` in
`@breditor/experimental-rich-content`, and an identical copy of the subset check
in `@breditor/interchange` (a test compares the copies byte for byte). The same
accept/reject table runs in Rust, the browser package and interchange, and the
browser test checks that every admitted value is its own `new URL(value).href`.

The optional typed autolink rule (`autolink-v1`, any profile with the standard
link format; see [`RICH_INPUT_RULES.md`](RICH_INPUT_RULES.md#optional-autolink-autolink-v1))
reuses this exact native subset for inline links: a typed candidate becomes a
link only if its target is already a fixed point of the subset, so it renders,
copies and exports exactly like a value entered through the explicit link editor.

### Native action and commands

`actions::SetImageLink::capture(document, image, Option<&RichImageLink>)`
patches one image node (`None` removes both properties); asset, alt, size,
caption and identities are untouched. It uses the guarded node-patch precedent
of `SetListNumbering`: a full-source guard, an exact inverse for Undo/Redo, one
history group per command, an admitted exact no-op (`Unchanged`), read-only and
stale-observation refusal, and `RichImageLinkError::Profile` outside V4.
Other image actions (`resizeImage`, `replaceImage`, `setImageAlt` with a
description, `setImageCaption`) keep the link. `RichImageLink::read` returns the
exact admitted link.

The Wasm/TS command is
`{kind: "setImageLink", data: {image, href, newWindow?}}`: `href` is a canonical
target string or `null` to clear; `newWindow` (Boolean) is allowed only with a
target and defaults to same window. The strict decoder
(`codec::decode_rich_image_link_command`) rejects unknown/duplicate fields, a
missing `href`, `newWindow` with a clear, a non-canonical or unsafe target (no
repair), an 8 KiB overflow and a non-V4 context with
`breditor_rich.image_link_intent`. JavaScript snapshots the intent to
primitives (`encodeImageLinkIntent`) before serializing it; the facade reports
`supportsImageLinks()`, and a V4 profile or owner without `imageLinkVersion` 1
is refused.

### Rendering and editing behavior

The link wraps **the image only, never its caption**:
`<figure …><a data-rich-image-link class="breditor-image-link" href="…" [rel="noopener noreferrer" target="_blank"]><img …></a><figcaption>…</figcaption></figure>`.
The attribute list is exactly what the inline `safeLinkV1` policy emits
(`imageLinkRenderAttributesV1`). A value outside the admitted subset renders the
image without an anchor. The live renderer (`wrapImageLink`) and the static
renderer emit the same structure and attributes; the live anchor additionally
carries the editing affordances `draggable="false"` and, while editable,
`tabindex="-1"`.

**Links are inert while editing.** Inline links are inert in the editable
surface because the browser never follows a link inside `contenteditable`. The
image figure, however, is a non-editable island, so the controller cancels
`click`/`auxclick` activation of `a[data-rich-image-link]` while the owner is
editable, and the anchor leaves the tab order. Clicking a linked image therefore
selects the image node exactly as before and never navigates or opens a window
(checked in Chromium, Firefox and WebKit for same- and new-window links). In a
read-only surface the anchor is an ordinary focusable link, like inline links.

The V4 toolbar adds **Image link** (an "Image link URL" field, at most 2,048
characters, canonicalized through `safeLinkV1` before any command, plus the same
"Link opens in: Same window / New window" choice as the inline Link control —
the shared toolbar field vocabulary has no checkbox type) and **Remove image
link**. Both target the selected image (the image node, or a caret in its
caption, like the existing alt/caption controls), send only `setImageLink`, and
the Image link control explains that a decorative image must be described
before it can be linked. Localization uses the existing per-control map (ids
`image-link`, `reset-image-link`).

### Interchange

`@breditor/interchange` reads `supportsImageLinks()` once at creation. Local V4
owners report `true`; V1–V3 and shared owners do not.

- **HTML import, V4 owner:** an `<img>` inside `<a href>` (inline, or
  `<figure><a href><img></a><figcaption>`) takes the anchor's link; `target` and
  `rel` follow the inline link rules (`target="_blank"` → new window). An unsafe
  href is dropped with the existing `unsafe-link` notice, a canonical target
  outside the native subset (for example an IPv6 host) also reports
  `unsafe-link`, and a decorative image (`alt=""`) keeps no link and reports
  `image-alt`.
- **HTML import, V1–V3 owners:** unchanged. The link around an image is dropped
  silently (an unsafe href still reports `unsafe-link`), and
  `<figure><a><img></a></figure>` keeps its original `block-structure` fallback.
- **HTML export:** `<figure><a href [target rel]><img></a><figcaption>`; when the
  host has no portable image URL the alt-text paragraph keeps the link. V4 HTML
  round trips exactly.
- **Markdown:** a same-window linked image that is otherwise Markdown-exportable
  exports as `[![alt](<src>)](<href>)` after the image round-trip verifier
  re-parses exactly one link around exactly one image; captions, sizes and
  new-window links fall back to HTML with `markdown-feature`. Importing that
  Markdown shape gives a V4 owner the image link (V1–V3 drop it).
- **Clipboard:** native copy and paste inside a V4 owner keep both properties
  through the native clipboard record (the pasted image gets fresh identities).
  A V1–V3 owner refuses a V4 clipboard record that carries an image link.

### Fingerprint

The image-link slice moved the V4 lock; the collapsible-section slice moved it
again (see slice 4 for the current value).

### Tests

- Rust core unit test (`rich_content/image_link.rs`): the subset accept/reject
  table. Schema unit test: V4 differs from V3 only by its rule revision, the
  text-language format and the image element revision.
- Rust core `tests/rich_image_link_v4.rs`: fingerprint locks, admission only of
  canonical targets and only in V4, flag/target/misplacement rules, the
  decorative rule (admission, capture and `setImageAlt`), set/replace/clear in
  one history group each with Undo/Redo, checkpoint restore and exact no-ops,
  other image actions keeping the link, read-only/stale/missing/V1–V3 refusal,
  strict decoding and native clipboard copy/paste with V3 refusal.
- Wasm `tests/rich_image_link_v4.rs`: descriptor and owner capability, V1–V3
  refusal, set/replace/clear/Undo/Redo/restore, decorative/read-only/stale and
  malformed intent.
- TypeScript: browser `image_link_href.test.ts` (parity table, WHATWG fixed
  point, canonicalization, `safeLinkV1` attribute identity), rich-content
  `tests/image_link.test.ts` (render, inert editing policy, intent, controls,
  toolbar and facade boundary), editor `tests/static_image_link.test.ts` (static
  output, rejection, live parity), interchange `tests/image_link.test.ts`
  (subset copy parity, per-profile HTML/Markdown import/export/round trip).
- Playwright `experiments/rich-browser/image-link-v4.spec.mjs` in Chromium,
  Firefox and WebKit on a real Wasm V4 owner: capability and V3 refusal, the
  toolbar control (rejection, canonicalization, new window, remove), the `<a>`
  around only the `<img>`, one Undo group with Undo/Redo/restore, clicking the
  linked image selecting it without navigation or popups, native copy/paste
  keeping the link with V3 refusing the record, and interchange for V4 versus V3.

## Slice 4: collapsible sections (audit gap `widgets-and-embeds`, collapsible section)

Before this slice no rich language had a disclosure widget: HTML import unwrapped
`<details>`/`<summary>` into ordinary flow. V4 adds an original section node. It
is plain document structure with inert native rendering, not an embed or a
provider-backed widget.

### Grammar and placement

| Node | Children | Properties |
| --- | --- | --- |
| `breditor/details` | exactly one leading `breditor/details-summary`, then one or more V4 flow blocks | `block-id` (required), `details-open` (optional Boolean, only `true`) |
| `breditor/details-summary` | text runs only (may be empty) | `block-id` (required) |

Decisions:

- **Body.** The body admits exactly what a blockquote admits in V4: paragraphs,
  headings, lists, task lists, images, blockquotes, code blocks, rules, tables
  and nested sections. Tables stay forbidden below a table cell, even through a
  section.
- **Placement.** A section is a V4 flow block wherever V2 flow is admitted: the
  document, list-item and task-item tails (never an item's leading line), a
  blockquote, a table cell and another section's body. Image captions keep their
  paragraph-only grammar. V4 overrides those containers' child grammar, so the
  section is a grammar change recorded in the fingerprint.
- **Nesting.** Sections may nest, but at most `RICH_DETAILS_MAX_DEPTH = 8`
  sections lie on any root-to-leaf path (a sealed V4 rich rule).
- **Summary content.** A summary is one inline text line like a paragraph: every
  catalog inline format, inline links and text language are allowed (HTML
  admits phrasing content in `<summary>`). It carries **no block layout**
  (alignment, direction, indent and line height are rejected on it; layout
  reads and commands skip it) and no other property. A summary outside a
  section, a second summary, a summary that is not first, a section without a
  body and `details-open: false` are rejected. V1–V3 reject both node kinds.

### Open state

`details-open` is **persisted document state**, as HTML's `open` attribute is:
it is in history (every change is one Undo group), checkpoints, clipboard
records and interchange. Only `true` is canonical; collapsed is absence. It is
not view state, so collapsing a section publishes a new revision.

### Native actions and commands

| Rust | Wasm/TS command | Semantics |
| --- | --- | --- |
| `actions::WrapDetails::capture(doc, first, last, wrapper, summary, open)` | `{kind:"wrapDetails",data:{first,last,wrapper,summary,open}}` | Wraps a direct-sibling flow range (keeping every identity) as the body of a new section with an empty summary. A range containing a summary is refused. Wrapping an empty paragraph inserts an empty section (summary plus one empty paragraph). |
| `actions::UnwrapDetails::capture(doc, wrapper)` | `{kind:"unwrapDetails",data:{wrapper}}` | Replaces the section with a paragraph carrying the summary's identity, runs and formats, followed by the whole body. A caret in the summary keeps its offset. |
| `RichLocalSession::set_details_open(snapshot, section, open)` (`actions::SetDetailsOpen`) | `{kind:"setDetailsOpen",data:{block,open}}` | Guarded node patch; the current state is an admitted no-op. Collapsing moves a selection with any endpoint, node or grid inside the hidden body to a caret at the end of the summary in the same publication. |
| `RichLocalSession::enter_details_body(snapshot, paragraph)` | `{kind:"enterDetailsBody",data:{paragraph}}` | From a collapsed caret in a summary: inserts one empty paragraph as the first body block (expanding a collapsed section in the same group) and moves the caret there. The summary text is never split. |

Each is one exact history group with an exact inverse, refuses read-only owners,
stale observations and non-V4 contexts (`RichDetailsError::Profile`), and
survives checkpoint restore. `insertBlocks` accepts a `details` flow draft
(`{kind:"details",block,summary,text,formatsJson,open,body}`) and a
`{kind:"details",block}` flow parent; inserting before the summary is refused.

Existing actions:

- **Typing, formats, search, coverage.** A summary is a text block for
  selection, plain and grouped typing, inline and pending formats, selection
  coverage and search/replace (summary and body are both traversed, collapsed or
  not).
- **Never split, joined, converted or moved.** `SplitTextBlock`,
  `JoinTextBlocks`, `SetHeading` and `SetCodeBlock` refuse a summary
  (`TextTarget`); block input rules never convert it; `MoveBlock` refuses it as a
  source (`MoveSource`).
- **Enter / Backspace / Delete (browser).** Enter at any summary caret sends
  `enterDetailsBody`; Enter with a range inside a summary does nothing.
  Backspace at a summary start sends `unwrapDetails`. Backspace at the start of
  the first body block moves the caret to the summary end; Delete at the summary
  end moves the caret to the first body block when the section is open (and
  stays put when collapsed). Summary and body text are never merged.
- **Ranges across a section boundary.** The original sibling join refuses a
  summary endpoint (`FlowRange`), so original-routing range edits across it are
  refused with an error; the general range planner keeps both boundary blocks
  distinct, keeps a wholly covered summary (emptied) inside a partially covered
  section and asks for one fresh floor paragraph when the body would become
  empty. A range covering a whole section removes it. A general Enter or flow
  paste whose caret lands in a summary is refused (it would split the summary).
- **Block move.** A section is a move container: blocks move into and out of its
  body, and the whole section moves with its summary (a summary's drag handle is
  the section's). Moving the last body block out or anything before the summary
  is refused (`RichDetailsError::Shape`).
- **Lists, headings, layout.** List/task wrapping and heading/paragraph controls
  are disabled in a summary; layout commands skip it; tables can be inserted in a
  body (except below a table cell).
- **Clipboard.** A node or whole-range copy keeps the section with its open
  state; paste rekeys every identity. A partial copy keeps a section only while it
  has its summary and some body; otherwise its parts become ordinary flow (a
  summary becomes a paragraph). A V1–V3 owner refuses a record containing a
  section.
- **Navigation.** Logical flow navigation treats sections as transparent, but a
  collapsed section exposes only its summary: its hidden body is never a stop.
  A selection set explicitly inside a hidden body is still admitted (the host's
  responsibility); collapsing always moves the selection out.

### Rendering and editing behavior

The live renderer emits
`<details data-rich-block data-rich-details [open]><summary data-rich-block data-rich-text>…</summary>…</details>`
with `open` from document state. While the owner is editable the controller
cancels the summary's native toggle (the `click` default) and reverts any
browser-initiated toggle (for example find-in-page) to document state, so
clicking a summary only places the caret. Toggling happens only through
`setDetailsOpen` (**Expand/Collapse section**). A collapsed body is hidden by the
browser's native `<details>` rendering. A read-only live surface allows native
toggling as presentation only. The static renderer emits the same structure with
`open=""`, leaves native toggling to readers and validates the same grammar, open
value and nesting bound.

The V4 toolbar adds **Collapsible section** (wraps the selected sibling blocks,
or the caret's block, into an open section), **Remove collapsible section** and
**Expand/Collapse section** (pressed when open), targeting the nearest section
around the selection. The standard slash menu gains a **Collapsible section**
item (`details`) that appears only with a V4 toolbar.

### Interchange

`@breditor/interchange` reads `supportsDetails()` once at creation (local V4
owners only).

- **HTML import, V4 owner:** `<details>` becomes a section; the first `<summary>`
  child is its summary and `open` maps to `details-open`. Block markup inside a
  summary is flattened (first line) or moved to the start of the body; a missing
  summary becomes an empty summary; both report `block-structure`. An empty body
  gets one empty paragraph. Sections deeper than 8 are lifted (summary text as a
  paragraph, then the body) with `block-structure`.
- **HTML import, V1–V3 owners:** unchanged: `<details>`/`<summary>` are unwrapped
  into ordinary flow (the summary becomes a paragraph) with `unsupported-element`,
  and `open` reports `unsupported-attribute`.
- **HTML export:** `<details [open]><summary>…</summary>…</details>`; V4 HTML
  round trips exactly.
- **Markdown:** no syntax. A section is exported as a safe HTML block with
  `markdown-feature` (nested content stays on one line and blank lines inside
  text are escaped as `&#10;`); importing that Markdown maps it through the
  sanitized HTML importer, so a V4 owner gets the section back and V1–V3 unwrap
  it.

### Fingerprint

The section slice moved the lock to
`sha256:f19134f8bf95a5170a36eb2f5a9f5e3819dbfd2b0dcd9507ab846c60cffb5428`; the
mention and table-caption slices moved it again (see the [current lock](#fingerprint-current)).
V1–V3 locks are unchanged.

### Not included

Section anchors for fragment links, `name`-grouped exclusive accordions, custom
disclosure markers, an in-surface toggle button and shared-collaboration rules
(V4 is local only).

### Tests

- Rust core `tests/rich_details_v4.rs`: fingerprint locks, placement accept table,
  malformed/old-profile/nesting/nested-table reject table, wrap/toggle/type/unwrap
  history with checkpoint restore, collapse selection relocation, read-only/stale
  refusal, Enter from a summary, summary refusals, block moves, general ranges
  across the boundary, flow navigation over collapsed bodies, search/replace,
  clipboard whole/partial copy with V3 refusal and layout skipping.
- Wasm `tests/rich_details_v4.rs`: descriptor and owner capability, V1–V3
  refusal, the four commands with Undo/Redo/restore, the `details` draft and
  parent, malformed, read-only and stale intent.
- TypeScript: rich-content `tests/details.test.ts`, editor
  `tests/static_details.test.ts` (static output, rejection, live parity),
  interchange `tests/details.test.ts` (per-profile import/export/Markdown
  fallback and round trip).
- Playwright `experiments/rich-browser/details-v4.spec.mjs` on a real Wasm V4
  owner: capability and V3 refusal, toolbar insertion, typing in summary and
  body, Enter from the summary, Undo/Redo/restore, collapse/expand with a body
  caret, summary clicks never toggling, browser toggles reverted, Backspace
  unwrap, copy/paste with V3 refusing the record and interchange for V4 versus V3.

## Slice 5: mentions (audit gap `mentions-slash`, durable mention entities)

Slash commands already existed; durable mention entities did not. V4 adds a
native mention entity with a stable host reference, an opt-in `@` suggestion
menu and command execution entirely through Rust.

### Representation decision

Rich text blocks (paragraph, heading, code block, section summary) contain only
text runs: there is no inline element child kind, and every text coordinate,
selection, action, search, clipboard and writing tool assumes text-only
children. A true inline atom node would need a new grammar child kind plus new
position, mapping and editing rules across all of those subsystems. V4 therefore
represents a mention as **one native valued inline format over the exact text
`@` + label**, plus an immutability law and native editing rules that make it
behave atomically:

- **Immutability law (admission).** Every maximal contiguous stretch of
  characters carrying one equal `breditor/mention` format must be one or more
  whole copies of `@` + its label. Other formats may vary inside it (a bold half
  is still the same mention). A partial edit is never admitted
  (`RichContentContract`). Two equal adjacent mentions merge into one run
  `@Ann@Ann`, which is two units.
- **Selection snapping.** `RichSelection::try_new` (every admitted selection,
  including command targets and mapped selections) snaps text endpoints out of
  mentions: a caret inside a mention moves to its nearest edge and a range
  endpoint inside one expands outward, keeping direction. Deleting, replacing,
  copying or formatting therefore always covers whole mentions; Backspace right
  after a mention (a one-character target) deletes the mention whole in one step.
  Documents without mentions (all V1–V3 documents) are untouched.
- **No inheritance.** Effective caret formats and pending typing formats never
  contain a mention, so typing next to a mention (or after a pasted mention) is
  plain text.
- **Code blocks** carry no inline formats, so they never contain a mention;
  converting a paragraph with a mention to a code block follows the existing
  format policy (its text stays `@label`).
- **Section summaries** are phrasing content like a paragraph, so they admit and
  insert mentions under the same law.

The live renderer shows each unit as a `contenteditable="false"` chip, so the
browser caret cannot enter it either.

### Format and property domains

| Item | Value |
| --- | --- |
| Format kind | `breditor/mention`, revision 1, owned by Breditor (no extension can declare it) |
| `breditor/mention-kind` | required string, closed set `user`, `page`, `tag` |
| `breditor/mention-id` | required string `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}` (1–128 bytes, the content-identity charset) |
| `breditor/mention-label` | required string, 1–256 UTF-8 bytes, no leading/trailing Unicode white space, no control characters (C0, DEL, C1), no U+2028/U+2029 and no bidi embedding/override/isolate controls (U+202A–U+202E, U+2066–U+2069) |
| Text | exactly `@` + label per unit (the prefix is `@` for every kind) |
| Profiles | V4 only (plain and standard-inline V4). V1–V3 reject it as an unknown format |
| Format budget | V4 now reserves two of the 256 inline-format slots (text language and mention), so V4 admits at most 253 extension formats |

Values are admitted exactly: there is no case folding, trimming or Unicode
normalization at any boundary.

### Identity semantics

`(kind, id)` is the durable host identity; it never changes after insertion. The
label is a **snapshot** captured at insertion and is part of the document text
(selection offsets, copy, plain text and word counts see `@label`). A host that
wants the current display name re-resolves it from `data-mention-kind` /
`data-mention-id` for secondary presentation (tooltip, hover card), never by
rewriting the chip text; static output and every export use the stored label.
The element `entityId` field stays `null`: it identifies elements, while a
mention is an inline format value. V4 renders **no link** for a mention (no URL
resolver exists in V4).

### Native action and command

`RichLocalSession::insert_mention(snapshot, target, &RichMention)` replaces one
text range inside a paragraph, heading or section summary (normally the typed
`@query` trigger; a collapsed range inserts at the caret) by the mention followed
by one plain space, both with the styles of the range start (never a mention).
The caret lands after the space. It is **one** guarded `ReplaceTextRange`
history group, so one Undo restores the typed trigger and the actual pre-edit
selection, and the typing burst that typed the trigger stays a separate group.
Slash commands reach the same one-step Undo through the native
`replaceTriggerThen` composite ([SLASH_COMMANDS.md](SLASH_COMMANDS.md)). Read-only owners,
stale observations, cross-block, code, missing targets and non-V4 contexts
(`RichMentionError::Profile`) are refused without publication.

Deleting a mention is ordinary deletion (snapping makes it whole). Search
(`find_rich_text`, therefore replace-one/replace-all) never reports a match that
intersects a mention: a label is an entity snapshot, not editable text.

The Wasm/TS command is
`{kind:"insertMention",data:{selection:{kind:"text",anchor,focus},mention:{kind,id,label}}}`.
The strict decoder (`codec::decode_rich_mention`) rejects unknown/duplicate
fields, non-objects, out-of-domain values, a 2 KiB overflow and a non-V4 context
with `breditor_rich.mention_intent`. JavaScript snapshots the intent to
primitives (`encodeMentionIntent`). The descriptor reports `mentionVersion: 1`,
the owner `mentionVersion()` `"1"`, the facade `supportsMentions()`; a V4 profile
or owner without them is refused.

### Suggestion menu

`mountRichMentions(host, options)` (`@breditor/experimental-rich-content`, and
`mountMentions(editor, options)` in `@breditor/editor`) is opt-in. The slash
command session was generalised into one shared typed-trigger session
(`suggestion_session.ts`) configured with a trigger character, its menu
attributes, catalog strings and an execution; `mountRichSlashCommands` keeps its
exact behaviour, DOM and messages, and a surface may carry both menus. The `@`
session:

- opens when `@` is typed at a block start or after white space and reads the
  trigger and query from admitted Rust views (the query ends at white space or a
  second `@`, or after `maxQueryLength`);
- takes a static suggestion list (filtered locally) or a host provider
  `(query, {signal, revision, session})`; superseded requests are aborted through
  the `AbortSignal` and stale results are discarded;
- renders an accessible listbox outside the surface (`aria-controls`,
  `aria-expanded`, `aria-activedescendant`, live status) and never takes focus;
- on choose runs exactly one `insertMention` replacing the typed trigger.

Suggestions are `{kind, id, label, description?}`; `(kind, id)` must be unique
per list and the label is validated with the Rust grammar before any command.
New catalog keys (English defaults): `mentionLabel` "Mentions",
`mentionLoading` "Loading suggestions…", `mentionCountOne` "1 suggestion
available", `mentionCount` "{count} suggestions available", `mentionEmpty` "No
matching suggestions". Existing strings are byte-identical.

### Rendering

Live: `<span class="breditor-mention" data-mention-kind="…" data-mention-id="…" contenteditable="false">@label</span>`
grouping the unit's styled pieces (each piece keeps its other formats; the
mention has no inline recipe). Restored carets rest beside a chip, never inside.
Static (`renderStaticDocument`): the same span without `contenteditable`;
partial mention text is a `grammar` error and out-of-domain values a `format`
error. `richMentionStyles` is an optional host CSS hook.

### Interchange

`@breditor/interchange` reads `supportsMentions()` once. Local V4 owners report
`true`; V1–V3 and shared owners do not.

- **HTML export:** each unit is the span above around its styled pieces.
- **HTML import, V4 owner:** only that exact shape (class `breditor-mention`,
  valid kind/id, text `@` + a valid label without tab/newline/double space)
  becomes a mention; anything else stays text. V4 HTML round trips exactly.
- **HTML import, V1–V3 owners:** unchanged; the span imports as plain `@label`.
- **Markdown:** Markdown has no mention syntax, so a block with a mention falls
  back to safe HTML with `markdown-feature`; that HTML reimports as a mention into
  a V4 owner. Typed `@name` in Markdown is ordinary text.
- **Clipboard:** native copy/paste inside V4 keeps kind, id and label (a partial
  copy range snaps outward); the plain-text flavour is `@label`; a V1–V3 owner
  refuses a V4 record carrying a mention.

### Fingerprint

The mention slice moved the lock to
`sha256:39fcdb478f73d51a6a3187785ab43bd2d0cca167940d8892614e16c4ad52202e`; the
table-caption slice moved it again (see [Slice 6](#fingerprint-current)).
V1–V3 locks are unchanged.

### Not included

Host-declared kinds, kind-specific prefixes (`#tag`), live label re-resolution
inside the chip, mention links, mention search by id, shared-collaboration rules
(V4 is local only).

### Tests

- Rust core unit tests (`rich_content/mention.rs`): property domain accept/reject
  table and format round trip. Schema unit test: V4 vs V3 differences.
- Rust core `tests/rich_mention_v4.rs`: fingerprint locks, admission only in V4,
  property domains, the whole-label law, insertion in one history group with
  Undo/Redo and checkpoint restore, separate typing and mention undo steps,
  snapping (caret, ranges, Backspace, explicit partial targets, typing at edges,
  formatting part of a mention), search exclusion, read-only/stale/target/V3
  refusal, strict decoding, native clipboard with V3 refusal, and summaries,
  search and clipboard across sections.
- Wasm `tests/rich_mention_v4.rs`: descriptor, catalog and owner capability,
  V1–V3 refusal, insert/delete/Undo/Redo/restore, malformed, read-only and stale
  intent.
- TypeScript: rich-content `tests/mention.test.ts` (grammar mirror, intent,
  grouping, live chips, static parity, caret restore, factory boundary, `@`
  session with async cancellation and one-step undo, coexistence with slash
  commands), editor `tests/static_mention.test.ts` (static output, rejection,
  live parity), interchange `tests/mention.test.ts` (grammar parity, per-profile
  import/export/Markdown fallback and round trip).
- Playwright `experiments/rich-browser/mention-v4.spec.mjs` in Chromium, Firefox
  and WebKit on a real Wasm V4 owner: capability and V3 refusal, typing `@` and a
  query, the async menu, choosing, the chip, the caret moving past it, plain
  typing after it, Backspace deleting it whole, one Undo restoring `@query`,
  snapping, copy/paste with plain text `@label` and V3 refusing the record, and
  interchange for V4 versus V3.

## Slice 6: table captions (audit gap `advanced-tables`, captions)

Before this slice no rich language could caption a table: HTML import turned
`<caption>` into an ordinary paragraph before the table (with `block-structure`).
V4 adds an optional caption that mirrors the image caption: one ordinary
paragraph owned by the table. Nested-table policy, accessible resize handles and
table/cell presentation remain open parts of `advanced-tables`.

### Grammar decision

| Node | Children (V4) |
| --- | --- |
| `breditor/table` | `breditor/table-row` × 0–256, **then** at most one `breditor/paragraph` (the caption) |

- **Trailing, not leading.** The caption is the table's **last** child, after
  every row. Rows therefore keep child indices `0..rows`, so every existing row
  index, cell path, merge context and row/column action is unchanged; a row
  appended "at the end" is inserted before the caption. The row ceiling (256),
  cell ceiling and merge grammar are untouched. A caption before or between rows,
  a second caption and any non-paragraph caption (heading, list, …) are rejected.
- **A paragraph, like the image caption.** The caption is a `breditor/paragraph`
  with its own stable `block-id`. It admits every inline format, inline links,
  text language, mentions and block layout (alignment, direction, indent, line
  height), exactly like an image caption. It is not a new node kind, so its
  persisted paragraph contract is unchanged; only the table's child grammar
  changes (recorded in the fingerprint).
- **Presentation order = document order.** HTML requires `<caption>` to be a
  table's first child; renderers emit it first and lay it out **after the rows**
  with `caption-side: bottom`, so the visual, reading, search, clipboard and
  navigation orders all agree with the AST (rows, then caption), like
  `<figcaption>` after an image.
- **Hidden tables.** A table with no rows or no columns (retained hidden state)
  may keep its caption. It renders nothing (the live placeholder and the static
  renderer's `hiddenTables` entry are unchanged), search skips it, and deleting
  every row keeps the caption for Undo/restore.
- V1–V3 reject a paragraph below a table; their documents, fingerprints and
  conversions are unchanged.

### Native actions and commands

| Rust | Wasm/TS command | Semantics |
| --- | --- | --- |
| `RichLocalSession::add_table_caption(snapshot, table, paragraph)` | `{kind:"addTableCaption",data:{table,caption}}` | Adds one empty caption with the fresh identity `caption` and places a collapsed caret in it (pending formats cleared). A table that already has a caption is refused (`RichTableCaptionError::Exists`), never replaced. |
| `RichLocalSession::remove_table_caption(snapshot, table)` | `{kind:"removeTableCaption",data:{table}}` | Removes the caption (text, formats, identity). Removing an absent caption is an admitted no-op (`Unchanged`). A text selection with an endpoint in the caption becomes a node selection of the table; other selections map unchanged. |
| `actions::SetTableCaption::capture(doc, table, Option<RichBlockDraft>)` | — | The guarded table patch both use: rows, cells, merges, columns and identities untouched; a non-paragraph draft is refused (`RichDraftError::Caption`). |

Each command is one history group with an exact inverse (Undo/Redo and
checkpoint restore), refuses read-only owners, stale observations, a missing
table (`RichTableCaptionError::Target`) and non-V4 contexts
(`RichTableCaptionError::Profile`); a reused identity fails admission
atomically. The raw `SetTableCaption` action dispatched to an older owner is
refused by its grammar. The strict Wasm records reject unknown, missing and
mistyped fields. `RichDocument::table_caption(table)` and
`RichDocument::caption_table(block)` read the relation; the Wasm descriptor
reports `tableCaptionVersion: 1`, the owner `tableCaptionVersion()` `"1"` and the
facade `supportsTableCaptions()`. A V4 profile or owner without them is refused
(`breditor_rich.table_caption_runtime`).

### Editing behavior

- **Typing and formats.** The caption is an ordinary text block for typing,
  grouped typing, inline and pending formats, text language, mentions, selection
  coverage and layout commands.
- **Enter** follows the image-caption precedent: the caption stays one paragraph,
  so Enter (and Shift+Enter) insert a line break; a general Enter
  (`insertGeneralParagraph`) starting in a caption is refused.
- **Never split, joined, converted, wrapped or moved alone.** `SplitTextBlock`,
  `JoinTextBlocks` and flow pastes refuse it (it is not a flow child); a heading
  conversion is refused by the paragraph-only caption grammar; list, quote,
  section and task wrapping controls are disabled in it; block Markdown shortcuts
  stay literal text; `MoveBlock` refuses it (`MoveSource`) and the table's drag
  handle moves table and caption together.
- **Backspace / Delete.** Backspace at the start of an **empty** caption removes it
  (`removeTableCaption`, one Undo step). Otherwise Backspace at the caption start
  and Delete at its end do nothing: caption text never merges with a cell or the
  next block. Original-routing ranges across the caption boundary are refused
  (`FlowRange`); the general range planner keeps the caption a caption (its
  covered part is removed, the rest stays), never joins it to another block, and
  a range covering the whole table removes table and caption together.
- **Table actions keep the caption last**: insert/delete/move row (including
  moving a row to the end), insert/delete/move column, resize, merge, split,
  header and clear. Their Undo/Redo is exact and a caret in the caption is
  untouched.
- **Grid selections never include the caption.** Grid coverage, grid copy, merge
  and clear cover cells only. The caption's coverage domain is
  `RichCoverageDomain::TableCaption(table)` (`{kind:"tableCaption",table}` in the
  coverage read), distinct from cells and from image captions.
- **Navigation.** `<caption>` is first in the DOM but laid out after the rows, and
  native caret movement around it differs per engine (Chromium and WebKit move
  from the last row to the next cell, Firefox skips the caption). The live
  controller therefore owns the unmodified arrow keys at the four caption
  boundaries (`table_caption_navigation.ts`): Down from the last line of a
  last-row cell and Right at the end of the last cell enter the caption; Up from
  its first line and Left at its start return to the last row; Down from its last
  line and Right at its end continue after the table (native flow navigation);
  Up/Left at the start of the block right after the table reach the caption end.
  Every other arrow key, and Shift-extended selections, stay native. Logical
  flow navigation (`navigateFlow`, Alt+PageUp/PageDown) keeps the table one
  outer stop: from the caption start it selects the table, from the caption end it
  continues after the table, and it never stops in a caption from outside.
- **Search/replace and writing tools** traverse the caption after the table's
  cells (presentation order); a hidden table's caption is skipped.
- **Clipboard.** A node, whole-document or covering general-range copy keeps the
  caption (a partially covered caption is sliced); paste rekeys its identity. A
  general range ending before the caption copies none, a text copy inside it is
  ordinary text, and a grid record can never carry a caption. Plain text puts the
  caption on its own line after the tab-separated rows. A rich flow paste
  starting in a caption uses the explicit caption text projection. A V1–V3 owner
  refuses a record containing a captioned table.

### Rendering

Live: `<table data-rich-block data-rich-table><caption data-rich-table-caption="{table-id}" style="caption-side: bottom"><p data-rich-block data-rich-text>…</p></caption><colgroup>…</colgroup><tbody>…</tbody></table>`.
The caption paragraph is ordinary editable text in the surface (no non-editable
island), so native carets, selection mapping and composition work as in any
paragraph. The live stylesheet adds only spacing and colour
(`caption[data-rich-table-caption]`). The static renderer emits the same
structure (`style="caption-side:bottom"`, `data-rich-table-caption`), validates
the same grammar (one trailing paragraph) and has structure/attribute parity with
the live renderer.

The V4 toolbar adds **Table caption** (`table-caption`): enabled for a selected
table (node or grid selection, or a caret/range in a cell or in the caption),
pressed when the table has a caption; activating it adds an empty caption and
moves the caret into it, or removes the caption. Localization uses the existing
per-control map; no new string keys.

### Interchange

`@breditor/interchange` reads `supportsTableCaptions()` once (local V4 owners
only).

- **HTML import, V4 owner:** the first `<caption>` becomes the table's caption
  paragraph (inline formats, links, language and mentions as usual). A caption
  whose content is one paragraph imports without a notice; an empty caption is an
  empty caption. A leading heading becomes the caption paragraph, further blocks
  stay as flow before the table, and a caption that starts with other blocks
  (lists, quotes, …) stays flow before the table; each repair reports
  `block-structure`. A second `<caption>` keeps the original conversion. A rowless
  table still imports no table (`table-geometry`) and keeps the caption text as
  flow.
- **HTML import, V1–V3 owners:** unchanged: `<caption>` content becomes flow
  before the table with one `block-structure` notice.
- **HTML export:** `<table><caption><p style="white-space:pre-wrap">…</p></caption><colgroup>…`;
  V4 HTML round trips exactly. A hidden captioned table exports its caption as a
  paragraph (`table-geometry`).
- **Markdown:** GFM tables have no caption, so a captioned table falls back to its
  safe HTML block with `markdown-feature`; importing that Markdown gives a V4 owner
  the caption back and V1–V3 the original flow conversion. Uncaptioned tables keep
  their GFM export.

### Fingerprint

The table-caption slice moved the lock to
`sha256:6daf61c3c5a216bb4d831c8bd6b9b776044b0a4598a346270ecf6579373959c0`; the
page-break slice moved it again (see [Slice 7](#fingerprint-current)). V1–V3 locks
are unchanged.

### Not included

Caption position choice (top), `<caption>`-level summaries or long descriptions,
table titles in the accessibility tree beyond native `<caption>` semantics, caption
drafts in `insertTable`, table/cell presentation, accessible resize handles and
shared-collaboration rules (V4 is local only).

### Tests

- Rust core `tests/rich_table_caption_v4.rs`: fingerprint locks, the grammar
  accept/reject table (formatted/empty/hidden captions; leading, middle, repeated,
  heading and list captions; duplicate identity; V1–V3), add/type/format/break/
  remove history groups with Undo/Redo and checkpoint restore, the existing-caption,
  read-only, stale, missing, reused-identity and V1–V3 refusals, split/join/heading/
  move/general-Enter/Markdown-rule refusals, block move of the table, every row,
  column and cell action keeping the caption (with exact Undo/Redo), split and
  deleting every row, grid coverage/copy exclusion and the `TableCaption` domain,
  flow navigation, search/replace order, whole/covered/partial/grid/forged
  clipboard records with V1–V3 refusal and general ranges into and across the
  caption. Schema unit test: V4 vs V3 differences.
- Wasm `tests/rich_table_caption_v4.rs`: descriptor and owner capability, V1–V3
  refusal of commands and captioned documents, add/type/remove/Undo/Redo/restore,
  strict malformed records, read-only and stale intent.
- TypeScript: rich-content `tests/table_caption.test.ts` (live `<caption>` render,
  native caret mapping, toolbar control and owner binding, Enter/Backspace/Delete,
  the offset-based Left/Right caption boundaries,
  insertion position, disabled flow controls, block moves, factory boundary),
  editor `tests/static_table_caption.test.ts` (static output, hidden tables,
  rejection, live parity), interchange `tests/table_caption.test.ts` (per-profile
  import, repairs, export, Markdown fallback and round trip).
- Playwright `experiments/rich-browser/table-caption-v4.spec.mjs` in Chromium,
  Firefox and WebKit on a real Wasm V4 owner: capability and V3 refusal, the toolbar
  adding a caption with the caret in it, typing and Enter, layout below the rows,
  removal with Undo/Redo/restore, all eight arrow-key boundary moves, flow
  navigation out of it, table actions keeping it, grid
  copy excluding it, Backspace in an empty caption, copy/paste with V3 refusal and
  interchange for V4 versus V3.

## Slice 7: page breaks (audit gap `pagination`)

Breditor stays a continuous flow editor; it is not a pagination engine. This slice
adds the one page fact a document stores, an explicit page break, plus an opt-in
CSS print layer outside the language. The full scope decision, print layer and
limitations are in [PAGINATION_AND_PRINT.md](PAGINATION_AND_PRINT.md).

### Grammar and placement

| Node | Children | Properties |
| --- | --- | --- |
| `breditor/page-break` | none | `block-id` (required), nothing else |

The document root's V4 child grammar is the V4 flow kinds **plus** the page break.
No other container admits it: list items, task items, blockquotes, collapsible
section bodies and table cells keep the V4 flow kinds without it (a page break in
a section nested in a list item or cell would otherwise have been admitted, since
child grammar is per element kind). V1–V3 reject the kind. The grammar change and
the new element are recorded in the fingerprint.

### Native actions and commands

| Rust | Wasm/TS command | Semantics |
| --- | --- | --- |
| `RichLocalSession::insert_page_break(snapshot, position, block)` | `{kind:"insertPageBreak",data:{position,block}}` | One page break with the fresh identity `block` at a document-root position, as one `InsertBlocks` history group; the selection maps. A non-root position is refused (`RichPageBreakError::Placement`). |
| `RichLocalSession::delete_page_break(snapshot, block, paragraph)` | `{kind:"deletePageBreak",data:{block,paragraph}}` | Removes one page break as one `ReplaceBlocks` group. A node-selected page break recovers like `delete_atom`; `paragraph` is a fresh floor used only when nothing else would remain. A non-page-break target is refused (`RichPageBreakError::Target`). |
| `RichBlockDraft::page_break(id)` | flow draft `{kind:"pageBreak",block}` | For `insertBlocks` and clipboard drafts; placement is proved by the grammar. |

Each refuses read-only owners, stale observations and non-V4 contexts
(`RichPageBreakError::Profile`), with exact Undo/Redo and checkpoint restore.
`RichDocument::is_page_break(block)` reads the kind.

A page break joins the existing whole-atom set (image, table, horizontal rule):
node selection, `selected_flow_atom` / `deleteAtom`, typing over a node
selection, `insertParagraphAdjacent`, and logical flow-navigation stops. Block
moves keep it in the root (the grammar refuses any other destination, and the
TypeScript move planner never offers one). Search and writing tools skip it. A
general range across it removes it; node, range and document copies keep it with
a fresh identity on paste; its plain text is an empty line; a V1–V3 owner refuses
a clipboard record containing it.

### Rendering

Live: `<div data-rich-block data-rich-page-break class="breditor-page-break" role="separator" aria-label="{pageBreakLabel}" style="break-after:page;page-break-after:always" contenteditable="false" data-select-node>`,
drawn as a dashed line with the catalog label (`richPageBreakStyles`). The label
is the new UI catalog key `pageBreakLabel` ("Page break"); the print preview's
description is the new key `printPreviewLabel`. Both live in their own block of
`ui_locale.ts`; existing keys are byte-identical. Static: the same element without
`contenteditable`/`data-select-node` (option `pageBreakLabel`), with a live
parity test.

The V4 toolbar adds **Page break** (`page-break`, inserts after the root block
holding the selection) and the standard slash menu gains a **Page break** item
(V4 toolbar only).

### Interchange

`@breditor/interchange` reads `supportsPageBreaks()` once (local V4 owners only).
HTML import maps Word's `<br clear=all style='page-break-before:always'>` (also
inside a paragraph, which is split), Google Docs'
`<hr style="page-break-before:always;display:none">`, an empty `<div>` with a
forced break and forced breaks declared on content blocks (collapsed at the
content edges and next to another break, as CSS does); breaks below the root are
removed with `block-structure`. V1–V3 conversion is unchanged. Export writes
`<div style="break-after:page;page-break-after:always"></div>`; Markdown falls
back to that HTML with `markdown-feature`, which reimports exactly.

### Fingerprint

The page-break slice moved the V4 lock to
`sha256:eb74301f1eedccc6838cf67090b2ce47e91e51112f9550d5ba25a22a20d0e9cb`; the
bookmark slice moved it again (see [Slice 8](#fingerprint-current)).

### Not included

Page numbers, running headers/footers, breaks inside containers, column breaks,
keep-with-next or avoid-break document properties, section-specific page setup and
shared-collaboration rules (V4 is local only).

### Tests

- Rust core `tests/rich_page_break_v4.rs`: fingerprint locks, root-only grammar
  accept/reject table (quote, list item, task item, section body, table cell,
  image caption, content, extra property, duplicate identity, V1–V3), insert/
  append/delete history groups with Undo/Redo and checkpoint restore, placement/
  identity/anchor/target/stale/read-only/V1–V3 refusals, node selection and
  atom deletion recovery (including a sole page break), `insertParagraphAdjacent`,
  flow navigation, block moves and wrapping, search, general ranges and clipboard
  with V3 refusal and nested paste refusal. Schema unit test: V4 vs V3 differences.
- Wasm `tests/rich_page_break_v4.rs`: descriptor and owner capability, V1–V3
  refusal of commands, drafts and documents, insert/delete/Undo/Redo/restore, the
  `pageBreak` draft, malformed, misplaced, read-only and stale intent.
- TypeScript: rich-content `tests/page_break.test.ts`, editor
  `tests/static_page_break.test.ts`, interchange `tests/page_break.test.ts`.
- Playwright `experiments/rich-browser/page-break-v4.spec.mjs` in Chromium,
  Firefox and WebKit on a real Wasm V4 owner, including print-media emulation.

## Slice 8: bookmarks and internal links (audit gap `document-utilities`)

Before this slice stable block identities existed (`block-id`) but no user-visible
reference target: a block ID is an opaque, replica-allocated identity that changes on
paste and is never typed by a person. V4 adds **named bookmarks** and **internal links**
to them. Footnotes, template fields and cross-reference fields ("see page 3",
auto-updating heading text) are later work and are not part of this slice.

### Representation decision

A bookmark is an optional **block property**, not an inline atom or format:

| AST key | Elements | Domain |
| --- | --- | --- |
| `breditor/bookmark` | `breditor/paragraph`, `breditor/heading`, `breditor/code-block` (anywhere they appear, including list items, quotes, cells, sections and captions) | `[A-Za-z][A-Za-z0-9_-]{0,63}`: 1–64 ASCII bytes, starts with a letter, case-sensitive, never trimmed, folded or repaired |

- **One bookmark per block**, so no new grammar, child kind, text coordinate or
  selection rule is needed: everything that already moves a block (block moves, wraps,
  list/quote/section/table rewrites, Undo) carries its bookmark.
- **Unique per document.** A repeated name is a `DuplicateContentId` admission failure,
  the same law and validation domain mechanism as stable content identities.
- **The name is the reference target.** It travels with its block and is independent of
  `block-id`, position, heading text and numbering. The ASCII grammar is safe verbatim
  as a URL fragment, inside an HTML id (`bm-` + name) and as a DOCX bookmark name.
- V4 records the changed property contract as **persisted type revision 2** of
  `breditor/paragraph`, `breditor/heading` and `breditor/code-block` (V1–V3 keep 1).
  V1–V3 reject the property everywhere. Section summaries, lists, tables, images and
  page breaks never carry one.

### Internal links

An internal link is the ordinary standard inline link (`breditor-inline/link`) whose
`breditor-inline/href` is exactly `#` + a bookmark name. It is a **separate bounded
grammar**; the external link policy (`safeLinkV1`, absolute canonical HTTP(S)) is
unchanged and never sees internal targets. V4 admission (a sealed rule) rejects any
other href starting with `#` (`#`, `#1a`, `#a b`, `##a`) and an internal link with
`new-window: true` (an in-document jump never opens a window). The standard inline
link declaration is unchanged, so V1–V3 keep their exact admission (core only checks
the declared string shape there).

### Reference integrity

Decision: **dangling links are allowed, reported exactly and rendered as broken**; only
renaming is reference-preserving.

- Deleting, clearing or cutting a bookmarked block is never refused because links point
  at it. Blocks disappear through dozens of generic paths (range deletion, joins, cut,
  replace-document, Undo of an insertion, paste over a selection); refusing all of them
  would make ordinary editing fail unpredictably and would let one link pin arbitrary
  content. A link whose target no block carries is a *broken* link.
- `RichBookmarkIndex::read` (Wasm `bookmarkIndexJson()` on an observation, facade
  `bookmarkIndex()`) returns `{bookmarks:[{name,block}], links:[{block,target}],
  brokenLinks:[{block,target}]}` in document order from one frozen snapshot. Adjacent
  runs with one equal link are one occurrence.
- **Renaming** (`renameBookmark`) rewrites the anchor and every internal link to it in
  every text block (paragraphs, headings, section summaries, captions, cells) as **one**
  guarded history group, so a rename never breaks a link and one Undo restores both.
- **Joins and splits.** A range join keeps the left block, so the left block's bookmark
  survives and the removed right block's bookmark is gone (its links dangle). Splitting
  (Enter) keeps the bookmark on the identity that stays (the left part); the new right
  block has none. Kind changes (paragraph ↔ heading ↔ code block, including Markdown
  shortcuts) keep it.
- **Paste.** Pasted blocks never carry a bookmark: names are document-unique anchors and
  pasted content gets fresh identities. Copying keeps the bookmark in the clipboard
  record (so a V1–V3 owner refuses a V4 record carrying one), cutting and pasting moves
  the content but not the anchor (use block moves to keep it), and pasted internal links
  are kept (they resolve to the original anchor if it still exists).
- **Shared history and permissions.** V4 is local only; there is no shared journal for
  bookmarks. Bookmark edits follow the owner's read-only policy like every other command.

### Native actions and commands

| Rust | Wasm/TS command | Semantics |
| --- | --- | --- |
| `actions::SetBookmark::capture(document, block, Some(&name))` | `{kind:"setBookmark",data:{block,name}}` | Set or replace one text block's bookmark. Links are not rewritten (a replaced name's links dangle). A name another block holds is refused (`RichBookmarkError::Duplicate`); a non-text or absent block (`Target`). |
| `actions::SetBookmark::capture(document, block, None)` | `{kind:"setBookmark",data:{block,name:null}}` | Clear it; links to it dangle and are reported. |
| `actions::SetBookmark::rename(document, &from, &to)` | `{kind:"renameBookmark",data:{from,to}}` | Rename and retarget every `#from` link to `#to` in the same group. An absent `from` (`Missing`) or taken `to` (`Duplicate`) is refused; `from == to` is an admitted no-op. |

`SetBookmark` is one ordered list of guarded node patches applied as one admitted edit
with one exact inverse: one history group per command, exact Undo/Redo and checkpoint
restore, admitted exact no-ops, read-only and stale-observation refusal and
`RichBookmarkError::Profile` outside V4. The strict decoders
(`codec::decode_rich_set_bookmark_command`, `decode_rich_rename_bookmark_command`)
reject unknown, duplicate or missing fields, wrong types, out-of-grammar names, a 2 KiB
overflow and a non-V4 context with `breditor_rich.bookmark_intent`. JavaScript snapshots
intent to primitives (`encodeSetBookmarkIntent`, `encodeRenameBookmarkIntent`). Links to
a bookmark are created with the existing format commands (`changeInlineFormats` /
`changeSelectionFormats` with the literal `{href:"#name", new-window:false}`). The
descriptor reports `bookmarkVersion: 1`, the owner `bookmarkVersion()` `"1"`, the facade
`supportsBookmarks()`; a V4 profile or owner without them is refused.

### Rendering

- **Live.** For a bookmark-capable (V4) owner the controller renders a bookmarked block
  with `id="bm-<name>"` and `data-rich-bookmark="<name>"`; the `bm-` prefix keeps
  bookmark ids out of the host's id space. An internal link's `<a>` gets
  `href="#bm-<name>"` and `data-rich-internal-link="<name>"`; a dangling one has no
  `href` and carries `data-rich-link-broken` (`richBookmarkStyles` draws a wavy
  underline). Older owners render exactly as before (the renderer option `bookmarks`
  is set by the controller only for V4 owners).
- **Inert while editing; navigation in read-only.** While editing, clicks on internal
  links are cancelled (like image links). In a read-only surface a click scrolls the
  bookmarked block **of the same surface** into view and never changes `location` or
  the page hash, so two editors on one page never jump into each other.
- **Static.** `renderStaticDocument` emits the same `id`, `data-rich-bookmark`, `href`,
  `data-rich-internal-link` and `data-rich-link-broken` attributes (a parity test
  compares them with the live renderer). Static output is a plain page, so a resolved
  link navigates natively to `#bm-<name>`. The static grammar validates the name and
  per-document uniqueness (`property` errors). It is a union renderer: a same-window
  `#name` link in any document renders as an internal link.

### Toolbar

`createRichToolbarV4` adds **Bookmark** (`bookmark`: a "Bookmark name" field; on a block
without a bookmark it sends `setBookmark`, on a bookmarked block `renameBookmark`, so
links follow; the grammar and uniqueness are checked before any command), **Remove
bookmark** (`remove-bookmark`) and **Link to bookmark** (`link-bookmark`: the link
control's internal-target choice — a select listing the document's current bookmarks,
applied to the selected text). Select options that depend on the document come from the
new optional `RichToolbarReading.options` (filled while no draft is open). No slash item
is added, so the trigger-composite allowlist is unchanged.

### Interchange

`@breditor/interchange` reads `supportsBookmarks()` once (local V4 owners only).

- **HTML export (V4 owner):** `id="bm-<name>"` on the bookmarked `<p>`, `<hN>` or `<pre>`
  and `<a href="#bm-<name>">` for internal links.
- **HTML import (V4 owner):** an `id` on `<p>`/`<h1>`–`<h6>`/`<pre>`, or an `<a name>` /
  `<a id>` inside one, becomes that block's bookmark; `href="#<name>"` becomes an
  internal link. A `bm-` prefix is removed on both sides, so our own export round trips
  exactly and foreign ids and fragments map to the same name. The first valid, unused
  anchor of a block wins; invalid names (Google Docs `h.abc`, Word `_Toc…`), duplicates
  and extra anchors report `unsupported-attribute`; an out-of-grammar fragment keeps the
  original `unsafe-link`; `target="_blank"` on an internal link reports
  `unsupported-attribute`. Ids on other elements stay silently ignored (unchanged), so a
  link to such an id imports as a dangling internal link.
- **HTML, V1–V3 owners:** unchanged: ids are dropped, `<a name>` reports
  `unsupported-attribute`, `href="#…"` reports `unsafe-link`, and export of a `#…` link
  keeps the original `unsafe-link` text.
- **Markdown:** CommonMark has no block-anchor syntax, and a `[text](#name)` link alone
  cannot carry the anchor, so a block with a bookmark or an internal link falls back to
  the exact HTML above with `markdown-feature`; that HTML reimports exactly into a V4
  owner. Typed Markdown `[up](#top)` imports as an internal link for a V4 owner.
- **DOCX** (`@breditor/interchange/docx`): a bookmark becomes
  `<w:bookmarkStart w:id w:name/>…<w:bookmarkEnd/>` around the paragraph content and an
  internal link `<w:hyperlink w:anchor="name">` (no relationship). A dangling internal
  link keeps its text without a hyperlink (`unsafe-link`). Word's own UI limits names to
  40 letters, digits and underscores; longer or hyphenated names are written verbatim
  and reported as `style-approximation`.

### Not included

Footnotes and endnotes, template/merge fields, cross-reference fields that display the
target's text or page number, bookmarks on a span of text or on non-text blocks, links
to other documents' bookmarks, automatic heading anchors, a link-preserving cut, and
shared-collaboration rules (V4 is local only).

### Fingerprint (current)

Current candidate V4 lock for schema `example/layout@1` with the standard inline
preset: `sha256:40ed4c0716f9baab1ec30da8b5641623b8fbbdafc7e6f838f5b0496e01add372`
(asserted in the core and Wasm text-language, image-link, section, mention,
table-caption, page-break and bookmark tests). V1–V3 locks are unchanged. The schema
unit test proves V4 differs from V3 only by its rule revision, the text-language and
mention formats, the image revision, the section grammar, the table's caption grammar,
the root-only page-break element and the text-block revisions.

### Tests

- Rust core unit test (`rich_content/bookmark.rs`): name and fragment grammar table.
  Schema unit test: V4 vs V3 differences including the text-block revisions.
- Rust core `tests/rich_bookmark_v4.rs`: fingerprint locks, admission (kinds, grammar,
  uniqueness, V1–V3 refusal), internal-link grammar and new-window rule (V1–V3 exact),
  the index with dangling links, set/replace/clear with Undo/Redo/checkpoint restore,
  rename retargeting links in one group, clearing and deleting targets, kind changes and
  splits, paste dropping anchors with V3 refusing the record, read-only/stale/old-profile
  refusal and strict decoding.
- Wasm `tests/rich_bookmark_v4.rs`: descriptor and owner capability, V1–V3 refusal,
  set/rename/clear/Undo/Redo/restore, the index, malformed/read-only/stale intent.
- TypeScript: rich-content `tests/bookmark.test.ts` (grammar mirror, intent, live render
  for V4 versus older owners, controls, dynamic select options, toolbar and factory
  boundary), editor `tests/static_bookmark.test.ts` (static output, rejection, live
  parity), interchange `tests/bookmark.test.ts` (grammar copy parity, HTML export/import
  per profile and round trip, foreign anchors and losses, Markdown fallback, DOCX parts).
- Playwright `experiments/rich-browser/bookmark-v4.spec.mjs` in Chromium, Firefox and
  WebKit on a real Wasm V4 owner.
