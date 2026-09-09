# Browser release size budgets

Status: required `0.2.0` release gate

Run `npm run check:size`. The command first builds every workspace, then
measures the actual generated package artifacts and the production React
reference build. It fails when an expected emitted set is empty, a required
singleton is absent or duplicated, or a budget is exceeded. Browser package
sets are enumerated recursively so nested emitted modules cannot escape the
total.

The current release ceilings are deliberately explicit:

- all emitted `@breditor/browser` JavaScript: 860,000 bytes;
- all emitted browser declarations: 235,000 bytes;
- all emitted `@breditor/reference-highlight` JavaScript: 12,000 bytes;
- all emitted reference Highlight declarations: 12,000 bytes;
- generated Wasm binary: 1,500,000 bytes;
- generated Wasm JavaScript glue: 100,000 bytes;
- packed `@breditor/browser` tarball: 225,000 bytes;
- packed `@breditor/reference-highlight` tarball: 20,000 bytes;
- packed `@breditor/wasm` tarball: 455,000 bytes;
- reference-application JavaScript: 750,000 raw and 200,000 gzip bytes; and
- reference-application Wasm: 1,500,000 raw and 400,000 gzip bytes.

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

This includes the profile-aware projection path, descriptor-only bounded array
admission, and brand-checked native Event-family, Selection,
`AbstractRange`/`Range`/`StaticRange`, ClipboardEvent, and DataTransfer
boundaries. The gzip application, declaration, Wasm, glue, and package ceilings
were not raised. The new raw ceilings are explicit headroom for reviewed
semantic and browser-security code, not a code-splitting or file-enumeration
escape.

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
panic locations. This reviewed recipe preserves the native
throughput policy and keeps ABI 3 within the existing Wasm raw, gzip, glue, and
tarball ceilings.

The current React example deliberately initializes the editor eagerly and
disables Vite's module-preload polyfill because its production build emits one
JavaScript chunk and no preload links. The gate totals every emitted JavaScript
chunk, so future code splitting cannot evade either the raw or gzip ceiling.
The eager chunk can exceed Vite's generic 500 kB warning while still passing
the explicit product budgets; the gate does not suppress or relabel that
warning as an error.
