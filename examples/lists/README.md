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

For a separate, offline packed-consumer check:

```sh
npm run test:lists:packages -- target/flat-list-candidate-EXACT_ID
```

This stages private browser/Wasm tarballs under `target`, installs them with
locally packed dependencies into a fresh external temporary consumer, and checks
strict types plus real Chromium/Firefox/WebKit startup, toolbar and V6 history
recovery. It also runs the existing paragraph-only Node/types/Chromium smoke
against the same tarballs. There are no source aliases or workspace symlinks in
the consumer. Exact tarballs and consumer artifacts are retained for inspection.
The report compares sizes against unchanged default ceilings; a functional
pass is not a size-budget pass or approval of an optional shipping package.

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
## Repeatable installed-package measurements

After `test:lists:packages` passes, pass its saved qualification record to
`npm run test:lists:performance -- target/flat-list-packages-XXXXXX/qualification.json`.
This builds an external consumer of those exact installed tarballs, not source
aliases. It measures 10/100/500-item documents and asserts exact document,
selection, undo, backup/reopen and redo behavior. Reports retain browser versions,
artifact hashes and partial results on failure. No shipping output is replaced.

`BREDITOR_PERF_BROWSER=webkit BREDITOR_PERF_RUNS=5` runs up to five fresh browser
processes, stopping on the first failure (not retrying it). The default is one
process for each of Chromium, Firefox and WebKit. Optional `--diagnose-export`
instruments only the disposable bundle's export reader; additionally set
`BREDITOR_EXPORT_DEEP_DIAGNOSTICS=1` to log validation rejection sites and heading
rank scalars. Diagnostic runs cannot substitute for ordinary qualification.

Timing includes synchronous public-event work and forced layout. It is not
physical input, p95, memory profiling or a supported maximum document size.
The three-sample min/median/max values are local observations, not release gates.

For CPU investigation, set `BREDITOR_PERF_BROWSER=chromium
BREDITOR_PERF_CPU_PROFILE=1` when running the same command. This explicitly uses
an unminified diagnostic bundle and saves a Chrome-compatible `.cpuprofile`
alongside the report, with a sampled self-time summary. It profiles the whole
fixture, including untimed correctness assertions; its timings are not ordinary
production measurements. Neither installed tarballs nor shipping artifacts are
modified by profiling.
