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
copied-source native consumer, strict workspace/shared documentation, paired
local/shared Wasm builds, TypeScript builds/tests/types,
installed-package checks and installed mixed editing, review and asset workflows.
It ends with the readiness inventory, not a release-readiness assertion.

Both profiles now require the actual paired-Wasm `retained-image-references`
probe. It covers all 30 grammar/scope/history combinations, exact pure reads,
returned-object provenance, invisible Redo and losing peer bindings, and exact
restore/future history. Its default portable form needs no historical cache;
earlier-runtime refusal and history comparisons require both explicit pinned
directories and are not silently counted otherwise. The installed writing-tools
consumer also repeats this complete probe from fresh bare package imports and
checks the new public local/shared/managed/React-accessible types. Its previous
writing and root/React assertions remain required.

Both profiles also require the public native `relay-room-backups` test with the
locked full-server feature set and the ordinary relay native cache. It exercises
exact comment/version/revision/final-decision recovery and original duplicate
receipts without reexecuting Accept. `relay-backups-no-server` repeats public
and library recovery without enabling networking, and `relay-docs` compiles the
public server Rust documentation with warnings denied. The full `relay-native` suite additionally
covers all ten original profile/transport choices, retained offline client work
and future Undo/Redo without losing a peer's text, strict transport admission,
trusted cut and identity mismatch, inert revision
preparation, poisoned sources and insert-only filesystem races. The
[server-log contract](SERVER_ROOM_BACKUPS.md) remains one recovery component, not
whole-room activation, asset closure or cross-generation qualification.

Both profiles also require `packet-asset-references` and `version-source-ownership`.
The former checks all 18 shared grammar/scope/history configurations through actual
Wasm, including source-and-intent bindings, explicit Pending, pure selected-source
capture, immutable/provenance/source-record guards and exact future history. The
latter checks catalog source replacement before startup, during live capture and
across an awaited save, retaining failed intent for exact retry. Both use explicit
IDB/lock fixtures, require no network or historical cache and grant no whole-room
or cross-device authority. Fresh installed writing-tools acceptance repeats their
unchanged assertions from the packaged public API, with fixture-only cache controls
resolved inside the installed archive. Pinned earlier readers are separate evidence.

Both profiles require `retained-store-backups`, which adds 90 actual native-backed
proposal/revision/catalog restores and reopens across 30 policy configurations,
exact point-in-time exports and future document/comment histories. It checks
occupied/unknown destinations, a noncooperative winner, transaction abort/retry,
failed-close export, missing source, cancellation and source replacement. The
fresh installed session-backup consumer repeats the complete unchanged public
probe in addition to its prior 20 document/paired cases and startup upgrade fences.
Storage, lock scheduling and server metadata are explicit fixtures; room-wide
transactions, asset-byte closure and cross-device/server authority remain separate.

Both profiles require `selected-asset-bytes` through actual shared Wasm. Thirty
configurations capture/read exact source and two PNG payloads, reconstruct 90
component archives, re-admit selected sources and compare 180 future checkpoints.
Fresh installed acceptance repeats the unchanged public probe, strict byte/source
types and production-module isolation. Full browser acceptance additionally uses
real PNG/JPEG/WebP decoders, exact source verification, local URL revocation and
IndexedDB Blob recovery after reload. Node storage/decoder fixtures and that one
Chromium artifact are distinct evidence scopes; neither supplies whole-room,
asset-upload-state, provider/server authority or cross-generation qualification.

The installed asset-browser stage now also verifies managed owner inventory of
two invisible Redo images, exclusion of unrelated store files, immutable returned
data, copied/foreign refusal and fresh native reads after a real reload. Persisted
metadata cannot be adopted as source provenance; an intervening Redo invalidates
the prior read. The [SDK checkpoint](qualification/2026-10-19-retained-asset-references-sdk.json)
records one passing frozen 33-check selection, fresh official producer builds,
separate pinned earlier readers and unchanged complete archive regressions. It
does not provide room consistency, a generation bridge or V1 approval.

Both profiles require `shared-docs` with `RUSTDOCFLAGS=-D warnings`, alongside
the strict workspace documentation check. The independent native consumer also
names the public retained-image reference type, observes a Redo-only binding and
restores exact future history without a direct core dependency. Source copies
exclude only each crate-root Cargo `target` cache; vendor/source entries with that
name remain. The [native reference checkpoint](qualification/2026-10-19-native-retained-asset-references.json)
records 29 passing selected checks at identical source across an initial 26-stage
success prefix and a three-stage continuation after locked npm cache recovery.
That earlier checkpoint additionally executes six canonical integration contracts
through the research compatibility manifest. It qualifies the then Rust-only
read, not a complete official-profile run; subsequent SDK evidence is separate.

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

Fullscreen adds an actual-Wasm/root/React probe and fresh isolated installed
acceptance to both profiles. The native API is an explicit fixture in that
portable probe; current grammar/history/recovery and borrowed-control assertions
remain unchanged when repeated inside installed packages. The full profile also
requires `installed-fullscreen-browser`, using a fresh production bundle, actual
Chromium activation/fullscreen/change events, viewport, typing/history and browser
storage. Physical Escape, other platforms and the complete V1 gates remain
separate qualification work. Fullscreen does not widen native document protocols.
The [fullscreen checkpoint](qualification/2026-10-18-fullscreen-browser-installed.json)
retains the passing frozen 25-stage selection, portable and native-browser results,
exact installed archives and distinct development preflights. It is not a complete
candidate profile or hosted CI approval.

Shared recovery adds document and paired archive probes plus a delayed-factory
database-upgrade regression to both profiles. Exact native replay, Redo, local
versions, selected review progress and insert-only failure/race handling remain
required. Fresh installed acceptance exercises the public factories without
workspace links. Its explicit development `--reuse-runtimes` mode records that
native producer builds were reused; neither candidate profile selects that mode.
The full profile additionally requires the installed backup production page in
headless Chromium, actual IndexedDB/Web Crypto/Web Locks and exact recovery after
a page reload. These checks do not qualify complete-room backup, cross-device
writer fencing, retention/rotation, process crashes or V1 readiness. See the
[shared archive contract](SHARED_SESSION_BACKUPS.md).

The [shared archive checkpoint](qualification/2026-10-18-shared-session-backups.json)
retains a frozen 23-stage selection, the independently pinned pre-repair installed
SDK witness and the repaired native-browser reload drill. Its final installed
stage uses fresh official runtime builders, not the earlier development reuse
preflight. The 36 document/108 paired portable cases and 20 real-browser workflows
are distinct evidence scopes; no complete-room restore or V1 gate is promoted.

Raster asset archives add mandatory portable snapshot/metadata/epoch, decode,
insert-only race and aborted-write contracts to both profiles. An actual shared
Wasm probe also checks original/general/document selections, both histories,
comments/versions and retained image bytes through future Undo/Redo. Its storage,
locks and two exact PNG decoding are explicit fixtures. The fresh three-package
consumer checks public types and a production bundle with registry
artifacts pinned to the producer lock, without workspace/shared/React modules.
The full profile additionally requires native PNG/JPEG/WebP decode, all four
upload states, atomic partial-add rollback and restored native image-history
behavior through a real reload in the installed Chromium artifact. The
[asset archive contract](RICH_ASSET_BACKUPS.md) retains whole-store scope and
separate authority/room-backup limits. An explicit development `--reuse-runtime`
mode does not qualify the official runtime builder and is selected by neither
candidate profile.

The [raster archive checkpoint](qualification/2026-10-18-raster-asset-backups.json)
retains a passing frozen 23-stage selection, the failing pre-repair opaque-receipt
regression and fresh official-build installed/browser evidence. Its 14 focused
storage tests and six shared image/history cases are portable fixtures; actual
PNG/JPEG/WebP, IndexedDB, crypto and reload are exercised separately in one installed
Chromium artifact. The earlier disk-exhausted run is retained as incomplete, not
counted as a pass. Neither complete-room recovery nor a V1 gate is promoted.

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
