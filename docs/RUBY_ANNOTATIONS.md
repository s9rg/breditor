# Ruby (furigana) annotations

Ruby annotations attach a small reading (for example Japanese furigana or
Chinese bopomofo) to a run of base text: `<ruby>漢字<rt>かんじ</rt></ruby>`.
Breditor delivers ruby as an **opt-in, first-party typed inline extension**,
`breditor-ruby/ruby`. Hosts add it to their profile; it is never a default.

**Status (November 21, 2026): available, opt-in.** Local and shared editors,
live and static rendering, HTML/Markdown interchange and DOCX export.

## Decision: no grammar change, no V5

Rich language V4 is frozen ([RICH_LANGUAGE_V4.md](RICH_LANGUAGE_V4.md)): a new
*standard* inline format would be a grammar change and need a new language
(V5). Ruby does not need one. The existing typed inline-format extension seam
([EXTENSION_ARCHITECTURE.md](EXTENSION_ARCHITECTURE.md), `0.3.0-alpha.1`
onward) already lets a host declare an inline format with typed, bounded
properties, with its own schema fingerprint, the generic set/remove commands,
exact history, replay and shared merging. Ruby fits it exactly:

- **base text** = the formatted run(s);
- **annotation** = one required string property.

This matches the comparison target: Tiptap's Ruby text is a mark with an `rt`
attribute (`setRubyText({rt})`, `unsetRubyText()`), parsed from
`<ruby>base<rt>reading</rt></ruby>` with `<rp>` ignored.

The V1–V4 grammars, rule revisions, fingerprints and the V4 golden checkpoint
are unchanged; a profile without the extension is byte-identical to before.

## Data model

| Item | Value |
| --- | --- |
| Extension | `breditor-ruby/ruby`, version 1 (outside the reserved `breditor/*` namespace) |
| Format | `breditor-ruby/ruby`, persisted revision 1 |
| Property | `breditor-ruby/annotation`: required string, 1–256 UTF-8 bytes |
| Rust | `breditor_core::rich_content::ruby_extension_v1()`, `RichRubyAnnotation` |
| Bootstrap entry | `richRubyBootstrapExtensionV1` / `withRichRubyBootstrapV1(json)` (`@breditor/experimental-rich-content`) |
| Shared configuration entry | `richRubySharedExtensionV1` / `withRichRubySharedConfigurationV1(configuration)` |
| SDK presets | `rubyProfileBootstrapJsonV4`, `rubySchemaFingerprintV4` (`@breditor/editor`); `rubySharedProfileConfigurationV4` (`@breditor/editor/collaboration`) |
| Fingerprint, `breditor-editor/standard@4` + standard inline V1 + ruby V1 | `sha256:59b7d3c1fcbe2e85e23e526198312400e5732579d957a244d622c60a61194833` (locally and shared) |
| Fingerprint, `example/layout@1` V4 + standard inline V1 + ruby V1 (tests) | `sha256:dd793107a933e30a41608316003ce4d725952a35d1c63ffffbee8ba79d6a27d1` |

The seam is language independent: V1–V3 hosts may add the extension too. Every
profile that includes it has its own fingerprint, so saved ruby documents,
checkpoints and shared journals are refused by profiles without it (and vice
versa).

**Annotation policy.** Schema admission enforces the byte bound. Commands,
controls and importers additionally require the text to have no leading or
trailing whitespace and no control characters, line/paragraph separators or
bidi embedding/override/isolate controls (`isRichRubyAnnotation`,
`RichRubyAnnotation::try_new`, the same rules as a mention label). The Ruby
field trims the input first. A stored value outside this policy (possible only
in a document produced elsewhere) renders and exports as plain base text.

**Grouping.** Consecutive runs with one equal annotation form one ruby group,
whatever their other formats (`<ruby><strong>漢</strong>字<rt>かんじ</rt></ruby>`).
Two adjacent bases with the *same* reading therefore render as one group;
give each base its own reading or separate them with other text.

## Opting in

Local (`@breditor/editor`):

```ts
import {openLocalEditor,rubyProfileBootstrapJsonV4} from "@breditor/editor";
import {rubyToolbarControls} from "@breditor/experimental-rich-content";
const editor=await openLocalEditor({host,richLanguage:4,profileBootstrapJson:rubyProfileBootstrapJsonV4,
 toolbar:(core,standard,presentation)=>[...standard,...rubyToolbarControls(core,presentation)]});
```

Saved records bind `rubySchemaFingerprintV4`
(`RichDocumentSessionStore.open(name,{richLanguage:4,schemaFingerprint:rubySchemaFingerprintV4})`).

Shared (`@breditor/editor/collaboration`):

```ts
import {openSharedEditor,rubySharedProfileConfigurationV4} from "@breditor/editor/collaboration";
import {sharedRubyToolbarControls} from "@breditor/collaboration";
await openSharedEditor({...,richLanguage:4,configuration:rubySharedProfileConfigurationV4,
 toolbar:(core,standard,presentation)=>[...standard,...sharedRubyToolbarControls(core,presentation)]});
```

The SDK `toolbar` factories now receive the editor's inline presentation as an
additive third argument. Lower-level hosts compile `withRichRubyBootstrapV1(...)`
with `compileStandardRichProfileV4` (or any bootstrap 6–9) and pass
`createStandardRichInlinePresentationV1(profile.inlineCatalogJson())`; the
presentation recognizes the exact ruby declaration and needs no recipe for it
(`richInlinePresentationHasRuby`). A declaration that reuses the kind with any
other contract is an ordinary format and needs its own recipe.

## Commands and history

There is no ruby-specific native command. Ruby uses the generic typed-format
commands, so Rust owns validation, the exact result and history:

- **Set / replace:** `setInlineFormat` with `{kind:"set",formatsJson:[ruby literal]}`
  over explicit targets replaces the whole map on every selected character.
  `rubyCommand({targets,annotation})` builds it.
- **Remove:** `setInlineFormat` with `{kind:"remove",format:"breditor-ruby/ruby"}`.
- **Shared:** one dispatch of `set_format` commands (`enabled:false` removes).

Each action is **one Undo step**; Undo/Redo and checkpoint restore replay the
stored operation. Concurrent shared annotations of the same characters converge
like every valued format: per character, the highest causal stamp wins. An
over-bound annotation is refused atomically with no publication.

**Typing never inherits a reading** (local core and shared typing alike, like a
V4 mention): text typed beside or inside a base is plain; its other formats are
inherited as usual. The reading stays on its exact base. Caret format reads
therefore report no ruby at a caret; the controls read the group around the
caret from the document instead.

## Controls and UI

`rubyToolbarControls(core,presentation)` (local) and
`sharedRubyToolbarControls(core,presentation)` (shared) return two controls,
both built on the DOM-free `rubyControls`:

| Control id | Behaviour |
| --- | --- |
| `ruby` (**Ruby**, field `annotation` "Ruby text") | Sets or replaces the reading on an extended selection inside one text block, or, at a caret inside a base, on that whole group. Hydrates the field from the current reading; mixed readings show the mixed hint. Refuses an empty or invalid reading, and a selection across blocks. |
| `remove-ruby` (**Remove ruby**) | Removes ruby from the selection (any number of blocks) or from the whole group around a caret. Enabled only where a reading is present. |

Both are localized through the existing UI catalog by control id
(`ui.controls.ruby.label`, `ui.controls.ruby.fields.annotation.label`,
`ui.controls["remove-ruby"].label`, see [UI_LOCALIZATION.md](UI_LOCALIZATION.md)).
They are ordinary toolbar controls, so the selection toolbar and context menu
can show them too.

## Rendering

| Output | Shape |
| --- | --- |
| Live editor | `<ruby class="breditor-ruby" data-rich-ruby>base<rp contenteditable="false" data-ruby-paren="("></rp><rt contenteditable="false" data-ruby-text="かんじ"></rt><rp … data-ruby-paren=")"></rp></ruby>` |
| Static (`renderStaticDocument`) | `<ruby class="breditor-ruby" data-rich-ruby="">base<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>` |

In the live editor the reading and parentheses are CSS generated content
(`richRubyStyles`, added to the editor stylesheet only when the presentation
includes ruby). They are not text nodes, so selection offsets, typing, IME
composition reconcile, search and native copy see only the base text, and the
reading cannot be edited inline; it is edited through the Ruby field. A click on
the reading itself places the caret in the base in Chromium and leaves no
editable caret in Firefox and WebKit (typing then does nothing); it never types
into the reading or loses text. A click on the base text behaves normally. Assistive technologies read the
generated reading like the static `<rt>`. A document or presentation without
ruby renders exactly as before.

## Interchange

| Path | Behaviour |
| --- | --- |
| HTML export | `<ruby>base<rp>(</rp><rt>reading</rt><rp>)</rp></ruby>` per group |
| HTML import, ruby-capable owner (`supportsRubyAnnotations()`) | Each base/`<rt>` pair inside `<ruby>` becomes base text with that reading; `<rp>` is ignored and `<rb>` unwrapped; several pairs in one `<ruby>` are supported. A reading that is empty or outside the policy, or an `<rt>` without base, keeps the base as plain text and reports `removed-content`; `<rtc>` reports `unsupported-element`. |
| HTML import, other owners | Unchanged: `<ruby>`, `<rt>`, `<rp>` report `unsupported-element` and their text flows inline. |
| Markdown export | CommonMark has no ruby: a paragraph with ruby falls back to exact HTML (`markdown-feature`), which a ruby-capable owner reimports exactly. (`base(reading)` text was rejected: it is lossy and ambiguous with real parentheses.) |
| DOCX export | `w:ruby` with `w:rubyPr` (distributed alignment, 5 pt reading, 10.5 pt base, `w:lid` from the base's text language or `ja-JP`), the reading in `w:rt` and the styled base runs in `w:rubyBase`. |

`supportsRubyAnnotations()` is true for local owners whose profile declares the
exact extension. Shared interchange owners do not report it yet (the same known
gap as the other V4 interchange capabilities, see
[SHARED_RICH_V4.md](SHARED_RICH_V4.md)), so imports into a shared owner keep the
original conversion.

## Not included

- No ruby on its own in a document without base text, no nested ruby, no
  double-sided ruby (`rtc`), no per-character mono-ruby splitting beyond
  separate groups, no positioning options (over/under, alignment).
- No inline editing of the reading in the surface (by design) and no keyboard
  shortcut.
- Shared interchange capability (above).

## Tests

- Rust: `crates/breditor-core/tests/rich_ruby_v1.rs` (admission, fingerprint,
  frozen V4 unchanged, policy, set/replace/remove history and checkpoint replay,
  over-bound refusal, typing inheritance);
  `crates/breditor-collaboration/tests/shared_ruby_contracts.rs` (shared
  fingerprint equality, convergence, Undo, typing, checkpoint, atomic refusal).
- Vitest: `packages/breditor-editor/tests/ruby.test.ts` (composition, presentation,
  live/static rendering, controls, shared adapters, localization),
  `packages/breditor-interchange/tests/ruby.test.ts` (policy parity, HTML,
  Markdown, DOCX).
- Browser: `experiments/rich-browser/ruby.spec.mjs` (real Wasm owner in
  Chromium, Firefox and WebKit).
