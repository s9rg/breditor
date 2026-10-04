# Experimental heading demo

This separate React build exercises the real public browser editor with an
experimental Rust/Wasm heading profile. It reuses the standard demo's React
ownership, autosave, backup download and independent recovery UI. It does not
replace the default demo, overwrite its saved document, or publish a package.

## Reproduce

From the repository root, with Cargo/wasm-bindgen and local Node tools on PATH:

```sh
npm run build
npm run test:headings:experimental
```

The second command prints a qualified `target/heading-candidate-*` directory.
Pass that exact directory to the separate demo:

```sh
BREDITOR_HEADING_BINDINGS=target/heading-candidate-EXACT_ID npm run demo:headings
```

Open `http://127.0.0.1:4186/`. The config rejects missing/unqualified candidates,
paths outside this repository's `target`, and Wasm bytes whose hash no longer
matches their qualification record. It is a developer workflow, not a signed
artifact or trust boundary for files supplied by another party.

Production-build qualification (three installed Playwright engines required):

```sh
BREDITOR_HEADING_BINDINGS=target/heading-candidate-EXACT_ID npm run test:demo:headings
```

This builds only `target/heading-demo`, then serves those production assets.
It tests all heading ranks, mixed inline formatting, exact undo, typed Link/size
survival through reload, independent backup recovery with a retained redo branch,
automatic accessibility checks and narrow viewport overflow. Default demo tests
continue to use the original configuration and paragraph-only Wasm package.

## Boundaries

- Paragraph and h1–h6 controls are ordinary declared toolbar controls backed by
  Rust intents and action states. Existing inline shortcuts are unchanged.
- Bootstrap V3 explicitly selects the text-block profile, Document V2 and
  Session V5. The schema name and fingerprint differ from the standard demo.
- The autosave slot is `breditor.experimental-heading-showcase.v1`. No old
  checkpoint is relabeled or migrated. Recovery never writes to this slot.
- Downloaded backups contain selection, undo/redo and potentially deleted text.
  Keep them private. Only matching profile/generation backups can be restored.
- Plain-text paste is supported; rich paste, lists, tables and images are not
  implemented here. Flat bullet/numbered lists are the next feature milestone.
- The experimental Wasm has its own measured footprint. The default bundle
  ceilings are unchanged and currently failing for declarations/compressed JS.
- Automated browser checks are not OS IME, real OS clipboard or screen-reader
  qualification, and a narrow layout test is not a mobile support claim.
