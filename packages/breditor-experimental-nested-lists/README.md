# @breditor/experimental-nested-lists

Private opt-in candidate bundling the browser runtime and matching Rust/Wasm
engine. Not published or release-qualified. Never pack this unassembled template.

From the repository root, use the actual directory printed by each command:

```sh
node scripts/build-experimental-nested-list.mjs
node scripts/check-experimental-nested-list-packages.mjs target/nested-list-candidate-XXXXXX
node scripts/build-opt-in-nested-list-package.mjs target/nested-list-packages-XXXXXX/qualification.json
node scripts/check-opt-in-nested-list-package.mjs target/nested-list-opt-in-XXXXXX/assembly.json
```

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
migrated. Tab nesting is pending; hosts can configure primary-modifier shortcuts.

Builds only write isolated target artifacts. Default shipping bundles are not
rebuilt. Size budgets, native input/assistive-technology checks and the historical
intermittent WebKit fault remain release gates. Automated green checks do not
establish native clipboard, physical IME or spoken VoiceOver support.
