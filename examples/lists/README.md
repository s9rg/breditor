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

The test command builds only `target/list-demo-qualification` using Vite's
`qualification` mode; it does not replace the ordinary preview at
`target/list-demo`. It then checks heading ranks,
list conversion/removal, typed Link/size, undo/redo, real reload, downloaded V6
backup recovery, browser keyboard input, automated accessibility and narrow
layout. Browser automation is not physical OS clipboard/IME or screen-reader
qualification.

Scripted composition cases additionally replace a backward selection inside a
bold numbered-list heading, verify provisional text is absent from a second
view's durable document, and check single-edit undo with exact directional
selection, V6 reload and redo. Cancellation and invalid numbering recover the
original document without adding history; the same editor must accept ordinary
typing afterward. These explicitly constructed events and provisional DOM
mutations are controller/persistence regressions, not real OS IME evidence.

If port 4187 is occupied by your preview, set `BREDITOR_LIST_TEST_PORT=4188`
(or another free port) for `test:demo:lists`. The test server never reuses an
existing server. This does not change the interactive preview's port.

## Disposable native clipboard check

Open `/manual-clipboard.html` on the same list preview. This separate entry point
uses the real flat-list editor, seed document and 21-control toolbar, but does
not enable autosave or read the main demo's IndexedDB slot. Reload resets it.
Use non-sensitive test text: native Copy and Cut replace the system clipboard.
The page never calls the Clipboard API itself.

Follow its Safari/Chrome checklist for single-item and cross-item copy/cut/paste,
caret movement, heading/list conversion, formatting and exact undo/redo. Capture
the report even if a check fails. It contains at most 256 event records, owner
status/revision, browser details and the qualified candidate's Wasm SHA-256;
it excludes document, clipboard, scratch and input contents. Review it before
sharing. Truncation, pending events, faults or missing observations prevent a
complete result. Reload starts a new recording.

When driving Safari through native accessibility automation, verify the actual
highlighted range before Copy or Cut. An accessibility `selectText` request can
leave a caret instead of the requested range. If that happens, click the intended
line and use native keyboard selection (for example, Cmd+Left then
Cmd+Shift+Right), checking the visible selection before proceeding. A trusted
Copy event by itself proves neither a nonempty selection nor clipboard output;
paste into the scratch area and inspect the exact result.

An `operator-confirmed` result is self-reported, not automatic certification:
browser automation can also produce trusted events. The automated suite verifies
the fixture, synthetic cross-item transfer, numbered-list history, empty-item
exit, report redaction and reload isolation in all three engines. Those checks
do not qualify physical OS clipboard, IME or a screen reader. Use the main demo
for separate OS composition, accessibility, autosave and V6 recovery checks.

## Private packed-consumer check

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
- This preview is not a published release. Private packed-consumer checks have
  passed, but that is not approval of a shipping package or its size budgets.
  Bundle size/performance, physical native-input and complete release
  qualification remain open; existing shipping size ceilings are unchanged.
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

Append `--core-only` to the measurement command to run the raw installed Wasm
engine without an editor DOM or browser owner. This separately measures fresh
action-state preparation, an exact cache hit, post-edit refresh, selection,
typing, projection, undo, export, backup/restore and redo. Every snapshot must
match the current revision, contain the complete fault-free catalog, and retain
correct undo/redo availability; reads must leave document/selection unchanged.
The same document sizes/text and three independent engines per size are used.

Raw commands do not request the result's `projectionUpdate()` readback;
projection-handle acquisition is timed separately, not full node readback or
rendering. Their final Boolean argument controls history-group closure, not
projection generation, and is `false` in this fixture.
Profile compilation happens once per process. Inspection/assertions
are outside the timed calls, and a reported zero can be timer rounding rather
than free work. These phase measurements are diagnostic, not quantities to
subtract directly from the browser-owner timings. `--core-only` and
`--diagnose-export` are mutually exclusive; optional Chromium CPU profiling also
works in core-only mode. Neither mode relaxes shipping behavior or release gates.

To investigate Rust call stacks, run
`node scripts/build-experimental-flat-list.mjs --diagnostic-names`, then qualify
that candidate with `scripts/check-experimental-flat-list-packages.mjs` and pass
the new package record to the CPU measurement command above. This uses a separate
Cargo cache and keeps function names while retaining existing ABI checks. Its
packages and measurement reports are explicitly marked as diagnostic. The named
binary differs from the ordinary binary: collect a new profile, never use its
function indices to relabel an older stripped profile. These larger artifacts
are not a delivery candidate, and their timings are not release measurements.
