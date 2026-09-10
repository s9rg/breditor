# `@breditor/reference-highlight`

`@breditor/reference-highlight` packages five complete callback-free reference
profiles. The original `REFERENCE_HIGHLIGHT_*` surface remains the exact
property-free `example/highlight` proof shipped for `0.2.0`. The additive
`REFERENCE_FORMATTING_*` surface combines that unchanged Highlight with a typed
`example/link` format. The `0.3.0-alpha.11` `REFERENCE_SHOWCASE_*` surface keeps
both, adds three ordinary property-free text styles, presents the base
clear-inline-formatting route, and supplies a separate declarative shortcut
manifest for its no-input controls.
The `0.3.0-alpha.12` `REFERENCE_COLOR_SHOWCASE_*` surface keeps those values
and adds one closed RGB24 text-color extension, renderer, native toolbar field,
typed input helpers, and distinct fingerprint-bound documents.
The `0.3.0-alpha.13` `REFERENCE_SIZE_SHOWCASE_*` surface keeps all earlier
values and adds one exhaustive three-step text-size extension, inert token
renderer, native integer select, typed input helpers, and another distinct
fingerprint-bound document family.

The package exports inert profile data, exact durable schema fingerprints,
fingerprint-bound Document V2 fixtures, complete owned browser render and
toolbar manifests, and canonical Link, RGB24, and Text Size set/remove input
helpers. It does not
register JavaScript behavior, mutate the AST, or adopt a ProseMirror, Lexical,
Tiptap, or CKEditor protocol.

The `0.3.0-alpha.3` package remains the same property-free Highlight proof. It
uses Profile Bootstrap V1 and Session Checkpoint V2, so it does not exercise
the new ABI-4 typed-profile command or Session Checkpoint V3 path.

`0.3.0-alpha.4` adds the combined surface without changing any byte or meaning
of the Highlight-only exports. The combined profile explicitly selects Profile
Bootstrap V2 and the browser's property-preserving Session Checkpoint V3 path.
Alpha.5 changes none of that package data; it proves the combined Link and
Highlight values through Enter, multiline plain-text paste, paragraph-boundary
join, undo, reload with both history branches, and redo. Paste inherits target
formatting only and never reconstructs source Link properties.
Alpha.6 changes no reference data. The same application-owned Link form can set
or remove the complete Link instance across a multi-paragraph selection while
Highlight peers, empty paragraphs, edge text, undo/redo, and Session V3 reload
remain exact.
Alpha.7 moves that Link form into the callback-free toolbar declaration. The
browser runtime owns its draft URL and Boolean values and submits the existing
typed intent; the semantic profile, durable fingerprint, and public Link input
helpers remain unchanged.
Alpha.8 hydrates a pristine Link form from an exact uniform Rust-owned complete
map. Absent or mixed state uses defaults; dirty input survives refresh and
rejection, while completion or close/reset hydrates again from authoritative
state. Form-admissible URL text remains exact inert scalar data until the
separate `safeLinkV1` renderer decides navigation presentation. The native
single-line field preserves surrounding whitespace but rejects CR/LF rather
than silently accepting browser normalization.
Alpha.9 preserves every Highlight and Formatting export byte-for-byte. Its
Showcase profile adds Emphasis, Strikethrough, and Code through the existing
generic toggle declaration; no new Rust action implementation, operation kind,
browser protocol, Wasm method, or durable record generation is added.

Alpha.10 changes no reference schema, extension bootstrap, renderer recipe,
fixture, fingerprint, or durable record generation. Its Showcase toolbar adds
the base stateless **Clear formatting** control immediately before Undo and
Redo. The control names `breditor/control-clear-inline-formatting` and invokes
the no-input `breditor/clear-inline-formatting` intent; Rust selects
`breditor/clear-inline-formats` through
`breditor/clear-inline-formatting-binding`.

Alpha.11 changes no reference schema, semantic manifest, renderer recipe,
fixture, fingerprint, or durable generation. It adds the separately frozen
`REFERENCE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST`, created by the exact peer
`@breditor/browser` module. The manifest binds Showcase action-state identities
to primary-modifier physical-letter-code chords; the browser derives the matching no-input
intent or history direction from the owned compiled-profile descriptor. The same
compiled table drives native `keydown` and toolbar `aria-keyshortcuts`.

Alpha.12 preserves every earlier reference profile and fingerprint. The new
Color Showcase declares required integer `example/rgb24` on
`example/text-color@1`, uses the existing Rust-generated typed setter and
state, renders only the browser-derived canonical `color:#rrggbb` style, and
presents the value through native `<input type="color">`. It adds no Rust
action, Wasm method, operation, or durable format generation; ABI 5 remains
current.

Alpha.13 again preserves every earlier profile and fingerprint. The new Size
Showcase declares required integer `example/text-size-step` in `0..=2` on
`example/text-size@1`. It uses the same Rust-generated setter and state, the
browser's exhaustive `safeIntegerTokenV1` renderer, and one native `<select>`
whose Small, Large, and Huge options cover the complete semantic domain.
Normal is format removal. It adds no Rust production contract, generated Wasm
member, operation, or durable format generation; ABI 5 remains current.

## Use

This repository does not publish packages automatically. After a maintainer
publishes the release, install one exact browser/Wasm/reference set. The exact
browser peer matters: browser manifests are owned by the module instance that
checks them.

```sh
npm install @breditor/browser@0.3.0-alpha.13 \
  @breditor/wasm@0.3.0-alpha.13 \
  @breditor/reference-highlight@0.3.0-alpha.13
```

```ts
import { openBreditorBrowserEditor } from "@breditor/browser";
import {
  REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT_JSON,
  REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
  REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
} from "@breditor/reference-highlight";
import initializeWasm, * as breditorWasm from "@breditor/wasm";

await initializeWasm();

const opened = await openBreditorBrowserEditor({
  host: document.querySelector("#editor") as HTMLElement,
  label: "Notes",
  wasm: breditorWasm,
  semanticProfile: {
    bootstrapJson: REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
  },
  initialDocument: {
    lineageId: "reference-highlight",
    documentJson: REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT_JSON,
    historyCapacity: 100,
  },
  rendering: REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
  toolbar: {
    host: document.querySelector("#toolbar") as HTMLElement,
    manifest: REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
  },
  keyboard: {
    editing: "beforeinputPrimary",
    primaryModifier: "control",
    shortcuts: "enabled",
  },
});

if (!opened.ok) throw new Error(opened.error.message);
```

The renderer emits a safe `<mark class="breditor-reference-highlight">` for
Highlight and a `<strong>` outside it when the same run has both formats. The
toolbar contains Bold, Highlight, Undo, and Redo native buttons. Both format
buttons invoke semantic no-input intents and consume descriptor-correlated
tracked state; neither stores a callback or dispatches a concrete action.

For bounded single-run examples, use
`createReferenceHighlightDocumentJson(text, "plain")` or
`createReferenceHighlightDocumentJson(text, "highlighted")`. Empty text is
canonicalized to an empty paragraph. The helper rejects malformed UTF-16 and
text beyond the default one-leaf limit.

## Combined Highlight + Link

Use the additive combined exports with the explicit typed-profile selector:

```ts
import { openBreditorBrowserEditor } from "@breditor/browser";
import {
  REFERENCE_FORMATTING_IDS,
  REFERENCE_FORMATTING_SAMPLE_DOCUMENT_JSON,
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_FORMATTING_RENDER_MANIFEST,
  REFERENCE_FORMATTING_TOOLBAR_MANIFEST,
  createReferenceLinkRemoveInputJson,
  createReferenceLinkSetInputJson,
} from "@breditor/reference-highlight";
import initializeWasm, * as breditorWasm from "@breditor/wasm";

await initializeWasm();

const opened = await openBreditorBrowserEditor({
  host: document.querySelector("#editor") as HTMLElement,
  label: "Notes",
  wasm: breditorWasm,
  semanticProfile: {
    bootstrapJson: REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
    formatVersion: 2,
  },
  initialDocument: {
    lineageId: "reference-formatting",
    documentJson: REFERENCE_FORMATTING_SAMPLE_DOCUMENT_JSON,
    historyCapacity: 100,
  },
  rendering: REFERENCE_FORMATTING_RENDER_MANIFEST,
  toolbar: {
    host: document.querySelector("#toolbar") as HTMLElement,
    manifest: REFERENCE_FORMATTING_TOOLBAR_MANIFEST,
  },
  keyboard: {
    editing: "beforeinputPrimary",
    primaryModifier: "control",
    shortcuts: "enabled",
  },
});

if (!opened.ok) throw new Error(opened.error.message);

opened.editor.executeIntentJson(
  REFERENCE_FORMATTING_IDS.linkIntentId,
  createReferenceLinkSetInputJson("https://example.com/docs", true),
);
opened.editor.executeIntentJson(
  REFERENCE_FORMATTING_IDS.linkIntentId,
  createReferenceLinkRemoveInputJson(),
);
```

The Link recipe emits `<a class="breditor-link">` and delegates all attributes
to the browser-owned `safeLinkV1` policy. Only canonical, credential-free,
absolute HTTP(S) URLs become `href` values. A true
`example/open-in-new-window` value also emits the fixed
`rel="noopener noreferrer"` and `target="_blank"` pair. Invalid or unsafe
stored URLs leave an inert anchor rather than becoming DOM attributes.

Link is deterministically outermost when formats overlap; Strong is outside
Highlight inside it. Between Highlight and Undo, the declarative toolbar adds
a runtime-owned Link form with a required URL field, an open-in-new-window
Boolean choice, and Apply/Remove controls. Draft values stay outside the frozen
manifest. Applications can still call `executeIntentJson` with
`createReferenceLinkSetInputJson` or `createReferenceLinkRemoveInputJson` for
the same supported typed intent.

`createReferenceFormattingDocumentJson(text, options)` creates bounded
single-run examples. Set `highlighted: true` and/or provide
`link: { href, openInNewWindow }`. The helper emits format and property
identities in lexical order, validates the declared UTF-8 bounds, and deeply
freezes its object form.

## Showcase

Use `REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP_JSON`,
`REFERENCE_SHOWCASE_RENDER_MANIFEST`,
`REFERENCE_SHOWCASE_TOOLBAR_MANIFEST`, and
`REFERENCE_SHOWCASE_SAMPLE_DOCUMENT_JSON` with the same Bootstrap-V2 open
shape shown above. Also pass the exact browser-owned shortcut data:

```ts
import {
  REFERENCE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
} from "@breditor/reference-highlight";

const opened = await openBreditorBrowserEditor({
  // ...the Showcase profile, document, renderer, keyboard, and toolbar options
  keyboardShortcuts: REFERENCE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
});
```

The sample starts with Highlight and a safe Link so Italic,
Strikethrough, and Code visibly begin inactive. The toolbar has exactly Bold,
Italic, Strikethrough, Code, Highlight, Link, Clear formatting, Undo, and Redo
in that order.

The shortcut manifest declares primary+B for Bold, primary+I for Italic,
primary+Shift+S for Strikethrough, primary+E for Code, primary+Shift+H for
Highlight, primary+Z for Undo, and both primary+Y and primary+Shift+Z for Redo.
The host's `keyboard.primaryModifier` chooses `Control` or `Meta`. Link remains
typed application UI and has no shortcut; Clear formatting is intentionally
unbound in this reference presentation. Matching toolbar buttons advertise the
same compiled chords through `aria-keyshortcuts` only while shortcut
translation is enabled.

`createReferenceShowcaseDocumentJson(text, options)` accepts independent
`bold`, `italic`, `strikethrough`, `code`, and `highlighted` flags plus the
existing Link option. When all formats overlap, the renderer's fixed
outer-to-inner chain is Link, Strong, Emphasis, Highlight, Strikethrough, Code
(`<a><strong><em><mark><s><code>`). The AST still stores one canonical format
set on its text leaf; wrapper nesting is browser presentation only.

## Color Showcase

Use the parallel `REFERENCE_COLOR_SHOWCASE_*` exports for the closed RGB24
slice:

```ts
import {
  REFERENCE_COLOR_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_COLOR_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT_JSON,
  REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST,
} from "@breditor/reference-highlight";

const opened = await openBreditorBrowserEditor({
  host,
  label: "Notes",
  wasm: breditorWasm,
  semanticProfile: {
    bootstrapJson: REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
    formatVersion: 2,
  },
  initialDocument: {
    lineageId: "notes-color-showcase",
    documentJson: REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT_JSON,
    historyCapacity: 100,
  },
  rendering: REFERENCE_COLOR_SHOWCASE_RENDER_MANIFEST,
  keyboardShortcuts: REFERENCE_COLOR_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  keyboard: {
    editing: "beforeinputPrimary",
    primaryModifier: "control",
    shortcuts: "enabled",
  },
  toolbar: {
    host: toolbarHost,
    manifest: REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST,
  },
});
```

The Color Showcase retains every earlier Showcase control and inserts Text
color between Highlight and Link, for ten controls total. Its native picker
defaults to `0x5b21b6` when the semantic selection is unset or mixed. Apply
submits one exact integer property and Remove submits the shared
`{"operation":"remove"}` input. A pristine form hydrates an exact uniform
Rust-owned RGB24 value; drafts remain ephemeral browser state.

`createReferenceColorShowcaseDocumentJson(text, options)` accepts the earlier
Showcase options plus `textColor`, which must be an integer from `0` through
`16_777_215`. When every format overlaps, semantic `FormatSet` order is Strong,
Code, Emphasis, Highlight, Link, Strikethrough, Text Color. The renderer's
independent outer-to-inner order is Link, Strong, Emphasis, Highlight,
Strikethrough, Code, Text Color. The innermost wrapper is exactly
`<span class="breditor-text-color" style="color:#rrggbb">`.

The Color Showcase reuses the earlier shortcut manifest by identity. Text
color has no shortcut because its typed intent requires an explicit value.
See the normative [text-color contract](../../docs/TEXT_COLOR.md).

## Size Showcase

Use the parallel `REFERENCE_SIZE_SHOWCASE_*` exports for the closed Text Size
preset slice. Its open shape is identical to the Color Showcase example above,
but uses `REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON`,
`REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT_JSON`,
`REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST`,
`REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST`, and
`REFERENCE_SIZE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST`. Use a distinct lineage
such as `breditor-react-reference-size-showcase` and a distinct persistence
slot such as `breditor.react-reference-size-showcase.v1`; a Size Showcase
editor never reinterprets a Color Showcase checkpoint.

The toolbar inserts Text size immediately before Text color, yielding eleven
controls. The native select contains exactly Small (`0`), Large (`1`, the
default), and Huge (`2`). Apply submits the existing complete-map typed-set
input and Reset removes the format. Normal text is absence of Text Size rather
than a fourth stored value. A pristine form hydrates an exact uniform step;
unset or mixed state displays the declared default without claiming semantic
uniformity, and dirty drafts remain ephemeral browser state.

`createReferenceSizeShowcaseDocumentJson(text, options)` accepts every Color
Showcase option plus `textSize: 0 | 1 | 2`. The canonical semantic format set
remains lexically ordered. The renderer's independent outer-to-inner chain is
Link, Strong, Emphasis, Highlight, Strikethrough, Code, Text Size, Text Color.
The Text Size wrapper is exactly a one-class `span` with one derived
`data-breditor-integer-token="small|large|huge"` attribute; it never receives
CSS text from the document.

Programmatic callers can use `createReferenceTextSizeSetInputJson(step)` and
`createReferenceTextSizeRemoveInputJson()` with
`REFERENCE_SIZE_SHOWCASE_IDS.textSizeIntentId`. Text Size adds no shortcut
because the shortcut protocol executes no-input work only. See the normative
[text-size preset contract](../../docs/TEXT_SIZE_PRESETS.md).

## Contract

The frozen identities are available through `REFERENCE_HIGHLIGHT_IDS`. The
semantic definition is:

- schema `example/editor@1`;
- extension `example/highlight-extension@1`;
- property-free format `example/highlight@7`;
- action `example/toggle-highlight`;
- no-input intent `example/toggle-highlight-intent`;
- binding `example/toggle-highlight-binding`; and
- tracked state `example/highlight-control`.

The exact durable fingerprint is
`sha256:374d5f058129ab8916d052866e37f3b3540dbb754ba560e55086415a3c58f741`.
Changing the schema selector, format identity, revision, or compiler contract
requires a different fingerprint and new Document V2 data. Presentation-only
changes do not change the durable fingerprint.

The additive `REFERENCE_FORMATTING_IDS` definition retains all Highlight
identities above and adds:

- extension `example/link-extension@1`;
- typed format `example/link@1`;
- required string property `example/href` with inclusive UTF-8 bounds
  `1..=2048`;
- required Boolean property `example/open-in-new-window`;
- generated set action `example/set-link`;
- typed intent `example/set-link-intent`;
- binding `example/set-link-binding`; and
- presence state `example/link-presence`.

That exact combined content language compiles to
`sha256:33d6e87ffa2d10a504a3319d64a71a2c980ec90c3e1c9e4f6cf97809982113cc`.
Action, intent, binding, state, toolbar, and rendering declarations do not enter
the durable schema fingerprint.

The additive Showcase uses schema `example/showcase-editor@1`, retains those
Highlight and Link identities, and adds extension
`example/text-styles-extension@1` with property-free formats
`example/emphasis@1`, `example/strikethrough@1`, and `example/code@1`. Their
action, intent, binding, and state names are available through
`REFERENCE_SHOWCASE_IDS`. The exact Showcase fingerprint is
`sha256:2a90a5fea97e6f4c3b9c535a78b76e9daf50afd95df3e3119392bfc19fd5ec63`.

The Color Showcase uses schema `example/color-showcase-editor@1`, retains all
five Showcase extension formats (alongside built-in Strong), and adds:

- extension `example/text-color-extension@1`;
- typed format `example/text-color@1`;
- sole required integer property `example/rgb24` with inclusive bounds
  `0..=16_777_215`;
- generated action `example/set-text-color`;
- typed intent `example/set-text-color-intent`;
- binding `example/set-text-color-binding`; and
- presence state `example/text-color-presence`.

That exact content language compiles to
`sha256:b3d051b7a68a15ef8d47ce2a7c4f051a76d09c386f9545f7b955590d2cc7433d`.
The Color Showcase has four extension declarations, seven total formats
including built-in Strong, seven render recipes, ten action-state entries, and
ten toolbar controls.

The Size Showcase uses schema `example/size-showcase-editor@1`, retains every
Color Showcase declaration, and adds:

- extension `example/text-size-extension@1`;
- typed format `example/text-size@1`;
- sole required integer property `example/text-size-step` with inclusive
  bounds `0..=2`;
- generated action `example/set-text-size`;
- typed intent `example/set-text-size-intent`;
- binding `example/set-text-size-binding`; and
- presence state `example/text-size-presence`.

That exact content language compiles to
`sha256:ec554b29919bd84ec013ea2af4d0248e1a3fabdcb1514bb642035871a49189d5`.
The Size Showcase has five extension declarations, eight total formats
including built-in Strong, eight render recipes, nine intents, eleven
action-state entries, three typed-set surfaces, and eleven toolbar controls.

## Deliberate limitations

This package demonstrates several immutable property-free formats, one closed
typed Link format, one closed RGB24 text-color format, and one closed
exhaustive Text Size integer format. The styles coexist
independently; there are no
exclusion groups or per-format aggregate policies. The base Clear formatting
command removes every inline format together and cannot preserve a chosen
subset. It does not provide
dynamic installation, arbitrary nodes
or attributes, arbitrary CSS, custom JavaScript/Rust callbacks, arbitrary typed toolbar
forms, callback keymaps, key sequences, typed-input shortcuts, block code,
headings, lists, extension-defined `beforeinput` rules,
converters, rich paste, or a native/Wasm plugin ABI. The Link form uses the
browser's closed string/Boolean field vocabulary, the color form uses only the
exact RGB24 integer field, and the size form uses only a dense exhaustive
native integer select. The Link href contract validates scalar shape and size; URL safety
remains a separate browser-owned presentation policy. Reconstruct the editor
with a newly compiled profile when semantic extensions change.

Text color is opaque sRGB24 only. There is no alpha, background, gradient,
named color, CSS variable, theme token, contrast guarantee, or source-format
preservation on paste. CSP `style-src-attr`, forced-colors modes, user styles,
and browser settings may suppress or override the visible color. Native color
picker UI and keyboard access vary by browser and operating system. A
collapsed pending-color change creates no standalone undo entry under the
existing typed-set history law.

Text Size is not arbitrary CSS, a numeric input, a sparse enum, or a custom
widget. Its three renderer tokens require host CSS for visible sizing, and
presentation ratios do not enter the semantic fingerprint. There are no
optgroups, disabled or dynamic options, font families, absolute lengths,
responsive scales, or source-size preservation on paste. A collapsed pending-
size change follows the same no-standalone-undo-entry law.

The Showcase shortcut value is browser presentation, not part of any Rust
extension manifest. It is fixed for an editor lifetime, addresses only existing
action-state IDs, and cannot change action preparation, history, replay, or
durable bytes. See the normative
[keyboard shortcut contract](../../docs/KEYBOARD_SHORTCUTS.md).

Only a fresh uniform complete map hydrates fields; mixed state has no fieldwise
values or merge base. Form drafts are not persisted, replayed, or undoable.
The reference package is trusted same-realm JavaScript configuration, not a
sandbox boundary. See the normative
[typed toolbar decision](../../docs/TYPED_TOOLBAR_CONTROLS.md).

The package uses only supported package-root APIs. Its profile bootstrap is an
ABI-local Wasm configuration value, not a stable general manifest wire format.

## License

Licensed under either Apache-2.0 or MIT, at your option.
