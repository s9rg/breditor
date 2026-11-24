# V1 candidate checks

## Temporary directories for independent installs

The installed-consumer checks create fresh fixtures under the system temporary
directory. On Unix, set `TMPDIR` to an existing directory to choose the volume
for package archives, consumer installs, and fixture logs. The checks resolve
the directory before creating the fixture so the installation, custody checks,
and reported paths agree when the directory is reached through a symlink.

## Hosted setup evidence

The manual candidate workflow uploads a runner context report even when a
toolchain or dependency setup step fails before the verifier starts. It records
the selected commit and profile, the runner platform, and each step's outcome.
When the verifier starts, the same artifact includes its existing stage logs
and candidate result.

The hosted job starts a wall-clock budget before toolchain setup. At five hours
and 45 minutes, the verifier receives SIGTERM so it can stop its active stage
and write an interrupted result. The job retains the evidence before the
six-hour runner limit. A timed-out run fails qualification and keeps the
stages it reached for diagnosis.

When qualification fails, the candidate artifact also retains bounded raw
Playwright JSON from the rich, shared and installed application network
matrices when those reports exist. The browser failure index lists the copied
paths, digests and omissions. This preserves structured evidence even when all
browser tests finished and a later report check failed before retaining them.

The GitHub Actions job summary identifies failed setup or the last recorded
candidate stage. It gives the stage log's path within the uploaded artifact
when available.

Each running stage reports its elapsed time and captured log size once a
minute in the live job output. Detailed command output stays in the
stage log, which the workflow retains with the final evidence.

The run artifact retains completed runtime size reports and the dependency
inventories and notice files from the paired Wasm packages and native relay.
Reviewers can compare the exact files and their recorded hashes across builds.
When the installed browser matrix passes, the run also retains that stage's
archive digests alongside its browser test log.
The matrix uses the release relay from the native dependency stage and verifies
its executable hash before starting the browser checks.

## Independent release matrices

The manual candidate workflow offers `default-matrix` and
`editor-browser-matrix` profiles. Each runs the same matrix as the full plan
in its own checkout and can finish even when an earlier full-profile stage
is still running or fails. The editor browser profile builds the default
browser distributions and the native relay before testing fresh installed
SDK archives. It uses the same three desktop browser engines, relay hash
check and archive evidence as the full plan.

Locally, use `node scripts/verify-candidate.mjs --default-matrix` or
`node scripts/verify-candidate.mjs --editor-browser-matrix`. The results carry
the selected profile and leave full candidate qualification outstanding.

The default matrix runs workspace TypeScript and diagnostics after it builds
the default packages. Its browser and demo stages discover the selected
Playwright projects and cases before execution and require every discovered
case to pass exactly once. Both complete candidate profiles also run the full
workspace script suite after the Native executable and fixture producers.
That suite uses the exact shared runtime receipt from its candidate.

Select `rich-browser-matrix` to build the candidate's local rich runtime and
run the existing grouped rich browser suite in Chromium, Firefox and WebKit.
Each engine has a separate Playwright process and stage budget. The candidate
manifest retains each report and the workflow keeps failed traces. Qualification
and coverage review require a passing result for every reported spec, zero
skips or failures, and an executed suite for every candidate rich-browser spec
file on each engine. The bounded WebKit projects provide that file coverage
together. This matrix is also required by the full candidate plan.

Select `shared-browser-matrix` to run the shared collaboration browser suite
with the research Wasm probe and fixtures built from the candidate. Its network
cases use the same hash-verified release relay as the installed editor matrix.
Each batch must pass every case discovered by its selected Playwright command
and cover every scheduled file and project. The profile retains the discovered
case identities, three-engine Playwright reports and failed traces.
The full plan requires this suite along with the installed SDK checks.

Select `installed-application-network` to run the promoted SDK network suite
in Chromium, Firefox and WebKit. It builds and installs fresh browser, rich,
collaboration and editor packages and runs the same first-party pilot,
history and presentation assertions against the candidate Native relay.
The retained report includes the Playwright results, archive, shared Wasm,
relay and fixture digests. The workflow retains failed Playwright traces.

## Dependency inventories

Select `dependency-inventories` to build the rich and shared Wasm notice
bundles and the native relay inventory in one candidate job. On Linux the
relay inventory also records the ELF interpreter, linked libraries and library
search paths of the exact release binary. These reports support the dependency
review against the distribution's actual artifacts.

## Installed distribution workflows

Select `installed-distribution-workflows` to build the candidate Wasm and
native relay fixtures and run the installed interchange, mixed editing,
suggestion, Reader and review asset workflows in an independent job. The mixed
editing check reuses the interchange consumer produced in the same run. The
review checks pack and install their own clean consumers. The retained reports
and stage logs include npm archive digests, and the candidate manifest records
the relay fixture hashes. This profile exercises installed APIs and the native
relay through synthetic DOM and storage fixtures. Browser matrices are separate
profiles.

## Input rules and writing tools

Select `input-writing-workflows` to qualify the current input rules and
writing tools against the candidate source and fresh SDK archives. It runs
the existing borrowed controls and managed startup checks, then retains both
independently installed workflow reports. These reports bind the exercised
local and shared Wasm and npm archive hashes to the run and record the bundle
module checks. Historical reader qualification and physical-input evidence have
separate procedures.

## Installed feature browser checks

Select `installed-feature-browser` to build fresh SDK consumers and run the
search, placeholder, fullscreen, session backup and raster backup browser
checks, along with the three-engine rich-demo latency sample. The consumer
checks generate their build and archive receipts in the same checkout.
The run retains each primary installed consumer report and its corresponding
browser report. Reviewers can compare the npm archive hashes from the producer
with the Wasm and behavior recorded by the browser. The session backup browser
report also records IndexedDB recovery through a page reload.

## SDK type checks

Select `sdk-types` to run the full plan's workspace and promoted rich,
collaboration and editor type checks in an independent job. It builds the
default packages and the promoted dependencies first, including the local and
shared Wasm declarations the editor imports. Use
`node scripts/verify-candidate.mjs --sdk-types` to run the same stages locally.
Installed workflows and browser behavior have their own qualification profiles.

## Candidate shards

The manual full profile accepts an optional shard. The named shards cover the
contiguous native, runtime, SDK and relay stages through installed metadata
reconciliation. Each SDK or relay shard first runs the full plan's prerequisite
builds in its own checkout. The joint handover source and installed checks run
in separate jobs so each has its own time and evidence budget. The result
identifies the shard, its prerequisites, its assigned stage IDs and the source
digest, and retains its logs and reports.

Native cold restart runs authentication and each of the four document and
comment history pairs separately. Source and fresh-install jobs each verify
their case against the candidate runtime.

Reconciled packet recovery has separate source and installed jobs for the
short contracts, original Pending availability, checked current state and the
older reference-only read path. Every case checks the current candidate
runtime's receipt and retains its Native observations in the case report.

The source and installed metadata reconciliation jobs build the same three
companion native relay fixtures. The installed job verifies the copied
executables against the candidate build receipt.

Native generation reconstruction has separate source and installed shards.
Each builds the Native cohort prerequisites and uses a shared-runtime receipt
from its candidate checkout. Both shards verify the source and bytes of the
Native cohort reports before and after their contract runs. The installed shard
also checks the unpacked runtime against the receipt. The workflow retains both
result reports.

The installed generation execution and reconstruction stages pin each npm
archive at pack time, compare it with the consumer lock, and recheck the
archive bytes before recording the digests in their results.

Native generation execution also runs in separate source and installed shards.
The execution checks build their live generation and physical control fixtures
from the candidate. Each exercises the 92 existing contracts against its
receipt-bound shared runtime. The installed job repeats all 92 through the
fresh archive and through the production bundle, and verifies the installed
Wasm and glue before and after both runs. Both shards retain their reports.
When either Native generation qualification fails, its stage log records a
bounded summary of failing TAP test numbers and known source locations.

Run a shard locally with `node scripts/verify-candidate.mjs --shard <name>`.
Add `--dry-run` to inspect its checks. Run with the default shard selection
`none` for the complete plan. Readiness review and the remaining full-profile
stages are still required.

In the exact clean candidate checkout, run
`node scripts/check-candidate-coverage.mjs <result.json>...` over downloaded
candidate run manifests. Keep each manifest next to its logs and retained
reports. The coverage report checks the source digest, planned stage sequence
and retained file hashes. Direct stages that use a paired shared runtime must
name the same build receipt from their run, including the execution input
recorded by the runner. Coverage also verifies each direct stage’s command,
arguments, planned proof settings and successful process exit. It compares
absolute argument and planned environment paths inside the checkout by
repository-relative path and uses the recorded tool paths for the plan’s tool
roles. Candidate coverage requires directly executed stages.
Use the separate activation shard verifier for adopted worker reports.
Add `--require-complete` before the
manifest paths to fail if any engineering stage is missing. The functional
and focused profiles together can supply all engineering stage evidence
before the readiness ledger passes.

For hosted receipts, verify each downloaded ZIP against its artifact digest
in GitHub and confirm the corresponding workflow attempt succeeded. Add
`--require-hosted` to validate the recorded runner identity, revision,
profile, shard, setup outcomes and expected tool executable names alongside
each result. The Node version must match the exact pin in the candidate
checkout's qualification workflow. Keep
`runner-context.tsv` in the artifact directory above each `run-*` directory.
Compare the reported repository, run ID and attempt with the GitHub listing
for the same downloaded artifact. The coverage report also records the context
digest. This option requires artifacts from a workflow that records those fields.

To automate the comparison, save the authenticated GitHub REST responses for
`repos/OWNER/REPO/actions/artifacts/ARTIFACT_ID` and
`repos/OWNER/REPO/actions/runs/RUN_ID/attempts/ATTEMPT` as `artifact.json`
and `run-attempt.json`. Download that artifact's ZIP from GitHub. Keep the
responses and ZIP outside the extracted artifact. Supply the repository you
intended to qualify, then run this in the exact clean candidate checkout.

```sh
node scripts/check-hosted-candidate-artifact.mjs OWNER/REPO artifact.json run-attempt.json artifact.zip extracted/run-NAME/result.json
```

The command checks the ZIP digest from the artifact API and requires a
successful attempt of the candidate workflow. It uses `unzip` to verify that
the authenticated ZIP contains one matching manifest, runner context and
copy of each counted stage log and required retained report. It validates the
extracted copies with the regular coverage checker. The authenticated API
responses supply the trusted repository and run metadata.

## Whole-room activation jobs

Select `portable-relay-recovery` to run both relocation checks in a dedicated
candidate job. The workflow retains both reports, including the candidate,
relay, shared runtime and clean-installed archive hashes.

Both complete candidate profiles build the real relay fixture and run the
`portable-relay-relocation` and `portable-relay-legacy-handover` checks.
Each check uses the same relay executable with the workspace SDK and a fresh
offline-installed SDK. The candidate runner requires fresh reports bound to
the candidate's built shared runtime. The relocation scenario stops the source
process, parks its native files, restores the moved bundle, and verifies client
and provider inputs before serving from a separate process.

The manual [activation workflow](../.github/workflows/activation-qualification.yml)
builds the three package distributions, the normal shared runtime and the
three Native relay fixtures once. Six jobs run the existing source and
independent-install checks for warm handover, cold handover and relay restart.
Each job downloads the same build and checks the source commit, content digest,
Node and host identity, and artifact bytes before running. The final job checks
all six reports, their retained logs and the matching installed package hashes.
The shared Wasm build receipt binds the compiler output and matching packaged
Wasm, glue and declarations to the source commit. Workers receive that receipt
with the binaries and check the paired bytes before starting. The activation
launcher pins the receipt digest for its source fixtures and transfers a copy
into an independent consumer before running its tests. Direct historical runs
with their retained runtime can still use the historical Wasm pin.
The Native suggestion relay has a separate build receipt. It records the
executable Cargo selected for the current source and platform. Metadata checks
verify the receipt before using the relay, and installed checks compare their
copied executable with the verified build. Archived metadata checks keep their
original fixture pins.
This produces whole-room activation evidence. The full V1 qualification and
reviewed release gates are separate and still required.

Run the same commands locally in fresh checkouts of one commit. Build with
`node scripts/qualify-activation-shard.mjs prepare`. Pass the resulting
`target/activation-qualification-inputs` directory to
`node scripts/qualify-activation-shard.mjs run <stage> <inputs-directory>`
in a worker checkout with locked dependencies installed. Worker checkout
outputs must be absent so importing the build cannot overwrite them. Put the
six `activation-check-*` report directories under one directory and run
`node scripts/qualify-activation-shard.mjs verify <inputs-directory> <reports-directory>`.

Pass the same inputs and six report directories to `node scripts/verify-candidate.mjs`
with `--activation-evidence <inputs-directory> <reports-directory>` and the
chosen profile. The verifier checks the reports before starting, then compares
its local activation build with the worker inputs when it reaches the six
activation stages. It retains each worker log in the candidate run. The other
candidate stages still run in their original order. Running without this option
executes the six activation commands locally.

## November 4 completed integration

The [completed restart composition](qualification/2026-11-04-native-joint-reassociation-composition.json)
is now integrated locally. Its 129 source and 129 installed component cases pass,
as do the ordinary committed source workflow and an independently installed
pending-then-committed repeated restart. Actual Rust child deaths, fresh
authenticated confirmation/publication, seven source families, fourteen offline
lanes, three metadata lanes, exact asset states and future document/comment
Undo/Redo are checked. The repeated run preserves four earlier complete metadata
destinations. All 2,915 full-workflow installed files match the tested SDK.

The separate [bounded uncertainty observations](NATIVE_UNCERTAINTY_READ_OBSERVATIONS.md)
repair is also integrated after 82 source and 82 independent installed cases.
An injected real intent-reader refusal retains its numbers, sends no HTTP request
and performs no intent write. Final Main has 2,917 byte-matching SDK files, fresh
generated-output verification and four strict type contracts. The Native full
workflows qualify the preceding coordinator baseline; they were not rerun for
this failure-metadata-only patch.

These are controlled Node storage workflows with actual Rust processes. Physical
browser durability, generic cold client bootstrap, complete supported profiles,
the historical archive-read/WebKit faults, remaining parity and all thirteen V1
release gates remain open. Original protocols/defaults, normal Wasm, versions
and public-root exports are unchanged. Nothing is pushed, tagged or published.

## Earlier checkpoints

The following entries retain their earlier qualification scopes and failures.
The current integrated composition is described above.

[SDK Native publication](NATIVE_ROOM_PUBLICATION.md#repeatable-sdk-component-checks)
now passes both checked-in 22-case commands on one unchanged source snapshot,
including strict private declarations and 2,825 byte-matching independently
installed distribution files. Actual Rust HTTP controls commit and publish one
Native epoch while seven cold client families retain fourteen original offline
document/comment suffixes, three real image upload acknowledgements and exact
future native histories. Separate lost commit/publication replies require
explicit retries against the same actual owner; IPC only provisions and observes.
The artifact checker verifies complete retained intent bytes, descriptor pins,
actual receipts and the subsequent original-protocol delivery.

The [qualification](qualification/2026-11-03-sdk-native-publication.json) retains
source, independent packages, the exact Native binary, public workflow artifacts,
logs and earlier development failures in a compressed, read-back-verified proof.
The 192-case Native generation regression and strict lint preceded the new
JavaScript runners; all 3,158 Native build input files match the final source.
This is a private component checkpoint. The complete joint owner is being tested
separately; actor transfer plus metadata continuation, physical durability, full
policy/candidate matrices, remaining parity and all thirteen V1 gates remain
open. Neither historical archive-read nor WebKit fault is declared repaired.
Original protocols/defaults, versions, normal Wasm and public-root exports stay
unchanged.

[Approved retirement retry](NATIVE_ACTIVATION_SOURCE_SESSION.md#retrying-an-approved-partial-retirement)
repairs a reproduced failure where a partial durable source close left all fourteen
actors held but could never continue into replacements. The exact unchanged
reproducer, three new source cases, four existing source-session cases and both
metadata lifetime regressions pass. The seven retirement/source-session cases
also pass from independent packages. Repeated close failures, foreign recipe
refusal, reentrant terminal Close and seven exact future native histories retain
the same actor custody with zero ordinary writer acquisition. Strict private
types and all 2,835 installed distribution files match their producer.

The [qualification](qualification/2026-11-03-approved-retirement-retry.json)
preserves the original failure and the final evidence. This is a local ownership
repair; the full joint coordinator, complete candidate profiles, physical storage,
remaining parity and all thirteen V1 gates remain open. The earlier full 60-case
wrappers were not rerun. Original protocols/defaults, Rust, normal Wasm, versions
and public-root exports are unchanged; neither historical fault is declared fixed.

[Metadata namespace continuation](METADATA_NAMESPACE_CONTINUATION.md) now passes
the complete sixteen-case source workset and the same sixteen cases from fresh
independently installed packages. The actual seven-family replacement preserves
three local metadata lanes, original version/revision acknowledgements, pending
packets and exact future document/comment Undo/Redo. Its immutable four-Blob
intent precedes destination creation; nine storage laws and interrupted-write
resumption pass in both environments. All 2,815 installed distribution files
match their producer and strict private declarations pass.

The [functional qualification](qualification/2026-11-03-metadata-namespace-continuation.json)
retains exact source, packages, public Native/client/metadata files and earlier
failures in a compressed, read-back-verified proof. One earlier ordinary source
run failed an exact 1 MiB archive read that returned zero bytes before authority
callbacks. The later unchanged ordinary source run passes, as do two diagnostic
Native runs; these do not identify or repair that intermittent fault. The prior
source60/installed60 regression wrappers preceded only the new Intent constructor
repair; 2,446 other distribution files remain byte-identical. Do not count those
wrappers as a final-source full60 rerun.

This is private component functionality. Binding original metadata pins to the
actual retained activation capture and composing genuine Native commit,
uninterrupted actor transfer and authenticated whole-room publication remain
required. Physical storage, full policy/candidate matrices, remaining parity and
all thirteen V1 gates remain open. Rust, normal Wasm, versions, original protocols/
defaults and public-root exports are unchanged; neither historical fault is
claimed repaired.

[Genuine Native uncertainty across persistent source commands](NATIVE_ACTIVATION_SOURCE_SESSION.md)
now passes the complete three-case source workset and the same three cases from
fresh independently installed packages. One actual Rust commit loses its reply;
the SDK command fails while the real source exclusion stays held. A separate
command, explicit durable suspension and cold reopening retain the original
`request-started` intent with no fabricated receipt. Pending metadata records
remain literal, and all seven clients retain exact native checkpoints and future
document/comment Undo/Redo. All fourteen actor locks stay held through suspension;
this cold-reopen case releases them explicitly before reopening original writers.

Both open/closed metadata regressions pass again. All 2,803 installed distribution
files match their producer, strict private declarations pass and copied tests
reject references to the producer checkout. The exact source, complete actual
activation intent objects, Native observations, packages and logs are retained
in a read-back-verified compressed
[qualification](qualification/2026-11-02-persistent-source-native-unknown.json).
The prior source60/installed60 component qualification remains separate; its full
wrappers were not rerun for these test/runner changes. SDK/Rust implementation,
normal Wasm, versions, original protocols/defaults and public-root exports are
unchanged.

This qualifies uncertainty ownership and explicit cold preservation. Combining
real Native commit with uninterrupted actor transfer into replacement roots,
metadata namespace continuation and authenticated production publication remains
required. The fixture's real Rust router return uses test IPC, not a new production
publication API. Physical storage, full policy matrices/candidate profiles,
remaining parity and all thirteen V1 gates stay open. Neither historical fault
is declared repaired.

[Actual Native room publication](NATIVE_ROOM_PUBLICATION.md) adds a separate
operator control that owns the actual committed service and bound socket. Socket
custody is independent of the preparation runtime; only the authenticated worker
registers that same socket on its current live reactor. The new opt-in router
tracks actual upgraded connections through document/comment lease cleanup.
Cancelled waiters retain their worker/quota; cancelled close retains the same
server task, while failed or aborted cleanup stays explicitly uncertain.

The [functional qualification](qualification/2026-11-03-native-room-publication.json)
passes all ten focused cases, the complete 191-case generation-recovery suite,
42 ownership doctests and thirty consecutive cancelled-waiter runs. Strict library/
test lint, the no-server build, nineteen touched Rust formatting checks and four
candidate-plan cases pass. Actual publication survives preparation-runtime shutdown
and serves original offline document/comment work and future Undo/Redo under all
four history policy pairs. Two reproduced development defects and their exact
source/binaries remain in a compressed, read-back-verified proof: false HTTP200
when serving was spawned onto a dead preparation reactor, and an intrusive test
observer that provoked the production mutex refusal it was trying to observe.
The repair changes neither that refusal policy nor test timeouts.

Both candidate profiles require the new Native publication stage; complete profiles
were not run. The joint pin is association data, not certification of local editor
readiness. Combining this control with actual source/activation metadata pins,
uninterrupted actor transfer and seven-family installed SDK convergence remains
required. Physical storage, full policy matrices, remaining parity and all thirteen
V1 gates stay open. Normal Wasm, versions and original wire/default meanings are
unchanged. Neither historical archive-read nor WebKit fault is declared repaired.

[Persistent native activation source ownership](NATIVE_ACTIVATION_SOURCE_SESSION.md)
now retains the actual source reservation across failed commands and caller
cancellation. Explicit suspension checkpoints enlisted review/metadata owners,
drains dependent work and durably closes original sources before releasing or
transferring their actors. The repair preserves live-lease save assertions: each
actual final lease Close captures custody only after normal save/flush, and a
partial shutdown retains mixed original/captured ownership for canonical retry.

The complete 60-case source workset and the same 60 cases from fresh independently
installed packages pass. They include all seven source/replacement families,
all fourteen actor locks, exact future document/comment Undo/Redo, zero ordinary
writer acquisition during replacement, and actual version/suggestion/revision
children in three local metadata lanes. Both open and explicitly closed metadata
child lifetimes preserve pending packets without invented acknowledgements.
Strict private declarations pass; an independent compile matches 2,426 emitted
collaboration files and all 2,803 installed SDK distribution files match their
producer. The original failures and exact executed source are retained in a
compressed, read-back-verified
[qualification](qualification/2026-11-02-native-activation-source-session.json).

This is private component ownership, not completed authenticated whole-room
activation. A separate genuine lost-response workflow is still being tested;
metadata namespace relocation, normal route publication, the full SDK policy
matrix, physical storage, full candidate profiles, remaining parity and all
thirteen V1 gates remain open. Dedicated component commands are available but
are not yet part of every candidate profile. Rust, normal Wasm, original
protocols/defaults, public-root exports and versions are unchanged. Neither
historical archive-read/WebKit fault is declared repaired.

[Retired actor custody transfer](RETIRED_ACTOR_HANDOFF.md) now continues
same-scope retirement into a synchronously returned replacement executor. The
old reservation is revoked before caller-input reflection; invalid construction
restores it. Transfer requires the exact freshly verified preparation and the
actual closed owner with all fourteen actor locks retained. Saved phase or
receipt data cannot provide that custody, and ordinary writer acquisition is
never used for the handoff.

Two final source cases and the same two cases from fresh independently installed
archives pass through all seven concrete replacement families, local promotion
and exact future document/comment Undo/Redo. Eight unchanged regressions per
environment also pass in the earlier worksets. Those combined ten-case runs
retained one test setup failure: their last typing assertion restored a range
without placing a caret. Only that setup changed; all runtime source and 2,793
distribution files remain byte-identical. The final two cases were rerun; the
combined ten-case wrapper was not rerun. Strict source/installed types and
compressed proof are retained in the
[qualification](qualification/2026-11-02-retired-actor-handoff.json).

This supplies actual retirement-to-executor ownership. A persistent joint attempt
must still retain source exclusion through uncertain Native commits and
coordinate normal route publication with local replacement. Physical storage,
the complete SDK policy matrix, complete candidate profiles, remaining parity
and all thirteen V1 gates remain open. Rust, normal Wasm, versions and original
protocols/defaults are unchanged; neither historical archive-read/WebKit fault
is declared repaired.

[Actual native process loss and SDK recovery](NATIVE_PROCESS_RECOVERY.md) now
passes 27 source cases and the same 27 cases from fresh independently installed
packages. Both prepared and committed checkpoints survive actual child
`SIGKILL` and fresh-process target reacquisition. Fresh account tokens are
required, old tokens and stale controls refuse, and original protected writer/
comment credentials remain unchanged.

The complete seven-family cold workflow retains fourteen actual offline
document/comment suffixes and three real upload ACKs. A real native commit
response is lost after its process is killed; the old intent remains
`request-started` with no fabricated receipt. The new process stays inactive,
retains and inspects a separately selected complete intent, rejects the old
activation choice and commits the next epoch only after fresh approval.
Original protocol delivery then converges all fourteen lanes, and future
document/comment Undo/Redo remains exact for every client. The previous
inactive-raster baseline also passes in both environments.

A reproduced failed-boot cleanup bug is repaired: corrupt checkpoints still
refuse, while cleanup preserves that original error instead of masking it with
normal-shutdown assertions about an already killed process. The regression
preserves corrupt evidence, leaves actual durable authority files unchanged,
keeps the old owner closed and checks repeat cleanup. Startup is split into
eight documented Rust files; strict native-example lint, all eight formatting
checks and seven declaration files pass. All 2,804 package artifact files
match their producer, archives and independent installed copies. The
[qualification](qualification/2026-11-02-native-process-recovery.json) retains
exact executed source, binaries, complete old/new intent data, public Native/
client/raster files, the earlier development/lint failures and compressed proof.

This is actual Rust process-loss evidence over controlled Node IndexedDB, locks
and raster presentation. Physical browser storage, the full SDK history-policy
matrix, production whole-room actor handoff and route publication, full candidate
profiles and remaining parity still require work. Dedicated component commands
are not yet in every candidate profile. Normal Wasm, versions, public production
APIs and original protocols/defaults stay unchanged. Neither historical archive-
read/WebKit fault is declared repaired; all thirteen V1/parity gates remain open.

[Raster reads before native activation](RECOVERY_RASTER_BYTES.md) close the
ordering gap where recovery needed image bytes from a normal editing service
that had not yet been activated. A separate bounded operator endpoint reads
actual selected PNG/JPEG/WebP files while the native owner is inactive. Genuine
SDK source and continuation controls expose immutable, hashed Blob data through
private branded ports. Complete recovery and packet capture can use these
controls; existing normal account transports and all queue/ACK meanings stay intact.

The [qualification](qualification/2026-11-02-recovery-raster-bytes.json) passes
23 source cases and the same 23 cases from fresh independently installed packages.
The genuine seven-family workflow stops normal serving routes, recovers three
rasters including server-only content absent from all fourteen upload archive
roles, captures complete client and packet data, performs inactive Native
inspection, then makes one actual SDK-triggered native activation. Future
document/comment Undo/Redo remains exact for all seven clients. All 47 affected
Rust generation-control cases pass, as do strict library/test/example lint, the
no-server build, seven declaration files and eleven touched Rust format checks.
Independent compilation matches 2,408 emitted SDK files; all 2,804 installed
package artifacts match their producer and archives. Exact executed source,
binary, packages, actual public Native/client/raster files and development failures
are retained in a compressed, read-back-verified proof.

This qualifies controlled service retirement/reacquisition within one Rust
process. Physical host-process crash/reopen, real browser-storage durability,
production whole-room handoff, the full SDK history-policy matrix and complete
candidate profiles remain open. The dedicated component commands are available;
they are not yet wired into every candidate profile. Normal Wasm and versions
are unchanged. Neither historical archive-read/WebKit fault is declared repaired;
all thirteen V1/parity gates remain open.

[SDK coordination of durable native activation](SDK_NATIVE_ACTIVATION.md) now
passes 45 focused cases plus the complete genuine Native workflow from source,
and the same 46 cases from fresh independently installed packages. Seven cold
client owners retain fourteen offline document/comment suffixes and three actual
upload ACKs. A complete 15.8 MB intent is saved before any commit request. Losing
the real Rust response stays explicitly uncertain; separately approved retries
return the same receipt, and the actual durable authority advances one epoch.
Original protocol delivery then converges all seven clients and preserves exact
future document/comment Undo/Redo. Original Pending and cache meanings remain literal.

Twenty existing recovery/current-read regressions also pass. Strict declarations,
dedicated Native-example lint and nine touched Rust formatting checks pass. A
fresh SDK compile matches all 2,400 emitted files, and all 2,777 package artifact
files match independent archives. The [qualification](qualification/2026-11-02-sdk-native-activation.json)
retains exact source, binaries, complete intent/server/packet/raster data, the
earlier fixture assertion failure and a read-back-verified compressed proof.
Source cases ran in two separate jobs; the canonical combined source wrapper was
not executed. The installed wrapper completed its complete 46-case workset.

This is a qualified experimental SDK/native-service bridge. Public production
whole-room handoff, the complete SDK history-policy cross-product, physical
process/storage crash qualification, performance and complete candidate profiles
remain open. The new dedicated commands are not yet wired into every candidate
profile. Normal Wasm, original protocols/defaults and versions are unchanged;
neither historical archive-read/WebKit fault is declared repaired. All thirteen
V1/parity gates remain open.

The [native-held revision delivery contract](NATIVE_REVISION_DELIVERY.md)
now executes original outboxes through their genuine parent suggestion queue
loan, retaining real supersession/conflict receipts and exact immutable packets.
The [qualification](qualification/2026-10-29-native-revision-delivery.json) passes
1,049 direct checks and 475 independently installed checks, including all six
bound source families, owned/unowned child acceptance, permanent observers,
receipt/bridge failures, lost replies, competing revisions and actual parent/child
retirement. Two prepared seven-family room workflows settle all four bound
version, suggestion and revision stores and cold-reopen future document/comment
Undo/Redo. An accepted-predecessor history gap was reproduced in six families
and repaired in both ordinary and native revision discovery.

The three local-lane metadata bindings, complete provider/client/historical-copy
and asset reconciliation, and joint authenticated activation remain required.
Full candidate profiles were not run; all thirteen V1/parity gates remain open.
No package version, push, publication, tag or deployment changed.

The [native-held suggestion delivery contract](NATIVE_SUGGESTION_DELIVERY.md)
now executes original queued packets and decisions through genuine author or
permanent-observer transports while ordinary editing remains excluded. Its
[qualification](qualification/2026-10-29-native-suggestion-delivery.json) passes
871 direct checks and 299 independently installed checks. It covers all six
bound source families, owned/unowned Undo, actual receipt failures, lost replies,
observer lifetime and policy, and a prepared seven-family room that settles
four suggestion queues and version catalogs while preserving pending revisions.
Cold reopening retains future document and comment Undo/Redo for all seven.

Native-held revision settlement, explicit metadata bindings for the three local
lanes, complete provider/client/historical-copy/assets reconciliation and joint
authenticated activation remain required. Full candidate profiles were not run;
all thirteen V1/parity gates remain open. No package version, push, publication,
tag or deployment changed.

The [compound metadata preparation contract](HELD_METADATA_PREPARATION.md) now
opens original version, suggestion and revision children inside real segmented
and independent sources while native editing stays held. Preparation performs
no startup save or network work, uses exact original committed records, and
grants no ordinary mutation permission. It drains actual late lock callbacks;
partial preparation remains owned by the source for a later attempt.

The [qualification](qualification/2026-10-29-held-metadata-preparation.json) passes
676 direct checks, 106 independently installed checks, eight strict source type
stages and two installed type stages. It includes 60 native preparation policies,
20 lifetime cases, and actual seven-family room recovery that prepares and
publishes versions for all four bound source families while retaining their
pending proposal/revision records. Cold reopening preserves future document and
comment Undo/Redo for all seven families. Exact source/metadata/packet bytes,
complete room archives and packages have a read-back-verified proof index.

Suggestion/revision transport, metadata bindings for the three local lanes,
complete provider/client/historical-copy/assets reconciliation and authenticated
joint activation remain required. Original protocols, defaults, public exports,
package versions and normal Wasm remain unchanged. All thirteen V1 gates remain
open; full candidate profiles have not been executed.

The [native-held version delivery contract](NATIVE_VERSION_DELIVERY.md) now
connects explicit work admission to actual original catalog records, source
persistence and fresh authenticated transport. It preserves immutable version
packets and separates server acceptance from actual local durability. Real
storage aborts, authority loss after commit and lost replies retain exact retry
state; closing drains actual work before native exclusion can release.

The [qualification](qualification/2026-10-29-native-version-delivery.json) passes
593 direct checks, 98 independently installed checks, seven strict source type
stages and two installed type stages. It includes 48 direct native version
policies, 24 real failure/retry cases and original catalog publication through
prepared seven-family whole-room recovery, followed by cold future document and
comment Undo/Redo. Actual source/catalog/packet bytes, complete room archives,
package archives and logs have a read-back-verified index.

Unopened compound metadata children, suggestion/revision transport, all-family
metadata settlement, complete provider/client/assets reconciliation and joint
authenticated activation remain required. Original protocols, defaults, public
exports, package versions and normal Wasm remain unchanged. All thirteen V1
parity gates stay open; full candidate profiles have not been executed.

The [per-call metadata work contract](METADATA_ADMITTED_WORK.md) now admits
individual staging/write jobs through the actual held native reservation while
ordinary store methods stay excluded. Each actual promise is tracked by both
its original work owner and a separate one-job native witness. Disposal, another
job's failure or a visible offline status cannot release a pending job.

A reproduced staging lifetime trap returned a promise to a synchronous method
and released its witness early. The repair rejects that call in strict types
and reports JavaScript misuse while retaining its actual promise until settlement.
The [qualification](qualification/2026-10-29-admitted-metadata-work.json) passes
518 direct checks, 25 fresh offline-installed checks, six strict source type
stages and installed types. Nine new work laws run beside the real owned-history
receipt cases, existing native delivery/metadata regressions, original authenticated
4/6/6 metadata matrices and all candidate-plan/storage/verifier laws. Exact
before/after sources, logs and actual packages have a read-back-verified index.

This is a scheduling prerequisite. Constructor-owned metadata ports still must
connect it to actual source/record persistence and freshly authenticated transport.
Complete all-family metadata settlement, provider/client/assets reconciliation and
authenticated joint activation remain required. No protocol/default/version,
Rust source or normal Wasm changed; the 575/273 Rust baseline is carried. Full
626/634 candidate profiles were not executed. All thirteen V1 gates remain open.

The [native owned-suggestion ingress](NATIVE_OWNED_SUGGESTION_INGRESS.md) now
adopts an original authenticated server decision into its accepting writer's
history while the actual native owner remains exclusively held. Ordinary edits,
public method substitutions, copied proofs and stale reservations stay excluded;
the accepted command is never rerun. Source persistence and original queue receipt
settlement remain separate. Authority loss after native commitment reports refusal
while retaining the actual adopted history for fresh persistence and cold reopen.

The [qualification](qualification/2026-10-29-native-owned-history.json) passes
509 direct checks, 16 fresh offline-installed checks, six strict source type
stages and installed types. All six original/general/document and explicit/typing
policies use actual server Accept receipts, normal Wasm and cold future
document/comment Undo/Redo. Existing native delivery/metadata regressions and
original authenticated 4/6/6 metadata matrices pass. Before-source/log evidence,
actual packages and final source/logs have a read-back-verified proof index.

This primitive does not complete metadata networking. Constructor-owned metadata
ports, per-call work admission, complete receipt/outbox settlement, provider/client/
assets reconciliation and authenticated joint activation remain required. No Rust
source, normal Wasm, public defaults or version changed; the 575/273 Rust baseline
is carried. Full 626/634 candidate profiles were not executed. All thirteen V1
gates remain open.

The [metadata work custody contract](METADATA_WORK_CUSTODY.md) now includes
actual version/suggestion/revision transport callbacks and local cache writes
in native recovery exclusion. Disconnecting or disposing an adapter cannot
release its pending work or attachment. Compound shutdown names only genuine
same-core metadata children, drains them, closes them and repeats the strict
all-retired barrier before underlying source cleanup.

The [qualification](qualification/2026-10-29-metadata-work-custody.json) passes
488 direct checks, 32 nested independently installed checks, five source type
stages and installed public types. Eight before-repair failures reproduce the
missing adapter/store custody. Original authenticated version/owned-suggestion/
revision matrices pass with 4/6/6 policies in source and fresh offline archives.
The installed loader lost a directory URL slash; its recorded repair changes
only the checker and preserves byte-identical production packages. Both actual
full-storage workflows reopen seven cold native owners from 46 databases with
offline work and verify all-seven future document/review Undo/Redo. Exact
source, logs, archives and complete storage files have a read-back-verified index.

This repairs ordinary metadata exclusion and cleanup. Native-held metadata
delivery ports, owned-suggestion native ingress, receipt/outbox settlement,
complete provider/client/assets reconciliation and authenticated joint activation
remain required. The 575/273 Rust baseline is carried; no Rust source or normal
Wasm changed. Full 622/630 candidate profiles were not executed. Physical
durability and large-history cost remain unqualified; all thirteen V1 gates
remain open.

The [portable selected-storage contract](SELECTED_ROOM_STORAGE.md) now captures
actual selected component records in a complete typed binary file and restores
them into an entirely empty controlled origin at their original names. Plans
derive from the genuine room root, catalog and asset adoption; unrelated shared
document records stay outside the backup. Existing selected values must match
exactly, and only missing keys are added. Per-database commits survive a later
copy failure and require a newly observed, freshly approved retry.

The [qualification](qualification/2026-10-29-selected-room-storage.json) passes
471 direct checks, seventeen fresh offline-installed checks and five strict type
stages. A reproduced codec defect silently dropped built-in custom metadata; the repaired
codec refuses unsupported state before any asynchronous binary callback.
Both actual workflows save/read the portable file, restore 46 databases,
exercise a real partial-copy failure, reopen seven genuinely new native owners
with offline work, separately obtain fresh approval and renewed authenticated
receipts for three local review streams, then verify future document/review
Undo/Redo for all seven families. Complete emitted files and actual package
archives are retained with a read-back-verified proof index.

Restoration supplies data only. Current native/source admission and authenticated
delivery still use their separate normal policies; archived approval is never a
new gate. Literal protocol meanings, public defaults and normal Wasm are unchanged.
The prior 575/273 Rust baseline is carried, not rerun. The 615/623 full candidate
profiles were not executed. Relocation, unowned metadata dependencies, packet
transport custody, complete reconciliation, joint activation and sustainable
large-history cost remain open. Node storage is not physical crash durability.
All thirteen V1 gates remain open.

The [new data-restore contract](SELECTED_LOCAL_REVIEW_RESTORE.md) now restores
the original preparation and full local receipt records beside a genuine
reconstructed seven-family owner. Both original namespaces are reserved and
probed without placeholders. A fresh decision pins absent/identical destinations,
complete bundle bytes, actual current native cut and authenticated full path.
Conflicting data is refused. A real second-upgrade failure preserves the first
commit and requires a newly observed, freshly approved partial retry.

The [qualification](qualification/2026-10-29-selected-local-review-restore.json)
passes 453 direct checks, ten fresh offline-installed checks and four strict
type stages. Source and actual archives restore both metadata schemas, separately
resume through the normal freshly approved path, renew all three local review
streams and verify all-seven future document/review Undo/Redo with offline work.
Restored data never revives an old gate or grants server/actor permission.

Only these two metadata destinations were absent; underlying source/asset stores
were genuinely cold-reopened. Entirely empty-room restoration, relocation, packet
transport custody, complete reconciliation and authenticated joint activation
remain open. Physical durability and large-history cost remain unqualified.
The normal Wasm/public defaults are unchanged; the prior 575/273 Rust baseline
is carried. The 610/618 complete candidate profiles were not executed.
All thirteen V1 gates remain open.

The [local review delivery contract](SELECTED_LOCAL_REVIEW_DELIVERY.md) now
provides real authenticated delivery for independent-local, local-operation-snapshot
and local-operation-flat sources through a separate private owner. Original
family formats remain unbound. Complete export includes the original whole-room
before-file, current seven-family native/packet/upload file and every new receipt
record; the old current-file alone is not a backup of this new layer.

The [qualification](qualification/2026-10-29-selected-local-review-delivery.json)
passes 448 direct checks, 16 fresh offline-installed consumer checks and three
strict type stages. Both source and actual archives exercise three native review
streams, seven cold native owners, outstanding offline suffixes and future
document/review Undo/Redo. A real committed-but-refused export recovery bug was
reproduced, then repaired against unchanged assertions. The strengthened runs
also refuse a stored head changed during fresh approval and drain actual late
completion work before releasing custody.

This is existing-only cold recovery, not absent-destination receipt restoration,
metadata outbox settlement, full provider/client/assets closure or whole-room
activation. Node storage/locks do not qualify physical crash durability. The
normal Wasm and public defaults are unchanged; the prior 575/273 Rust baseline
is carried, not freshly rerun. The 605/613 full candidate profiles were not
executed. All thirteen V1 gates remain open.

The [private full-history resume contract](SELECTED_DELIVERY_JOURNAL_RESUME.md)
is now implemented in the library rather than remaining an isolated prototype.
It reopens complete saved facts and original preparation data existing-only,
requires genuine native/server/source continuation for every cut plus fresh
explicit approval, creates a NEW runtime gate and records its current cut before
admitting delivery. All old bytes and original catalog A/B meanings stay literal.

The [qualification](qualification/2026-10-29-fresh-cold-delivery-resume.json)
passes 447 direct checks and eight actual fresh offline-installed consumer checks,
with strict SDK/private types and no failures, skips or canceled cases. Real
seven-family cold reopening, after-approval old-byte corruption refusal, final
two bound-source receipts and all-seven future document/review Undo/Redo pass.
A genuine permission-boundary cleanup bug was reproduced twice: permission
refusal correctly blocked editing but retained the preparation namespace.
The source-compiled repair passes unchanged assertions; main source and fresh
archives also pass namespace retry, token non-replay and native exclusion checks.

The unchanged normal Wasm and real native service execute these workflows.
The prior575/273 Rust baseline is carried, not freshly rerun: no Rust changes
occur here. Public exports, package versions and ordinary defaults stay unchanged.
The complete600/608-stage plans are not executed. Node IDB/locks are fixtures,
not physical durability evidence. Three local comment lanes remain unbound;
authenticated adoption, metadata transport custody, full provider/client/assets
closure and joint activation remain required. All thirteen V1 gates stay open.
The historical WebKit fault is not declared repaired.

The [authenticated-path/owned-work qualification](qualification/2026-10-29-authenticated-path-owned-work.json)
freshly passes 575 server/273 no-server Rust tests, strict Rust/SDK checks, 166
SDK laws and all 205 plan/verifier laws. All thirty seven-author source/installed/
executed-bundle cases require genuine authenticated complete-path reads while
keeping old prior/current checks literal. Installed modules run unchanged old34
and new42 wire laws. A concrete four-controller cancellation bug is reproduced
with exact before sources, then passes ten repeats of its actual native/HTTP
regressions after repair. All141 unchanged retained-owner prototype tests pass
against the new native service; that SDK development code remains unmerged.
This is not cold editing resume, whole-client/provider adoption, physical
durability, whole589/597-stage plan qualification or V1 approval. All thirteen
gates remain open; the historical WebKit fault is not declared repaired.

The [complete-path/coupled-journal qualification](qualification/2026-10-29-ordered-delivery-path-coupled-journal.json)
freshly passes 565 server/273 no-server Rust tests, both strict all-target lint
modes, Rustdoc, format, public types, 124 SDK contracts and all 203 candidate-plan/
verifier laws. All thirty seven-author source/installed/executed-bundle cases
require the actual complete ordered native path and original predecessor checks;
34 unchanged installed wire laws also pass. Normal Wasm is unchanged. A separate
141-test development qualification verifies actual quiescence, exclusive gate
handoff and automatic stop on committed-but-refused recording, preserving facts
without reopening permission. It is not merged, installed journal qualification,
physical durability, authenticated remote path control or fresh cold editing
resume. The complete 584/592-stage plans and all thirteen V1 gates remain open.

The [intermediate-cut/journal qualification](qualification/2026-10-29-chained-delivery-journal.json)
freshly passes ten native guard tests, strict Rust/SDK checks, 124 SDK contracts,
79 candidate/plan laws and all ten seven-author source/installed/bundled modes.
Every case requires an actual intermediate predecessor while retaining the old
initial-predecessor check. Production libraries and normal Wasm are unchanged;
the full 559/273 Rust baseline is carried, not freshly rerun. A separate 136-test
development qualification covers factual journal storage, interrupted native
delivery, exact-byte CAS and all prior 112 retained-owner tests. It is unmerged,
not fresh editing resume, not installed journal qualification and not physical
durability. Whole-plan qualification and all thirteen V1 gates remain open.

The [authenticated delivery-control qualification](qualification/2026-10-29-authenticated-delivery-control.json)
passes 559 server/273 no-server Rust tests, both strict lint modes, Rustdoc,
format, 124 SDK contracts and 77 plan/verifier laws. All ten seven-author modes
run from source, fresh packages and an executed minified bundle with real
authenticated advanced-cut reads. The unchanged 34 wire laws also run from
installed modules. Both candidate profiles require the new native, SDK and
public type fences while retaining old checks. This is not current-client
adoption, partial-delivery resume, whole-plan or joint activation qualification.
Normal Wasm is unchanged; all thirteen V1 gates stay open.

The [server delivery-continuation qualification](qualification/2026-10-29-server-delivery-continuation.json)
freshly passes 551 server and 273 no-server Rust tests, both strict all-target
lint modes, strict Rustdoc, format and 75 candidate/plan laws. It requires full
native/raster ancestry from actual restore origin through the previous serving
cut to the current server. Source, fresh packages and the executed minified SDK
each run all ten seven-author modes and require that complete prior-cut check.
This is not an advanced-cut SDK adoption, resumable delivery journal or whole-room
activation qualification. The preparation prototype is unmerged, normal Wasm is
unchanged, and all thirteen V1 gates stay open.

The [real selected-delivery qualification](qualification/2026-10-29-native-selected-delivery.json)
passes all ten original native grammar/wire modes from source, fresh actual
package archives and an executed minified SDK: seven offline authors per mode,
real epoch-fenced/durable services, authentication/raster bytes/receipts,
idempotent reconnect, future native history and exact cold paired reopen.
Strict SDK/public types, all-target server-feature lint, format and 73 plan laws
pass. Both profiles require its source/native and installed/bundled stages.
The separate retained-owner prototype is not merged or whole-room qualified;
unbound sources, metadata outboxes, durable delivery preparation and joint
server/provider/client activation remain open. All thirteen V1 gates stay open.

The [relay quiescence qualification](qualification/2026-10-29-relay-recovery-quiescence.json)
passes 15 focused laws, four public late-save cases, ten unchanged segmented and
forty unchanged independent-history relay cases, the complete original 119-case
seven-family source suite, 45 native-branch regressions and 192 plan/verifier
laws. Fresh real package archives and an actually executed minified bundle each
pass all four public cases, with strict public types and no workspace links.
Both profiles require the contract, source and installed quiescence stages.
This does not execute the whole candidate plan, rerun the carried 545/273 Rust
baseline, merge the separate held-owner delivery prototype, reconcile every
packet/provider/client, or activate a whole room. Normal Wasm is unchanged and
all thirteen V1 gates remain open.

The [durable native activation qualification](qualification/2026-10-28-durable-native-generation-activation.json) passes
545 full server-feature tests, 273 no-server tests and 190 plan/verifier
laws without skips. It covers actual durable target preparation, same-owner cold
restart, refusal of post-source checkpoint loss, real process exits and native
HTTP/WebSocket offline/future-history continuation. Both candidate profiles
require its native and public stages. Both strict all-target lint modes, formatting
and Rustdoc pass. This is not whole-plan, fresh npm, complete provider/client or
coordinated whole-room qualification. All thirteen V1 gates stay open.

The [native service qualification](qualification/2026-10-28-native-generation-service-activation.json) passes
533 full server-feature tests, 273 no-server tests and 188 plan/verifier
laws without skips. Eight selected laws and a public ten-mode socket workflow
cover genuine source/target activation, the reproduced synced-without-lease
fallback, original offline document/comment retry receipts, future native history
and exact rasters. Both profiles require these native and public activation
stages; both strict all-target lint modes, formatting and Rustdoc pass.
This is not the whole candidate plan, fresh npm qualification, cold reactivation
or complete provider/client/whole-room closure. Normal Wasm is unchanged and all
thirteen V1 gates remain open.

The [durable source qualification](qualification/2026-10-28-durable-generation-source-handover.json)
passes 523 server-feature tests (346 unit tests, every public integration target
and 30 doctests), 273 no-server tests and 186 candidate-plan/verifier laws.
The selected native/public stages pass 12/4 laws, and twenty shared-read stress
repeats complete 4,800 successful statuses. All runs have zero ignored/skipped
tests. Strict all-target Clippy, formatting and Rustdoc pass. Both profiles require
the new real process/fault stage and the public ten-mode durable workflow.
This is not the whole candidate plan, portable consensus, hardware power-loss,
complete provider/client closure or authenticated whole-room activation. All
thirteen V1 gates remain open; the normal Wasm runtime is unchanged.

The [integrated native continuity qualification](qualification/2026-10-28-native-generation-continuity.json)
passes 509 server-feature tests (334 unit tests, all public integration
targets and 29 doctests), 273 no-server tests and 184 candidate-plan/verifier
laws without skips. Both all-target strict lint modes, formatting and Rustdoc pass.
Both candidate profiles now explicitly require the public-only generation handover
workflow as well as the unchanged complete native and epoch stages. This is not
an execution of the whole candidate plan or a replacement-room activation grant.
The normal Wasm runtime stays unchanged; all thirteen V1 gates remain open.

The additive [mixed-component qualification](qualification/2026-10-28-generation-component-reconstruction.json)
passes 119 source, 119 installed and 119 actual production-bundle laws, retaining
all previous 107 assertions and adding twelve component laws per path. Sixty-nine
native hosts, 180 control laws, 182 candidate-plan laws and seven strict types
are preserved. Normal Wasm and production Rust are unchanged; the native baseline
is carried. This does not execute the complete candidate plan, qualify the
separate native epoch repair or close any of the thirteen V1 release gates.

The additive [generation older-disk reconstruction qualification](qualification/2026-10-28-generation-native-reconstruction.json)
passes 107 source, installed-package and actual production-bundle laws per path,
including 91 unchanged generation/physical execution laws, six unchanged cold
execution laws and ten new reconstruction laws. Six strict consumer fixtures,
180 control laws and 180 candidate-plan laws pass. Sixty-three genuine native
fixture hosts are preserved. This is not an execution of the complete candidate
plan or closure of mixed-state recovery, room activation or any V1 release gate.

Both profiles require `delivery-operation-cohort-contracts`,
`delivery-operation-cohort-type-fence`, `delivery-operation-cohort` and
`installed-delivery-operation-cohort`. The private
[five-family contract](DELIVERY_OPERATION_COHORT.md) joins complete-delivery and
restored-operation parents to the existing local cohort without changing native
or file protocols. Four unchanged getter-reentrancy regressions fail before the
private cancellation fence and pass after it. Five real-cancellation laws retain
all upload owners and the established error-cause contracts.

The [selected qualification](qualification/2026-10-23-delivery-operation-cohort.json)
passes all 53 selected stages normally from the 355-stage functional plan.
Source contracts pass 41 laws and fresh packages pass 120 functional laws.
Source, installed packages and the actual production bundle each execute forty
five-family cohorts with 400 exact handoffs and 200 cold continuations, covering
five native profiles, four history pairs and restored snapshot-v1/lineage-v1
inputs. Scope/mask schedules are not their full Cartesian domain; mixed
lineage-v2 and the complete bundled negative suite are not established here.

All six full complete-delivery/restored source and installed domains pass
640 cases and 1,920 future native history pairs each. The restored source/parent
matrices use snapshot inputs. Existing local-cohort, native-input-cohort,
incoming-source and catalog integrations also pass. Eleven consumers pin matching
archives. Workspace tests pass 2,647, editor tests 385 and scripts 2,929, with three
existing browser skips. The 2,857 native inputs and twelve normal runtime files
are byte-identical to the prior native qualification, not freshly tested Rust
suites. Complete 355/363-check plans, seven-family durable adoption, reconciliation,
authenticated activation, sustainable history, full parity and all thirteen V1
release gates remain open.

Both profiles now also require `physical-catalog-v3-contracts`,
`physical-catalog-v3-type-fence`, `physical-catalog-v3` and
`installed-physical-catalog-v3`. The private
[seven-family catalog](PHYSICAL_ROOM_CATALOG_V3.md) retains both local-operation
formats without widening old readers, owns distinct absent-only database stores
and fences native/input observations after callbacks. Its fixed twenty-case
domain covers five normal profiles and four history pairs with atomic-v2
inventories; it is not the complete role/transport/older-family Cartesian domain.
The actual package/bundle workload and new nominal type fence are mandatory.
The [functional evidence](qualification/2026-10-23-physical-catalog-v3-functional-evidence.json)
covers 49 selected domains: 45 normal stages and four SDK completions recovered
after their runner parents were interrupted. Actual zero exits, original
deadlines, exact inputs and complete reports are verified; interrupted manifests
and partial logs are preserved, not converted into normal passes. The new
source/installed/bundle workload has equal twenty-case results. The full flat,
snapshot, journal and five-family source/installed matrices are freshly repeated.
Workspace/diagnostic tests pass 2,647, editor tests 385 and scripts 2,839, with
three existing browser opt-in skips. Eight fresh consumers pin matching archives.
The complete 343/351-check plans were not executed. The subsequent
[snapshot construction repair](qualification/2026-10-23-snapshot-handoff-construction.json)
is integrated; the current qualification above also repeats snapshot/flat cohort
and incoming-source integration. All thirteen V1 gates remain open.

Both profiles now require `native-input-incoming-source-contracts`,
`native-input-incoming-source-type-fence`, `native-input-incoming-source` and
`installed-native-input-incoming-source`. The private
[incoming native source](NATIVE_INPUT_INCOMING_SOURCE.md) binds an actual admitted
input handle to its genuine live journal/source, with fresh read policy and
both-lane native/version continuation. It is not a custody or activation grant.
The forty-case source/installed workload covers five native profiles, four
history pairs and both input families, with rotated scope/mask coverage rather
than a full Cartesian domain. The real production bundle repeats the workload;
installed assertions change reversible import/runtime/fixture locations only.
The [selected qualification](qualification/2026-10-22-native-input-incoming-source.json)
passes all 33 selected stages from the 339-check functional plan. Source/installed
laws pass 16/15, including one source plan law; each of source, installed archives
and the actual bundle passes forty cases with equal semantic results. Three
offline consumers pin matching archives. Workspace/diagnostic tests pass 2,647,
editor tests 385 and scripts 2,827, with three existing browser opt-in skips.
The initial false-only view assertion is corrected to full view equality; failed
runs remain retained and no native repair is claimed. Previous full recovery
matrices carry only across verified unchanged bytes, not as fresh executions.
The complete 339/347-check plans are not executed. All thirteen V1 gates remain open.

Both profiles now require `flat-local-participant-contracts`,
`flat-local-participant-type-fence`, `flat-local-participant` and
`installed-flat-local-participant`. The distinct private
[flat family](FLAT_LOCAL_OPERATION_PARTICIPANT.md) uses actual production
framing, semantic admission, shared journal and four-name native/upload custody.
The type fence preserves exact family/intent and source selection-policy types.
The fixed 480-case native domain and fresh installed assertions remain mandatory;
the earlier development overlays and snapshot qualifications do not replace them.
The [selected qualification](qualification/2026-10-22-flat-local-operation-participant.json) passes all 35 selected stages
from the 335-check functional plan. The flat source/installed domains each pass
480 cases and 1,440 handoffs, cold resumes and future history pairs. The separate
source and fresh-package suites pass 67/66 laws, including three repeated native
generations in all four history combinations; the source count includes the
candidate-plan law. Five consumers pin matching archives. Existing snapshot
standalone/complete-parent source/installed matrices pass freshly too.
Workspace/diagnostic tests pass 2,647, editor tests 385 and scripts 2,811, with
three existing browser opt-in skips. Other legacy matrices carry only across
exact unchanged bytes. All thirteen V1 gates remain open.

Both profiles now also require `native-input-journal-family-contracts`,
`native-input-journal-type-fence` and `installed-native-input-journal-family`.
The private [shared journal machinery](NATIVE_INPUT_OPERATION_JOURNAL.md) retains
closed snapshot-v1 wire semantics while sharing actual native publication and
read lifetime. Family identity and one-use facade construction use genuine
private slots; caller adapters, structural DTOs and unreturned owners refuse.

Its [selected qualification](qualification/2026-10-22-native-input-journal.json)
passes 31 checks from the 331-check functional plan. Full existing standalone and
complete-parent source/installed 480-case domains are freshly repeated, as are
their 33/37 focused laws. Four consumers pin matching archives; six new laws pass
both installed and genuinely bundled. Scripts pass 2,744 with three existing
browser skips. Unchanged legacy inputs/archive bytes carry other old full matrices.

The [49-test typed graph development proof](development/2026-10-22-typed-flat-local-operation.json)
alone did not integrate a graph family into the product registry or qualify its
complete parent and repeated product export. The later flat-family qualification
above covers those components. All thirteen V1 gates, room adoption, complete
reconciliation, authenticated activation and sustainable native history remain
open.

Both profiles require `restored-local-participant-contracts`,
`restored-local-participant-type-fence`, `restored-local-participant` and
`installed-restored-local-participant`. The private
[four-name restored-local parent](RESTORED_LOCAL_OPERATION_PARTICIPANT.md)
conserves genuine native/journal/input/provider and whole-upload ownership through
durable phases, cold resume, callback-safe transfer and same-owner cleanup retry.
Missing acknowledged components refuse without empty initialization. Fresh read
factories are independently selected; another runtime reconstructs its own anchor.

Its [selected qualification](qualification/2026-10-22-restored-local-operation-participant.json)
passes 28 checks from the 328-check plan. Source/fresh packages each repeat 37
focused laws and all 480 cases, with 1,440 handoffs/cold resumes/future history
pairs and twelve interruption boundaries 40 times each. The changed standalone
journal's complete source/installed 480-case domains and 33 laws also pass freshly.
Three consumers pin matching archives; scripts pass 2,737 with three existing
opt-in browser skips. Other legacy full matrices remain carried under exact
unchanged inputs/package bytes, not relabelled fresh.

That snapshot checkpoint qualifies complete restored-local ownership, not product
repeated flat export. The [flat-provenance development contract](FLAT_LOCAL_OPERATION_PROVENANCE.md)
had repeated editable/cold native evidence but did not replace typed kernel/SDK
integration and full source/installed domains. The later flat-family qualification
above covers those components. Room adoption/reconciliation, authenticated
activation, sustainable history, full parity and all thirteen V1 gates remain open.

Both profiles require `restored-local-journal-contracts`,
`restored-local-journal-type-fence`, `restored-local-journal` and
`installed-restored-local-journal`. The distinct
[restored-local journal](RESTORED_LOCAL_OPERATION_JOURNAL.md) owns literal incoming
provenance, publishes input LIVE once under actual native writer leases and cold
reconciles exact current/pending cuts. Both native histories and ordered versions
must continue input LIVE. Missing acknowledged owners are never initialized away.

Its [selected qualification](qualification/2026-10-22-restored-local-operation-journal.json)
passes 24 checks from the 324-check plan. Source/fresh packages each repeat 33
focused laws and the full 480-case domain, including 960 cold resumes, 1,440 exact
future history comparisons and six interruption boundaries 80 times each. Two
unchanged admission assertions fail before repair and pass afterward. Two fresh
consumers pin matching archives; scripts pass 2,699 with three existing opt-in
browser skips. Previous full matrices are carried under 5,175 unchanged inputs
and 1,048 actual old package files, not relabelled freshly executed.

That checkpoint is an actual native journal/source restore; the complete upload
parent and repeated flat export are qualified separately above. Room-family
adoption, complete historic copy/provider/client reconciliation, authenticated
activation, sustainable native history, full parity and all thirteen V1 release
gates remain open.

Both profiles require `independent-local-portable-contracts`,
`independent-local-portable-type-fence`, `independent-local-portable` and
`installed-independent-local-portable`. The distinct
[portable local contract](INDEPENDENT_LOCAL_OPERATION_PORTABLE.md) retains the
literal original, acknowledged/pending saves, unsaved LIVE, complete uploads and
selected pixels. Actual native replay checks both histories, unique ordered
versions, fresh read scopes and whole-upload conservation without acquiring a
writer. Missing pixels remain Pending.

Its [selected qualification](qualification/2026-10-22-independent-local-operation-portable.json)
passes 26 checks from the 320-check plan. Source/fresh packages each repeat 40
focused laws and the full 480-case domain, including 1,440 future native-payload
comparisons. Existing local-parent source/installed matrices pass freshly too;
three consumers pin matching archives. All previous implementation/assertion inputs
and 1,030 actual old package files are unchanged except README/candidate-plan
changes. Earlier full graph/journal/delivery domains are carried, not claimed fresh.

Native-payload replay does not adopt incoming operation/upload ownership; actual
editable/cold ownership is qualified above. Repeated restore/flat export, five-family room
adoption, all provider/client/historic-copy reconciliation, authenticated
activation, sustainable history and all thirteen V1 release gates remain open.

Both profiles require `independent-local-operation-participant-contracts`,
`independent-local-operation-participant-type-fence`,
`independent-local-operation-participant` and
`installed-independent-local-operation-participant`. The private
[complete local ownership contract](INDEPENDENT_LOCAL_OPERATION_PARTICIPANT.md)
retains genuine source/journal/provider and whole-upload custody through transfer,
cold resume, ten first-publication failure boundaries and callback-safe handoff.
No readiness-shaped record or serialized flag establishes native ownership.

Its [selected qualification](qualification/2026-10-22-independent-local-operation-participant.json)
passes 53 checks from the 316-check plan. Source/fresh packages each repeat 55
focused laws and the full 480-case native domain, including 1,440 handoffs and
future history pairs. Two unchanged assertions reproduce failed-release retry
against actual retained pre-repair packages and pass after repair. Nine fresh
consumers pin matching archives; existing source/installed journal, native-origin,
delivery-parent, graph, local-recovery, capture and full delivery-recovery workflows
also pass. Three existing opt-in browser skips are not platform qualification.

Complete portable local operation export/editable restore, five-family adoption,
all historic-copy/provider/client reconciliation, authenticated activation,
sustainable native history and full parity remain required. This is not the whole
candidate plan, physical durability or any of the thirteen V1 release gates.

Both profiles require `independent-local-journal-contracts`,
`independent-local-journal-type-fence`, `independent-local-journal` and
`installed-independent-local-journal`. The private
[local operation journal](INDEPENDENT_LOCAL_OPERATION_JOURNAL.md) retains actual
original/current/pending native saves under a distinct local-only storage family,
without manufacturing a delivery binding or silently dropping operation provenance.

Its [selected qualification](qualification/2026-10-22-independent-local-operation-journal.json)
passes 47 checks from the 312-check plan. Source/fresh packages repeat 47 focused
laws and the fixed 480-case native domain each, with 1,920 native opens, 1,440
cold journal resumes and all six prepare/source/acknowledge interruption
boundaries. Failed prepares require an explicit live retry; the other 400
interrupted cases cold-recover retained pending or committed data. The unchanged
fresh-read/expired-write-signal assertions pass after repair; an isolated build
with the retained development-before journal reproduces the failure.

Seven fresh installed consumers pin matching archives. Existing local-origin,
delivery-journal, local recovery, capture and full delivery-recovery workflows
also pass. The source-owned journal is not a complete whole-upload participant
parent, portable complete operational archive, five-family native room adoption,
sustainable history or authenticated activation. This is not the whole plan,
platform durability, a historical WebKit repair or any of the thirteen V1 gates.

Both profiles require `independent-local-origin-contracts`,
`independent-local-origin-type-fence`, `independent-local-origin` and
`installed-independent-local-origin`. The private
[local native-origin contract](INDEPENDENT_LOCAL_NATIVE_ORIGIN.md) preserves
local source meanings while verifying actual document/comment ancestry and
immutable local versions before autosave and later persistence. It explicitly
forwards temporary bootstrap policy, refuses incompatible private companions and
subscribes both selected first-write cancellation scopes.

Its [selected qualification](qualification/2026-10-22-independent-local-native-origin.json)
passes 39 checks from the 308-check plan. Source/fresh packages each pass 37 laws
and all 480 native cases, with 960 cold opens and 1,440 future history pairs.
Three development composition failures pass unchanged after the repair; an
isolated installed build with the recorded prior policy files reproduces them.
Existing source/installed delivery-origin, local recovery, capture and full
delivery-recovery workflows pass too. Six actual consumers pin matching archives.
This is not the whole candidate plan, a historical released-package bug claim,
five-family native adoption, sustainable history or V1 approval.

Both profiles require `independent-recovery-contracts`,
`independent-recovery-type-fence`, `independent-recovery` and
`installed-independent-recovery`. The
[complete local contract](INDEPENDENT_PARTICIPANT_RECOVERY.md) transfers actual
native/original-provider/upload owners without inventing a delivery binding.
Its [selected qualification](qualification/2026-10-22-independent-participant-recovery.json)
passes 38 checks from the 304-check plan. Source/fresh packages each repeat 128
laws and the fixed full 240-case native matrix, including 480 handoffs, 240 cold
resumes and 720 future history pairs. Six consumers pin matching archives; old
local capture and delivery recovery source/installed matrices also pass.

Four unchanged regressions prove the native late-cancellation repair; an isolated
rebuild with the recorded previous bootstrap implementation reproduces them.
Delivery's focused set now has 131 laws, including the same four transaction
boundaries. Original formats/defaults and normal native bytes stay unchanged.
Whole-room adoption, provider/client reconciliation, authenticated activation,
sustainable history and all thirteen V1 gates remain open.

The existing `independent-delivery-recovery-contracts`,
`independent-delivery-recovery-type-fence`, `independent-delivery-recovery` and
`installed-independent-delivery-recovery` now include the
[actual write-policy repair](INDEPENDENT_RECOVERY_WRITE_POLICY.md). The
[selected qualification](qualification/2026-10-22-independent-recovery-policy.json)
passes 31 checks from the 300-check plan. Twenty identical failures reproduce
against both old source and retained installed packages; all 127 expanded
recovery/custody laws pass against source and fresh packages. Both full workflows
repeat 256 cuts and 512 handoffs. The original two reproductions pass unchanged.
Source/installed semantic results match exactly; timing-dependent transport poll
totals are retained separately, not treated as invariant case counts. Current
catalog contracts pass freshly, while its two full 480-cohort matrices are
explicitly carried across unchanged data-reader inputs rather than claimed fresh.
Local-only recovery, whole-room reconciliation/activation and all thirteen V1
gates remain open.

Both profiles require `physical-catalog-v2-contracts`,
`physical-catalog-v2-type-fence`, `physical-catalog-v2` and
`installed-physical-catalog-v2`. The private
[five-family file contract](PHYSICAL_ROOM_CATALOG_V2.md) keeps actual immutable
archive/database/lease ownership and explicit graph read factories, without
turning file retention or prefix diagnostics into editable room adoption.
Its [selected qualification](qualification/2026-10-22-physical-catalog-v2.json)
passes 33 checks from the 300-check plan, 17 source/installed laws and the full
480-cohort catalog matrix each. Four installed consumers pin matching archives;
old catalog/inventory contracts remain intact. Separately reproduced native and
upload recovery policy failures and isolated repair evidence are retained, not
counted as fixed by the catalog qualification. They are repaired and qualified
separately above. All thirteen V1 gates remain open.

Both profiles require `independent-inventory-contracts`,
`inventory-input-snapshot-contracts`, `independent-inventory-type-fence`,
`independent-inventory` and `installed-independent-inventory`. The
[independent participant contract](INDEPENDENT_PARTICIPANT_INVENTORY.md) admits
genuine independent local/delivery histories and private graph-restored native
borrows without inferring delivery bindings or activation permission. Its
[selected qualification](qualification/2026-10-22-independent-inventory.json)
passes 31 checks from the 296-check functional plan, including 23 source/installed
laws and the full 480-cohort native matrix each. Eight actual input-snapshot
failures have unchanged passing assertions. Its earlier 96-cohort five-family
catalog prototype is superseded by the separately qualified file component
above; editable room adoption and all thirteen V1 gates stay open.

Both profiles require `restored-graph-contracts`, `restored-graph-type-fence`,
`restored-graph` and `installed-restored-graph`. The private
[complete graph](RESTORED_OPERATION_GRAPH.md) preserves actual native history,
whole uploads, older input-only pixels and exact incoming provenance through
further editable restores and cold reopens. The
[selected qualification](qualification/2026-10-22-restored-graph.json) passes 29
checks from the 291-check functional plan. Source/fresh installed packages repeat
28 focused laws and the byte-identical full 640-policy graph probe each; the four
existing parent/standalone recovery matrices also pass. The retained disposal
failure has unchanged passing assertions. Whole-room integration, sustainable
native lifetime and all thirteen V1 gates remain open.

Both profiles require `restored-operation-read-contracts` and
`installed-restored-operation-read`. The private
[independent read scope](RESTORED_OPERATION_READ.md) holds actual input/native
lifetimes under fresh read authorization after writer expiry, without authorizing
writes. The [selected qualification](qualification/2026-10-22-restored-operation-read.json)
passes 13 checks from the 287-check functional plan, 15 source/installed read laws
and all four normal 640-case parent/standalone source/install recovery matrices.
The new read laws cover both input kinds and four document/comment history
combinations; the full matrices separately check ordinary restore/write behavior.
Complete follow-on export, room integration and V1 approval remain open.

Both profiles require `restored-participant-contracts`,
`restored-participant-type-fence`, `restored-participant` and
`installed-restored-participant`. The private
[whole-input participant coordinator](RESTORED_PARTICIPANT.md) retains genuine
source and upload ownership across interrupted restore and final handoff. The
[selected qualification](qualification/2026-10-22-restored-participant.json)
passes 17 checks from the 285-check functional plan. Source/fresh offline packages
repeat 29 focused laws and the full 640-policy snapshot-input matrix each;
flat lineage and pending-only pixels have separate focused coverage. A reproduced
partial-owner retry failure has unchanged before/after assertions. An intermittent
raster-admission refusal remains unexplained, not repaired by subsequent passes.
Complete follow-on provenance export and whole-room activation remain required.

Both profiles require `restored-operation-source-contracts`,
`restored-operation-source-type-fence`, `restored-operation-source` and
`installed-restored-operation-source`. The private
[source restore component](RESTORED_OPERATION_SOURCE.md) retains full incoming
provenance while replaying original/CURRENT/PENDING/LIVE through actual native
source owners. Source and fresh offline installed packages repeat 31 laws and
the byte-identical full 640-policy snapshot restore probe. At that source
checkpoint the functional plan had 281 checks; parent handoff is added separately
above. Next provenance export and room activation remain required; no V1 gate is closed.

Both profiles require `held-asset-restore-contracts`,
`held-asset-restore-type-fence` and `installed-held-asset-restore`. The
[held whole-upload factory](HELD_ASSET_RESTORE.md) keeps actual custody through
policy-guarded insertion and return. Source/installed packages repeat 20 new and
58 unchanged asset laws, with strict public types. At that held-asset checkpoint,
the functional plan had 277 checks. Complete participant restore and room
activation remain separate.

Both profiles require `bounded-operation-storage-contracts` and
`installed-bounded-operation-storage`. The [storage admission repair](BOUNDED_OPERATION_STORAGE.md)
checks row bounds before value reads without changing save transaction semantics
or stored families. Source and fresh offline packages repeat the same 23 laws.
The functional plan at that storage checkpoint had 274 checks; byte/memory and physical durability
qualification remain separate.

Both profiles require `native-owner-lifetime-contracts` and
`installed-native-owner-lifetime`. The [lifetime contract](NATIVE_OWNER_LIFETIME.md)
reserves native ownership before callbacks and distinguishes factory cleanup from
an editor's own disposal. The same 32 laws run in source and fresh offline
installed packages. The functional plan at that lifetime checkpoint had 272
checks; no V1 gate is closed.

Both profiles require `independent-operation-lineage-contracts`,
`independent-operation-lineage-type-fence`, `independent-operation-lineage` and
`installed-independent-operation-lineage`. The private
[lineage data family](INDEPENDENT_OPERATION_LINEAGE.md) keeps exact restore inputs
and later states in a flat content-addressed file. The same 29 laws and
byte-identical full 640-case probe run in source and fresh installed packages.
The functional plan at that lineage checkpoint had 270 checks. Durable restore/source ownership and room
activation remain required.

Both profiles require `independent-operation-portable-contracts`,
`independent-operation-portable-type-fence`, `independent-operation-portable` and
`installed-independent-operation-portable`. The private
[portable operation data boundary](INDEPENDENT_OPERATION_PORTABLE.md) retains
original/current/pending/live native work, whole uploads and the exact raster
reference union. The same 31 focused laws and byte-identical full 640-case probe
run in source and fresh installed packages. The functional plan at that capture
checkpoint had 266 checks.
Portable operation restore, room adoption and activation remain required.

Both profiles require `independent-operation-participant-contracts`,
`independent-operation-participant-type-fence`, `independent-operation-participant`
and `installed-independent-operation-participant`. The private
[operational participant](INDEPENDENT_OPERATION_PARTICIPANT.md) joins genuine
recovery, the new native source/journal and actual whole-upload custody. The same
28 laws and byte-identical full 640-case probes run in source and fresh installed
packages. The functional plan at that owner checkpoint had 262 checks; portable
operation restore, whole-room adoption and activation remain separate work.

Both profiles require `independent-operation-journal-contracts`,
`independent-operation-journal-type-fence`, `independent-operation-journal` and
`installed-independent-operation-journal`. The private
[save journal](INDEPENDENT_OPERATION_JOURNAL.md) runs on actual source open,
prepare, commit, acknowledgement and close. The checks require the same 50 laws
and byte-identical 640-case source/installed probe. The functional plan at that
journal checkpoint had 258 checks. The operational owner above joins actual
participant/upload ownership; portable operational export and room activation
remain separate work.

Both profiles require `independent-operation-origin-contracts`,
`independent-operation-origin-type-fence`, `independent-operation-origin` and
`installed-independent-operation-origin`. They check the private
[native autosave boundary](INDEPENDENT_OPERATION_NATIVE_ORIGIN.md) with genuine
original/segmented document and independent comment replays, zero-write refusal,
transaction/lost-acknowledgement laws and readable unsaved exports. Fresh archives
repeat the 22 focused laws and full 640-case legal native-policy matrix. The
functional plan at that native-origin checkpoint had 254 checks. The source
journal above adds durable cut intent; complete operation/room ownership remains
separate work.

Both profiles require `operation-asset-custody-contracts`,
`operation-asset-custody-type-fence` and `installed-operation-asset-custody`.
They qualify [actual multi-owner upload custody](OPERATIONAL_COHORT_CUSTODY.md#hold-every-selected-upload-store)
and canonical final source guards for original/generation recovered and operational
handoffs and mixed-family cohorts. The installed consumer repeats the same 45 laws
with strict public types and reversible module-location changes only. The current
functional plan at that handoff checkpoint had 250 checks; whole-room activation remains separate work.

The [handoff qualification](qualification/2026-10-21-operation-asset-custody.json)
records 101 passing selected stages, including fresh native suites and the
isolated producer-rebuild/install check. It does not execute all 250 plan checks
or close any V1 gate. Its retained index distinguishes 29 matching archive reports
from the 20 actual consumer installations behind them.

Both profiles require `asset-custody-contracts`,
`independent-delivery-recovery-contracts`, `independent-delivery-recovery-type-fence`,
`independent-delivery-recovery` and `installed-independent-delivery-recovery`.
They qualify the [durable recovery contract](INDEPENDENT_DELIVERY_RECOVERY.md),
including exact interrupted-commit adoption, native cold replay, current read-only
handoff and actual upload-store custody through its final barrier. The functional
plan at that recovery checkpoint had 247 checks; operational descendants and whole-room activation remain open.

The [recovery qualification](qualification/2026-10-21-independent-delivery-recovery.json)
passes 61 selected stages and 1,897 script tests with three existing skips. Source
and fresh installed packages each repeat 99 focused laws and 256 recovery cuts,
including 512 handoffs and exact upload/original-file checks. Fourteen installed
reports pin matching archives. Both pre-fix regression package sets and the
superseded interrupted run are retained explicitly. Complete native-suite
evidence is carried only across unchanged native inputs/runtime; this is not
whole-plan, operational continuation, physical durability, activation or V1 approval.

Both profiles require `independent-delivery-participant-contracts`,
`independent-delivery-participant-type-fence`, `independent-delivery-participant`
and `installed-independent-delivery-participant`. They qualify the
[complete participant contract](INDEPENDENT_DELIVERY_PARTICIPANT.md), including
exact pending records, receipts, raster payloads, whole cancelled upload state,
current-policy recovery and real authenticated author/observer continuation.
Canonical facade tests include the repaired old local-only capture. The current
functional plan at that checkpoint had 242 checks; whole-room coordination and activation remain open.

The [complete participant checkpoint](qualification/2026-10-21-independent-delivery-participant.json)
passes 55 selected stages and 1,797 script tests with three existing skips. Source
and fresh installed packages each repeat 44 focused laws, 120 local native cases
and 88 authenticated network cases, with 136 complete network archive restores.
Thirteen installed reports pin matching archives. The exact final false-Ready
regression fails on the retained previous archive. Complete native-suite evidence
is carried only across unchanged native inputs and all six normal shared runtime
files; it is not freshly reexecuted in this SDK checkpoint. This is selected
functional evidence, not whole-plan, physical durability, activation or V1 approval.

Both profiles require `independent-delivery-contracts`,
`independent-delivery-type-fence`, `independent-delivery` and
`installed-independent-delivery`. They check the
[atomic delivery contract](INDEPENDENT_DELIVERY.md): complete independently
selected native histories, exact pending review/version work, acknowledged
receipt discipline, real authenticated author and observer recovery, and future
native Undo/Redo. Fresh offline archives repeat the same functional assertions
and strict public types. The functional plan at that checkpoint had 238 checks; these
stages do not qualify physical whole-room adoption or V1 readiness.

The [delivery qualification](qualification/2026-10-21-independent-delivery.json)
records 51 main stages and two fresh complete native suite stages passing against
one frozen source. The script suite passes 1,752 tests with three existing skips;
native suites pass 379 server-enabled and 267 no-server tests/doctests. Each source
and installed run repeats 120 local native and 88 authenticated network cases,
plus 32 focused laws. Twelve installed reports match all package archive hashes.

Both profiles require `native-history-read-plan-contracts`,
`native-history-read-contracts`, `native-history-read-type-fence`,
`native-history-read` and `installed-native-history-read`. They check the
[capture-bound native history contract](CAPTURED_NATIVE_HISTORIES.md): genuine
explicit document/comment families, absent versus unselected comments, exact
native histories and lifetime-checked borrowed reads. Root API fences remain
closed; installed implementation laws load private modules explicitly.

The [captured-history qualification](qualification/2026-10-21-captured-native-histories.json)
records all 34 selected checks passing in four batches with one frozen source and
1,719 script passes with three existing skips. Source and installed packages each
repeat 300 native cases and 47 focused laws; seven installed regression reports
retain identical package archive hashes. Native-only reads remain distinct from
the full selected-source check required at recovery boundaries.

Both profiles require `owned-core-cleanup-plan-contracts`,
`owned-core-cleanup-contracts`, `owned-core-cleanup-type-fence`,
`owned-core-cleanup` and `installed-owned-core-cleanup`. They cover actual SDK
lease cleanup after prior native disposal without treating cached revision
numbers as live source proof. Source and installed packages repeat 300 native
cases, 300 cold pairs, 900 future history comparisons and 26 focused laws,
including actual in-flight commit/abort barriers and co-owned version resources.
See [the lifetime contract](OWNED_CORE_LIFETIME.md) and its
[qualification](qualification/2026-10-21-owned-core-lifetime.json). The build and
three isolated regression batches pass all 29 selected checks against one frozen
source; the script suite passes 1,670 tests with three existing skips. The exact
final disposed-owner regression fails against the retained old public archive.

Both profiles require `independent-participant-plan-contracts`,
`independent-participant-contracts`, `independent-participant-type-fence`,
`independent-participant` and `installed-independent-participant`. The new explicit
local family preserves both native lanes, versions, selected raster bytes and
whole upload state. Source and fresh offline archives repeat 80 native
configurations, 160 cold pairs, 240 future history comparisons and 30 focused
laws. The existing independent storage and original/generation recovery checks
remain mandatory. See [the contract](INDEPENDENT_PARTICIPANT_BACKUP.md).

The [independent participant checkpoint](qualification/2026-10-21-independent-participant-backup.json)
records all 24 selected stages passing and 1,642 script passes with three existing
skips. The exact construction regression fails against the preserved pre-key
package and passes against the repaired source and fresh installed package.
Native Cargo suites are carried only across unchanged native inputs/runtime;
this is not whole-plan, physical durability, authenticated activation or V1 approval.

Both profiles require `canonical-source-readers-plan-contracts`,
`canonical-source-readers` and `installed-canonical-source-readers`. They run the
same actual-Wasm binding and mutation assertions against genuine original and
managed local-generation captures, with instance/prototype facade overrides,
across all five grammar/inline profiles. Installed consumers use fresh offline
public archives without workspace links. The original 1,000-check lightweight
generation-stamp law and broader recovery/script stages remain required.
The functional plan at that checkpoint had 234 checks; the recorded selections below are
historical subsets, not whole-plan or V1 approval.

Both profiles also require `physical-recovery-assets-plan-contracts`,
`relay-physical-recovery-assets-native`, `physical-recovery-assets-contracts`,
`physical-recovery-assets-type-fence`, `physical-recovery-assets` and
`installed-physical-recovery-assets`. They add actual retained native image
bindings, native provider payloads and complete held client upload snapshots to
the separately authenticated control. The old continuity contracts remain
mandatory. Source and fresh offline packages repeat the same native/client
assertions; Pending queues and unselected historical copies are not settled by
available bytes. See [the distinct contract](PHYSICAL_CLIENT_ASSET_RECONCILIATION.md).
At that asset checkpoint the functional plan had 216 checks; the subsequent
238-check plan also included canonical readers, independent participant recovery,
owned-core lifetime, explicit native-history reads and independent delivery. Selecting a
subset or passing functional checks does not grant V1, public-hosting or
activation approval.

Both profiles require `physical-recovery-control-plan-contracts`,
`relay-physical-recovery-control-native`, `physical-recovery-control-contracts`,
`physical-recovery-control-type-fence`, `physical-recovery-control` and
`installed-physical-recovery-control`. These join separately authenticated actual
native A/B/C and provider checks with held original/generation client histories.
The source and fresh offline public-package probes share unchanged assertions;
original native/provider, client-operation and no-networking checks stay required.
See the [live control contract](PHYSICAL_RECOVERY_CONTROL.md) for lifetime, Pending
coverage and the distinct remaining durable coordinator/activation work. This
adds six stages to the preceding 204-check functional plan, not V1 approval.

Both profiles require `physical-host-plan-contracts`,
`relay-physical-host-native` and `relay-physical-host-public`. These exercise the
distinct [physical server ancestry contract](PHYSICAL_SERVER_RECOVERY_ANCESTRY.md),
including all forty independent native history configurations and ten exported
Rust consumer profiles. Full relay and no-networking suites remain mandatory.
These native checks do not substitute for the combined SDK/server parent,
complete provider/client closure or authenticated whole-room activation.

Both profiles also require `physical-host-assets-plan-contracts`,
`relay-physical-host-assets-native` and `relay-physical-host-assets-public`.
They join genuine same-host A/B/C continuity with actual provider-backed rasters,
including ten native and ten exported-only grammar/transport modes, stale-cut
refusal, weak native/provider lifetime and final-callback source comparisons on
Verified and missing-byte Pending. See the
[physical availability contract](PHYSICAL_SERVER_ASSET_AVAILABILITY.md).
Existing full-native, ancestry, original-provider and no-networking stages remain
required; this is not complete client/outbox closure or activation.

Both profiles also require `provider-callback-custody-plan-contracts` and
`relay-provider-callback-custody`. Four actual public Rust regressions require
the final source comparison to follow every provider callback before Verified
or Pending publication, for native-log and raster-manifest changes. The broader
server-recovery suite remains required; no saved format or provider rule changes.

The native log suites also pin exact original frame bytes and all incomplete
final-frame suffixes, and separately exercise continuation family/sequence/hash
admission beyond a real full original log. The
[framing checkpoint](qualification/2026-10-21-log-continuation-framing.json)
passes fresh server and no-networking suites; core/runtime evidence is carried
only across unchanged inputs and artifacts. These existing native stages do not
yet qualify directory rotation, durable physical heads or multi-file recovery.

The native suites and public Rust consumer now include the
[server-native retention laws](SERVER_NATIVE_HISTORY_GENERATIONS.md): 144
suggestion-preparation and 288 staged-transport configurations, 40 independent
server families, ten private-effect creation orders, real history beyond 1,000
inputs, exact receipt retry and cold recovery. Public joined recovery keeps
native cuts, asset references and original rasters without overwriting later
service work. Same-clock/parallel fixture reservations must preserve cleanup
custody; tests do not serialize threads to hide collisions. Existing mandatory
native, public-backup and no-networking stages exercise these laws. The
[65-check qualification](qualification/2026-10-21-server-native-history-generations.json)
records an explicit architecture selection, not the entire unchanged 176-check
functional plan, physical crash certification or server-log rotation.

Both profiles require `independent-history-contracts`,
`independent-history-type-fence`, `independent-history-sdk` and
`installed-independent-history`. They qualify the separately selected SDK comment
generation facade and atomic two-lane native history store. Source and fresh
offline public archives repeat 72 facade and 576 storage configurations, exact
cold/future histories, immutable lane files, uncertain-save retries and native
ownership refusals. The installed consumer also repeats 21 unchanged public
contracts, strict public types and a production module graph without workspace
links, React or synthetic storage. Old source/relay/participant adapters remain
closed to this new storage family. Native server/log generations and authenticated
room activation are not implied. The complete functional plan now has 176 checks;
the [SDK checkpoint](qualification/2026-10-21-independent-history-storage.json)
runs an explicitly recorded selection of 36, not that entire plan.

Both profiles require `read-only-history`, `read-only-history-type-fence` and
`installed-read-only-history`. Current read-only former authors archive without
unlocking or resetting native identity. Native consumers cover 144 independent
document/comment configurations; managed document storage covers 216 with exact
cold recovery and failed/uncertain-save retry. Partial/future capabilities and
pinned old stores refuse before publication. Those three stages do not select
independent SDK comment storage; the separate stages above cover that family.
Neither selection activates a server generation profile.

The ownership probes additionally exercise the relay wrapper's direct lifecycle
guard in 36 configurations. Own shadow `core` bindings must refuse without
invoking getters or advancing the native archive; ordinary unshadowed sealing
and cold recovery must still pass.

Both profiles require `managed-core-binding` and `installed-managed-core-binding`.
The same positive probes exercise 72 generation and 144 original/search/paired
native configurations. Public `core` replacement, deletion or getters must not
redirect capture, backup, version admission or cleanup. Failed close keeps the
actual retired owner and leases available for retry; explicit discard never
disposes a replacement editor. The production bundle excludes synthetic storage.

Both profiles require `native-review-generations`,
`research-review-generations`, `native-review-generations-type-fence` and
`installed-native-review-generations`. The normal application Wasm must expose
the explicitly selected native comment family without native proof constructors
or server-finalization effects. Source and fresh public archives run identical
72-configuration author and six-observer probes, preserving exact immutable
files, native receipts, anchors and future history. Strict bare-import native
types remain mandatory. These stages qualify the native component, not atomic
SDK comment storage, server-log generations or room activation.

Both profiles require `room-recovery-catalog-v2-contracts`,
`room-recovery-catalog-v2-type-fence`, `room-recovery-catalog-v2` and
`installed-room-recovery-catalog-v2`. The separate V2 family retains original
and generation files without adopting an old journal, stages genuine inactive
native owners, and repeats the same assertions in fresh offline archives.
Native room fixtures build normally. Exact file retention, interrupted recovery,
duplicate-writer refusal and future native histories are mandatory; passing
inactive staging is not authenticated activation or historic-copy disposition.
The native V2 probe also injects a failed cleanup release in generation,
mixed-original and original-catalog staging on both transports. Failed cleanup
must retain private custody for close retry, exact file/record retention and
fresh native recovery. The fresh public consumer repeats those same six paths.
Both profiles additionally require `recovery-cleanup-scope-contracts`. Twelve
participant-internal native rollback paths abort a ready marker and refuse
attempt release or native cleanup; source and installed consumers retain exact
records/files and cold-reopen the participants without losing private owners.
Both profiles require `recovery-opening-custody-contracts` as well. Twenty
initial-opening paths fail before an attempt returns, then fail one lease
release. Source and installed consumers must recover without placeholders,
record/file changes or closing a competing returned owner. The private ledger
retains actual failed cleanup in its original context, with 4,096 pending opens
per context; successful transfer frees that runtime reservation immediately.
Eight more startup regressions cover both catalog factories' begin/resume on
both native transports. The installed consumer must preserve exact catalog
records and files, leave no aborted-create placeholder, protect returned live
owners and reopen all eight catalogs after retrying actual failed cleanup.
The installed generation-asset stage streams bounded child output into its
unique consumer directory before inspecting exit status. It retains a hashed
child report on both failure and success; a later install cannot replace that
failed consumer's log. A child pass is not a full installed-stage pass.

The candidate verifier checks the current opt-in rich editor, collaboration,
interchange and review packages alongside the original default workspace. It
does not change package versions, publish, push, tag or deploy anything.

## Run the checks

Both profiles require `generation-room-inventory`, `generation-room-custody`
and `installed-generation-room`. These add genuine native generation prefix
coverage and the internal all-or-nothing two-participant custody prerequisite,
including late retirement/authority/upload/cut refusals and cold future history.
The identical native probes run again in fresh offline public archives. See
[generation room recovery](GENERATION_ROOM_RECOVERY.md) for the contract and the
still-required durable catalog, provider closure and activation work.

Both profiles require `participant-recovery-storage-contracts`,
`participant-recovery-type-fence`,
`participant-recovery` and `document-participant-recovery`. These check durable
per-participant attempt markers, exact interrupted commit/adoption and original
native reopening across all six selected session families. The fresh installed
session consumer repeats the new 30 paired and 36 document-only cases through
bare imports without replacing its existing archive workflows. This is not
authenticated global participant discovery, room activation, generation bridging
or browser/power-loss qualification.

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

Both profiles require `relay-asset-backups`, `relay-asset-owner-paths` and
`relay-assets-no-server`. These exercise the public server raster restore,
retained offline Undo/Redo with actual image bytes, the isolated working-directory
and parent-alias ownership regressions, and the host API without networking.
The full native suite also checks complete original files, actual PNG/JPEG/WebP
admission, partial-copy resumption, ambiguous completion, occupied paths,
exclusive attempts and refusal without deleting divergent work. The
[server raster contract](SERVER_ASSET_BACKUPS.md) requires explicit host activation
after completion; these component checks do not provide a whole-room transaction.

Both profiles require `relay-server-room-backups` and
`relay-server-backups-no-server`. The public cases use real loopback HTTP upload,
private host capture, a complete source shutdown, joined native recovery and
fresh account authentication. A separate offline writer retains exact future
Undo/Redo without undoing an accepted peer caption. The native suite also covers
all ten original profile/transport choices, exact original component bytes,
interrupted log/raster/completion prefixes, no-overwrite refusal and exclusive
attempts. The [joined server barrier](SERVER_ROOM_RECOVERY.md) is not a complete
participant backup or cross-generation qualification.

Both profiles require `asset-source-snapshot-contracts`, the identical
`asset-source-cancellation-regression` input and `participant-backups` through
actual shared Wasm. Thirty native replay configurations capture and restore
native/paired/retained state with whole-store upload epochs, opaque receipts and
an unreferenced image. Fresh installed session-backup acceptance repeats this
public probe and strict type contracts; the original acceptance cases remain
mandatory. Installed asset-browser acceptance additionally checks the synchronous
native/source callback and pure upload reader with real PNG/JPEG/WebP and IDB.
The [participant contract](SHARED_PARTICIPANT_BACKUPS.md) does not claim a durable
multi-store recovery transaction, discovery or global activation.

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

The [PR readiness check](../.github/workflows/pr-readiness.yml) runs the
release ledger, candidate runner, and activation workflow contract tests
against proposed merges to `main`. It uses the pinned Node toolchain and
requires no package installation or native build. The manual candidate
workflow below runs the actual release qualification.

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
