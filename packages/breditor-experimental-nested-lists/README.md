# @breditor/experimental-nested-lists

Private opt-in candidate bundling the browser runtime and matching Rust/Wasm
engine. Not published or release-qualified. Never pack this unassembled template.

From the repository root, use the actual directory printed by each command:

```sh
node scripts/build-experimental-nested-list.mjs
node scripts/check-experimental-nested-list-packages.mjs target/nested-list-candidate-XXXXXX
node scripts/build-opt-in-nested-list-package.mjs target/nested-list-packages-XXXXXX/qualification.json
node scripts/check-opt-in-nested-list-package.mjs target/nested-list-opt-in-XXXXXX/assembly.json
node scripts/measure-opt-in-nested-list-size.mjs target/nested-list-opt-in-XXXXXX/assembly.json
```

The plain nested build command selects the complete word projection transport,
including signed integer properties and version-2 generated getter bindings.
This changes only isolated nested builds, not ordinary shipping package features.
For an explicit historical legacy comparison, use:

```sh
BREDITOR_NESTED_WORD_CANDIDATE=0 node scripts/build-experimental-nested-list.mjs
```

Then use that candidate's printed directory in the remaining commands. Do not
transfer a word-candidate pass to a legacy build, or vice versa. Builds remain
private candidates, not release-qualified packages.
Diagnostic-name builds retain legacy transport;
word transport and diagnostic names cannot be combined. The nested package still
requires all release gates below; selecting the tested transport is not release
qualification. The size command verifies the archive, package tree, consumer
report and emitted Wasm identities; it measures all consumer assets without
approving a ceiling.

Import `BreditorBrowserEditor` and `BreditorNestedListBrowserEditorOptions` from
`@breditor/experimental-nested-lists`, initialize the engine from its `/wasm`
subpath, then call `BreditorBrowserEditor.openNestedLists(options)`. Supply a V5
semantic profile and fingerprint-bound DocumentV2 or SessionV7 checkpoint.
The package exports `NESTED_LIST_TOOLBAR_MANIFEST` and
`preflightNestedListWasmSemanticProfile`; `/wasm-binary` exposes the engine asset.
`/advanced` uses the same browser module graph. Do not mix runtime objects with
another installed Breditor package. Dispose the editor when removing its host.

Each item has one leading paragraph or heading followed by child lists. Nested
indent/outdent carries descendants and preserves selection/history. Plain-text
paste does not import HTML structure. Task lists, arbitrary multi-block items,
tables and collaboration are not included. Old sessions are not implicitly
migrated. Tab/Shift-Tab nests only when Rust enables the command; otherwise Tab
retains native navigation. Hosts can also configure primary-modifier shortcuts.

Builds only write isolated target artifacts. Default shipping bundles are not
rebuilt. Size budgets, native input/assistive-technology checks and the historical
intermittent WebKit fault remain release gates. Automated green checks do not
establish native clipboard, physical IME or spoken VoiceOver support.
