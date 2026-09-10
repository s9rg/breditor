# `@breditor/reference-highlight`

`@breditor/reference-highlight` packages three complete callback-free reference
profiles. The original `REFERENCE_HIGHLIGHT_*` surface remains the exact
property-free `example/highlight` proof shipped for `0.2.0`. The additive
`REFERENCE_FORMATTING_*` surface combines that unchanged Highlight with a typed
`example/link` format. The `0.3.0-alpha.10` `REFERENCE_SHOWCASE_*` surface keeps
both, adds three ordinary property-free text styles, and presents the base
clear-inline-formatting route.

The package exports inert profile data, exact durable schema fingerprints,
fingerprint-bound Document V2 fixtures, complete owned browser render and
toolbar manifests, and canonical Link set/remove input helpers. It does not
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

## Use

This repository does not publish packages automatically. After a maintainer
publishes the release, install one exact browser/Wasm/reference set. The exact
browser peer matters: browser manifests are owned by the module instance that
checks them.

```sh
npm install @breditor/browser@0.3.0-alpha.10 \
  @breditor/wasm@0.3.0-alpha.10 \
  @breditor/reference-highlight@0.3.0-alpha.10
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
shape shown above. The sample starts with Highlight and a safe Link so Italic,
Strikethrough, and Code visibly begin inactive. The toolbar has exactly Bold,
Italic, Strikethrough, Code, Highlight, Link, Clear formatting, Undo, and Redo
in that order.

`createReferenceShowcaseDocumentJson(text, options)` accepts independent
`bold`, `italic`, `strikethrough`, `code`, and `highlighted` flags plus the
existing Link option. When all formats overlap, the renderer's fixed
outer-to-inner chain is Link, Strong, Emphasis, Highlight, Strikethrough, Code
(`<a><strong><em><mark><s><code>`). The AST still stores one canonical format
set on its text leaf; wrapper nesting is browser presentation only.

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

## Deliberate limitations

This package demonstrates several immutable property-free formats and one
closed typed Link format. The styles coexist independently; there are no
exclusion groups or per-format aggregate policies. The base Clear formatting
command removes every inline format together and cannot preserve a chosen
subset. It does not provide
dynamic installation, arbitrary nodes
or attributes, colors, custom JavaScript/Rust callbacks, arbitrary typed toolbar
forms, extension keymaps, block code, headings, lists, `beforeinput` rules,
converters, rich paste, or a native/Wasm plugin ABI. The one Link form uses the
browser's closed string/Boolean field
vocabulary. The Link href contract validates scalar shape and size; URL safety
remains a separate browser-owned presentation policy. Reconstruct the editor
with a newly compiled profile when semantic extensions change.

Only a fresh uniform complete map hydrates fields; mixed state has no fieldwise
values or merge base. Form drafts are not persisted, replayed, or undoable.
The reference package is trusted same-realm JavaScript configuration, not a
sandbox boundary. See the normative
[typed toolbar decision](../../docs/TYPED_TOOLBAR_CONTROLS.md).

The package uses only supported package-root APIs. Its profile bootstrap is an
ABI-local Wasm configuration value, not a stable general manifest wire format.

## License

Licensed under either Apache-2.0 or MIT, at your option.
