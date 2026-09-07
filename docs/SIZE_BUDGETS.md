# Browser release size budgets

Status: required `0.1.0` release gate passed

Run `npm run check:size`. The command first builds every workspace, then
measures the actual generated package artifacts and the production React
reference build. It fails when an expected emitted set is empty, a required
singleton is absent or duplicated, or a budget is exceeded. Browser package
sets are enumerated recursively so nested emitted modules cannot escape the
total.

The `0.1.0` release ceilings are deliberately explicit:

- all emitted `@breditor/browser` JavaScript: 800,000 bytes;
- all emitted browser declarations: 225,000 bytes;
- generated Wasm binary: 1,500,000 bytes;
- generated Wasm JavaScript glue: 100,000 bytes;
- packed `@breditor/browser` tarball: 225,000 bytes;
- packed `@breditor/wasm` tarball: 450,000 bytes;
- reference-application JavaScript: 700,000 raw and 200,000 gzip bytes; and
- reference-application Wasm: 1,500,000 raw and 400,000 gzip bytes.

These are regression ceilings, not claims that every consumer downloads every
unbundled browser module. They include measured headroom for the supported
content-egress boundary without hiding growth by raising the bundler warning.
Gzip measurements use Node's level-9 gzip implementation and are reproducible
comparisons, not exact transfer-size promises for every CDN.

The two packed-tarball ceilings run inside `npm run smoke:packages`, after an
explicit browser build and two-build Wasm package check and before isolated
installation. Packing disables lifecycle hooks so ambient npm configuration
cannot turn those prerequisites into a stale-artifact pass.

Native release builds keep optimization level 3 and one code-generation unit
without LTO. Shipped Wasm instead uses the dedicated `wasm-release` profile:
size optimization, fat LTO, one code-generation unit, aborting panics, and
stripped symbols. The pinned package pipeline also removes Wasm name and
producer sections and uses exact `rolldown 1.2.7` to deterministically minify
generated JavaScript glue while retaining its declaration link. Package checks
rebuild twice and compare complete hashes, so those transformations cannot hide
nondeterminism. This reviewed recipe preserves the native throughput policy and
keeps ABI 3 within the existing raw, gzip, glue, and tarball ceilings instead
of raising them.

The current React example deliberately initializes the editor eagerly, so its
single JavaScript chunk can exceed Vite's generic 500 kB raw warning while still
passing the explicit 200 kB gzip product budget. Code splitting is a future
application optimization; the release gate must not suppress or relabel the
warning as an error.
