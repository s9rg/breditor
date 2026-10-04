# Experimental flat list demo

This separate React preview exercises headings, flat bullet/numbered lists and
the existing typed inline formats through the real Rust/Wasm core. It reuses the
standard demo's React lifecycle, autosave, backup download and independent
recovery UI, with an explicitly bound list editor factory. Nested lists follow
in a later milestone.

## Reproduce

With workspace dependencies and reference package artifacts already built, and
Cargo/wasm-bindgen on PATH, qualify an isolated experimental candidate:

```sh
npm run test:lists:experimental
```

Pass the exact printed candidate directory to the preview:

```sh
BREDITOR_FLAT_LIST_BINDINGS=target/flat-list-candidate-EXACT_ID npm run demo:lists
```

Open `http://127.0.0.1:4187/`. The Vite configuration requires a passing flat-list
candidate under this repository's `target` directory and checks its Wasm hash.
It aliases the browser runtime to source and the Wasm module to the candidate;
it does not rebuild or replace package `dist` files. This local developer check
is not artifact signing or a trust boundary for third-party supplied files.

Production UI qualification uses all three installed Playwright engines:

```sh
npm run typecheck:demo:lists
BREDITOR_FLAT_LIST_BINDINGS=target/flat-list-candidate-EXACT_ID npm run test:demo:lists
```

The test command builds only `target/list-demo`, then checks heading ranks,
list conversion/removal, typed Link/size, undo/redo, real reload, downloaded V6
backup recovery, browser keyboard input, automated accessibility and narrow
layout. Browser automation is not physical OS clipboard/IME or screen-reader
qualification.

## Boundaries

- One paragraph or heading per list item; no nesting, indent/outdent, tables,
  images, task lists or general rich paste. Clipboard interchange is text, not
  list structure or retained inline formatting.
- Bootstrap V4, Document V2 and Session V6 remain explicit. The schema is
  `example/flat-list-showcase`; autosave uses
  `breditor.experimental-flat-list-showcase.v1`. No standard or heading slot is
  read, relabeled, migrated or overwritten.
- Recovering a backup opens a separate editor without autosave. Matching schema,
  fingerprint and session generation are required. Backups contain undo/redo and
  potentially deleted text; store them privately.
- The 21-control toolbar is manifest-composed: ten structural controls plus the
  existing eleven-control inline/history showcase. Shortcut declarations remain
  profile-owned and unchanged.
- This preview is not a published release. Bundle size/performance,
  packed-consumer and physical native-input qualification remain open; existing
  shipping size ceilings are unchanged.
