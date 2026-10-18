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
the installed editor browser matrix and the fail-closed reviewed readiness guard.
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
