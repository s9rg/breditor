# V1 candidate checks

The candidate verifier checks the current opt-in rich editor, collaboration,
interchange and review packages alongside the original default workspace. It
does not change package versions, publish, push, tag or deploy anything.

## Run the checks

Use the documented Rust, wasm-bindgen and Node toolchains with the workspace
dependencies installed. Native Cargo checks use the locked offline dependency
graph. Package-consumer checks build fresh archives and install them into
independent temporary projects.

```sh
npm run verify:candidate -- --dry-run
npm run verify:candidate:functional
npm run verify:candidate
```

The functional profile runs strict native formatting/lint/tests, an independent
copied-source native consumer, workspace documentation, paired local/shared Wasm
builds, TypeScript builds/tests/types,
installed-package checks and installed mixed editing, review and asset workflows.
It ends with the readiness inventory, not a release-readiness assertion.

The rich-browser TypeScript build is an explicit prerequisite of the shared and
editor SDK builds. The default workspace build does not generate that opt-in
package's `dist/browser` declarations. Both profiles also type-check it explicitly
and require `check-candidate-sdk-build.mjs`: two copied-source trees begin without
compiled rich-browser/shared/editor SDK files. The former shared-first order must
reproduce its missing-module diagnostics, while the declared order must build and
type-check all three. The check retains logs and verifies unchanged producer
source/outputs. It borrows external development dependencies and copies previously
built default browser/Wasm artifacts and candidate native bindings as explicit
prerequisites; this is SDK dependency-order qualification, not a full clean native
bootstrap, npm installation or hosted CI run.
The [build-order checkpoint](qualification/2026-10-18-clean-sdk-build-order.json)
retains that negative reproduction, corrected commands and exact fresh installed
archive comparisons in a frozen 15-check follow-up.

Search adds actual-Wasm programmatic, persistence, borrowed-control and managed
startup probes, plus independent installed vanilla/React workflows. The installed
search check seeds and verifies external registry artifacts against the producer
lock; it does not use workspace links. Its explicit `--reuse-runtimes` mode is
available for focused development checks and records that no fresh producer
rebuild was qualified. The candidate profile does not select that mode.

Input rules add current-runtime DOM/root/React probes and a fresh independent
installed consumer to both profiles. Their portable
`--current-runtime-only` scope needs no untracked historical runtime cache and
records three historical proof classes as deferred, not passed. All current
functional cases remain required. The stricter default standalone checker still
requires the exact pinned earlier/prior SDK pairs; it never silently substitutes
new binaries or falls back when those references are unavailable. The two scopes
write separate reports. The
[local pipeline checkpoint](qualification/2026-10-18-input-rules-candidate-pipeline.json)
retains both scopes, identical current-case counts and unchanged archive bytes.
It is selected-stage qualification, not hosted CI or a complete profile run.

Writing tools add actual paired-Wasm counts/outline, borrowed DOM controls and
managed persistence/React probes to both profiles, plus a fresh four-package
installed consumer. These mandatory stages use the current runtimes and need no
local historical cache. Independently pinned earlier-reference restore/history
checks require explicit arguments to `probe-writing-tools.mjs`; their absence is
recorded as no earlier-reader evidence, not silently counted as a pass. Installed
checks verify public types, exact package/runtime bindings, production bundle
isolation and unchanged functional probes without workspace source links. DOM,
storage and input fixtures do not establish physical platform qualification.
The [writing-tools checkpoint](qualification/2026-10-18-writing-tools-browser-installed.json)
records the passing selected-stage run, separate pinned-reader proof and exact
fresh installed archives; it does not claim a complete profile or hosted CI run.

Placeholders add actual paired-Wasm managed/React workflows and a fresh isolated
four-package consumer to both profiles. These stages use current runtimes without
requiring local historical caches. The standalone probe can additionally accept
both exact pinned earlier references for restore/future-history and unsupported-
option/default-DOM checks; omitted references supply no earlier-reader evidence.
Prompt fixtures exercise visibility, Copy, composition, read-only state, peers,
reopen, immutable configuration and early startup refusal, not physical input or
screen-reader qualification. The full profile additionally requires the installed
placeholder production-page check in one headless Chromium engine: actual DOM
placement, responsive prose/heading fonts and RTL, automated typing/history,
readonly transitions, disposal and unchanged default DOM. It is functional
layout/input evidence, not a physical-input or cross-browser qualification.
The [placeholder checkpoint](qualification/2026-10-18-placeholder-browser-installed.json)
retains the passing frozen 38-stage selection, exact current/pinned-reader proof,
fresh installed archive hashes and production-page results. It does not promote
the whole profile or any V1 gate.

The installed placeholder browser stage also covers rejected startup with a
focused preexisting input in all six local/shared/document/search factories,
followed by a successful same-host/writer retry. The
[rollback repair checkpoint](qualification/2026-10-18-startup-host-rollback.json)
retains the actual pre-repair failure and passing 18-stage follow-up. The bounded
guarantee leaves unchanged children connected; restoring a genuinely changed
host does not promise general focus restoration.

The local/shared runtime builders also stage a dependency inventory, available
upstream notice texts and the pinned Rust library notices before copying a
candidate runtime. Installed consumers verify their inventory/text hashes and
binding to the actual Wasm binary. These are separate from the original default
package's reviewed notice policy. Missing notice texts, license review and source
availability remain explicit release work; an inventory is not approval.

Both opt-in builders remap logical and physical repository, Cargo-home and target
paths to stable labels, then reject remaining absolute build/user-home paths in
the generated Wasm before copying package outputs. They control encoded Rust
flags for these candidate builds; extra `RUSTFLAGS`/`CARGO_ENCODED_RUSTFLAGS` and
ambiguous path prefixes containing `=` or the argument separator are rejected.
Use the separate research builds for custom compiler experiments. Paths with
spaces and symlinked build roots are supported by the remapping guard.

The default full profile also runs the existing default-package release matrix,
the installed editor browser matrix, one installed search production-browser
functional/geometry check and the fail-closed reviewed readiness guard.
That last guard fails while any capability or qualification gate remains open.
Neither profile supplies manual qualification or release approval. The functional
profile is a qualification subset, not a smaller approved V1 product scope.

`BREDITOR_CARGO` and `BREDITOR_NPM` can name executable paths. They are passed as
single executable arguments, never interpreted by a shell. The toolchains and
host/browser dependencies must already be available; this command is not an
environment installer.

The verifier passes its selected Cargo, rustc, wasm-bindgen, test runner, Node and
npm paths through the original and candidate scripts' corresponding environment
aliases. `BREDITOR_RUSTC`, `BREDITOR_WASM_BINDGEN` and
`WASM_BINDGEN_TEST_RUNNER_BIN` can select the paired tools explicitly. Legacy
`CARGO_BIN`, `RUSTC_BIN`, `WASM_BINDGEN_BIN` and `NPM_BIN` remain accepted inputs.
Conflicting aliases resolve to the explicit `BREDITOR_*` choice, which is recorded
for each stage; executable paths containing spaces remain one argument.

## Prepared hosted qualification

The manual workflow in
[GitHub Actions](../.github/workflows/candidate-qualification.yml) defaults to the
full profile and offers the functional profile explicitly. It has read-only
repository permissions, exact upstream Action revisions and no retained checkout
credentials, publishing or deployment step. Profile dispatch uses a validated
environment value rather than interpolating input into a command.

The workflow installs the baseline Node/Rust/bindgen pair, fetches the three
locked Cargo graphs before offline qualification, and installs all three
Playwright engines for the full profile. It retains only the run-owned candidate
results/logs for 14 days, including failure logs; setup failures remain CI failures
even when no candidate manifest exists. Upload scope excludes arbitrary target
data, application stores, credential files and hidden files. Log content must
still be reviewed before publishing evidence.

The file is JSON-formatted YAML so contract tests can inspect its structure
without introducing another parser dependency. Local tests validate its dispatch,
failure propagation, exact tools/actions, shell syntax and artifact scope. An
independent manifest-only offline npm installation also loads the baseline tools
with lifecycle scripts disabled. These checks do not establish successful hosted
Ubuntu execution, browser installation or Rust bootstrap. No workflow was pushed
or dispatched in this checkpoint, and the release-CI gate remains open.

## Retained evidence

Each execution owns a fresh `target/v1-candidate-runs/run-*` directory containing
an atomic `result.json` and a separate bounded log per stage. The manifest records
the source commit and working-tree content hash, host/Node identity, commands,
explicit environment overrides, outcomes, log hashes and selected artifact hashes.
Generated consumer reports must be fresh. A failure stops subsequent stages and
keeps the completed logs. Interruptions, timeouts, launch failures and log-write
failures cannot become passes.

Source evidence covers tracked and nonignored untracked files. The verifier
compares source identity before and after every stage; an edit or commit change
invalidates the run. Do not edit the repository during qualification. Ignored
build outputs and caches are excluded from source identity; selected generated
artifacts are recorded separately. This is working-tree qualification, not a
hermetic build or immutable release-candidate archive.

Each stage has a 32 MiB log limit and a 30-minute deadline, except the broad
default/browser matrices with two-hour deadlines. These do not relax the
underlying scripts' per-case bounds. Source inventory is bounded at 32,768 files,
32 MiB per file and 256 MiB in total. Cancellation targets process groups on POSIX;
Windows cancellation and crash durability are not qualified by this runner.

## Release approval

Every manifest keeps `v1Ready: false` and `publicationApproved: false`. A passing
run establishes only that its selected checks passed against its recorded source
and artifacts. The [release plan](V1_RELEASE_PLAN.md) and
[readiness ledger](v1-readiness.json) retain the remaining parity, compatibility,
storage, deployment, platform, performance and pilot requirements. Publication
and public deployment require separate authorization.
