# Rich language V4 (unreleased candidate)

Rich V4 is an explicit, opt-in rich language under construction. It is **not
released**. It is built in five slices; this document records the first one
(ordered-list numbering). The remaining slices (text-run language tags, image
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
| Capability queries | `supports_rich_block_layout()` (V3 and V4), `supports_rich_list_numbering()` (V4 only) |
| Wasm | explicit profile bootstrap **format 9**: `BreditorRichProfile.fromBootstrapJsonV4` / `fromStandardBootstrapJsonV4`; descriptor `richLanguageVersion: 4`, `taskStructureVersion: 1`, `blockLayoutVersion: 1`, `listNumberingVersion: 1`; owner `listNumberingVersion() === "1"` |
| JavaScript factories | `compileRichProfileV4`, `compileStandardRichProfileV4` (`@breditor/experimental-rich-content`); `createLocalProfileV4`, `profileBootstrapJsonV4` (`@breditor/editor`, schema `breditor-editor/standard@4`) |
| SDK openings | `openLocalEditor({richLanguage: 4})`, `openLocalDocumentEditor({richLanguage: 4, ...})` and both local React components' `initialOptions` |
| Toolbar | `createRichToolbarV4(core, presentation)`: the V3 structural/layout controls plus **List numbering** |

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
to V3. Shared interchange owners do not report list numbering, so imports into a
shared owner keep the original `list-numbering` notices.

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
