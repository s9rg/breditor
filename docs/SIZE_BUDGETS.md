# Browser release size budgets

Status: required release gate, verified for the unpublished
`0.3.0-alpha.5` typed paragraph-structure checkpoint

Run `npm run check:size`. The command first builds every workspace, then
measures the actual generated package artifacts and the production React
reference build. It fails when an expected emitted set is empty, a required
singleton is absent or duplicated, or a budget is exceeded. Browser package
sets are enumerated recursively so nested emitted modules cannot escape the
total.

The current release ceilings are deliberately explicit:

- all emitted `@breditor/browser` JavaScript: 950,000 bytes;
- all emitted browser declarations: 245,000 bytes;
- all emitted `@breditor/reference-highlight` JavaScript: 28,000 bytes;
- all emitted Highlight + Link reference declarations: 24,000 bytes;
- generated Wasm binary: 1,600,000 bytes;
- generated Wasm JavaScript glue: 100,000 bytes;
- packed `@breditor/browser` tarball: 235,000 bytes;
- packed `@breditor/reference-highlight` tarball: 20,000 bytes;
- packed `@breditor/wasm` tarball: 520,000 bytes;
- reference-application JavaScript: 800,000 raw and 210,000 gzip bytes; and
- reference-application Wasm: 1,600,000 raw and 450,000 gzip bytes.

Alpha.6 recalibrated only the two raw JavaScript ceilings from 800,000 to
825,000 browser-package bytes and from 700,000 to 725,000 reference-application
bytes. The final Alpha.6 gate measured:

- browser-package JavaScript: 812,022 bytes;
- browser declarations: 218,408 bytes;
- reference-application JavaScript: 708,638 raw and 186,131 gzip bytes;
- generated Wasm: 1,224,221 bytes; and
- generated Wasm JavaScript glue: 46,732 bytes.

Alpha.7 recalibrates only the browser-package JavaScript and declaration
ceilings, from 825,000 to 860,000 bytes and from 225,000 to 235,000 bytes. Its
measured artifacts are:

- browser-package JavaScript: 848,850 bytes;
- browser declarations: 225,622 bytes;
- reference-application JavaScript: 722,537 raw and 189,216 gzip bytes;
- generated Wasm: 1,224,768 bytes; and
- generated Wasm JavaScript glue: 46,732 bytes.

The measured growth is the reviewed strict semantic-intent result adapter,
immediate-only public and toolbar delivery, descriptor-correlated action-state
catalog, and toolbar/profile admission code. The application, Wasm, glue,
gzip, and package-tarball ceilings are unchanged; the gate still counts every
emitted module recursively.

Alpha.8 adds separate ceilings for the callback-free reference package rather
than hiding it inside the browser allowance. Its clean package artifacts
measured:

- reference Highlight JavaScript: 8,088 bytes;
- reference Highlight declarations: 7,880 bytes; and
- packed `@breditor/reference-highlight` tarball: 9,430 bytes.

The first two values recursively total every emitted `.js` or `.d.ts` file.
The tarball value comes from the same lifecycle-disabled pack used by the clean
three-package consumer gate. The 12,000/12,000/20,000-byte ceilings leave
reviewable headroom without allowing a reference example to become an
unbounded runtime or silently bundle another browser copy.

A clean Alpha.8 rebuild of both the release candidate and the unchanged
Alpha.7 tag with the lockfile-selected Node/Vite/Rolldown toolchain produced
734,688 raw and 194,970 level-9-gzip application JavaScript bytes. The raw
application ceiling therefore moves from 725,000 to 750,000 bytes; the gzip
ceiling remains 200,000. The same-source tagged comparison produced the same
734,688-byte output, so this recalibration is build-output headroom rather than
reference-extension code being added to the React application.

The final `0.2.0` gate measured:

- browser-package JavaScript: 848,842 bytes;
- browser declarations: 225,614 bytes;
- reference Highlight JavaScript: 8,088 bytes;
- reference Highlight declarations: 7,880 bytes;
- generated Wasm: 1,224,760 bytes;
- generated Wasm JavaScript glue: 46,732 bytes;
- reference-application JavaScript: 734,680 raw and 194,962 gzip bytes;
- reference-application Wasm: 1,224,760 raw and 362,048 gzip bytes;
- packed browser package: 210,754 bytes;
- packed reference Highlight package: 9,435 bytes; and
- packed Wasm package: 428,471 bytes.

No final-release ceiling was widened.

The `0.3.0-alpha.2` typed-formatting checkpoint recalibrates only the packed
Wasm tarball ceiling from 450,000 to 455,000 bytes. Its clean deterministic
build measured:

- generated Wasm: 1,310,315 bytes;
- reference-application Wasm gzip: 384,753 bytes; and
- packed Wasm package: 451,381 bytes.

The raw and gzip Wasm ceilings remain unchanged. The 1,381-byte overflow over
the prior packed ceiling is attributable to the reviewed property-aware action,
validation, and exact replay paths now linked into the browser engine; package
contents and deterministic two-build checks remain unchanged.

The `0.3.0-alpha.3` checkpoint recalibrates the browser, declaration, Wasm,
demo, and Wasm-tarball ceilings for the reviewed ABI 4 bridge: Profile Bootstrap
V2, typed descriptor/projection getters, strict typed action/intent JSON,
explicit V3 profile factories, browser property validation,
`executeIntentJson()`, and Session V3 IndexedDB/autosave. Its passing actual /
ceiling measurements are:

- browser-package JavaScript: 905,441 / 910,000 bytes;
- browser declarations: 235,040 / 245,000 bytes;
- reference Highlight JavaScript: 8,088 / 12,000 bytes;
- reference Highlight declarations: 7,880 / 12,000 bytes;
- generated Wasm: 1,559,138 / 1,600,000 bytes;
- generated Wasm JavaScript glue: 51,502 / 100,000 bytes;
- reference-application JavaScript: 766,787 / 775,000 raw bytes and
  202,015 / 210,000 gzip bytes;
- reference-application Wasm: 1,559,138 / 1,600,000 raw bytes and
  433,691 / 450,000 gzip bytes;
- packed browser package: 221,799 / 225,000 bytes;
- packed reference Highlight package: 9,529 / 20,000 bytes; and
- packed Wasm package: 502,756 / 520,000 bytes.

The packages remain unpublished. These are local deterministic-build and
isolated-tarball gates, not registry size claims. Historical `0.2.0` and
alpha.2 measurements above remain the results for those checkpoints.

This includes the profile-aware projection path, descriptor-only bounded array
admission, and brand-checked native Event-family, Selection,
`AbstractRange`/`Range`/`StaticRange`, ClipboardEvent, and DataTransfer
boundaries. The gzip application, declaration, Wasm, glue, and package ceilings
were not raised. The new raw ceilings are explicit headroom for reviewed
semantic and browser-security code, not a code-splitting or file-enumeration
escape.

The `0.3.0-alpha.4` checkpoint recalibrates only the artifacts that now carry
the reviewed closed `safeLinkV1` policy, the additive Highlight + Link reference
profile, and the React-owned typed Link form. Its final clean-build actual /
ceiling measurements are:

- browser-package JavaScript: 931,778 / 950,000 bytes;
- browser declarations: 240,208 / 245,000 bytes;
- Highlight + Link reference JavaScript: 25,391 / 28,000 bytes;
- Highlight + Link reference declarations: 21,764 / 24,000 bytes;
- generated Wasm: 1,558,739 / 1,600,000 bytes;
- generated Wasm JavaScript glue: 51,502 / 100,000 bytes;
- reference-application JavaScript: 783,144 / 800,000 raw bytes and
  206,251 / 210,000 gzip bytes;
- reference-application Wasm: 1,558,739 / 1,600,000 raw bytes and
  433,449 / 450,000 gzip bytes;
- packed browser package: 228,658 / 235,000 bytes;
- packed Highlight + Link reference package: 14,624 / 20,000 bytes; and
- packed Wasm package: 502,604 / 520,000 bytes.

The browser JavaScript, reference JavaScript/declaration, application raw
JavaScript, and browser-tarball ceilings move from their alpha.3 values. The
browser declaration, gzip, Wasm, glue, reference-tarball, and Wasm-tarball
ceilings remain unchanged. Alpha.4 changes neither Wasm ABI 4 nor a durable
format; the small Wasm-size movement is deterministic release-string and
link-layout variation rather than a new transport surface.

The `0.3.0-alpha.5` checkpoint keeps every alpha.4 ceiling. Its final clean,
reproducible build and lifecycle-disabled package gate measured:

- browser-package JavaScript: 931,778 / 950,000 bytes;
- browser declarations: 240,208 / 245,000 bytes;
- Highlight + Link reference JavaScript: 25,391 / 28,000 bytes;
- Highlight + Link reference declarations: 21,764 / 24,000 bytes;
- generated Wasm: 1,568,465 / 1,600,000 bytes;
- generated Wasm JavaScript glue: 51,502 / 100,000 bytes;
- reference-application JavaScript: 783,144 / 800,000 raw bytes and
  206,251 / 210,000 gzip bytes;
- reference-application Wasm: 1,568,465 / 1,600,000 raw bytes and
  436,851 / 450,000 gzip bytes;
- packed browser package: 228,964 / 235,000 bytes;
- packed Highlight + Link reference package: 14,747 / 20,000 bytes; and
- packed Wasm package: 506,509 / 520,000 bytes.

Executable-code growth is confined to the reviewed Rust property-preserving
structural operation and action paths; package tarball deltas also include the
alpha.5 version and documentation updates. Alpha.5 adds no browser module, Wasm
ABI signature, durable-format generation, or package file class; all three
package tarballs still pass isolated import, type-check, production-bundle, and
real-Chromium initialization from local artifacts.

These are regression ceilings, not claims that every consumer downloads every
unbundled browser module. They include measured headroom for the supported
content-egress boundary without hiding growth by raising the bundler warning.
Gzip measurements use Node's level-9 gzip implementation and are reproducible
comparisons, not exact transfer-size promises for every CDN.

The browser build emits runtime JavaScript without source comments, then runs a
separate declaration-only pass so public API documentation remains in the
shipped `.d.ts` files. This keeps explanatory source and type documentation
without charging applications or the package tarball for duplicate prose.

The three packed-tarball ceilings run inside `npm run smoke:packages`, after
explicit browser/reference builds and the two-build Wasm package check and
before isolated installation. Packing disables lifecycle hooks so ambient npm
configuration cannot turn those prerequisites into a stale-artifact pass.

Native release builds keep optimization level 3 and one code-generation unit
without LTO. Shipped Wasm instead uses the dedicated `wasm-release` profile:
size optimization, fat LTO, one code-generation unit, aborting panics, and
stripped symbols. The pinned package pipeline also removes Wasm name and
producer sections and uses exact `rolldown 1.2.7` to deterministically minify
generated JavaScript glue while retaining its declaration link. Package checks
rebuild twice and compare complete hashes. On supported POSIX build hosts,
canonical source-path remapping plus exact logical/physical build-root checks
and common user-home pattern checks prevent host-specific workspace,
Cargo-home, or target prefixes from entering the module. Canonical relative
paths such as `cargo/registry/...` remain intentionally available for useful
panic locations. This reviewed recipe preserves the native throughput policy.
It kept ABI 3 within the historical `0.2.0` ceilings and keeps ABI 4 within the
current alpha.5 ceilings listed above.

The current React example deliberately initializes the editor eagerly and
disables Vite's module-preload polyfill because its production build emits one
JavaScript chunk and no preload links. The gate totals every emitted JavaScript
chunk, so future code splitting cannot evade either the raw or gzip ceiling.
The eager chunk can exceed Vite's generic 500 kB warning while still passing
the explicit product budgets; the gate does not suppress or relabel that
warning as an error.
