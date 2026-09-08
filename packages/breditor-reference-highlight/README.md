# `@breditor/reference-highlight`

`@breditor/reference-highlight` is Breditor's complete callback-free reference
extension for the narrow `0.2.0` property-free inline-format path. It packages
the exact `example/highlight` profile used by the generated Wasm boundary
suite. The Rust history/replay suites and browser projection/clipboard suites
exercise the same generic Highlight path and identity family under additional
test-specific schema selectors and format revisions.

The package exports inert profile data, its exact durable schema fingerprint,
fingerprint-bound Document V2 fixtures, and complete owned browser render and
toolbar manifests. It does not register JavaScript behavior, mutate the AST,
or adopt a ProseMirror, Lexical, Tiptap, or CKEditor protocol.

## Use

This release candidate is currently unpublished. After publication, install one
exact browser/Wasm/reference set. The exact browser peer matters: browser
manifests are owned by the module instance that checks them.

```sh
npm install @breditor/browser@0.2.0-rc.1 \
  @breditor/wasm@0.2.0-rc.1 \
  @breditor/reference-highlight@0.2.0-rc.1
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

## Deliberate limitations

This package demonstrates one immutable, property-free inline format. It does
not provide dynamic installation, arbitrary nodes or attributes, colors,
links, custom JavaScript/Rust callbacks, keymaps, `beforeinput` rules, typed
intent input, converters, rich paste, or a native/Wasm plugin ABI. Reconstruct
the editor with a newly compiled profile when semantic extensions change.

The package uses only supported package-root APIs. Its profile bootstrap is an
ABI-local Wasm configuration value, not a stable general manifest wire format.

## License

Licensed under either Apache-2.0 or MIT, at your option.
