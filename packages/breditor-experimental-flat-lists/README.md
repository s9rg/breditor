# @breditor/experimental-flat-lists

Private, opt-in beta candidate: headings and flat bullet/numbered lists, with a
paired browser runtime and Rust/Wasm engine in one package. No registry release
is available or authorized by this checkpoint. Install the locally generated
tarball; do not run `npm pack` on this source directory, which has no built runtime.

From the repository root, qualify the experimental Wasm and browser packages,
then assemble this package from that exact qualification record:

```sh
npm run test:lists:experimental
npm run test:lists:packages -- target/flat-list-candidate-XXXXXX
npm run build:lists:opt-in -- target/flat-list-packages-XXXXXX/qualification.json
npm run test:lists:opt-in -- target/flat-list-opt-in-XXXXXX/assembly.json
npm install /absolute/path/printed/by/the/build/breditor-experimental-flat-lists-0.3.0-alpha.22.tgz
```

Use the actual directories printed by each preceding command. The opt-in build
creates a fresh directory under `target`, not default package `dist` directories.
It does not publish, change default size budgets, or approve release readiness.

```ts
import { BreditorBrowserEditor, type BreditorFlatListBrowserEditorOptions }
  from "@breditor/experimental-flat-lists";
import initialize, * as wasm from "@breditor/experimental-flat-lists/wasm";

await initialize();
// Supply host, label, a V4 semantic profile, and its fingerprint-bound initial
// document (or a V6 session checkpoint). See the external consumer fixture.
const options: BreditorFlatListBrowserEditorOptions = { ...yourOptions, wasm };
const opened = await BreditorBrowserEditor.openFlatLists(options);
if (!opened.ok) throw new Error(opened.error.code);
// Dispose opened.editor when its host is removed.
```

Initialization fetches the adjacent Wasm asset; a bundler must emit it, or the
caller must supply a Wasm initialization input. `./wasm-binary` exports that
asset explicitly. `./advanced` exposes the matching lower-level browser API.
No deep imports or dependency on `@breditor/browser` or `@breditor/wasm` is needed.
The root also exports `FLAT_LIST_TOOLBAR_MANIFEST` for composing custom toolbars
and `preflightFlatListWasmSemanticProfile` for validating a profile and obtaining
its document fingerprint without accessing private modules.
Keep runtime objects inside this package's module graph: do not mix owner,
selection, profile or adapter objects with another installed Breditor runtime.

The existing contracts are unchanged: profile bootstrap V4, document V2, state
V3 and session/commit V6. Recovery must use the matching profile/fingerprint.
The default paragraph packages remain separate and do not gain list support.

Boundaries: one paragraph or heading per item; no nesting, indent/outdent,
tables, images, collaboration or general rich paste. Browser clipboard import
remains constrained by the existing plain-text policy. Desktop-only beta
qualification is incomplete: spoken VoiceOver, physical IME cancellation,
the historical intermittent WebKit fault, size budgets and large-list latency
remain release gates. Automated tests are not a substitute for native input or
screen-reader evidence.
