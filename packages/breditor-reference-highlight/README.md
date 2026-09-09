# `@breditor/reference-highlight`

`@breditor/reference-highlight` packages two complete callback-free reference
profiles. The original `REFERENCE_HIGHLIGHT_*` surface remains the exact
property-free `example/highlight` proof shipped for `0.2.0`. The additive
`REFERENCE_FORMATTING_*` surface combines that unchanged Highlight with a typed
`example/link` format for the `0.3.0-alpha.4` path.

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

## Use

This repository does not publish packages automatically. After a maintainer
publishes the release, install one exact browser/Wasm/reference set. The exact
browser peer matters: browser manifests are owned by the module instance that
checks them.

```sh
npm install @breditor/browser@0.3.0-alpha.4 \
  @breditor/wasm@0.3.0-alpha.4 \
  @breditor/reference-highlight@0.3.0-alpha.4
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
Highlight inside it. The declarative toolbar still owns only no-input Bold,
Highlight, Undo, and Redo buttons. An application-owned URL form calls
`executeIntentJson` with `createReferenceLinkSetInputJson` or
`createReferenceLinkRemoveInputJson`; no callback or captured URL is placed in
the static toolbar manifest.

`createReferenceFormattingDocumentJson(text, options)` creates bounded
single-run examples. Set `highlighted: true` and/or provide
`link: { href, openInNewWindow }`. The helper emits format and property
identities in lexical order, validates the declared UTF-8 bounds, and deeply
freezes its object form.

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

## Deliberate limitations

This package demonstrates one immutable property-free format and one closed
typed Link format. It does not provide dynamic installation, arbitrary nodes
or attributes, colors, custom JavaScript/Rust callbacks, typed toolbar forms,
keymaps, `beforeinput` rules, converters, rich paste, or a native/Wasm plugin
ABI. The Link href contract validates scalar shape and size; URL safety remains
a separate browser-owned presentation policy. Reconstruct the editor with a
newly compiled profile when semantic extensions change.

The package uses only supported package-root APIs. Its profile bootstrap is an
ABI-local Wasm configuration value, not a stable general manifest wire format.

## License

Licensed under either Apache-2.0 or MIT, at your option.
