# WebKit clipboard and startup investigation

## Status

### October 1: release consolidation and fresh normal-JIT counterexample

All 17 non-publishing release gates pass: 1,560 Rust/doc tests, 25 Wasm-target
tests, 1,378 runtime tests, 90 other package tests, 170 diagnostic tests, 159
browser cases and 39 demo cases. An additional 250-paragraph Unicode test passes
in all three engines, including backward selection and persisted redo across
reload. The browser tarball now has an exact 137-file allowlist, independently
verified through the full package-consumer gate; diagnostics are not shipped.

The pinned staged JavaScript-only probe nevertheless fails in normal-JIT mode
on WebKit 2359/26.6, using isolated Playwright 1.63.0. Attempt seven of ten fails
at iteration 2,001: array slot four is zero while the selected source local is
2048. Native Safari 26.6.2 and running Chrome each pass five bounded runs of the
same module bytes; these are same-page repetitions, not fresh-engine launches.
Fresh native clipboard checklists pass on both desktop browsers. None of these
passes closes the numerical fault or the historical selection-endpoint fault.
Safari/WebKit remains experimental. See the
[consolidation record](qualification/2026-10-01-consolidation.json).

For a second-machine check with no Rust build, debugger or browser settings
change, run `node scripts/serve-staged-range-qualification.mjs` and open
`http://127.0.0.1:4241/`. The module at
`tests/browser/diagnostics/fixtures/numeric-transfer-staged.js` is byte-identical
to the saved failure probe (SHA-256
`efb634fa1e5a8e080e27d177aefcaf181534675c900e60f7649bead66fc5efb9`). The
loopback-only page shows a report for five bounded same-page runs. Preserve
failed reports as well as passing ones, and separately record OS/browser build.
The script verifies the module hash before serving; it is optional diagnostics,
not an editor dependency or a production mitigation.

### October 1: projection-update child ownership

Six failing regressions reproduced a child projection being consumed/freed
again during parent update cleanup. The update now retains its child's active
reservation through parent cleanup and final generation admission. Thirteen
regression/control cases cover both entry points, rejected children, throwing
cleanup, active aliases, final checks and independent nested reads/updates.
All 1,378 runtime tests, 170 diagnostic tests, type checks, 159 browser cases
and 39 demo cases pass without retries. Size budgets are unchanged; application
gzip is 224,950/225,000 bytes.
[Exact fix and verification](qualification/2026-10-01-projection-child-ownership.json).
The standalone numerical fault and historical selection-endpoint rejection
remain unresolved. This checkpoint changes adapter ownership, not the engine,
and does not rerun the standalone numerical probe or native Safari.

### Profile-descriptor ownership fix

Twelve failing regressions reproduced overlapping descriptor consumption and
inspection of a protected handle's `then` accessor before ownership admission.
Both descriptor entry points now reserve the view before metadata/accessors,
through cleanup and final generation validation. Fifteen new regression/control
cases cover callback phases, public/captured cross-entry calls, independent
nesting and existing protected-list/cleanup contracts. All 1,365 runtime tests,
170 diagnostic tests, type checks, 159 browser cases and 39 demo cases pass
without retries. Reusing equivalent UTF-8 scanners in command admission and
plain-text export keeps the unchanged gzip limit: 224,911/225,000 bytes.
[Reproduction and verification](qualification/2026-09-28-descriptor-ownership.json).
The numerical and historical selection-endpoint WebKit faults remain open.
This checkpoint does not rerun the standalone numerical probe or native Safari
and does not claim an engine fix.

### Action-state ownership fix and fresh WebKit counterexamples

Ten new failing tests reproduced duplicate consumption/cleanup through
reentrant action-state accessors and destructors. The consumer now reserves
its complete active handle graph through cleanup, sharing reservations with
document/checkpoint readers. Twenty regression/control cases cover nested
strings/errors, cross-reader aliases, independent reads and failed admission.
All 1,345 runtime tests, 170 diagnostic tests, 159 browser cases, 39 demo cases
and ten additional instrumented WebKit lifecycle cases pass, without retries.
The Link and clipboard diagnostic hosts also inherit ordinary entry discovery,
fixing their unrelated virtual-module dependency-scan failure. Size limits are
unchanged; application gzip is 224,989/225,000 bytes.

The standalone numerical fault is **still reproducible**: the unchanged staged
JavaScript probe fails twice in five debugger-free no-JIT runs, at iterations
9,931 and 481. Array slot four reads zero while the selected source local reads
2048. Five normal-mode runs pass. Forty pre-change and ten post-change
instrumented editor cases do not reproduce the historical endpoint rejection;
neither the ownership fix nor these passes establish its cause or resolution.
No engine binary or installed browser settings were changed. Full release
verification and native Safari were not rerun in this checkpoint.
[Exact evidence and artifacts](qualification/2026-09-28-action-state-ownership-and-webkit-recheck.json).

### Broader reproducible-issues audit

The non-publishing 17-gate release verifier passes: 1,560 native Rust/doc tests,
25 Wasm-target tests, 1,325 browser-runtime tests, 90 other package tests,
type checks, reproducible package/consumer checks, ABI checks, size budgets,
159 browser cases and 39 demo cases. This audit also fixes two reproduced gaps:

- Composition construction reread the executor after validating it, allowing a
  different queue binding or rejection of a valid adapter. Four regressions
  failed before capture was fixed; a fifth preserves the stability check.
- Ordinary Vite discovery scanned an optional diagnostic HTML entry without
  its virtual-module plugin, failing dependency pre-bundling. Explicit ordinary
  entries fix both launchers without changing diagnostic builds or test scope.
  All 168 diagnostic-tool tests and a fresh 159-case browser run pass, and the
  scan error is absent from that fresh run.

This does **not** close the historical standalone numeric fault or the separate
intermittent clipboard/Link selection-endpoint rejection. Their relationship
is not proven. A passing release run is bounded evidence, not an engine fix.
An additional uninstrumented WebKit run passes all 40 cases with retries off
and first-failure stopping enabled: 20 repetitions each of 60 formatted
clipboard cycles and 300 Link/history cycles (1,200 and 6,000 total cycles).
No counterexample was observed in that run; the historical evidence remains.
[Audit evidence and remaining issues](qualification/2026-09-28-remaining-issues-audit.json).

### Independent composition routing/recovery fix

Ten failing regressions reproduced controller event routing and scheduled
recovery consulting overridable public `active`/`recover` members. False activity
could skip quarantine; throwing/fabricated recovery could interrupt restoration
or misreport success without releasing the lease. Internal admission now reads
private phase and scheduled recovery uses the private implementation shared
with the public entry point. All 1,320 runtime tests, runtime/test type checks,
unchanged size budgets and nine targeted browser checks pass across Chromium,
Firefox and WebKit. Synthetic composition settles once and preserves Undo/Redo;
native keyboard editing and toolbar history remain working. OS IME testing is
not claimed.
[Reproduction and verification record](qualification/2026-09-28-composition-private-lifecycle.json).
The separate WebKit numeric fault remains unresolved; native instrumentation
remained paused.

### Independent autosave status-isolation fix

Nine failing regressions reproduced autosave transitions and listener delivery
calling an overridable public `getStatus()` method. Throwing overrides could
interrupt dirty/flush/dispose calls; fabricated states could hide notifications
or clear listeners; reentrant overrides could dispose while scheduling.
Internal transitions and delivery now use a private immutable snapshot, with
the unchanged public method delegating to it. All 1,310 runtime tests,
runtime/test type checks, unchanged size budgets and nine demo browser checks
pass across Chromium, Firefox and WebKit. Browser checks include real editing,
formatting, history, persistence/reload and autosave-observation controls.
[Reproduction and verification record](qualification/2026-09-28-autosave-status-isolation.json).
The separate WebKit numeric fault remains unresolved; native instrumentation
remained paused.

### Independent checkpoint-store private lifecycle fix

Twelve failing regressions reproduced internal reliance on the overridable
public `closed` getter. False/true/throwing shadows could permit publication
after closure, run digest work on a closed owner, reject live work or leak an
exception instead of a typed failure. Store decisions now use private terminal
state while preserving the existing failure codes and dispatched-write rules.
All 1,301 runtime tests, runtime/test/browser type checks, unchanged size
budgets and twelve targeted browser checks pass. Chromium, Firefox and WebKit
each exercise closure during a native Web Crypto digest, blocked-open closure,
normal reload and full session backup/restore.
[Reproduction and verification record](qualification/2026-09-28-store-private-lifecycle.json).
The separate WebKit numeric fault remains unresolved; native instrumentation
remained paused.

### Independent document-export and cross-reader ownership fix

Fifteen failing regressions reproduced duplicate cleanup in document export,
including result/error aliases crossing between document and checkpoint reads.
The two readers now share active reservations spanning metadata inspection,
accessors and cleanup. Seventeen regression/control tests cover these cases,
independent nested document reads and guard release after metadata rejection.
All 1,289 runtime tests, runtime/test type checks, unchanged release size
budgets and all 78 editor checks across Chromium, Firefox and WebKit pass.
[Reproduction and verification record](qualification/2026-09-28-document-owner-reentry.json).
The earlier checkpoint-only reservation is now shared with document export.
The separate WebKit numeric fault remains unresolved; native instrumentation
remained paused.

### Independent checkpoint-result ownership fix

Ten failing regressions reproduced overlapping reads accepting the same Wasm
checkpoint result or cloned error, allowing duplicate consumption/cleanup.
Active-handle reservations now span metadata capture, accessors, reads and
cleanup. Independent nested reads and guard release after failed metadata
capture remain supported. All 1,272 runtime tests, runtime/test type checks,
unchanged size budgets and nine checkpoint browser checks across Chromium,
Firefox and WebKit pass. Three identical UTF-8 validators were consolidated
with twelve direct encoding/limit tests to stay within the existing budget.
[Reproduction and verification record](qualification/2026-09-28-checkpoint-owner-reentry.json).
This is a separate reproduced adapter bug, not a fix for the WebKit numeric
fault. Native engine instrumentation remained paused.

### Independent checkpoint-store shutdown fix

Two failing tests reproduced loads left waiting after closing a store whose
database open had not completed. Close now settles owner-side open waiters;
late upgrades abort and late connections close without reviving the owner.
Four unit regressions cover concurrent callers, schema validation and late
progress/upgrade events. All 1,248 runtime tests, runtime/browser type checks,
unchanged size budgets, and six real-browser checks pass. Chromium, Firefox and
WebKit each verify both a genuinely blocked IndexedDB open and normal checkpoint
save/reload with Undo/Redo. Already-dispatched write semantics are unchanged.
[Reproduction and verification record](qualification/2026-09-28-checkpoint-store-close.json).
This does not resolve the separate WebKit numeric fault.

### Independent queue-construction fix

Five failing regressions reproduced repeated reads of an accessor-backed
observer option: construction could validate one callback and store another,
including a non-function that failed only after a command executed. The queue
now captures and validates one value. All 1,244 runtime tests, production/test
type checks, unchanged size budgets and 12 targeted editing checks across
Chromium, Firefox and WebKit pass.
[Reproduction and verification record](qualification/2026-09-28-command-queue-options.json).
This does not resolve the separate WebKit numeric fault.

### Independent command-queue lifecycle fixes

Eight failing regressions reproduced stale ordinary admission after request
inspection changes queue state, overridable public capacity reads, and missing
rejection handlers for async executor/observer returns. Admission now rechecks
private lifecycle state before assigning a sequence, capacity uses private
counts, and async errors are consumed while retaining terminal failure and
no-retry semantics. A ninth test preserves successful nested admission order.
All 1,239 runtime tests, production/test type checks, unchanged size budgets
(application gzip 224,949 / 225,000 bytes), and all 78 editor checks across
Chromium, Firefox and WebKit pass. Async callbacks remain unsupported; their
already-started work cannot be canceled by the queue.
[Reproduction and verification record](qualification/2026-09-28-command-queue-lifecycle.json).
These fixes do not resolve the separate WebKit numeric fault.

### Independent deferred DOM repair fixes

Router regression tests reproduced two source-level bugs: async/thenable
scheduler results left failed deferred repair reporting `live`, and repair
triggered by a task or the next input could admit a reentrant editing command.
Invalid scheduling now faults and revokes callbacks. Canonical restoration
holds the dispatch guard and checks that the router remains live before
reporting success. Eleven new tests include normal post-repair editing controls.
All 1,230 browser-runtime tests, production/test type checks and unchanged size
budgets pass (application gzip 224,934 / 225,000 bytes).
The first broader editor run passed 75/78; three Firefox startup failures
coincided with a full disk and `ENOSPC` while saving traces. The failed run is
preserved rather than classified as a product regression or a clean pass.
Only the verified git-ignored Rust incremental compiler cache was removed
(41 GB; no source, evidence or compiled outputs), to permit a clean rerun.
That unchanged-code rerun passed all 78 editor checks across Chromium, Firefox
and WebKit with retries disabled, including all three failed Firefox scenarios.
[Verification record](qualification/2026-09-28-router-repair.json).
These fixes are independent of the unresolved WebKit numeric fault.

### Independent IME async-hook fixes

Source-level work reproduced two further composition-hook problems: async
scheduler failure could leave composition in `ending`, and rejected async
observers escaped containment. Thenable scheduler returns now fail immediately
and revoke retained callbacks; observer rejections cannot alter lifecycle
results. Nine new regressions include fulfilled/rejected promises, thenables,
throwing getters, successful timer handles and recovery notifications.
All 1,219 browser-runtime tests, production/test type checks and unchanged size
budgets pass (application gzip 224,918 / 225,000 bytes). Composition commit,
Undo and Redo pass three repetitions in each of Chromium, Firefox and WebKit.
[Reproduction and verification record](qualification/2026-09-28-composition-async-hooks.json).
Native instrumentation remains paused; these fixes do not resolve the engine
numeric fault below.

### Latest retry and independent composition fix

The post-store pattern guard now captures all five raw stored slots, the
original encoded input and, only at the verified array-construction call
site, all five caller source slots. Its deliberate control confirmed these
reads while leaving real array values intact. Five fresh guarded attempts
pass without a stop, but the immediately following debugger-free baseline
fails twice in five attempts (iterations 331 and 991, slot 4). The engine
issue is therefore **still unresolved**; no engine patch is adopted. See
[retry inputs and complete failures](qualification/2026-09-28-webkit-pattern-retry.json).

An independent composition-controller bug is now reproduced and fixed:
a custom scheduler can retain a callback before throwing, and the old
controller subsequently lets that rejected recovery callback leave quarantine
and release the queue lease. Failed scheduling now invalidates that callback.
Two regressions cover failed recovery and independently successful recovery,
including repeated callback delivery. The original failing case expected
`quarantined` but observed `idle`; all 1,210 browser runtime tests and the
browser package's production/test TypeScript checks pass after the fix.
The rebuilt workspace passes all size budgets (application gzip 224,988 /
225,000 bytes); 165 diagnostic tests also pass. Composition commit/Undo/Redo
passes three repetitions each in Chromium, Firefox and WebKit (nine total).
The custom-scheduler failure path itself is unit-tested, not native-IME
qualification. [Before/after verification record](qualification/2026-09-28-composition-scheduler-revocation.json).
This is not claimed to repair or share a cause with the WebKit numeric fault.

### Original native fragment control — still not fixed

The standalone native runner now calls the **original loaded engine code** at
`0xf7c118`, rather than a copied conversion sequence. It verifies the complete
WebKit 2336 framework hash, loaded-image identity and all eleven instructions
before calling the finite-number conversion/store fragment. Only its private
destination word is written; engine code is unchanged. Ten synthetic inputs
cover doubles, signed zero, fractions and signed int32 boundaries. NaN inputs
are forbidden because their fallback needs genuine engine object state.

All three 100-million-check controls (no yield, scheduler yield, short sleep)
pass. A fourth run passes one million checks with a four-millisecond sleep
every ten rounds. This does not exercise the JS interpreter, array allocation
or browser event loop; it neither clears those paths nor proves a hardware
fault. Invalid budgets, modes and a non-pinned framework are rejected.
[Native results, hashes and limits](qualification/2026-09-28-native-original-fragment-controls.json)
are preserved. The remaining guard gap is an input already wrong before
conversion: a conversion-consistency guard would accept that input. A separate
post-store pattern guard is being qualified to capture that case as well.

### Instrumentation controls and newer-engine comparison

A nearby anonymous allocation now permits the post-store guard without moving
the original conversion or store. Its deliberate control succeeds and ten
real attempts pass. Relocating only `FCSEL` also passes ten attempts. However,
an **allocation-only control with no numeric instruction changes also passes
ten attempts**, so these passes cannot be credited to a conversion fix.
An entry-stop-only control fails immediately at iteration 8461, slot 4; a
later ten-attempt entry-stop bracket passes. The samples do not establish
whether allocation, debugger helper execution, timing or another observer
effect explains the differences. All [native runs and source hashes are preserved](qualification/2026-09-28-numeric-array-observer-controls.json).

The pinned binary's call chain is now verified by static disassembly:
`llint_op_new_array` → `llint_slow_path_new_array` →
`constructArrayNegativeIndexed` → `JSObject::initializeIndex`. This does not
yet identify the failing instruction. The branch-selection candidate now
passes ten complete attempts, but the passing unchanged controls prevent
crediting it as a fix. An earlier batch was interrupted after three recorded
passes when a controller comment edit tripped source-hash validation; its
fourth attempt is unqualified and the six remaining attempts were not run.
The complete ten-attempt repeat used stable inputs. No native candidate is
adopted. [Branch experiment evidence](qualification/2026-09-28-native-selection-branch-experiment.json)
retains both batches and the interruption reason.

Playwright 1.63.0 / WebKit 2359 is installed **only in an isolated temporary
directory** for comparison against project Playwright 1.62.1 / WebKit 2336.
The project dependencies and old failing browser remain unchanged. The new
`compare-webkit-build.mjs` runs the same pinned staged module as static bytes,
without a debugger or developer VM, records engine hashes and requires the
full counters and exact two requests. Its old-engine baseline still fails:
four passes and one rejection at iteration 5811, slot 4. The newer engine
also fails twice in ten attempts, at iterations 371 and 8611, slot 4. The
subsequent old-engine bracket passes three and fails twice (4831 and 2361,
slot 4). All observed JIT options are false. Both builds exhibit the same
staged-2048/array-zero pattern; upgrading to this stable release does not
resolve the reproduction. No project dependency changes were made. See
[complete failures and pinned inputs](qualification/2026-09-28-webkit-build-comparison.json).

### Raw memory confirms the stored zero — not fixed

Two independent cold-capture failures now confirm the bad array value in
**native memory**, not only JavaScript snapshots. The debugger is attached
only after rejection, with no instrumentation or debugger present during
the failing computation. Iterations 9231 and 2941 both affect slot 4. Each
array's first four raw doubles are `40a0000000000000` (2048), and the last is
`0000000000000000` (positive zero). All five staged locals and their original
sources later still read 2048. Both failures immediately follow timer yields.

The cold branch retains the private failed array and obtains its native
description using `$vm.value`. LLDB checks the object's stored backing-pointer
against that description, reads exactly five slots, and detaches. Both pointer
checks succeed, and every raw slot agrees with the earlier JavaScript
snapshot. This rules out a JavaScript-only display/read artifact for these
two failures: the zero is really in the array's storage. It does **not** yet
identify the first corrupting instruction or establish a common cause with
the editor's earlier false comparison.

A deliberately constructed control array verifies the reader first. Then
the first probe batch fails on attempt 1; a second batch passes twice and
fails on attempt 3. Both batches stop at the first capture, so their remaining
16 planned attempts are not run. All observed JIT options are false. The
new probe changes only the failure payload of the storage-capture variant;
source-equivalence tests enforce that boundary. No Rust, Wasm or DOM editing
code is involved in this reproduction, and no production fix is claimed.
See [raw bytes, complete snapshots, debugger output and hashes](qualification/2026-09-28-numeric-array-cold-native-memory.json).

Repeat with `scripts/capture-webkit-array-memory.mjs ROOT ABSOLUTE_MEMORY_PROBE control 1`
and then `probe 10`, using `DEBUG=pw:browser` and distinct stdout/stderr logs.
The memory probe is compiled separately under
`target/numeric-range-memory-capture-20260928/`; the controller pins its hash.
A captured failure intentionally returns nonzero. All **155 diagnostic tests**,
browser TypeScript checking, CLI syntax checks and whitespace checking pass.
Next: identify the first wrong write or conversion without the guard suppressing
the observed failure; raw-memory capture establishes a trustworthy endpoint.

### Browser-native instrumentation

The new owned-WebProcess controller can attach, install the existing
post-conversion guard, and capture its deliberate control correctly. It pins
the installed framework and unchanged staged module hashes and verifies the
guard placement explicitly. It never attaches to an existing user browser.

The important control is **a real failure under unmodified debugger
attachment**: three passes followed by a failure at iteration 7101, slot 1,
with staged 2048 but array/local positive zero. Attachment alone therefore
does not prevent reproduction. Two guarded batches produce 17 clean passes,
one browser-shutdown transport error and no native mismatch. The transport
error completed page counters but is not counted as a clean pass. Both owned
processes were verified cleaned up. The second guarded batch completes all
10 attempts after the attached baseline failure.

Post-store capture first failed to install because the allocated guard was
outside the direct branch's range. The explicitly selected post-conversion
alternative leaves the original `FCSEL` in place but relocates subsequent
comparison/store instructions. Its passing runs **do not prove a fix** and
cannot eliminate instrumentation effects. All observed startup options show
JIT disabled and developer VM enabled. Full native output, deliberate control
registers, failures, source hashes and cleanup error are preserved in the
[browser-native guard record](qualification/2026-09-28-numeric-array-browser-native-guards.json).

To repeat this bounded investigation, run
`scripts/debug-webkit-array-repro.mjs ROOT ABSOLUTE_STAGED_PROBE control 1 post-conversion`,
then separate `baseline 10 post-conversion` and `probe 10 post-conversion`
invocations. Use the pinned WebKit 2336 root and staged module documented in
the record, `DEBUG=pw:browser`, and distinct JSONL/stdout and stderr files.
The controller stops on the first non-passing outcome; remaining attempts
must be reported as not run, not passed.

### Cold-path storage and indexed-write comparison

The latest browser capture confirms that **three actual failing arrays use
`ArrayWithDouble` storage**. A separate diagnostic calls the engine's
`$vm.indexingMode(values)` only after the original validator rejects a value;
healthy iterations never invoke it. This variant fails **3 / 10** attempts,
at iterations 3781, 881 and 2801, always slot 4. All staged locals later read
2048, while the consumed value and array slot read positive zero. This proves
the representation of these failed arrays, not the corrupting instruction.
All 40 observed startup `useJIT` values are false and all 40 `useDollarVM`
values are true; the developer inspector is enabled only in disposable test
children, never production or installed browser settings.

A representation-preserving comparison also narrows the search: initializing
`[0.5, 0.5, 0.5, 0.5, 0.5]` and then assigning the same five uncoerced values
by index passes **10 / 10** attempts. Unchanged staged baselines surrounding
it pass 5 / 5 and 3 / 5. The two baseline failures are iterations 8171 and
7031, slot 4, with the same 2048-to-zero observation. All five failures across
these batches immediately follow timer yields. Equivalent synthetic shape
checks show double storage after indexed assignments in both shell and browser.

The indexed probe compiles to `new_array_buffer` plus five `put_by_val`
instructions, rather than the staged probe's `new_array`. The pinned LLInt
indexed-store fast path uses explicit branches for integer/double conversion;
the array initializer uses `FCSEL`. This is a useful path distinction, **not
proof of which instruction failed**: allocation, timing and code shape also
change. No production workaround is taken from these variants. See the
[browser captures, exact failures, module hashes and traces](qualification/2026-09-28-numeric-array-browser-capture.json).

### Earlier storage representation controls

The latest bracketed storage comparison points more specifically toward the
double-array creation/conversion path, but is **not a verified fix**. The
sequence is staged baseline (5), tagged storage (10), staged baseline (5),
int32 storage (10), staged baseline (5), all JIT-disabled with zero retries.
The unchanged staged probe fails in every baseline batch: **4 failures / 15
attempts** overall. Both alternative representations pass **10 / 10**.

The tagged variant includes a non-number sentinel during array construction,
then truncates it before running the unchanged five-value validation loop.
The independent int32 variant instead applies `| 0` to the five array operands.
This preserves only this synthetic probe's 1/2048 values, not arbitrary editor
numbers: fractions, negative zero and large unsigned values would be damaged.
Neither variant is used in production. Source-equivalence tests require the
validators, sources, scheduling and failure snapshots to remain unchanged.

All four baseline failures capture staged locals later reading 2048 while one
array slot and the consumed local read positive zero. Iterations are 6641,
721, 7881 and 5491, immediately after timer yields. Slots 1 and 4 each fail
twice, so the frozen-field conditional alone cannot explain the observations.
The known-failing staged module retains its original SHA-256 throughout.

Standalone JSC `describe()` checks on equivalent synthetic constructions show
`ArrayWithDouble` for the baseline, `ArrayWithContiguous` for sentinel-truncated
arrays, and `ArrayWithInt32` for coerced arrays. These are not browser layout
captures. The local pinned-binary disassembly has a direct tagged-value store
at `0xf7c0d8`, versus numeric selection at `0xf7c130` and double store at
`0xf7c13c`. As a semantic cross-check, [current upstream initializeIndex](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/runtime/JSObjectInlines.h)
also separates tagged stores from `asNumber()` conversion for double storage;
that upstream revision has not been matched to the installed binary.

This is stronger evidence for a representation-dependent fault, not proof
of the exact failing instruction: both variants also change timing/code shape,
and the tagged variant changes allocation. No native array mismatch has been
captured, and its relationship to the editor's original false upper-bound
comparison remains unproven. All 134 diagnostic tests and browser typechecking
pass. See [the complete five-batch comparison, failures and source hashes](qualification/2026-09-28-numeric-array-storage-controls.json).

To repeat, compile the separate tagged/int32 probes with the same TypeScript
settings as the staged module, then run the existing static-browser config
with `BREDITOR_RANGE_VARIANT=staged`, `tagged`, or `int32` and
`BREDITOR_RANGE_JSC_MODE=no-jit`. Do not overwrite the pinned staged output.
Use distinct JSON reports/output directories, one worker, no retries and the
same 10,000-iteration budget. Repeat the unchanged baseline between variants.

### Earlier independent controls

The unchanged, static, JIT-disabled browser reproduction still fails: **two
failures in ten attempts** in the latest recheck, with no retries or skips.
Attempts 6 and 8 fail at iterations 8481 and 781, slot 4. All staged locals
later read 2048, but the consumed value and array slot read positive zero.
Both occur immediately after a timer yield. Every attempt verifies the same
compiled probe hash and requests only `/` and `/probe.js`; all 40 observed
browser startup `useJIT` values are false. These counterexamples remain valid
despite the passing standalone controls below.

The shell harness now supports a bounded 100,000-iteration budget without
changing the probe module. Ten attempts each pass unmodified, under unpatched
LLDB, and with the post-store guard; each successful attempt reports 1,500,000
checks. This larger sample still does not distinguish debugger effects from
guard effects. The classifiers require the requested budget, so a shorter
run cannot be accepted as completing a longer one.

A separate arm64 C/assembly control mirrors the candidate conversion sequence
without loading JavaScriptCore. FCSEL and an explicit-branch alternative each
pass 100 million checks with no scheduling intervention, with periodic yields,
and with periodic sleeps: 600 million checks across six runs. Compiled
disassembly confirms the intended sequence. This is a relocated synthetic
control, not an engine qualification, complete hardware test, or proof that
the original instruction always works in its engine context.

Read-only disassembly also prevents an unjustified link between symptoms:
`llint_op_lesseq`'s numeric fast path uses explicit branches and numeric decoding
followed by `FCMP/CSET`, not FCSEL; its numeric slow path does use FCSEL. We have
not identified which path or tier ran the original editor false upper-bound
comparison. **Neither symptom has a verified production fix.** All 123
diagnostic tests and browser-test typechecking pass; the native diagnostic
builds with warnings treated as errors, and invalid argument/budget controls
reject as intended. See [independent controls and fresh browser failures](qualification/2026-09-28-numeric-transfer-independent-controls.json).

### Standalone instruction control

This diagnostic only executes synthetic numeric inputs in its own process.
It does not load, attach to, or modify an engine. The ten cases cover double
1/2048, positive and negative zero, a fraction, and int32 values including both
extremes. A rejection emits raw hexadecimal strings for independent checking;
it is not automatically called a faulty conversion if those strings agree.

```sh
xcrun clang -arch arm64 -O2 -Wall -Wextra -Werror \
  tests/browser/diagnostics/native_numeric_select.c \
  tests/browser/diagnostics/native_numeric_select.S \
  -o target/native-numeric-select-20260928

target/native-numeric-select-20260928 fcsel 10000000 sleep
target/native-numeric-select-20260928 branch 10000000 sleep
```

Scheduling choices are `none`, `yield`, and `sleep`. Round counts are bounded
at ten million. For longer shell comparisons, append `100000` after the
existing controller arguments (including `post-store` for the native
controller); the larger budget requires zero minimum timer delay to remain
within the watchdog. The default budget stays 10,000.

### Earlier standalone capture

The staged unexpected-zero case now reproduces in **unmodified standalone
JavaScriptCore**, with JIT disabled and the timer shim's minimum delay set to
zero: one failure in twenty attempts across two ten-attempt batches. On the
first batch's attempt 7, iteration 332, slot 4 contains positive zero, while
all five staged locals later read as 1 and the original sources remain 1/2048.
Unlike previous browser captures, this iteration is not immediately after a
timer yield. The browser, editor, Rust, Wasm and JIT are therefore unnecessary
for this smaller symptom. Its relationship to the editor's false upper-bound
comparison remains unproven. Ten staged attempts with a four-millisecond
minimum delay and ten original-probe zero-delay attempts pass; these small
batches do not establish timer or staged-variable causation.

Two native diagnostic guards now target `JSObject::initializeIndex` in
disposable debugger-launched JSC children. Both leave the original FCSEL at
its original address. The post-conversion guard redirects the instructions
after it; the post-store guard changes only the return after the original
comparison and array write. Both deliberate-failure controls stop correctly
while the real converted value remains 1; the post-store control additionally
reads the correct stored bits from the array slot. These controls deliberately
alter only a diagnostic snapshot and are **not fault captures**.

Thirty post-conversion guarded attempts and ten post-store guarded attempts
pass without a native mismatch. Ten unpatched LLDB-launch baseline attempts
also pass. Address randomization is explicitly retained in the latest runs,
and captured load addresses vary. The observations do not distinguish a
debugger effect from a guard effect, and **no actual native array-conversion
failure has been captured**. No production fix or installed engine change is
claimed. All 121 diagnostic tests, browser-test typechecking and whitespace
checks pass. See the [standalone failure and native-control evidence](qualification/2026-09-28-numeric-transfer-native-capture.json).

### Repeating the native array checks

Use the pinned staged module compiled for the earlier host comparison. The
controller rejects different engine/module hashes, records source hashes,
uses a bounded per-child timeout, and stops on the first unexpected outcome.
`baseline` launches the same workload under LLDB without installing a guard
or breakpoint; `control` intentionally corrupts the diagnostic snapshot;
`probe` observes the real conversion. All native checks are diagnostic-only.

```sh
node scripts/debug-jsc-array-repro.mjs \
  /Users/s/Library/Caches/ms-playwright/webkit-2336 \
  /Users/s/code/breditor/target/numeric-range-staged-20260928/numeric_transfer_staged_probe.js \
  baseline 10 0

node scripts/debug-jsc-array-repro.mjs \
  /Users/s/Library/Caches/ms-playwright/webkit-2336 \
  /Users/s/code/breditor/target/numeric-range-staged-20260928/numeric_transfer_staged_probe.js \
  control 1 0 post-store

node scripts/debug-jsc-array-repro.mjs \
  /Users/s/Library/Caches/ms-playwright/webkit-2336 \
  /Users/s/code/breditor/target/numeric-range-staged-20260928/numeric_transfer_staged_probe.js \
  probe 10 0 post-store
```

The uninstrumented failing host control uses `scripts/run-jsc-range-repro.mjs`
with the matching framework environment, staged module, and `no-jit 0 10`.
The zero here selects the host shim's minimum timer delay; it is not a claim
about exact browser timer behavior. The stored JSON includes the complete
failing report and hashes of every raw run log.

### Earlier host controls

Further host controls preserve the unexpected-zero reproduction without the
Vite development client: a static page serving the **same compiled module
bytes** as standalone JavaScriptCore fails 1/10 normal and 1/10 JIT-disabled
WebKit attempts. Standalone runs pass 5/5 in each mode with a four-millisecond
minimum timer shim. All JIT-disabled browser startup observations report
`useJIT=false`; disabling JIT is not a fix. The failed browser cases load only
the HTML host and the hash-verified probe script, with no editor or Wasm.

A separate staged variant preserves expression evaluation order and exposes
all five scalar values before array construction. It fails 3/10 JIT-disabled
WebKit attempts: the staged locals and sources later read as 2048, while an
array element and consumed local read as positive zero. Failures occur in the
typed-array-derived slot once and the selected frozen-field slot twice. This
shifts the target to array creation/storage/readback or intervening numeric
representation conversion, not solely the conditional expression.

Read-only disassembly identifies a concrete native candidate for the next
capture: the interpreter array-creation path calls
`JSC::JSObject::initializeIndex` (file address `0xf7c074`), whose numeric path
uses `fcsel d0,d0,d1,hi` at `0xf7c130` before storing at `0xf7c13c`. That resembles
the earlier separate native comparison path; **no failing native execution has
yet been captured at this new site**. No engine binary or production runtime
was modified. All 111 diagnostic tests pass. See
[exact host, tier and staged-run evidence](qualification/2026-09-28-numeric-transfer-host-controls.json).

Cold-path source capture reproduces the reduced unexpected-zero case twice in
ten attempts (eight passes). At iterations 161 and 941, the source index is 1;
the immutable source fields later read 1 and 2048, but temporary `values[4]`
and the consumed local both contain positive zero. The other four temporary
values remain 2048. This narrows the reduced case to the source-field selection
/ transfer into the temporary values, before validation; it does not identify
the machine instruction or prove a shared cause with the editor's false upper
bound. Decimal and bit snapshots are strings recorded in-page, not just a
numeric return value decoded by Playwright. An intervening **unchanged-source**
control passes five Chromium, five Firefox and five WebKit attempts; those
WebKit passes do not erase either failing batch. All 104 diagnostic unit tests,
browser-test typechecking and whitespace checks pass. No production change or
verified repair is claimed.

The new JavaScript-only numeric control fails **five of ten WebKit attempts**.
It produces a different observable symptom: inputs initialized to 1 or 2048
arrive at validation as positive zero. Four failures occur in the frozen-field
representation and one in the typed-array representation, all on odd
iterations immediately after a timer yield (iteration modulo 10 equals 1).
The lower-bound rejection is correct for the captured zero; the
unexpected value's origin is not localized yet. Failed-trace network records
contain only the blank HTML host, Vite client and numeric probe—no Breditor
runtime or Wasm. This smaller case is a more frequent reproduction in the
measured batch, **not a proven reduction of the editor's false comparison**.
The original reduced probe, spec and config are preserved in
`target/webkit-numeric-range-20260928/diagnostic-sources` before any further
value-origin instrumentation.

The operand-level run now identifies an **original false upper-bound
comparison**, not only a failed composite validator. On attempt 72, the
`isPositiveU32` condition `value <= 4_294_967_295` returns false. The local is
then captured as decimal `1`, bits `3ff0000000000000`; the immediate upper-bound
recheck returns true. Original type, integer and lower-bound conditions must
have succeeded to reach this operand in the preserved AND chain. The failure
propagates through format-revision validation into document export, with the
editor owner still live. This run has 71 passes, one failure, and 28 not run
because it stops at the first failure, without retries. This is **not fixed**:
the exact failing comparison is identified, but its engine-level cause and
relationship to the earlier native `Object.is` capture remain unproven.

The complete-trace follow-up captures the export rejection more narrowly on
attempt 81: `wasm_document_json`'s `isU32` returns **false**, then the rejected
local is recorded as decimal `2048` with bits `40a0000000000000`. Subsequent
safe-integer, lower-bound and upper-bound checks are all true. The rejection
propagates through the string property contract, format binding, durable
contract, document reader and editor export while the owner remains live.
This identifies the original combined numeric predicate as the rejecting
operation; it does not yet identify which original operand failed. The
predicate uses `Number.isInteger`, whereas the diagnostic integer recheck uses
`Number.isSafeInteger`. No production behavior has been changed on the basis
of that subsequent observation. The fixed-budget batch finishes with 99 passes,
one failure, no retries and no skipped cases. Its three tracing modules are
preserved under `target/webkit-complete-trace-20260928/diagnostic-sources` with
hashes in the evidence record. The next diagnostic variant observes the
original numeric operands individually, retaining their short circuit and
recording the corresponding source expressions in the location map.

September 28 export follow-up: the intermittent fault is **not fixed**. A fixed
100-attempt formatted-clipboard run completes with 97 passes and three failures:
two document-export rejections after Copy, and one completed editor loop whose
result arrives at the test runner as `NaN` instead of 60. No endpoint rejection
occurs in that batch. The latter result alone cannot distinguish an in-page
counter fault from browser-to-test serialization. The fixture now records the
counter's decimal text and IEEE-754 bits before returning the original number.

Further traces locate separate rejections in session backup, format-contract
resolution, and projection-update consumption. The format-contract trace
reaches the format-binding/order check, not yet a specific invalid field. These
are observed rejection paths, not evidence of multiple independent causes or
proof that the earlier native `Object.is` fault caused them. A subsequent
projection rejection occurs on attempt 4 (three passes; 96 not run). Expanded
tracing now includes nested format/property readers, session readers, projection
failure returns, and failure-only numeric predicate snapshots.

Isolation controls pass 100,000 JavaScript-only selections, 100,000 real Wasm
restores / 300,000 selection reads, 64,000 blank-page numeric return values, and
150,000 JavaScript-only format-contract resolutions. These bounded passes do
not clear the interactive failures. Production artifacts are unchanged by this
follow-up. See [the run and trace evidence](qualification/2026-09-28-webkit-focused-export-investigation.json).

September 28 next follow-up: an ordered, five-pass diagnostic attempt on the
unchanged lifecycle build passes 141 cases, then fails the formatted clipboard
fixture on cycle 1 during Link Undo/Redo; 113 cases are not run. For the first
time this interactive failure has an exact rejection chain:
`wasm_selection_adapter:failure:164` (an anchor or focus `readPoint` returned
null), followed by command-adapter throws and the editor's failed delivery.
It is **not** the post-cleanup generation check. This locates the rejecting
branch, not the cause or which endpoint/predicate failed. The trace is preserved
under `target/playwright-link-diagnostics-v6`. Failure-only instrumentation now
captures the already-read point's closed enum values and numeric decimal/bits;
any validation recheck is explicitly subsequent evidence, not the original
predicate result. No getters are reread and no document text is retained.

Separately, a deterministic selection reentry bug is fixed: the old compiled
build admits two consumers of the same view and calls its destructor twice.
The guarded candidate rejects the nested consumer and frees once. Nine new
tests cover both public and captured-cleanup entries, foreign getters and
destructors, independent views, and release of the in-progress guard. All
1,208 runtime tests pass. This does not establish a link to the intermittent
WebKit rejection above.

Five further instrumented passes on the preserved lifecycle build (255 cases)
do not reproduce the endpoint rejection. The rebuilt reentry-fix runtime then
passes the unchanged, uninstrumented 153-case Chromium/Firefox/WebKit matrix.
All 93 diagnostic tests and browser/runtime typechecks pass. Production size
checks pass without changing budgets (demo gzip 224,986/225,000 bytes). These
are bounded results, not resolution of the intermittent failure or a rerun of
all release gates. The rebuilt production demo also passes all 39 browser cases,
without retries, skipped cases or flaky results. See [the exact-build record](qualification/2026-09-28-selection-reentry-and-endpoint-rejection.json).

September 28 follow-up: the latest lifecycle-hardening build is **not
release-qualified**. The full release run passes 14 gates, then reports 152/153
browser cases: warm Link faults on cycle 0 Undo (`toolbarDispatchFailed`). The
trace is preserved under `target/lifecycle-release-failure-QjIWwI`. Twenty
isolated Link repetitions pass, while an ordered diagnostic run faults during
clipboard replacement/typing history. Two later complete instrumented WebKit
passes (102 cases) pass. These do not erase either failure or establish their
cause. The opt-in `playwright.link-diagnostics.config.ts` host now records
bounded static exception and failed-delivery sites without document payloads,
re-reading getters, retries, or production logging.

A subsequent longer series passes 101 cases, then rejects selection restore
at iteration 9/read 0 with `selection.invalid_wasm_view`. No instrumented
exception site fired in that trace. Selection failure-return sites now include
the initial admission, coordinate validation, catch/cleanup, and final
generation-liveness branches; provisional default failures are not recorded.
Three full passes with that expanded instrumentation (153 cases) pass without
reproducing the fault. Instrumentation changes code shape and timing, so those
passes do not locate or fix it. See [the checkpoint evidence](qualification/2026-09-28-generation-lifecycle-and-webkit-followup.json).

To repeat the ordered investigation after building the packages:

```sh
npx playwright test -c playwright.link-diagnostics.config.ts --project=webkit --repeat-each=3
```

The host runs on loopback port 4216 and stops at the first failure. Failed traces
retain up to 32 `BREDITOR_LINK_THROW=` static locations, including non-throwing
failure returns, plus up to 32 `BREDITOR_SELECTION_POINT=` rejected-point
snapshots. The latter retain no arbitrary strings, objects, or document text.
The Link case also attaches the recorder and a hash-bearing
source-location map. `/link-diagnostic-map.json` must include all seven selected
modules. Missing module instrumentation is a fixture failure, not an editor
counterexample. The diagnostic transform never rewrites package artifacts.

For a fixed-budget interactive sample retaining every failure, use:

```sh
npx playwright test -c playwright.link-diagnostics.config.ts --project=webkit formatted-clipboard-lifecycle.spec.ts --repeat-each=100 --max-failures=0
```

The additional `BREDITOR_NUMERIC_PREDICATE=` snapshots retain the original
false result and already-read local value (at most 32). Their `recheck` fields
are later observations, not the original individual operands. Up to eight
`BREDITOR_LOOP_RESULT=` snapshots distinguish an in-page count from its numeric
transport when both observations are available. All original results,
short-circuit behavior, assertions, deadlines, and retry policy are retained.
Instrumentation nevertheless changes code shape and timing; batches with
different transforms are not controlled failure-rate comparisons.

The reduced bound-comparison control is independent of all Breditor runtime
modules, Rust, Wasm and editor DOM. It exercises original and separately
captured predicates with literal, typed-array, parsed, decimal-rematerialized
and frozen-property values:

```sh
npx playwright test -c playwright.numeric-range-repro.config.ts --project=webkit --repeat-each=10
```

To reproduce the static host controls from the repository root, first compile
the two diagnostic modules (do not rebuild them during a run):

```sh
npx tsc tests/browser/harness/numeric_range_probe.ts --target es2022 --module esnext --moduleResolution bundler --types node --skipLibCheck --noEmitOnError --outDir target/numeric-range-shell-20260928
npx tsc tests/browser/harness/numeric_transfer_staged_probe.ts --target es2022 --module esnext --moduleResolution bundler --types node --skipLibCheck --noEmitOnError --outDir target/numeric-range-staged-20260928
DEBUG=pw:browser npx playwright test -c playwright.numeric-range-static.config.ts --project=webkit --repeat-each=10
BREDITOR_RANGE_JSC_MODE=no-jit DEBUG=pw:browser npx playwright test -c playwright.numeric-range-static.config.ts --project=webkit --repeat-each=10
BREDITOR_RANGE_VARIANT=staged BREDITOR_RANGE_JSC_MODE=no-jit DEBUG=pw:browser npx playwright test -c playwright.numeric-range-static.config.ts --project=webkit --repeat-each=10
```

Use distinct `--output` directories and JSON report files to preserve each
batch. The host binds only loopback port 4240 and serves only its fixed HTML,
selected probe and hash metadata. Every attempt verifies served script bytes
against the selected local module and attaches requested-resource evidence.
The environment flags apply only to diagnostic children, not browser settings.
`scripts/run-jsc-range-repro.mjs` documents the standalone equivalent; its
classifier requires the expected result, empty failure events, verified engine
mode at start and finish, and successful process termination. A zero exit code
alone is not a passing JavaScriptCore run.

Seven independent regressions reproduce and fix stale successful reads after
profile-generation invalidation during reading/cleanup, across action state,
selection, projection and projection updates. Native Safari passes 50,000
restores on that build. This lifecycle bug is separate from the still-unresolved
intermittent browser failure. The prior successful qualifications below apply
only to their recorded builds.

Final independent checks pass 39/39 demo cases, 50,000 minified automated WebKit
restores / 150,000 reads, all 91 diagnostic unit tests, browser-test typechecking,
and whitespace checks. The automated restore fixture has the same bundle hash
as the passing native Safari run. None reclassifies the failed release gate.

Earlier checkpoint: the four-site numeric mitigation is now **integrated into the browser
runtime**, not supplied by the diagnostic transform. Its rebuilt minified
fixtures pass all 153 browser cases plus five 10,000-restore WebKit batches.
Installed Safari passes another five restore batches and a fresh native
Copy/Cut/Paste, caret, history and Link checklist. This does not resolve the
underlying JavaScriptCore defect or certify every platform/input path. See
[runtime integration](WEBKIT_WASM_NUMBER_REPRO.md#integrated-runtime-qualification)
and [the separate exact-build evidence](qualification/2026-09-26-boundary-runtime-integration.json).
Earlier statements that the candidate is test-only describe prior checkpoints.
All 17 non-publishing release gates pass, including the ordinary 153 browser
and 39 demo cases. The mitigation is retained; the engine investigation remains
open. No validation, deadline, retry or size-budget policy was relaxed.

Further qualification: all **153 existing browser tests** pass against the
minified boundary candidate, and native Safari completes another **150,000
restores / 450,000 selection reads**. Isolated WebKit conversion overhead is
18–19 ns per common integer in this local benchmark, not a typing-latency
measurement. These results support proceeding to scoped runtime integration;
the candidate is still opt-in, exact production bytes and the full release
verifier remain to be qualified. See [cost/native stress](WEBKIT_WASM_NUMBER_REPRO.md#conversion-cost-and-extended-native-stress)
and [full-matrix evidence](qualification/2026-09-26-boundary-full-matrix.json).

Interactive follow-up: the same opt-in boundary candidate passes **84 WebKit,
21 Chromium and 21 Firefox cases**, using the existing clipboard, DOM selection,
Link/history and manual-recorder assertions. Installed Safari 26.6.2 also passes
one native Copy/Cut/Paste, caret, undo/redo and Link checklist with a live owner
and no recorded fault. The original interactive build passes its 21 cases too;
this is expanded coverage, not a fresh interactive failure-to-success proof.
See [interactive qualification](WEBKIT_WASM_NUMBER_REPRO.md#interactive-and-native-clipboard-qualification).

The full-consumer boundary candidate now passes 15 automated WebKit cases and
10 native Safari cases (250,000 restores / 750,000 selection reads), plus all
1,188 browser-runtime contract tests with the candidate applied. A fresh
unchanged-build control rejects the profile descriptor at restore 8351; an
immediate candidate rerun passes five cases. That restore-only run does not
exercise clipboard/caret or DOM restoration; the separate interactive coverage
above now addresses those paths in bounded tests. This remains opt-in. See
[full-consumer qualification](WEBKIT_WASM_NUMBER_REPRO.md#full-consumer-qualification-follow-up).

Follow-up controls reject concurrent-GC and exception-mode switches as fixes.
A standalone native conversion control passes, while a clean reduced-case
comparison gives three original failures versus five SameValue candidate
passes. This is a candidate for further investigation, not production/editor
qualification. See [native/context controls](WEBKIT_WASM_NUMBER_REPRO.md#native-only-and-engine-context-follow-up).

Authorized native debugging now catches two encoded 2048 inputs on the native
Object.is false-return path, while comparison registers contain 0 and 2048.
Two baseline debugger runs and a JIT-disabled interpreter run reproduce this.
Developer mode was enabled with explicit user approval; only standalone
diagnostic children were debugged. This supersedes the previous authorization
blocker. The exact faulty instruction and relationship to all editor failures
remain unresolved. See
[native register captures](WEBKIT_WASM_NUMBER_REPRO.md#authorized-native-register-captures).

The numeric reduction now captures the false Object.is result before reporting
the mismatch, with both loaded locals recorded as 2048 and immediate rechecks
true. Three captured browser failures across two runs, plus a smaller boolean-
only capture, narrow the comparison-result path. They do not establish an
editor workaround or the exact engine instruction. See
[captured comparison controls](WEBKIT_WASM_NUMBER_REPRO.md#captured-comparison-result-controls).

Newest control: the unchanged 4,480-byte JS case now fails in **standalone
JavaScriptCore**, without a browser or Playwright, when a 4 ms host-timer control
is applied. Browser cases also fail with `useJIT=false` in the startup dump,
including an independent rerun. Earlier JIT-off passes are not a reliable fix.
The exact engine operation and linkage to all editor failures remain unresolved;
production code is unchanged. See [shell and tier controls](WEBKIT_WASM_NUMBER_REPRO.md#compiler-tier-and-standalone-shell-controls).

Native follow-up: Safari passed two ten-batch runs of the preserved JS-only
DataView comparison; Playwright WebKit failed the same visible runner in batch
four. A smaller 4,480-byte dependency-free JS reproduction now fails five of
ten WebKit cases when an unexecuted branch is retained. Product version labels
are not exact engine-commit ordering, and these native passes do not waive the
earlier native editor failure. See [the native comparison](WEBKIT_WASM_NUMBER_REPRO.md#native-safari-comparison-and-preserved-cold-branch).

Latest September 26 result: the inconsistent numeric comparison also reproduces
with a JavaScript DataView source, **without Wasm**, and still reproduces with
the private validator removed. WABT independently confirms the original tiny
module's bytes. This supersedes the narrower Wasm-boundary hypothesis below:
JavaScriptCore execution is implicated more broadly, but the exact faulty
operation and the relationship to each earlier editor failure are unresolved.
See [the independent audit and controls](WEBKIT_WASM_NUMBER_REPRO.md#independent-source-audit-and-javascript-only-failure).

September 26: an isolated input comparison now reproduces **without Rust or
Breditor's Wasm/glue** using a 48-byte hand-written Wasm module returning 2048.
The failing comparison reports inequality; cold capture shows actual and
expected 2048 with identical IEEE-754 bits and true equality rechecks. Repeated
Chromium/Firefox controls pass, and an all-JIT-off WebKit control passes; a
DFG/FTL-off control still fails. This strongly implicates a JavaScriptCore/Wasm
execution or numeric-representation path, but not a specific compiler pass or
every historical editor fault. See [the isolated reproduction and limits](WEBKIT_WASM_NUMBER_REPRO.md).
No production workaround or validation relaxation was added.

Further September 26 controls: the comparison-only reduction passes even its
raw f64 case, so it masks the issue. On the unchanged known-failing property
fixture, raw f64 fails one of five cases; i32 and two conversion variants each
pass five. A full-consumer text-round-trip candidate is isolated in an opt-in
build and does not change runtime sources. See the [controls and candidate](WEBKIT_WASM_NUMBER_REPRO.md#further-reduction-and-transport-controls-september-26)
and [machine-readable evidence](qualification/2026-09-26-number-transport-controls.json).

Current staged experiment: selection getters are captured once through one
generic `Reflect.get` call site, with original validation and cleanup intact.
Two independent automated WebKit runs and two native Safari runs passed 20/20
each; its source build matches the tested artifact byte-for-byte. A third
automated run passed ten cases, then failed startup with
`engine_bootstrap.invalid_request` at restore 8 of case eleven. All seventeen
ordinary release checks pass. This is **not a complete WebKit fix** and does not resolve
the separate startup or post-Link DOM-restoration faults.

The maintained opt-in startup diagnostic now captures a concrete descriptor
failure: at restore 22, `readFormatPropertyValueType` returned null and that
rejection propagated through `readFormatProperties` / `readFormats` /
`readDescriptor`. This identifies the failing validator, not yet its cause.
See [the diagnostic workflow](#maintained-startup-rejection-diagnostics).
Its refined build also reproduces `selection.invalid_wasm_view` at restore
113/read 1 after five passing batches, despite retaining the generic getter
capture. That selection workaround is therefore not proven sufficient either.

Earlier continued investigation: the original, normally minified production
selection probe **still fails**. A 30-run attempt passed 27 complete cases, then
rejected selection consumption at restore 113/read 1 of case 28 with
`selection.invalid_wasm_view`; two cases did not run. This probe has no DOM or
clipboard in its loop. Native Safari/Simulator smoke passes do not waive this
counterexample. See [the renewed production reproduction](#renewed-production-reproduction-after-native-smoke).

A subsequent selection-u32 predicate candidate also failed: 27 complete cases
passed before case 28 rejected restore 9,625/read 0. It is not a fix. Native
Chrome's bounded clipboard checklist now passes as well; that report predates
the candidate and does not qualify this intermittent selection path.

Installed **Safari 26.6.2 now reproduces the original production selection
failure too**, at restore 7,082/read 2 of native batch ten after nine passing
batches. This is not confined to Playwright's WebKit build. See
[the native stress observation](qualification/2026-09-25-safari-selection-stress.json).

Latest September 25 follow-up: a captured required schema-version rejection
now has a contract-equivalent positive-u32 predicate mitigation. All 17 release
gates and twenty maintained, uninstrumented production stress repetitions pass
(200,000 restores / 600,000 selection reads). See the final section for the
negative controls and exact scope. The original native clipboard/caret and
separate DOM-restoration faults are not yet directly proven resolved.

September 25 verification reproduced a selection rejection in the patched
build as well as the separate profile-startup rejection. The numeric transport
change is therefore **not a complete selection-path fix**. The September 24
passes below remain historical evidence, not a current claim of resolution.

The September 24 follow-up now includes a production mitigation for an isolated
selection-coordinate transport failure, with a failing pre-fix control. The
original cut/caret fault, spontaneous Link Undo fault, intermittent
profile-descriptor startup rejection, and a separately captured post-Link DOM
restoration failure are not proven resolved by that mitigation.
The previously fixed [form-disposal recovery blocker](WEBKIT_FAULT_RECOVERY.md)
and [numeric boundary mitigations](WEBKIT_ACTION_STATE_REGRESSION.md) retain
their separate evidence. Successful repetitions do not erase observed failures.

## Controlled clipboard schedules

`tests/browser/clipboard-lifecycle.spec.ts` runs five schedules in each engine:
no follow-up input events, synchronous paired beforeinput/input, task-delayed
paired events, input without beforeinput, and stale events after a caret move.
Each schedule performs twelve cycles, alternating forward and backward ranges.
It checks:

- Copy exports the selected text without changing the document frontier.
- Cut deletes once; paste prefers plain text when both representations exist.
- Echo events cannot advance the document frontier or move a newer caret.
- Two Undo and two Redo operations traverse exactly the cut and paste states.
- Subsequent caret movement and typing leave the owner live.

On failure, the test reports cycle, stage, public owner status, range count,
and anchor/focus/start/end node types, offsets, connectivity, and host ownership.
Those extra diagnostics contain no DOM text, markup, or clipboard payload.
The test uses synthetic ClipboardEvent/DataTransfer and InputEvent objects; it
does not access or replace the user's system clipboard. It covers deliberate
event interleavings, not proof that a particular Safari release emits them.
Selection setup waits for coherent native endpoints using the existing harness.
It therefore does not reproduce every transient native selection state or
establish trusted keyboard/menu clipboard behavior on Safari or iOS.

## Separate startup lifetime probe

`profile_owner_lifecycle_probe.ts` opens and disposes 1,000 independent editors,
alternating Link, Color Showcase, and Size Showcase profiles. Each editor must
be live and export its exact canonical initial document. Owners and hosts are
released on success or assertion failure. This exercises fresh compilation,
the complete public startup path, initial rendering/selection, and disposal;
the existing descriptor test still isolates repeated reads of one profile.
Neither fixture substitutes for React, persistence, or navigation tests.

## Follow-up evidence

All runs used normal browser optimization settings, zero retries, and unchanged
production validation. The targeted maintained matrix passed 21 cases across
Chromium, Firefox, and WebKit (the existing descriptor test plus the six new
cases per engine), including 180 clipboard cycles and 3,000 editor lifetimes.
Browser-test typechecking passed.

After the final failure-diagnostic additions, the complete uninstrumented
browser matrix passed **102/102** in 1.8 minutes and the complete uninstrumented
demo matrix passed **39/39** in 1.6 minutes. Both used their standard limits and
zero retries. The full 17-stage release verifier was not rerun for these
test/documentation-only changes; the earlier failing release attempt remains
recorded in the recovery notes, not reclassified by these passes.

Additional temporary, diagnostic-only WebKit experiments passed:

- 200 directional copy/cut/caret/paste cycles with interleaved history.
- 3,000 fresh alternating compiled profiles, three descriptor reads each.
- 1,000 full alternating editor startup/disposal lifetimes.
- Five complete demo repetitions, 65 cases in 2.5 minutes.

The temporary transforms log redacted rejecting branches and can affect JIT
optimization, so their passes are not equivalent to uninstrumented evidence.
The deliberate runtime-fault recovery demo produces an expected
`toolbarDispatchFailed`; that is not a spontaneous Undo reproduction.
Logs for this pass are local investigation artifacts under `/tmp/breditor-*`.
The older original clipboard trace is no longer present at its recorded `/tmp`
path; its earlier observations are retained in the browser-support notes.

No clipboard controller, selection admission rule, Rust transport, package
version, ABI, timeout, size ceiling, or recovery policy changed in this pass.
## Later spontaneous caret fault

A subsequent rejection-instrumented WebKit run failed its 37th case, after 36
passes; 23 remaining cases did not run. In the main React demo sequence, Link
editing and its Undo/Redo succeeded, then Bold, Undo, and Redo succeeded. After
the test moved the caret to the end of the formatted document, the owner became
`faulted (queueUncertain)` before the next keyboard-typing action began. The
autosave observer's initial saved-state assertion exposed this already-faulted
owner; this is not the earlier missed dirty-to-saved observation race.

The trace is preserved at
`/tmp/breditor-webkit-caret-queue-uncertain-20260924.zip`, with the diagnostic log
at `/tmp/breditor-webkit-rejection-capture.log`. The first fault-bearing snapshot
follows the caret operation and successful Bold-Redo assertions. This is a new
runtime observation, not a proven reproduction of the original clipboard
trigger: no cut/paste occurs in this sequence, and the earlier trace lacked a
public reason. Nor does it prove the same cause as Link's `toolbarDispatchFailed`.

The initial diagnostic build captured descriptor rejections and immediate
toolbar failure branches, neither of which reported the failing boundary here.
Follow-up instrumentation adds queue terminal codes, exception frame locations,
and adapter throw sites without logging exception messages or document values.
`queueUncertain` can reflect a terminal queue failure or a faulted adapter;
its name alone does not establish whether the executor or observer threw.
Automatic replay/restart remains forbidden while the admitted command outcome
is uncertain.

With the queue/adapter diagnostics enabled, 45 focused main-demo repetitions
passed in 3.5 minutes. A subsequent run of the original mixed main/size/color
sequence passed 45 cases in 2.4 minutes. Logs are
`/tmp/breditor-webkit-queue-capture.log` and
`/tmp/breditor-webkit-mixed-queue-capture.log`. Neither reproduced the fault, so
no exact throwing operation has yet been identified. These diagnostic passes
do not establish that the additional instrumentation fixes anything.

## Warm Link history regression and boundary isolation

`tests/browser/link-history-lifecycle.spec.ts` now checks 300 Link apply/Undo/Redo
cycles in one owner per engine. It alternates focus among the form and toolbar,
checks both normalized rendering and exact raw field hydration, and verifies
that text and Highlight survive. This exceeds the fixture's 20-entry history
capacity, then exports with a retained redo branch and restores the byte-exact
checkpoint into an independent owner. The original owner can still Redo.
Failures include the public status and stage and keep the fixture mounted for
trace capture. The targeted three-engine matrix passed in 19.5 seconds, and
browser-test typechecking passed. This controlled focus/click fixture is not a
trusted pointer-event or React/persistence test and did not reproduce the fault.
The complete uninstrumented browser matrix subsequently passed **105/105** in
1.9 minutes. That run includes the new Link fixture in all three engines; it
does not reclassify the failed diagnostic demo run or mark the full release
verifier green.

Other bounded experiments passed with normal WebKit optimization:

- Three uninstrumented direct-getter probes, each checking 1.4 million mixed
  present/absent reads of the remaining six numeric descriptor accessors. The
  expectation comes from a cold read of the same immutable descriptor: this is
  a consistency probe, not an independent semantic oracle or an integration
  fix for the previously observed descriptor rejection.
- One uninstrumented 1,000-cycle Link focus/apply/Undo/Redo owner. An earlier
  attempt used the wrong input selector and failed before exercising the loop;
  only the corrected fixture is counted.
- One uninstrumented 500-cycle formatted-selection/history/caret event probe,
  with liveness assertions after each stage and after queued native events.

No production behavior changed in that coverage-only pass. These narrower passes do not waive the new
spontaneous caret fault or the existing startup/Undo observations.

## Selection-coordinate transport mitigation

A no-DOM probe restored alternating absent, forward, collapsed, and backward
selections over `Hello 🙂 world`, then consumed each selection three times. The
expected endpoints come from the requested coordinates, not a second getter
read. With the original generated glue, an uninstrumented run rejected a view
at restore 2,506/read 2. A diagnostic repetition captured `anchorNodeIndex` as
`undefined` for a collapsed selection whose expected index was 2; the focus
index remained 2 and both offsets remained 14. The log is
`/tmp/breditor-selection-field-capture.log`. A longer pre-fix diagnostic probe
also reported an offset mismatch; it did not record the mismatching values and
must not be treated as proof of the same failing field.

The four numeric selection getters now return explicit JavaScript
number/`undefined` values from Rust instead of wasm-bindgen's optional-u32 f64
absence-sentinel transport. Native Rust callers retain `Option<u32>`, and the
JavaScript names and types are unchanged. There is no getter reread, guessed
coordinate, relaxed validation, JIT override, or command replay. This is a
targeted transport mitigation, not an upstream compiler/root-cause diagnosis.

The exact pre-fix Wasm/glue was retained before rebuilding. With normal WebKit
optimization and no diagnostic transforms, the old build failed the same
10,000-restore probe at restore 4,703/read 1 with
`selection.invalid_wasm_view`; the patched build passed three repetitions,
totalling 30,000 restores and 90,000 reads. The old trace is preserved at
`/tmp/breditor-selection-old-transport-negative-control-20260924.zip`; logs are
`/tmp/breditor-selection-transport-negative-control.log` and
`/tmp/breditor-selection-transport-fixed.log`. These are bounded results, not a
guarantee against every intermittent failure.

The maintained `selection-restore.spec.ts` regression checks 3,000 restores and
9,000 reads per engine, including exact endpoint kinds, indexes, offsets, and
affinities. All three engines passed under the standard limits and zero
retries. Generated-glue coverage also mixes present, zero, and absent values
on owned snapshots retained after their engine is disposed.

The corrected implementation and maintained regressions pass all 17 release
gates: 1,560 native Rust tests, 25 Wasm-target tests, 1,242 TypeScript tests,
108 browser cases, 39 demo cases, and nine verifier tests, plus format/lint,
documentation, types, clean packed consumers, reproducibility, and size checks.
All 227 ABI signatures and every existing size ceiling are unchanged. The Wasm
binary is 1,607,548 bytes and the demo JavaScript gzip budget is 224,716 bytes.
The complete log is `/tmp/breditor-selection-fix-release-final.log`.
An initial gate attempt caught an invalid document-root selection in the new
generated-glue test; the corrected fixture uses a supported paragraph boundary
at offset zero. The full verifier was rerun from the beginning, with no skipped
gate. Nothing was published.

## Separate post-Link DOM restoration failure

Before the selection transport change, a rejection-instrumented mixed React
demo run failed its 28th case after 27 passes. Link's normalized DOM attributes
were already correct, but the success message was absent. The queue caught
`DomReconciliationRequired` from `#consumeIntentResult`, then reported
`command_queue.executor_threw` at sequence 3. This narrows that occurrence to
the post-commit DOM transition, not an uncommitted Link command. It does not yet
distinguish renderer failure from native selection restoration failure.

The trace is `/tmp/breditor-webkit-link-dom-reconciliation-20260924.zip`; the
log is `/tmp/breditor-webkit-fix-boundary-capture.log`. The observed missing
numeric selection field is not established as this exception's cause. The
queue remains fail-closed, with no automatic command replay or silent owner
restart. The earlier caret and clipboard failures likewise remain separate
observations unless a common cause is demonstrated.

After the transport mitigation and full release gate, the same mixed main,
size, and color demo schedule passed 45 WebKit cases in 2.4 minutes with normal
optimization and zero retries. Temporary diagnostics now record rejected DOM
selection writes and post-install endpoint structure, plus renderer rejection
codes; this run captured no runtime fault. Its log is
`/tmp/breditor-selection-fix-dom-capture.log`. Because those transforms can
affect optimization, this diagnostic pass neither replaces the uninstrumented
release matrix nor proves the prior DOM-transition failure is resolved.

## September 25 verification: remaining rejection reproduced

The preserved pre-fix build failed the uninstrumented 10,000-restore probe at
restore 1,205/read 1 with `selection.invalid_wasm_view`. The patched build passed
two full repetitions, then failed at restore 6,681/read 0 of the third with the
same public code. Seven planned repetitions did not run after the fail-fast
stop. Both runs used normal WebKit optimization and zero retries. Traces are
`/tmp/breditor-selection-baseline-verify-20260925.zip` and
`/tmp/breditor-selection-patched-failure-20260925.zip`; corresponding logs are
`/tmp/breditor-selection-baseline-verify-20260925.log` and
`/tmp/breditor-selection-patched-verify-20260925.log`.

A field-instrumented run reported an offset mismatch at restore 55 even though
its failure record showed equal actual/expected offsets (14 and 0). This is an
unexplained observation, not evidence that different offsets were returned.
The trace is `/tmp/breditor-selection-patched-offset-capture-20260925.zip`.

The maintained exact-coordinate regression was then repeated three times per
engine. All six Chromium/Firefox cases and the first WebKit case passed; the
next WebKit case failed at restore 2,222 during bootstrap with
`engine_bootstrap.invalid_profile_descriptor`. One case did not run. This is a
startup failure before selection consumption, not the same observed rejection.
Its trace is `/tmp/breditor-maintained-selection-startup-failure-20260925.zip`.

Extending the maintained probe to 10,000 restores with branch diagnostics
captured another selection rejection at restore 6,233/read 0 after two passing
repetitions. `readPoint` returned null for the anchor even though the captured
fields were `text`, index 2, offset 0, and affinity `before`. The focus fields
were valid and mapped successfully. No missing numeric getter value was seen
in this occurrence. The log is `/tmp/breditor-selection-detail-20260925.log`;
the trace is `/tmp/breditor-selection-valid-fields-rejected-20260925.zip`.
The exact rejecting predicate and upstream cause are not yet established.

An independent raw-getter probe reuses one compiled profile, restores fresh
Rust owners, and compares a single read of every selection field against
independently seeded expectations, without the browser projection/selection
adapter. Five uninstrumented WebKit repetitions passed: 50,000 restores and
150,000 reads. This narrower pass is not a waiver of the full-path failure.
The probe is now maintained separately as `selection-raw-restore.spec.ts`.

Adding failure-only predicate diagnostics made ten extended maintained-probe
repetitions pass (100,000 restores / 300,000 reads). Instrumentation can change
optimization, so this result does not supersede the uninstrumented failures.
Logs are `/tmp/breditor-selection-raw-20260925.log` and
`/tmp/breditor-selection-predicate-20260925.log`.

A diagnostic-only variant replaced the selection adapter's unsigned-integer
predicate with the equivalent strict-number/unsigned-shift equality check. It
passed four 10,000-restore repetitions, then stopped at a profile-descriptor
bootstrap rejection at restore 3,341 of the fifth. This is inconclusive for the
selection predicate, not a validated fix. The production predicate is unchanged.
Log: `/tmp/breditor-selection-u32-20260925.log`; trace:
`/tmp/breditor-selection-u32-startup-failure-20260925.zip`.

The targeted maintained raw-getter, five clipboard-schedule, and Link-history
matrix passed 21 cases across all three engines. The uninstrumented WebKit
demo suite also passed three repetitions (39 cases) in 1.5 minutes under its
unchanged standard timeouts and zero retries. Logs are
`/tmp/breditor-selection-clipboard-maintained-20260925.log` and
`/tmp/breditor-webkit-demo-verify-20260925.log`. These passes do not waive the
selection or startup counterexamples. No production implementation changed
during this follow-up, and the full 17-stage release verifier was not rerun;
the prior green gate is historical evidence only.

The finalized raw-getter regression explicitly records value types so that
JSON omission cannot confuse an invalid value with `undefined`. Its final
three-engine recheck passed all three cases (27,000 reads total); browser-test
typechecking and whitespace checks also passed. Log:
`/tmp/breditor-selection-raw-final-20260925.log`.

## Further isolation and a maintained stress command

The next pass removed repeated profile compilation/descriptor admission by
reusing one compiled profile. That probe failed before selection consumption,
at projection read 6,961 after two passing 10,000-restore repetitions, with
`projection.invalid_shape`. The trace is
`/tmp/breditor-fixed-profile-projection-failure-20260925.zip` and the log is
`/tmp/breditor-selection-consumer-20260925.log`. A narrower variant reused cold,
validated projections for the exact saved snapshots and generation; its real
selection-consumer loop passed 100,000 restores / 300,000 reads. This separates
the exercised boundaries but does not exonerate the complete selection path.
Log: `/tmp/breditor-selection-only-consumer-20260925.log`.

Controlled code-shape/optimizer comparisons, all against the same Rust change:

- Disabling only FTL stopped on a profile-startup rejection at restore 6,619
  of the sixth run, after five passing runs. Disabling both DFG and FTL passed
  ten runs (100,000 restores / 300,000 reads). Diagnostic startup output
  confirms the accepted settings; these settings are never used by production
  or the ordinary browser/stress tests. Logs:
  `/tmp/breditor-selection-full-no-ftl-20260925.log`,
  `/tmp/breditor-webkit-xpc-option-check-20260925.log`, and
  `/tmp/breditor-selection-no-optimizing-jit-20260925.log`.
- Regenerating **unminified** glue with wasm-bindgen 0.2.127 produced a
  byte-identical Wasm binary and declarations. Ten normally optimized WebKit
  runs passed. Log: `/tmp/breditor-selection-unminified-20260925.log`.
- A Rolldown comparison regenerated the packaged baseline byte-for-byte, then
  disabled only glue compression, preserving identifier mangling. That variant
  still rejected a selection at restore 4,609/read 0 after four passing runs.
  It is **not a fix** and was not shipped. Trace:
  `/tmp/breditor-selection-no-compress-failure-20260925.zip`; log:
  `/tmp/breditor-selection-no-compress-20260925.log`.
- A normal production-minified Vite consumer also failed, at bootstrap 8,467
  of the second run, after one complete pass. The public code was
  `engine_bootstrap.invalid_profile_descriptor`. This counterexample is not
  confined to the development server. Trace:
  `/tmp/breditor-production-profile-startup-failure-20260925.zip`; log:
  `/tmp/breditor-selection-production-baseline-20260925.log`.

These observations establish sensitivity to execution path and code shape;
they do not yet identify a particular upstream compiler defect, prove that
minification changes JavaScript semantics, or prove a common cause for every
recorded failure. The unminified pass is not a production recommendation,
especially because downstream bundlers can transform dependency code again.

The extended reproduction no longer requires ignored investigation files:

```sh
npm run test:selection:stress
```

This builds the packages, runs the same maintained exact-coordinate oracle at
10,000 restores per case, repeats ten times in WebKit, and stops on the first
failure. It retains normal optimization, zero retries, and standard timeouts.
The ordinary browser matrix still uses 3,000 restores per case. The new config
is included in browser-test typechecking and writes traces separately under
`target/playwright-selection-stress-results`.

The first maintained stress run passed eight cases, then stopped at bootstrap
6,261 of the ninth with `engine_bootstrap.invalid_profile_descriptor`; the tenth
did not run. Log: `/tmp/breditor-maintained-selection-stress-20260925.log`;
preserved trace: `/tmp/breditor-maintained-stress-startup-failure-20260925.zip`.
The command is an investigative gate with a known intermittent failure, not a
green release certificate or a replacement for `verify:release`.

The selection-adapter unit suite now checks 20 invalid values across all four
numeric endpoint fields (80 combinations), including coercion traps, boxed
numbers, symbols, bigint, fractions, and out-of-range integers. It requires
rejection without coercion and exactly-once cleanup. All 11 adapter tests pass;
browser-test typechecking passes. No production predicate, queue policy,
minifier setting, ABI, size ceiling, or browser optimization setting changed.

After adding the stress configuration, the ordinary raw/consumed selection
matrix passed all six cases across Chromium, Firefox, and WebKit in 25 seconds.
Browser-package source/test typechecking, browser-test/config typechecking,
and whitespace checks pass. The full 17-stage verifier was not rerun for this
test/tooling/documentation follow-up; the failing stress and production-bundle
counterexamples remain release risks. Log:
`/tmp/breditor-selection-defaults-20260925.log`.

## Production startup narrowed to format revision transport

Failure-only branch capture in the production-minified consumer first rejected
at bootstrap 1,604 in `readFormats`, before the compiled-profile descriptor had
been admitted. This rules out descriptor comparison as the cause of that run.
Trace: `/tmp/breditor-production-descriptor-branch-20260925.zip`.

A second capture rejected at bootstrap 7,013 while printing valid local fields
for `example/link`: revision 1, property count 2, and canonical order after
`example/highlight`. All predicates recomputed in the failure branch passed.
This does **not** prove that their original evaluations passed. Trace:
`/tmp/breditor-production-descriptor-fields-20260925.zip`.

The next diagnostic stored the four original predicate results rather than
depending on recomputation alone. After five passing repetitions, it rejected
at bootstrap 9,741 of the sixth: only `revisionInvalid` was true, and the
captured revision had type `undefined`. Kind, ordering, and property count were
valid. This was the engine-owned descriptor admission path. The Link revision
is required and is 1 in the fixture. No getter was reread to accept the value;
validation still failed closed. Trace:
`/tmp/breditor-production-descriptor-predicates-20260925.zip`; log:
`/tmp/breditor-production-descriptor-predicates-20260925.log`.

The Rust `formatRevision` export now returns explicit JavaScript number or
`undefined`, avoiding optional-u32 floating-point sentinel transport, just as
the earlier contract-version getters do. The native `Option<u32>` accessor,
public JavaScript signature, invalid-index semantics, and browser validation
remain unchanged. Generated-glue coverage mixes present and absent revisions
after the originating profile is freed. This is a narrow transport mitigation,
not proof that every startup, selection, or clipboard fault shares its cause.

Production stress is now maintained rather than requiring ignored fixtures:

```sh
npm run test:selection:stress:production
```

It statically bundles the same selection oracle with normal Vite minification
and packaged glue, then uses the same 10,000-restore, ten-repetition budgets,
normal browser optimization, and zero retries. Results/traces are isolated in
`target/playwright-selection-production-stress-results`. The development
stress command is unchanged. Before the revision transport change, this
maintained production test passed once then rejected bootstrap 9,011 in the
second case. Log: `/tmp/breditor-maintained-production-stress-20260925.log`;
trace: `/tmp/breditor-maintained-production-baseline-20260925.zip`.

The fresh-build patched production run passed six cases, then still rejected
startup at restore 7,353 of the seventh; three cases did not run. This does
not validate a complete startup fix or prove the remaining failing field.
Log: `/tmp/breditor-format-revision-production-stress-20260925.log`; trace:
`/tmp/breditor-format-revision-production-failure-20260925.zip`.
The generated-glue contract suite passed against the actual packaged minified
glue, including revision `u32::MAX`, absent indices, and retained descriptors.

The patched predicate-instrumented production build passed all ten repetitions
(100,000 restores / 300,000 reads), so it did not locate the remaining rejection.
Its instrumentation changes code shape; this pass cannot override the failing
uninstrumented run. Log:
`/tmp/breditor-format-revision-diagnostic-20260925.log`.
All 64 native Wasm-crate tests, crate Clippy, browser-test typechecking, all 227
ABI signatures, generated-glue tests, and existing size ceilings pass.

The full 17-stage release verifier then passed stages 1–15, including native
and Wasm-target tests, TypeScript tests/types, direct/path-aliased package
reproducibility and packed consumers, ABI/glue checks, production builds, size
ceilings, and **111/111 browser cases**. It failed stage 16: **38/39 demo cases**
passed, but WebKit rejected startup before the invalid-UTF-8 backup test began.
The error chain was `browser_editor.engine_bootstrap_failed` /
`engine_bootstrap.invalid_profile_descriptor`. This is not evidence that backup
decoding itself failed, and the exact rejected descriptor field was not logged.
The final whitespace stage did not run in the verifier; it was checked
separately after updating these notes. The release gate remains **failed**.
Log: `/tmp/breditor-format-revision-release-20260925.log`; preserved trace:
`/tmp/breditor-format-revision-demo-startup-failure-20260925.zip`.

Next investigation target: capture the remaining descriptor rejection in the
patched, uninstrumented-shaped production path. Do not infer that the format
revision getter is now exonerated, weaken admission, retry a faulted queue, or
treat the diagnostic-only pass as a production guarantee. Nothing was published.

## Remaining required schema-version rejection

The next production diagnostic retained the original validation expressions
and logged only on rejection. After nine passing 10,000-restore cases, case ten
failed at bootstrap 7,853 in the initial schema/count checks, before format
revisions were read. Captured fields were the expected schema name, numeric
version 1, fingerprint, and counts 3/4/6/1. Trace:
`/tmp/breditor-descriptor-next-failure-20260925.zip`; log:
`/tmp/breditor-descriptor-next-20260925.log`.

Failure-only short-circuit markers then identified the original failing check:
`isPositiveU32(schemaVersion)`. This run passed thirteen cases and rejected
bootstrap 9,981 of the fourteenth, with the captured schema version again
numeric 1. The marker did not recompute the predicate or reread the getter.
It identifies the rejecting helper, not which subexpression or upstream
runtime operation produced the unexpected result. Schema version is a required
`u32` export, not an optional-u32 sentinel. Therefore converting additional
optional getters is not justified as a complete answer to this failure.
Trace: `/tmp/breditor-descriptor-predicate-next-failure-20260925.zip`; log:
`/tmp/breditor-descriptor-predicate-next-20260925.log`.

Two diagnostic controls passed ten cases each under normal WebKit optimization:

- A raw generated-getter control compiled 100,000 fresh profiles/engines and
  checked 300,000 descriptors against fixture-defined format revisions, counts,
  and string-domain bounds, including zero and absent values. It did not invoke
  the browser descriptor consumer. Log: `/tmp/breditor-profile-raw-20260925.log`.
- A complementary control captured one initial descriptor declaration, then
  performed 300,000 real consumer calls on plain JavaScript views and a
  JavaScript generation stub. No Wasm calls occurred in the repeated consumer
  loop. It checked exact owned-metadata equality and exactly-once view cleanup.
  Log: `/tmp/breditor-profile-js-control-20260925.log`.

Neither control reproduces the combined production execution path or exonerates
it. They are isolation evidence, not a fix or proof of a particular compiler
defect. During these controls, production predicates, browser optimization,
and Rust exports were unchanged.

The maintained raw-descriptor fixture additionally checks the required schema
fields and every top-level count against explicit reference-profile expectations.
It reads each selected field once, checks both profile-owned and engine-owned
descriptors, and releases all views and owners. The ordinary test uses 3,000
fresh profiles / 9,000 reads per browser. Required-u32 unit coverage now rejects
22 malformed values across schema version and format revision (44 combinations),
without coercion or generation disposal, and admits the full positive-u32 range.
All 17 descriptor unit tests pass.

### Contract-equivalent positive-u32 candidate

A diagnostic-only production variant changed just `isPositiveU32` to require
`typeof value === "number" && value > 0 && value === (value >>> 0)`. Exact
equality rejects truncation, modulo wrapping, non-finite values, and fractions;
the leading type guard prevents coercion. The accepted range remains 1 through
4,294,967,295. It changes no optional-value policy, collection limits, ownership,
or cleanup behavior.

With normal browser optimization, normal minification, no logging transforms,
and zero retries, this variant passed **20 cases / 200,000 restores / 600,000
selection reads**. Log: `/tmp/breditor-profile-u32-control-20260925.log`.
That bounded result justified applying the same small change to the production
descriptor consumer for broader verification. It does not establish a defect
in `Number.isInteger`, prove the exact runtime cause, or settle the separately
recorded selection and clipboard/DOM faults. Rust and the Wasm ABI are unchanged
by this candidate. Earlier failures remain historical evidence.

After applying the equivalent predicate, **all 17 release gates passed**,
including all 114 browser cases, all 39 demo cases, 1,245 TypeScript tests,
native/Wasm-target tests, packed consumers and reproducibility, all 227 ABI
signatures, and unchanged size ceilings. This includes the startup sequence
that failed in the previous full demo gate. Log:
`/tmp/breditor-descriptor-u32-release-20260925.log`.
This is a bounded verified result, not permission to discard the previous
intermittent-failure evidence or claim native Safari/iOS clipboard qualification.

Finally, rebuilding the **maintained production fixture** from these verified
packages and running it with `--repeat-each=20` passed all twenty cases in
3.3 minutes: **200,000 restores / 600,000 selection reads**, normal browser
optimization and minification, zero retries, unchanged timeouts, and no
diagnostic transforms. Log:
`/tmp/breditor-descriptor-u32-maintained-production-20260925.log`.
This is independent of the earlier temporary-fixture variant run. The original
clipboard/caret and DOM-restoration observations still need direct verification;
neither successful stress result is a guarantee against every WebKit fault.
No package was published and no public contract or size ceiling was relaxed.

## Direct clipboard/caret and Link lifecycle follow-up

With the required-version mitigation in place, the original mixed main/size/
color React demo schedule passed **45 WebKit cases** (fifteen repetitions) in
2.6 minutes. It uses real Playwright pointer/keyboard interactions, normal
optimization, standard individual case/action timeouts, zero retries, and no
diagnostic transforms. No post-Link DOM-restoration or caret runtime fault was
captured. Log: `/tmp/breditor-post-mitigation-demo-stress-20260925.log`.

The new `formatted-clipboard-lifecycle.spec.ts` combines formerly separate
paths in one warm owner. Sixty cycles alternate range direction and perform:

- Link apply, Undo, and Redo, with exact expected link attributes.
- Copy without a document mutation, then a cut followed by an immediate caret
  move; optional cut echoes run immediately or after a task boundary.
- Continued typing, two Undo/two Redo operations, and restoration of the exact
  canonical formatted document, including Highlight.
- A final checkpoint round-trip with the cut/typing redo branch retained,
  followed by successful Redo on the original owner.

The fixture exceeds its twenty-entry history capacity without depending on
evicted entries. Failures report cycle/stage, owner status, and structural
selection endpoints rather than clipboard payloads or document content.
Its first three-engine run passed all three cases in 11.3 seconds. Log:
`/tmp/breditor-formatted-clipboard-matrix-20260925.log`.

Both extended schedules now have maintained commands:

```sh
npm run test:demo:stress
npm run test:clipboard:stress
```

The demo command repeats the three mixed React cases fifteen times. It expands
only the overall run budget to eight minutes, preserving individual limits.
The clipboard command repeats nine cases ten times: the five controlled echo
schedules, basic copy/cut/paste, original forty-cut/caret regression, combined
formatted lifecycle, and the 300-cycle Link history test. Both stop at the first
failure and retain traces in their own `target/playwright-*-stress-results`
directories. Browser optimization remains normal and retries remain zero.

The fresh-build clipboard stress run passed **90/90** WebKit cases in 2.9
minutes, covering at least **1,600 cut/caret cycles** and **3,600 Link
apply/Undo/Redo cycles**. Log:
`/tmp/breditor-post-mitigation-clipboard-stress-20260925.log`.
Clipboard events in these tests are controlled `ClipboardEvent`/`DataTransfer`
objects, not trusted OS clipboard input; the user's clipboard was neither read
nor replaced. These passes directly exercise the earlier test scenarios but do
not establish that the startup predicate was their common cause, or qualify
retail Safari/iOS system-clipboard behavior. No additional runtime workaround,
retry policy, Rust transport, public contract, or size budget changed here.

After these test/tooling additions, the complete ordinary browser matrix passed
**117/117** across Chromium, Firefox, and WebKit in 2.4 minutes. Browser and demo
test/config typechecking and whitespace checks pass. Log:
`/tmp/breditor-post-mitigation-browser-matrix-20260925.log`.
The full seventeen-stage verifier was not rerun for this test-only follow-up;
its preceding all-green mitigation checkpoint is recorded separately above.

## Native clipboard qualification tooling

Added `npm run demo:clipboard` and a separate manual page at
`http://127.0.0.1:4185/manual-clipboard.html`. It opens the public Rust/Wasm
ReferenceFormatting editor without the automated harness's target-range shim,
and records bounded metadata for native clipboard/input event ordering, final
cancellation, public owner status/revision, and sticky faults. Reports omit
clipboard/document/form contents and distinguish self-reported operator checks
from browser-dispatched events. Pending, truncated, synthetic-only, and faulted
runs cannot become operator-confirmed. See the
[manual protocol and evidence contract](MANUAL_CLIPBOARD_QUALIFICATION.md).

The first automated fixture run passed 11/12 checks. Its Firefox paste failure
was a test-construction issue: Firefox supplied a separate event-owned data
transfer, leaving the constructor-supplied payload unavailable. Populating
`event.clipboardData` in the controlled tests, as the existing harness does,
fixed that setup. The manual page does not construct or rewrite clipboard
events. Adding a browser-dispatched typing/cancellation check then passed all
**15/15** fixture checks across the three engines in 10.9 seconds. No native
clipboard shortcut or Clipboard API was used by these automated checks.

The subsequent fresh **full seventeen-stage release verifier passed**, including
**132/132 browser cases**, **39/39 demo cases**, Rust/Wasm and TypeScript checks,
packed consumers and reproducibility, ABI generation 5's 227 signatures, and
unchanged production size ceilings. Log:
`/tmp/breditor-manual-clipboard-release-20260925.log`.
The demo JavaScript gzip budget remains tight at 224,723 / 225,000 bytes; this
manual tooling lives only in the test harness and is not shipped in that bundle.

This provides a repeatable way to collect a real manual report, **not a completed
retail Safari/iOS clipboard qualification**. The earlier intermittent failures
remain historical evidence. No additional production runtime workaround,
validation relaxation, version bump, or package publication was made here.

## Cross-paragraph follow-up: deterministic oversized-paste fault

The new boundary oracle first verified cross-paragraph cut/paste over emoji,
combining characters, mixed Bold runs and empty paragraphs, in both selection
directions. Its initial paragraph-boundary-only history expectation was wrong:
replacing LF with normalized LF is a selection-only commit and creates no
content-history entry. The test now explicitly verifies that documented law,
including the retained redo branch and subsequent independent typing history.

Adding a source with 10,000 LF characters (10,001 paragraphs) then exposed a
real failure: the live editor became `faulted(queueUncertain)` in **all three
engines**, at the rejected-paste step. The string fit the generic byte/code-unit
limits but exceeded Rust's `InsertPlainTextInput` paragraph ceiling. HTML
admission already checked that ceiling; plain paste did not. Rust's known action
input rejection escaped the string-command path through the executor, which
the queue correctly treated as terminal. This is a deterministic cross-browser
admission gap, not evidence for a common cause of the older WebKit faults.

`pasteInsertRequest` now checks the same normalized source-paragraph count as
HTML admission before a request can reach the queue. The shared counter lives
in `plain_text_paragraph_count.ts`. Generic validation still rejects foreign,
oversized and malformed strings first, and the original text is passed through
unchanged for Rust normalization. No exception retry, queue recovery rule,
semantic capacity, Wasm contract, or size ceiling is relaxed.

The targeted verification passes **95 unit cases** and **21 browser cases**.
It checks exact 10,000-paragraph factory admission and one-over rejection for
LF/CR/CRLF, mixed endings and Unicode separators, no hostile coercion, no HTML
fallback, and no queue submission on rejection. Real-owner tests cover invalid
Unicode, byte/code-unit overflow, paragraph overflow, unsupported MIME and HTML,
then prove the original document and exact redo branch survive and remain
editable. HTML-only multiline paste strips source formatting, plain paste stays
authoritative, mixed-format copy escapes markup, and cross-paragraph history
round-trips preserve canonical documents. Events remain controlled, not OS
clipboard input. The maintained clipboard stress schedule now includes these
seven cases: sixteen cases repeated ten times, with unchanged timeouts and no
retries.

The subsequent **full seventeen-stage release verifier passed**, including
**153/153 browser cases**, **39/39 demo cases**, **1,253 TypeScript unit cases**,
native Rust/Wasm checks, packed consumers and reproducibility, the unchanged
227-signature ABI, and every production size ceiling. Log:
`/tmp/breditor-clipboard-boundary-release-20260925.log`.
The demo JavaScript gzip size is 224,754 / 225,000 bytes, an increase of 31 bytes
from the preceding verified checkpoint. No budget was raised.

The expanded WebKit clipboard stress run then passed **160/160 cases** in
3.5 minutes, using the freshly verified packages with normal optimization,
zero retries, and no diagnostic transforms. Log:
`/tmp/breditor-clipboard-boundary-stress-20260925.log`.
This fixes the reproducible oversized-paragraph input fault without claiming
the same cause for the older intermittent WebKit observations or establishing
retail Safari/iOS system-clipboard qualification. Nothing was published.

## Native UI follow-up: installed Safari and iOS Simulator

The subsequent native UI run passed the complete bounded fixture checklist in
installed Safari 26.6.2 on macOS 26.6.2: native Copy/Cut/Paste, immediate caret
movement/typing, separate Undo/Redo entries, and Link history with Highlight.
The redacted report ends live at revision 28 with trusted Copy ×1, Cut ×2,
Paste ×1, no pending/dropped events, and no observed first fault.

Safari in an iPhone 17 Pro / iOS 26.5 Simulator first passed partial native
menu Cut/Paste and hardware-key typing/history smoke. A continuation in the
same fixture independently verified Copy and Cut using different clipboard
sentinels, then passed Link apply/Undo/Redo and end-of-document paste/undo.
Its captured report is operator-confirmed, live at revision 41, with trusted
Copy ×2, Cut ×2, Paste ×2, one insertText event, and no pending/dropped events
or first fault. This is mixed menu/hardware-key evidence, not physical-device
or soft-keyboard qualification. The Chrome fixture loaded, but native
testing stopped when the user switched the active tab; no native Chrome result
is claimed. See the [exact observations, report, and limits](qualification/2026-09-25-native-clipboard.md).

This checkpoint changes documentation/evidence only. It does not claim an
intermittent-fault fix or physical-iOS certification, and does not rerun or
replace the preceding full release and stress results. Nothing was published.

## Renewed production reproduction after native smoke

The user requested renewed investigation before native Chrome testing. No
production package, predicate, Wasm getter, queue policy, timeout, or browser
optimization setting was changed. The current packages were bundled with
`vite build --config vite.selection-stress.config.ts`, then the maintained
production probe ran with `--repeat-each=30`, zero retries and fail-fast.

It passed **27 cases** (270,000 restores / 810,000 selection reads), then case
28 rejected at zero-based **restore 113/read 1** with
`selection.invalid_wasm_view`. Two planned cases did not run. This is a real
current-build counterexample, not a timeout or test-server failure. The seed at
113 is the forward text range from UTF-16 offset 0 to 14, with both preorder
indexes 2 and affinities before/after. Bootstrap and the first selection read
of that owner succeeded; the next consumer read rejected. Those expected fields
come from the fixture schedule, not captured actual values at the failure.

The test calls the actual browser selection consumer against restored Rust/Wasm
owners and validated projections, without DOM selection, React, or clipboard
events. This separates this occurrence from native caret timing, but the public
error alone cannot distinguish outer handle/generation admission, scalar checks,
point mapping, selection construction, exceptions, or cleanup. Do not attribute
it to a specific integer predicate or a shared cause with older DOM failures.

Evidence:

- Log: `/tmp/breditor-webkit-investigation-selection-20260925.log`.
- Preserved trace: `/tmp/breditor-current-production-selection-failure-20260925.zip`.
- Trace SHA-256: `e02d4e8e2d8e025f4d1f38de469233dea89b578234b4254b8382f32f7f8e45ce`.
- Current probe JS SHA-256: `91010df8ffa528af5961604122c6d0090282dd362a91c67154fac86626e2dcc4`.
- Packaged Wasm SHA-256: `8bdb6afec021dff91384f739908357936369c9c9f9d100119043bf666a505a41`.
- Environment: macOS 26.6.2, Playwright 1.62.1 / packaged WebKit revision 2336
  (package-reported browser version 26.5), dirty alpha.22 worktree on
  `64fcee8529fc0784759cf347729de87e79b97853`.

The simultaneous maintained mixed React stress run passed **45/45** in 2.9
minutes. It covers main Link/Bold/history/caret/persistence plus Size and Color
Showcases; it did not reproduce the separate runtime faults. Log:
`/tmp/breditor-webkit-investigation-demo-20260925.log`.
The focused descriptor/selection/DOM-selection/command-adapter unit suites
passed **177/177**, including post-commit failure containment. Log:
`/tmp/breditor-webkit-boundary-units-20260925.log`.

An archived pre-mitigation production bundle also passed **10/10** runs
(100,000 restores / 300,000 reads) under the same normal WebKit settings.
That negative control is itself intermittent: its green result prevents
inferring mitigation efficacy from today's green repetitions. This was an
archived full bundle, not a single-change controlled A/B comparison. Its JS
SHA-256 is `b5819af437b6ce995491c991917e015acb5ae0deed41b6adfd43827ed32b4b6a`.
Log: `/tmp/breditor-webkit-archived-control-rerun-20260925.log`. The first launch
failed before testing because the temporary config used the wrong server
working directory; only the corrected run counts.

Source review confirms that the older `DomReconciliationRequired` branch may
follow an already-committed core update. It combines renderer failure and
native-selection write failure; automatic command replay could duplicate a
mutation and remains forbidden. The current no-DOM consumer rejection must
not be silently relabeled as that DOM failure.

### Failure-only diagnostic follow-up

A separate normally minified diagnostic bundle kept the same real selection
oracle and normal browser optimization, adding rejection-only field/branch
records and markers around the original safe-integer/nonnegative/u32-bound
checks. Markers do not reread getters, substitute accepted values, or retry a
failed operation. Outer admission, consumer exceptions, and cleanup failures
also have distinct markers. These transforms live only in ignored investigation
configs under `target/`; the packaged implementation is untouched.

The diagnostic variant passed **20/20** cases (200,000 restores / 600,000 reads)
in 3.6 minutes without a captured rejection. Log:
`/tmp/breditor-webkit-selection-rejection-20260925.log`.
Because this changes executable code shape, it neither identifies the original
rejecting predicate nor supersedes the current uninstrumented failure. The
exact sub-boundary remains unresolved. The full release verifier was not rerun;
the newer failing stress result is an open release risk despite the previous
green full verifier and bounded native Safari/Simulator results.

Next investigation should preserve the failing production bundle and obtain
an exact rejecting branch or a smaller deterministic reproducer; do not ship
an integer-predicate rewrite based solely on an instrumented pass. No root-cause
fix, version bump, publication, automatic queue replay, or browser-setting
change was made during this pass.

### Subsequent Chrome attempt

Native Chrome testing was attempted after the current failure had been located,
while the isolated diagnostic follow-up completed. The native UI controller
reported a user window change during new-window setup; refreshed state showed
the user's browsing tab, so no further clipboard keys were sent there. The
separate Chrome browser-control backend is unavailable in this session. An idle
Chrome window was requested; no new native Chrome qualification result is
claimed. This is a test-access interruption, not a Chrome editor failure.

After the user confirmed an idle Chrome window, the bounded native checklist
completed successfully, including independent Copy/Cut sentinel verification,
caret typing, separate history entries, exact paste, and Link history with
Highlight preserved. Its operator-confirmed report ends live at revision 38
with four trusted/settled events and no observed fault. See the
[Chrome observations and report](qualification/2026-09-25-native-clipboard.md#installed-chrome-bounded-checklist-passed-after-idle-window-confirmation).
This report was captured before rebuilding the selection-u32 candidate.

### Rejected selection-u32 candidate

A contract-equivalent selection predicate (`typeof value === "number" &&
value === (value >>> 0)`) was tested without diagnostic instrumentation. It
passed 27 production cases, then rejected selection consumption at restore
9,625/read 0 of case 28 (`selection.invalid_wasm_view`); twelve of forty
planned cases did not run. The seeded case was a forward text range, but the
actual rejecting fields were not captured. The rewrite has been removed;
additional numeric boundary tests remain. No browser optimization flags,
timeouts, validation contracts, or retry policy were relaxed.

- Log: `/tmp/breditor-selection-u32-candidate-20260925.log`.
- Trace: `/tmp/breditor-selection-u32-candidate-20260925/selection-restore-restored-6f93c--zero-offsets-and-direction-webkit-repeat27/trace.zip`.
- Candidate JS SHA-256: `3174eb4c8095b401d7c978a88d55257d5942cf4d25387da84a00ad00265a7f44`.
- Wasm SHA-256: `8bdb6afec021dff91384f739908357936369c9c9f9d100119043bf666a505a41`.

An isolated original-predicate control reproduced the exact earlier failing
production JS bytes (SHA-256
`91010df8ffa528af5961604122c6d0090282dd362a91c67154fac86626e2dcc4`).
Its first run failed during initial seed bootstrap with
`engine_bootstrap.invalid_profile_descriptor`, before selection consumption;
29 cases did not run. A second bounded run of the same bundle passed 10/10.
Logs: `/tmp/breditor-selection-u32-control-20260925.log` and
`/tmp/breditor-selection-u32-control-second-20260925.log`.

All first fourteen non-browser release gates passed against the candidate,
including 1,256 TypeScript tests, Rust checks, package-consumer smoke,
reproducibility, and size budgets. This does not supersede its production
WebKit failure; the full seventeen-gate verifier was not run on the candidate.
Log: `/tmp/breditor-selection-u32-release-preflight-20260925.log`.
The expanded selection adapter tests cover negative zero, subnormal/fractional
numbers, full-width u32 values, bigint, symbols, and callable/coercible foreign
values without invoking their coercion hooks. They are contract coverage,
not proof that the intermittent WebKit failure is fixed.

### Native Safari reproduces the uninstrumented consumer failure

Installed Safari 26.6.2 loaded the preserved production bundle with JS SHA-256
`91010df8ffa528af5961604122c6d0090282dd362a91c67154fac86626e2dcc4`.
A separate ignored HTML runner invoked the existing probe for 10,000 restores
and 30,000 exact-field selection reads per batch, reloading the page between
batches. It did not rebuild or instrument that JS, touch the clipboard, modify
browser settings, retry failed reads, or relax validation. Unlike Playwright
repeat workers, these reloads do not guarantee a fresh browser process.

Of twenty planned batches, nine passed; batch ten stopped at restore 7,082/read
2 with `selection.invalid_wasm_view`. Remaining batches did not run. The seeded
case was collapsed at offset 14; the actual rejected fields were not captured.
The native accessibility tree exposed the failed state, exact error, Safari
user agent, bundle hash, and stack location; these were saved in the
[native stress observation](qualification/2026-09-25-safari-selection-stress.json).
The earlier native clipboard smoke remains valid for its short checklist but
does not qualify sustained native Safari reliability.

A separate branch-labelled bundle changes only twelve same-length characters
in existing error-code literals. Reversing those twelve replacements yields
the failing JS byte-for-byte; no getter, predicate, control-flow expression,
or cleanup operation changes. Its SHA-256 is
`7141c92d6a23896d2e68889b8a4f1b48342cb9ae22de06a23c89ddb5752bf67a`.
The labels distinguish alias, cleanup capture, initial result, outer admission,
exception, cleanup failure, shape, absent fields, range kind/order, point
parsing, point mapping, and range validation. This remains diagnostic-only:
the public error contract is unchanged in shipped packages.

The twelve-label diagnostic passed 40/40 Playwright WebKit cases (400,000
restores / 1,200,000 reads; 7.7 minutes) and 20/20 native Safari reload batches
(200,000 restores / 600,000 reads). Log:
`/tmp/breditor-selection-branches-20260925.log`. These passes do not identify a
root cause or override either uninstrumented failure. In particular, its
initial placeholder result was relabelled even on successful calls; the missing
diagnostic-key message differs from the original placeholder's string message.

The next diagnostic preserves that hot-path placeholder and changes only
eleven characters in rejection labels. Its JS SHA-256 is
`b53d6f6c2ccdc846bfbc6a9afd2877f5a1315957caaeb3dd2dde161470f4fa1b`.
Installed Safari reproduced rejection at restore 6,089/read 0 of batch four,
after three passing batches, with **`selection.invalid_wasm_vieJ`**.
That label identifies `anchor === null || focus === null` after `readPoint`:
the endpoint scalar parser rejected before tree mapping or owned range
construction. It does not identify which endpoint or original sub-predicate
failed. The fixture seed was a forward range at offsets 0/14. See the
[native branch observation](qualification/2026-09-25-safari-selection-branch.json).

The rejection-only variant passed all 40 Playwright WebKit repetitions in
7.7 minutes (`/tmp/breditor-selection-cold-branches-20260925.log`), despite
its native Safari failure. A further original-predicate diagnostic recorded
only failed short-circuit checks and their captured scalar types/values, never
rereading a getter or accepting a retry. It passed 20 native batches without
capturing a predicate rejection. Its JS SHA-256 is
`2d5fe12340420fec581d5fae91bae2bd2fabaea948277f62cbcdf5f606179760`.
The exact original sub-predicate remains unresolved.

### Rejected immutable-record candidate

A second uninstrumented candidate materialized the same twelve once-read
fields in one frozen JavaScript record before applying the unchanged scalar
parser. Its isolated build and staged production source emitted identical JS:
SHA-256 `816f7c4894a99cb9f89e8a5ee970cd1a1e1b45ff1a7b1441c80ac7cfbd279914`.

- Native Safari passed 20/20 reload batches: 200,000 restores / 600,000 reads.
  The [native candidate observation](qualification/2026-09-25-safari-selection-record.json)
  is a bounded pass, not the final disposition of this candidate.
- The expanded Playwright run completed 39 repetitions without a selection
  error, then hit its unchanged eight-minute aggregate guard before the last
  repetition completed. This run **failed overall**, not 40/40 passed. Log:
  `/tmp/breditor-selection-record-candidate-20260925.log`.
- A separate twenty-repetition run passed five cases, then **rejected selection
  at restore 9/read 0 of case six** with `selection.invalid_wasm_view`.
  Fourteen cases did not run. Log:
  `/tmp/breditor-selection-record-candidate-second-20260925.log`.
  Preserved trace: `/tmp/breditor-selection-record-candidate-failure-20260925.zip`,
  SHA-256 `9121b41b86d22b192ff26f90be3f9dbbba9a1af420c6c3a5533ae2c357c5beec`.
- All seventeen release gates passed against that same failed candidate,
  including 1,271 TypeScript tests, 153 browser and 39 demo cases, ABI checks,
  package consumers/reproducibility, and unchanged size ceilings. Log:
  `/tmp/breditor-selection-record-release-20260925.log`.

The frozen-record candidate was removed: ordinary release gates and native
passes do not override a newer stress counterexample. A post-candidate native
control of the byte-identical original baseline also passed 20/20 batches.
That baseline has both a captured native failure and a later complete pass;
no causal efficacy claim follows from either candidate/control pass alone.

Single-read/ordered snapshot coverage and per-getter exception/cleanup tests
remain. They prove contract behavior under the unit runner, not a WebKit fix.
The separate baseline Chromium matrix passed 51/51 browser and 13/13 demo cases
(`/tmp/breditor-chromium-current-20260925.log` and
`/tmp/breditor-chromium-demo-current-20260925.log`), in addition to the earlier
native Chrome clipboard checklist.

### Rejected canonical-validator candidate and mapper localization

A third isolated candidate removed the adapter's duplicate `readPoint` parser.
It mapped an exact numeric preorder index to the owned projection, then relied
on `BaseRangeSelection.create` for offset, affinity, shape, and Unicode checks.
No numeric coercion, retry, or relaxed rejection was introduced. Its isolated
and staged production builds matched: JS SHA-256
`5b5bafebb623b7d09f1a0649fc03d5abc34d2579b56f8d8fa5ed7dd20fe007cd`.

Playwright WebKit passed 20/20 repetitions
(`/tmp/breditor-selection-canonical-candidate-20260925.log`), but installed
Safari passed only five batches before rejecting restore 5,753/read 1 in
batch six. See the [native observation](qualification/2026-09-25-safari-selection-canonical.json).
The release verifier passed stages 1–14 before being deliberately interrupted
as stage 15 started after the native counterexample; this is **not** a full
release pass (`/tmp/breditor-selection-canonical-release-20260925.log`).
The runtime candidate was removed. Both runtime selection files now match
their original pre-investigation forms; added contract tests remain.

A rejection-labelled diagnostic of that candidate failed natively at restore
6,483/read 1 of batch six, after five passing batches. JS SHA-256:
`2a073fbaf8dbe88702b6f668f5171d372b02dbd8f30d7ef0630d7a0227428994`.
Its `selection.invalid_wasm_vieJ` identifies **point mapping**, before the
canonical range constructor. This candidate has eleven adapter sites, so its
J label differs from the original twelve-site diagnostic's J (`readPoint`).
See the [mapper-branch observation](qualification/2026-09-25-safari-selection-mapping-branch.json).
This corrects the working hypothesis: a canonical numeric predicate failure
has not been demonstrated in this candidate.

A separate, unstaged candidate replaces selection-layer u32 predicates at
both admission layers with non-coercing unsigned-round-trip checks and uses
a type-guarded integer-remainder check at Unicode boundaries. It passed
20/20 Playwright WebKit repetitions; this is only a bounded isolated pass,
not a fix. JS SHA-256:
`d920748b684d514831a3e10da7570d4f4ca3d023f68d1458988b24662f5ec892`.
Log: `/tmp/breditor-selection-numeric-candidate-20260925.log`.

Contract coverage now additionally exercises malformed kind/affinity values,
exact node-type mapping, zero/negative-zero coordinates, both endpoints'
numeric domains, and Unicode scalar boundaries without foreign-value
coercion. The targeted selection run passed 82 tests across three files,
and browser-package typechecking passed. These unit results do not establish
native Safari reliability.

### Native lookup rejection with apparently valid coordinates

Failure-only mapper capture reproduced at restore 6,923/read 1 of native
batch six after five passes. It recorded the anchor's original arguments as
kind `text` (string), node index `2` (number), offset `14` (number), and affinity
`before`. The projection had one paragraph with one run. The anchor path
lookup returned null while the focus lookup succeeded, using node index `2`
and offset `0`; order was backward. JS SHA-256:
`3946d5f61f56ede84c99ee822a5e826775ca0988e9b7d7573e4afb8fa127a1f8`.
See the [mapper capture](qualification/2026-09-25-safari-selection-mapping-capture.json).

A second cold-path diagnostic labelled each null return within
`pathAtPreorderIndex`. It reproduced at restore 6,063/read 1 of batch six,
again after five passes. The original rejection was **`not-found`**, with
requested index `2`, expected kind `text`, and the running preorder counter
already at `3`. The outer capture still reported one paragraph/one run, a
null anchor and a successful focus. This localizes the rejection to the
lookup falling through despite apparently valid captured coordinates; it is
not the mapper's type guard, a node-kind rejection, or canonical selection
validation. JS SHA-256:
`56e31b793298e98ab4d845e7cc8f662441d1c122537cc9279b1a88a286dc4f5f`.
See the [path capture](qualification/2026-09-25-safari-selection-path-capture.json).

Both diagnostics retain the original getter reads and reject rather than
retry. Only failure paths record arguments. The long error was rendered in
separate text nodes to avoid accessibility-text truncation; this rendering
used the saved report and did not rerun getters. These observations do not
yet establish a particular JavaScriptCore/compiler defect: the comparisons'
original intermediate machine state is not captured.

All 1,277 TypeScript tests passed after the expanded contract coverage
(1,187 browser package, 57 reference profile, 33 demo). Log:
`/tmp/breditor-selection-contract-tests-20260925.log`.

### Numeric candidate: native pass, then renewed failures

The two-layer numeric candidate passed 20/20 installed Safari reload batches
(200,000 restores / 600,000 reads), in addition to its first 20/20 automated
WebKit repetitions. See the [native numeric report](qualification/2026-09-25-safari-selection-numeric.json).
Staging the equivalent source produced the exact same JS SHA-256
`d920748b684d514831a3e10da7570d4f4ca3d023f68d1458988b24662f5ec892`.

An independent second automated run passed four cases, then failed **profile
startup at restore 10 of case five** with
`engine_bootstrap.invalid_profile_descriptor`; fifteen cases did not run.
This run is not a selection rejection but prevents a full-path qualification.
Log: `/tmp/breditor-selection-numeric-candidate-second-20260925.log`.
Trace: `/tmp/breditor-selection-numeric-startup-failure-20260925.zip`, SHA-256
`aad293a6e185da91a2bdba49223feee3e6d95f26c8785fe3c81031fecbba176a`.

A follow-up changed only descriptor cold rejection paths and the probe's
startup error reporting, leaving the candidate's selection implementation
unchanged. That diagnostic passed four cases, then **rejected selection at
restore 6,165/read 0 of case five**; fifteen cases did not run. This is a
different bundle, not a byte-identical uninstrumented counterexample. However,
it provides no basis to retain the numeric changes as a reliable mitigation.
Diagnostic JS SHA-256:
`f1dfd22a5b741bbf9d7c6443d5e4065092f812a550ca52d386a53e90145ea3e7`.
Log: `/tmp/breditor-selection-startup-capture-20260925.log`.
Trace: `/tmp/breditor-selection-numeric-selection-failure-20260925.zip`, SHA-256
`65d94117c112201be3279b0b0bd212686011ee02f2ebdf5fcdb8fc0518ac58ba`.

The separate generic-getter candidate captures the twelve fields through one
`Reflect.get` call site in their original order, then applies the original
selection predicates and cleanup. It does not reread getters or retry failed
selections. Its first automated WebKit run and first native Safari run both
passed 20/20. These are isolated experiment results, not a source change or
proof that the getter call shape caused the fault. JS SHA-256:
`7f619b5583e111dd6b42c3d7a6f84acc7ac443810cb733362b7f84a36d1b88fc`.
Log: `/tmp/breditor-selection-reflect-candidate-20260925.log`.
See the [native generic-getter report](qualification/2026-09-25-safari-selection-reflect.json).

The numeric candidate also completed all seventeen ordinary release gates:
1,277 TypeScript tests, 153 browser cases and 39 demo cases, with ABI and size
ceilings unchanged. Log: `/tmp/breditor-selection-numeric-release-20260925.log`.
The candidate was then removed from runtime source because the stress failures
remain; its ordinary gate pass is historical evidence, not a qualification of
the restored source or proof of a WebKit fix.

### Generic getter capture staged after independent repeats

The generic-getter experiment passed a second independent automated 20/20
run (`/tmp/breditor-selection-reflect-candidate-second-20260925.log`) and a
[second native Safari 20/20 run](qualification/2026-09-25-safari-selection-reflect-second.json).
Across the two runs in each environment this totals 800,000 restores and
2,400,000 selection reads. Native runs reload between batches, not between
browser processes.

The source implementation was then staged in `wasm_selection_adapter.ts`.
Its production probe JS is byte-identical to the preserved candidate, SHA-256
`7f619b5583e111dd6b42c3d7a6f84acc7ac443810cb733362b7f84a36d1b88fc`.
The added inherited-getter test verifies the original receiver, exact read
order, one read per field and one cleanup. All 32 adapter tests pass. The
original numeric predicates, tree traversal, range validation, Wasm binary,
and public ABI remain unchanged by this experiment.

An additional native Chrome selection run was not started: the UI-control
tool reported user activity during navigation, so further native Chrome
actions stopped. The earlier saved native clipboard result predates this
candidate; it must not be presented as qualification of the new getter path.

The third uninstrumented automated run passed ten cases, then failed at
restore 8 of case eleven with `engine_bootstrap.invalid_request`; nine cases
did not run. Unlike the earlier selection and descriptor rejections, this
code denotes request admission or request/compiled-contract compatibility.
The exact branch was not captured. The artifact is the same preserved
generic-getter bundle, not a rebuilt diagnostic. Log:
`/tmp/breditor-selection-reflect-candidate-third-20260925.log`.
Trace: `/tmp/breditor-selection-reflect-request-failure-20260925.zip`, SHA-256
`f05a0d07867278d5d22890b307667892ce1bab9cc0a1b2aab49832771c60e40b`.
This is a failed overall run. Its ten completed cases do not waive the
startup counterexample, and the candidate remains provisional.

A fresh unchanged-baseline control on a separate port passed eighteen cases,
then rejected selection at restore 113/read 1 of case nineteen; one case did
not run. The control HTML still references the original artifact, whose
SHA-256 remains `91010df8ffa528af5961604122c6d0090282dd362a91c67154fac86626e2dcc4`.
This repeats the original selection failure after the candidate's successful
selection batches; it does not waive the candidate's new bootstrap failure.
Log: `/tmp/breditor-selection-baseline-final-control-20260925.log`.
Trace: `/tmp/breditor-selection-baseline-final-failure-20260925.zip`, SHA-256
`85b34aab3ddeaefb0c0b21fbd431a2ea53e03adc47906b80be981ad06cd37d31`.

The staged generic-getter source passed all seventeen release gates:
1,278 TypeScript tests (1,188 browser package, 57 reference profile, 33 demo),
153 browser cases and 39 demo cases, plus Rust/Wasm checks, ABI generation 5,
clean package consumers and reproducibility. Browser JavaScript is 1,081,216
bytes; demo JavaScript is 862,024 bytes / 224,785 gzip bytes. Existing size
ceilings were not raised and nothing was published. Log:
`/tmp/breditor-selection-reflect-release-20260925.log`.

A cold-path diagnostic labelled the bootstrap request rejection sites:
A = `readSource` returned null, B = request/compiled durable-contract mismatch,
C = invalid profile JSON type or preflight. It passed 20/20 automated cases
without reproducing the startup failure; consequently the original rejecting
branch remains unresolved. It did not reread or retry anything. Diagnostic
JS SHA-256: `c10eafdb58a1bd0b5c39768f52ecfbdd3e6836548af0cae45833be94a216dfac`.
Log: `/tmp/breditor-selection-request-capture-20260925.log`.
This diagnostic pass is not substituted for the failed uninstrumented run.

## Maintained startup rejection diagnostics

A second run of the old request-label diagnostic passed seventeen cases, then
failed restore 55 of case eighteen with
`engine_bootstrap.invalid_profile_descriptor`; two cases did not run. It did
not capture an A/B/C request rejection. Log:
`/tmp/breditor-selection-request-capture-second-20260925.log`.
Preserved trace: `/tmp/breditor-selection-request-descriptor-failure-20260925.zip`,
SHA-256 `e35407a6140a2658f7a005c3d4603fd622194bfc846ff6bd9714358ed03ecd54`.

The investigation now has a maintained command:

```sh
npm run test:startup:diagnostics
```

It builds the packages, then a separate normally optimized fixture under
`target/startup-diagnostics`, then runs twenty WebKit repetitions with the same
10,000-restore oracle, standard budgets, zero retries and first-failure stop.
No validation is bypassed, no getter is reread, and public error codes remain
unchanged. `npm run test:diagnostics` tests the recorder and source transform.

The diagnostic Vite plugin instruments named rejection exits in four emitted
modules (bootstrap, checkpoint, document admission and profile descriptor).
It uses the existing Rolldown parser, fails on parse/known-site drift, and emits
`startup-diagnostic-map.json` with original emitted-source SHA-256 hashes and
function/line/column mappings. It does not instrument expected alternative-shape
misses. The recorder retains at most sixteen events; its omitted count saturates
at one million. Stages are bounded identifiers and metadata is an allowlist of
numeric counters/types/bounds serialized as strings, including non-finite values.
No document, checkpoint, clipboard, schema text, code points or exception messages
are retained. Accessors and foreign value coercions are not invoked by recording.

The selection test requires the diagnostic reader in this opt-in mode and
requires it to be absent in ordinary mode. Successful runs require an empty
recorder. Failed runs attach `startup-rejections.json` to the Playwright trace,
then rethrow the original failure. Attachment failure cannot replace that error.
Open the trace under `target/playwright-startup-diagnostics-results` with
`playwright show-trace`; the JSON is a test attachment, not necessarily a separate
file next to the trace. Save the trace, build and mapping before another run,
because subsequent builds/runs replace their output directories.

The first diagnostic build passed one 10,000-restore check in each of Chromium,
Firefox and WebKit, with no breadcrumbs. After making reader presence mandatory,
a fresh WebKit run failed restore 22 of its first case; nineteen cases did not
run. The attachment captured exactly:

- `descriptor:readFormatProperties:218` (value-type helper returned null),
- `descriptor:readFormats:195` (property reader returned null),
- `descriptor:readDescriptor:128` (format reader returned null).

These are original emitted-JavaScript line numbers. The first site corresponds
to the `valueType === null` rejection in `wasm_profile_descriptor.ts`.
The original error stayed `engine_bootstrap.invalid_profile_descriptor`.
Log: `/tmp/breditor-startup-diagnostics-final-20260925.log`.
Preserved trace: `/tmp/breditor-startup-property-branch-20260925.zip`, SHA-256
`fc0f83f8b1cfe943ab6733dc7e14785b115b9c008b09b9c05dcc9248674aeb62`.
Diagnostic JS SHA-256:
`97614ea4a42b6cd56c6d36fe392293c7512d047e2d255a880c9d3a129e759bb6`.
An earlier partial repetition interrupted while finalizing the assertion is
not counted as evidence.

The next refinement instruments the value-type helper itself, including its
boolean conditional rejection, and records only its already-read numeric bounds
and numeric type tags. Kind tags are 1 boolean / 2 integer / 3 string / 0 other;
bound-type tags are 0 undefined / 1 number / 2 other. Optional absent bounds are
not confused with zero, and accepted nullable result fields are not logged as
rejections. It still does not establish a particular WebKit optimization bug,
Rust defect or Wasm transport defect. Instrumentation can change optimization
and mask an intermittent fault; a green diagnostic run cannot qualify production.

The ordinary production build remains byte-identical to the staged generic
getter candidate: JS SHA-256
`7f619b5583e111dd6b42c3d7a6f84acc7ac443810cb733362b7f84a36d1b88fc` and Wasm
`8bdb6afec021dff91384f739908357936369c9c9f9d100119043bf666a505a41`.
No recorder markers or diagnostic global are present in that build or the
browser package output. No production behavior was changed by this diagnostic
follow-up, and the existing release blocker remains open.

The refined property-boundary diagnostic passed five cases, then failed
selection consumption at restore 113/read 1 of case six; fourteen cases did
not run. Its startup recorder was empty, so this did not capture rejected
property bounds. The optimized diagnostic build still contains the generic
selection getter capture; this is a counterexample to treating that workaround
as a complete selection fix, though the instrumentation differs from production.
Log: `/tmp/breditor-startup-property-capture-20260925.log`.
Trace: `/tmp/breditor-startup-property-selection-failure-20260925.zip`, SHA-256
`bfa0bb7d1bc6e50e11d75835499cb6bc36c594166925bd677cf6dca37beece13`.
Refined diagnostic JS SHA-256:
`16402aa0a709b2d793759a8dd3d3939e2d2a51d1843de4b69fd19a48efa04b3b`.

A second independent run of that same refined bundle passed ten cases, then
failed selection at restore 66/read 1 of case eleven; nine cases did not run.
The startup recorder was again empty. Log:
`/tmp/breditor-startup-property-capture-second-20260925.log`.
Trace: `/tmp/breditor-startup-property-selection-second-failure-20260925.zip`,
SHA-256 `1e79e8cd0b1d770130e16b51a006979063a4ef8d42ddbd3ab2e0bf101e8f6143`.
The property-boundary values responsible for the earlier descriptor rejection
have therefore not yet been captured. The finalized recorder additionally
preserves negative zero as `"-0"`, since the integer-bound contract distinguishes
it from zero; this does not affect successful paths.

All workspace unit suites pass, including fifteen diagnostic tests, and
browser tooling typechecking passes. Ordinary browser discovery remains
153 cases; diagnostic unit files are excluded from Playwright discovery.
The full seventeen-stage release verifier was not rerun for this test-only
follow-up. Captured bounded reports and artifact identities are retained in
[the diagnostic evidence record](qualification/2026-09-25-startup-diagnostic-rejections.json).

Final tooling smoke checks pass in Chromium, Firefox and WebKit: three ordinary
uninstrumented 3,000-restore cases and three diagnostic 10,000-restore cases.
The latter explicitly require the reader and an empty recorder; the former
explicitly require the reader to be absent. Logs:
`/tmp/breditor-startup-debug-normal-smoke-20260925.log` and
`/tmp/breditor-startup-diagnostics-final-smoke-20260925.log`.
Final diagnostic JS SHA-256:
`3f0428f4cd62e4dd6758e544e82dd868e85210450edd2e94ba7d2295072467cb`.
The full unit count is 1,293 (1,278 workspace tests plus fifteen diagnostic
tests). These tooling checks do not supersede any sustained-stress failure.

## 2026-10-02: durable revision export rejection

Two fresh normally optimized WebKit diagnostic batches reproduced an export
failure in the formatted clipboard/Link lifecycle: case 3 of the first batch
and case 20 of the second. Both rejected the original `isPositiveU32` upper
bound, `value <= 4_294_967_295`, inside `readDurableFormatBinding`. Subsequent
snapshots recorded revisions 7 and 1 respectively, with matching IEEE-754 bits.
These observations locate the first rejecting expression; they do not capture
the engine's operand representation at the instruction that compared it.

The durable-contract reader now uses the descriptor reader's exact unsigned
round-trip predicate for positive-u32 versions/revisions. Type guarding stays
first; fractions, overflow, zero revisions and foreign objects still reject.
There is no reread, validation bypass, queue restart, Wasm ABI change or Rust
change. Sixty boundary cases cover both call sites, including the signed/u32
boundary and the maximum accepted value. The candidate passed forty diagnostic
and forty ordinary uninstrumented WebKit repetitions, each with sixty complete
clipboard/Link/history cycles. Normal optimization, zero retries and existing
assertions/timeouts were retained.

The formatted workflow now attaches the same bounded recorder and source-map
evidence as the Link-history workflow. Test-only instrumentation also captures
queue and router fail-stop sites; it never reads exception payloads or document
content. This instrumentation does not ship in the browser package.

This is a targeted mitigation, **not closure of the earlier `queueUncertain`
fault**. Neither reproduction faulted the owner, and a shared cause has not
been demonstrated. Preserve the original queue-failure trace and do not treat
green repetitions as an engine repair or native Safari/iOS qualification.
Commands, trace hashes and verification results are in the
[durable-u32 evidence record](qualification/2026-10-02-webkit-durable-u32.json).

The subsequent ordinary browser matrix was **161 passed / 1 failed**, not green.
The WebKit selection-restore test rejected bootstrap 9 with
`engine_bootstrap.invalid_profile_descriptor`; the clipboard/Link cases passed.
That trace is preserved independently in the evidence record. No exact
descriptor rejection branch was captured in the ordinary build, and the
export mitigation must not be described as fixing this startup failure.

The maintained production-minified startup diagnostic then passed twenty
batches (200,000 restores / 600,000 selection reads) with normal optimization
and zero retries. It captured no descriptor rejection. That diagnostic has a
different code shape from the failing development-module matrix and does not
supersede it. The exact startup branch remains unidentified.

### Development-module startup tracing and fresh queue reproduction

The startup recorder can now run against the ordinary development module graph,
without the separate production bundle/minifier. Run the isolated restore case:

```sh
playwright test -c playwright.startup-development-diagnostics.config.ts \
  tests/browser/selection-restore.spec.ts --project=webkit --repeat-each=40
```

Omit the file filter to preserve the full ordinary WebKit suite ordering. The
config keeps normal optimization, per-test limits and zero retries. The first
isolated run passed 40 batches (120,000 restores); the subsequent three complete
instrumented WebKit suites passed 162 cases. The recorder now also labels outer
descriptor guard, exception, cleanup and final-generation failures, while
ignoring provisional default failures. Startup tests require the five-module
manifest and retain its source identities on failure.

A five-repeat **uninstrumented** WebKit control then stopped after 118 passed,
one failed and 151 unrun cases. This was a fresh `queueUncertain` failure in
`clipboard-lifecycle.spec.ts`, schedule `none`, cycle 1, at the immediate caret
move after cutting. Expected caret offsets were 9/9; the faulted owner had no
native selection. No clipboard echo events were involved. This narrows the
workflow but does not identify its first internal rejection or prove a common
cause with descriptor startup.

That ordinary clipboard test now retains the existing Link/queue diagnostic
attachments too. An 80-case focused diagnostic attempt passed 17 cases, then
stalled launching the next browser before the editor loaded. Suite and teardown
timeouts make that run inconclusive; it is not an editor failure or a pass.
A smaller 20-case rerun passed. The earlier ordinary failure remains open.
See the [development and queue evidence](qualification/2026-10-02-webkit-startup-development.json).

Three complete suites under the Link/queue diagnostic transform also passed
162 cases. Neither diagnostic workload captured the first queue rejection.
This is evidence of intermittency and possible instrumentation sensitivity,
not a fix; a lower-impact observer is the next useful comparison. No shipping
runtime code changed during this follow-up.

### Queue-only observation and another startup reproduction

The opt-in `playwright.queue-diagnostics.config.ts` now supports two smaller
observers, without transforming selection, projection, command-adapter,
descriptor or durable-document validators:

```sh
playwright test -c playwright.queue-diagnostics.config.ts --project=webkit --repeat-each=5
BREDITOR_QUEUE_CAPTURE=stop playwright test -c playwright.queue-diagnostics.config.ts --project=webkit --repeat-each=5
```

The default observes four existing catch clauses and retains only known error
messages and sanitized package line/column frames. The `stop` mode observes the
existing `#fail` method and captures only executor-versus-observer failure codes;
its execution loops and catch bodies remain byte-identical. Unit tests check
that removing the inserted code restores the exact original module. Neither
mode is claimed to be optimization-neutral. No failed command is retried.

The first catch-mode batch passed 162 cases. The second stopped at 194 passed /
1 failed / 75 unrun because axe reported `#0NaN0NaN0NaN` foreground/background
colors for Highlight. Its accessibility assertion remains unchanged; this is
not a captured queue failure, and its cause has not been established.

Stop mode stopped at 159 passed / 1 failed / 110 unrun: fresh profile-owner
iteration 8, variant 2, returned `engine_bootstrap.invalid_profile_descriptor`.
The descriptor module was unmodified and no queue exception marker was emitted.
This is another startup reproduction, not proof that startup and clipboard
failures share a cause. The startup diagnostic now exposes and attaches its
recorder for the profile-owner test as well as the selection-restore test; a
missing recorder or incomplete manifest fails a diagnostic test that otherwise
passes, while attachment errors cannot replace the original failure.

Commands, traces and source identities are retained in the
[queue-only evidence record](qualification/2026-10-02-webkit-queue-only.json).

The next full startup-diagnostic batch stopped at 118 passed / 1 failed / 151
unrun in the no-echo clipboard test, cycle 1, during history. This time the
reason was `toolbarDispatchFailed`; the expected content check passed before
the liveness assertion failed. The test did not distinguish the four Undo/Redo
calls, so the exact history transition is not known. Startup attachments have
now also been connected to the existing clipboard/Link failure hook. This
closes an evidence-capture gap, not the runtime bug.

With those attachments installed, a further five-suite startup-diagnostic batch
passed all 270 WebKit cases. This does not supersede the preceding failures.
The clipboard test now labels undo-paste, undo-cut, redo-cut and redo-paste
separately, so the next failure can identify its exact history transition.
Final controls passed 20 startup/clipboard cases across Chromium and Firefox,
and 21 queue-only clipboard/Link cases across Chromium, Firefox and WebKit.
The diagnostic unit suite passed 183 tests; browser test type checking passed.
No shipping source or Rust/Wasm contract changed in this checkpoint. The first
internal rejection responsible for the intermittent owner fault remains open.

### Distinguishing failed toolbar delivery from queue exceptions

A subsequent startup-diagnostic batch reproduced `toolbarDispatchFailed` in
the formatted clipboard test, cycle 9, during its history sequence: **257 passed,
1 failed, 12 unrun**. This time the failure retained its complete five-module
manifest and startup recorder, which contained zero events and zero omissions.
That rules out a recorded rejection at those instrumented edges, not every
possible exception or selection failure. The first internal cause is still
unknown. The six history calls now carry distinct step/direction labels.

The queue diagnostic has an additional opt-in owner-delivery observer:

```sh
BREDITOR_QUEUE_DELIVERY=1 playwright test -c playwright.queue-diagnostics.config.ts --project=webkit --repeat-each=5
BREDITOR_QUEUE_DELIVERY=1 BREDITOR_QUEUE_CAPTURE=stop playwright test -c playwright.queue-diagnostics.config.ts --project=webkit --repeat-each=5 --max-failures=3
```

This adds recording at nine existing failed-delivery result edges and the
terminal toolbar fault. It distinguishes host preflight, lease acquisition,
failed queue submission, lease release and the final outcome check. Only
closed result/command tags are retained; arbitrary identifiers, payloads,
document snapshots and accessors are not read. Queue exception recording stays
separate. Source round-trip and synthetic execution tests verify that the
inserted observer does not replace a predicate, result or successful path.

The first five-suite delivery/catch batch passed all 270 WebKit cases; this is
not a runtime fix. Only the queue and browser owner are transformed, and the
boundary adapters remain unchanged. Full commands, source identities and trace
hashes are in the [delivery evidence record](qualification/2026-10-02-webkit-delivery.json).

The stop-only queue variant also passed 270 WebKit cases without reproducing
the fault. A separate deliberate-failure control now proves that a detached
temporary editor records the original host-preflight rejection in Chromium,
Firefox and WebKit (3 passed). It preserves the failed result and does not
retry or recover the owner. Run it with
`playwright test -c playwright.delivery-control.config.ts`; it is excluded from
the ordinary 54-case suite so its test ordering remains unchanged. These passing
controls verify the observer, not a fix for the intermittent failure.
Final Chromium/Firefox clipboard and Link controls passed 14 cases. The
diagnostic unit suite passed 187 tests and browser type checking passed. No
shipping runtime or Rust/Wasm source changed during this investigation.

### Separating a numeric-transfer false failure from editor faults

Another five-suite delivery run finished **269 passed / 1 failed**. The failure
was not a clipboard owner fault: a detached-toolbar shadow counter arrived as
`Infinity`, despite both owner phases remaining live and the document staying
unchanged. The counter starts at zero and its only update is a unit increment.

Retaining the original frozen page result with `evaluateHandle` and reading it
through `jsonValue` reproduced a second disagreement in a focused batch:
**79 passed / 1 failed**. This time `ownerDocumentShadowReads` arrived as `NaN`.
Reading that same retained object afterwards through JSON text showed all four
counters as decimal `0`, native JSON `0`, and IEEE-754 bits
`0000000000000000`. The operation was not replayed. This proves disagreement
between the received numeric result and later observations of the frozen page
object; it does not establish what each original serializer predicate saw.

The ordinary detached-toolbar test now carries its JSON-only result as text.
Every existing assertion remains, with additional checks of the original
counter types, decimal/JSON strings and raw bits. This prevents JSON's
normalization of negative zero, NaN or infinities from hiding a bad counter.
The first fixed focused batch passed all **80 WebKit cases**. Direct numeric
transfer remains available, with unchanged failure assertions, as an opt-in
diagnostic:

```sh
playwright test -c playwright.counter-transport.config.ts --project=webkit --repeat-each=40
```

A subsequent 40-case direct-transfer batch passed, so reproduction remains
intermittent. The installed Playwright serializer uses special-value
`Object.is` checks, but the evidence does not identify a Playwright logic bug
versus an engine/runtime anomaly. No dependency or shipping editor code was
patched. The earlier `queueUncertain`, `toolbarDispatchFailed` and startup
descriptor failures remain open and must not be dismissed as this counter
transport issue. Exact commands, trace hashes and verification results are in
the [counter transport evidence record](qualification/2026-10-02-webkit-counter-transport.json).

The subsequent five-suite delivery batch was **not green**: 257 passed, one
navigation timeout, 12 unrun, and suite/teardown timeout errors. The navigation
failure occurred before the toolbar disposal probe; its later page snapshot
showed a live revision-zero editor. The final Link evaluation returned all 300
cycles without throwing its owner checks, but only after about 268 seconds.
Its manifest request then failed because the test server had stopped. These
traces do not identify the cause of either stall, and no timeout was relaxed.
Chromium/Firefox controls passed all 18 selected counter/clipboard/Link cases.
A final separate single-suite WebKit run passed all 54 cases in one minute;
this does not supersede the preceding failures. Diagnostic unit tests passed
193 cases and browser type checking passed. No shipping source changed.

### First captured queue exception: projection conversion rejected

A focused, unchanged clipboard/history batch reproduced a real owner fault:
**139 passed / 1 failed**. The no-echo clipboard case failed in repeat 19,
cycle 1, at `continued typing`. The queue recorder captured
`Wasm projection update is invalid` at `command_queue:executor:225`, with its
first frame at `wasm_command_adapter.js:1218:32`. The seven-module manifest
confirms that the projection adapter was not instrumented in this run.

This identifies the failing boundary in `#consumeAndRenderUpdate`:
`consumeSemanticProjectionUpdateWithCleanup` returned a failure before the DOM
renderer was called. It does **not** yet identify which shape, generation,
cleanup or update check failed, or whether Rust returned malformed data versus
JavaScript rejecting valid data. It also does not establish that all earlier
`toolbarDispatchFailed` failures share this cause.

To narrow the next reproduction, the queue configuration now accepts a
failure-only projection observer:

```sh
BREDITOR_QUEUE_DELIVERY=1 BREDITOR_QUEUE_PROJECTION=1 playwright test -c playwright.queue-diagnostics.config.ts tests/browser/clipboard-lifecycle.spec.ts --grep 'clipboard none echoes' --project=webkit --repeat-each=100 --max-failures=3
```

Only existing projection rejection/throw sites are wrapped. Numeric predicates
and successful traversal operations are unchanged; source round-trip and
synthetic execution tests check this. Instrumentation can still affect timing
and compilation. The recorder and module map distinguish this mode from the
previous unmodified-projection capture.

Separately, four deterministic tests exposed an evidence-loss bug in the
after-test hook: it fetched the source map before attaching the already-read
queue recorder. A stopped server therefore discarded valid evidence. The hook
now saves the recorder first. Missing maps still fail an otherwise passing
diagnostic test, and attachment errors do not replace an original test failure.

`BREDITOR_LINK_TIMING=1` adds an opt-in observer to the existing Link test. It
adds no timers and measures timer waits separately from time between yields,
retaining at most 16 slow spans plus omission counts, visibility/focus and
monotonic/wall-clock deltas. Snapshots travel as JSON text. WebKit documents
[inactive-page timer throttling and macOS App Nap](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/),
but neither is established as the cause of the earlier stall; between-yield
time is not a direct Rust execution measurement.

Commands, hashes, the exact captured exception and follow-up results are in the
[projection rejection record](qualification/2026-10-02-webkit-projection-rejection.json).

The first projection-only follow-up passed 100 no-echo clipboard cases.
Cross-browser controls passed 42 cases and retained complete seven-module
manifests; all six Link timing snapshots completed 300 yields with no measured
span at or above 250 ms. Three further cross-browser cases passed explicit
timing-completeness assertions, and an ordinary uninstrumented WebKit suite
passed all 54 cases. None closes the earlier projection rejection.

The stop-only queue comparison then found a **different failure**: 69 passed /
1 failed. Delayed-echo clipboard repeat 9, cycle 0, canceled paste but did not
insert the expected text. The owner remained live and the native caret was
owned and connected at offset 9. Queue, delivery and projection recorders were
empty. The trace does not contain the original clipboard disposition, so it
cannot yet distinguish admission rejection, a handled no-op or another cause.

`BREDITOR_QUEUE_CLIPBOARD=1` now adds one observer at the router's existing
`#afterClipboard` entry. It keeps the last 16 results using closed operation,
reason and progress tags, never clipboard contents or event objects. It invokes
no getters, caps console emission at 16 non-success records, and leaves the
controller's decision and the router's handling unchanged. A source round-trip
test and synthetic execution tests verify the insertion. This mode adds the
router to the manifest and requires its recorder in attachments. The first
focused delayed-echo follow-up passed 50 WebKit cases without reproducing the
mismatch. The evidence record retains both failures as open; no shipping code,
admission rule, timeout or retry count was changed.
The final clipboard observer controls passed in Chromium, Firefox and WebKit
(3 cases), retaining eight-module manifests and identical redacted successful
paste results. All 213 diagnostic unit tests and browser type checking passed.

### Redo-cut fault narrowed to the child projection result

The next seven-case batch reproduced a fault with all four observers enabled:
**139 passed / 1 failed**. In the first formatted-clipboard case, cycle 3,
the third history action (Redo cut) faulted the owner. The recorded order was
`wasm_projection_adapter:failure:488`, queue stop with
`command_queue.executor_threw`, failed queue delivery, then
`toolbarDispatchFailed` for history redo.

The first marker is the `!projectionResult.ok` branch in
`readProfiledSemanticProjectionUpdate`. There were no earlier projection-adapter
markers and none were omitted. This narrows the fault but does not establish
an inconsistent boolean read: the child can legitimately return an error from
the uninstrumented projection constructor and its validators.

The projection diagnostic now captures that child's own result fields only
after this rejection branch has been taken. It records boolean text, frozen
status, field kinds and a closed error code, without traversing document data
or rereading a freed Wasm view. The original predicate and rejection identity
are preserved. At most eight snapshots are retained, and the manifest names
this capture mode. These are later observations, not the original predicate's
value. Source round-trip, getter non-invocation, bounded emission and identity
tests pass as part of the **219-test diagnostic suite**; browser type checking
also passes.

Exact reproduction details and follow-up results are in the
[child projection evidence record](qualification/2026-10-02-webkit-projection-child.json).
No shipping code or acceptance check changed. Both the projection fault and the
separate live-owner canceled-paste mismatch remain open.

The seven-case child-capture follow-up passed 140 cases, but a focused
formatted-clipboard batch then reproduced the same Redo-cut fault: **49 passed /
1 failed**, repeat 3, cycle 6. This time the child snapshot captured a frozen
failure union: own `ok` data field was boolean false (also `"false"` through
native JSON), no `value` field, and `error.code=projection.invalid_shape`.
The observation is consistent with rejection by the child constructor or its
validators, not a successful child result rejected by the outer boolean check.
It does not yet distinguish malformed input from erroneous validation.

`BREDITOR_QUEUE_PROJECTION_VALIDATION=1`, requiring the projection observer,
now adds a separate opt-in module capture for existing rejection returns in
`projection.js`. It records only static original lines and a function-name map,
including constructor catch returns, null-returning validation helpers and
array-validation failures. It does not wrap successful predicates or retain
inputs. Exact source restoration and rejection identity tests pass; the full
diagnostic suite now passes 223 tests and browser type checking passes.

The validator-instrumented batch did not reproduce a projection rejection, but
it was **not green**: 49 passed and one formatted-clipboard case timed out.
That evaluation eventually returned all 60 cycles after about 104 seconds,
with empty queue, delivery and projection recorders. The broader controls were
also **20 passed / 1 failed**: Chromium and Firefox passed all 14 selected cases,
while WebKit's input-only clipboard case eventually completed after about
95 seconds, exceeding its unchanged 30-second timeout. All 21 traces retained
complete nine-module maps. These two stalls are distinct observations from
the captured Redo-cut rejection; no per-yield timing observer was active in
the stalled cases, so their cause remains unestablished. No timeout was relaxed.
A final separate formatted-clipboard control passed in all three engines
(3 cases), with complete maps for all 63 validator rejection sites and empty
failure recorders. This does not supersede the preceding faults or stalls.

### First exact validator rejection: trailing required property

The next validator-instrumented batch was **59 passed / 1 failed**. Repeat 7,
cycle 4 failed during Link Redo. The first marker was `projection:reject:405`,
the null return in `validateFormatDetails`' trailing required-property loop.
It propagated through `projection:reject:295`, `projection:reject:70`, and the
previously observed child rejection before faulting the owner. The captured
child again had `projection.invalid_shape`. This instance is Link Redo, not
Redo cut; the evidence does not prove that both earlier Redo-cut failures came
from this exact check.

The next diagnostic snapshots the validator's contract position and the bounded
shapes of contract, supplied and accepted properties only after that rejection.
It retains only fixed reference property names, presence tags, value types and
numeric metadata, never values or document text. Getters are not invoked.
The 228 diagnostic unit tests and browser type checking pass, including exact
source restoration and preservation of the original rejection. No shipping
validation rule changed. Details are in the
[required-property evidence record](qualification/2026-10-02-webkit-required-property.json).

A deterministic projection-adapter regression now checks all 64 combinations
of required/optional declarations and supplied property subsets, including
trailing omissions and optional gaps. All pass, with accepted properties
preserved and exactly-once view cleanup; the adapter suite passes 42 tests and
the browser package type-checks. This does not reproduce the intermittent
browser fault. The first state-capture follow-up also passed 60 WebKit cases;
the prior rejection remains open, and observer effects remain possible.

The next mixed formatted-clipboard/Link-history batch was **39 passed / 1
failed**, exposing a separate boundary: Link Apply failed at cycle 6, with
`wasm_projection_adapter:failure:474` as the first marker. `readSemanticImpact`
had returned null, before `takeProjection` or child construction. No required-
property snapshot was produced, so this instance must not be attributed to
the trailing property check. The projection observer now also marks the eight
existing null-return sites inside `readSemanticImpact`, including conditional
null returns, without wrapping successful predicates or repeating getters.
Source restoration and single-evaluation tests pass; the diagnostic suite now
passes 230 tests and browser type checking passes.

The final combined-observer run was **33 passed / 3 timed out / 4 unrun**, with
an additional teardown/runner error. It stopped at the failure limit. All
three failed traces retained complete nine-module maps and empty failure
recorders. In the formatted case, all 60 cycles completed in about 16 seconds,
but page creation and navigation had already consumed about 12 seconds;
the whole test exceeded its unchanged 30-second deadline. Other delays
included diagnostic reads and context teardown, not just editor execution.
A read-only host snapshot showed substantial swap use, but did not establish
the cause. Further stress was stopped; no apps were closed, system settings
changed, or deadlines relaxed. Final cross-browser controls remain pending.

### Cross-browser timeouts coincide with severe host load

The next six-case control run timed out in Chromium (both selected cases) and
Firefox (startup), before reaching WebKit. It reported **0 passed / 3 failed /
3 unrun**, plus a runner error; the verified test runner was interrupted after
the host check. All three saved failure recorders were empty. Chromium's Link
timing capture remained incomplete at 128/300 yields, with a pending timer;
recorded slow spans included a roughly 600 ms timer and 3.39-second between-yield
interval while the page was visible and focused.

Read-only host checks found ten logical CPUs, a one-minute load average of
472.86, and later 523 runnable processes, 264 with CoreSimulator executable
paths. Four iOS simulators were booted. These observations make host contention
a substantial timing confounder; they do not explain the earlier projection
rejections or establish that simulator shutdown will resolve them. Permission
was requested before shutting down simulators belonging to another project.
No simulator or unrelated app was stopped and no system setting changed.
Exact results and trace hashes are in the
[host-load control record](qualification/2026-10-02-host-load-controls.json).

After user approval, all four identified simulators shut down gracefully,
without erasing data or force-killing processes. A fresh device query showed
no booted simulators. Runnable processes fell from 523 to 92, runnable processes
with simulator paths from 264 to one, and available disk space rose from about
2.5 GiB to 9.5 GiB. No source, browser traces or build caches were deleted.

The same six controls then **passed in all three engines in 27.3 seconds**,
with unchanged timeouts and complete nine-module diagnostic maps. All three
Link timing captures completed 300 yields, with no pending timer or slow span
at or above 250 ms. Maximum timer waits were 6.1/14/10 ms in
Chromium/Firefox/WebKit, compared with the prior Chromium capture's roughly
600 ms timer and incomplete run. This supports host contention as a contributor
to the cross-browser stalls, but does not close the earlier required-property
or semantic-impact rejections. See the
[post-shutdown evidence record](qualification/2026-10-02-post-simulator-controls.json).

### Impact rejection localized after host recovery

The next focused WebKit run was **23 passed / 3 failed / 14 unrun**, plus a
runner error. Link-history repeat 8, cycle 9, failed on Apply with the new first
marker `wasm_projection_adapter:impact:505`. This is the `textContainers` check
`!rangesAbsent(snapshot) || affectedParagraphCount === 0`, before taking the
child projection. It narrows the previous `readSemanticImpact` failure to one
condition but does not yet identify the failing operand. The other two cases
timed out; the formatted case had empty failure recorders and the Link case
also timed out during attachment capture. They are not additional reproductions
of that condition.

The observer now records the already-captured impact/count/range metadata only
after an impact rejection. It never repeats generated getters, retains only
closed tags, types and numeric metadata, and bounds retained snapshots to eight.
Tests check exact source restoration, unchanged success behavior, single
predicate evaluation, accessor avoidance, bounded storage, sink-failure
containment and isolation of nested snapshots. All **235 diagnostic tests**
pass, as does browser-harness type checking. A new adapter regression covers
all **32 combinations** of empty/nonempty affected paragraphs and four
present/absent range endpoints, including present zero endpoints. The adapter
suite passes **43 tests**, and the browser package type-checks. No production
code, validation rule or timeout was changed.

The state-capture follow-up stopped on its first timeout: **0 passed / 1 failed /
29 unrun**, with a context-teardown error. Its complete nine-module map confirms
the new observer loaded, but every failure recorder was empty. Link timing
captured only 9 completed yields with a tenth pending, an 820 ms maximum timer
and a 4,004 ms maximum between-yield interval; all ten slow spans were visible
and focused. Host load averages remained 134/202/291 on ten logical CPUs.
This run does not resolve the metadata defect. Full commands and artifact
hashes remain in the post-shutdown evidence record above.

### Reduced raw projection-impact control

The next full-editor readiness control failed in **Chromium**, with empty
failure recorders and only 128/300 timer yields completed. The longest timer
was about 1 second and the longest between-yield interval about 3.17 seconds.
The host still had 178 runnable processes, despite no booted simulators.

Source inspection found no deterministic mismatch in the rejected metadata
contract: Rust only classifies nonempty paragraph sets as `textContainers`,
and that variant has no root-splice ranges. The generated update glue still
converts optional-u32 absence sentinels to JavaScript `undefined`. This is a
boundary worth testing, not evidence that the sentinel conversion is faulty.

The generated-glue suite now checks real Link typed action, typed intent,
Undo, Redo and text insertion updates. It asserts count/index/range fields
before and after transferring the child exactly once. The complete suite
passes against the existing built Wasm package in Node. Seven negative controls
also pass, including zero, null, NaN, leaked ABI sentinel and post-transfer
metadata changes. They are included in the existing Wasm API check script.

A new opt-in reduced browser probe mounts **no editor**. It keeps one raw
reference-formatting Wasm owner alive for 300 Apply/Undo/Redo cycles, checks all
900 updates before and after child transfer, and returns its counters as text.
It excludes DOM rendering, toolbar dispatch, the command queue, clipboard,
adapter validation and timer scheduling:

```sh
playwright test -c playwright.impact-contract.config.ts --project=webkit --trace=on
```

Chromium passed. Firefox then timed out before the test body, creating its
page; browser logs showed tab and RDD subprocess startup timeouts. The failure
limit prevented WebKit from running in that batch. A separate WebKit invocation
**passed all 900 updates**. Browser type checking and shell syntax checking
pass. This is a smaller control, not a reproduction or fix: changed call sites,
optimization and lifecycle timing mean it cannot clear the full editor fault.
Commands, identities and results are in the
[raw impact contract record](qualification/2026-10-02-raw-impact-contract.json).

One final full-editor WebKit attempt timed out **setting up the page**, before
the application or test body ran. No new metadata rejection was observed.
Browser repetition was stopped because startup itself was unreliable. The
next full-editor capture should run after host recovery; no application fix
is claimed by the reduced controls or the new regression coverage.

### Recovered-host comparison and adapter-only reduction

On the next attempt the host's load averages had fallen to 4.76/5.31/6.98.
The full-editor WebKit control passed in 6.7 seconds. Its nine-module map
confirmed both metadata and required-property captures, and its timing record
completed all 300 yields with no pending timer or slow span; maximum timer
wait was 12 ms. The following full-editor batches passed **60 instrumented**
and **40 uninstrumented** cases with unchanged assertions, deadlines and zero
retries. No new rejected metadata was captured. These passing samples do not
prove that instrumentation is neutral or that host load caused the old faults.

The isolation controls now include a middle layer:
`tests/browser/harness/impact_adapter_probe.ts` sends real generated Wasm
updates through the unchanged production descriptor and projection adapters,
without DOM rendering, toolbar dispatch, command queue or timers. It does not
pre-read update metadata; the adapter owns reads and cleanup. Each cycle checks
Link Apply/Undo/Redo against expected values while retaining text and Highlight.
The raw control remains separate and unchanged.

Both reductions passed in Chromium, Firefox and WebKit (**six cases**, 900
updates each). The adapter-only Node smoke check passed, as did browser type
checking. A further **30 WebKit adapter-only repetitions** passed, totaling
27,000 validated updates. Run the focused control with:

```sh
playwright test -c playwright.impact-contract.config.ts tests/browser/diagnostics/impact-adapter.spec.ts --project=webkit --repeat-each=30
```

This creates three levels for future comparison—raw boundary, production
validators, and full editor—but has not reproduced the prior fault outside
the full-editor evidence. No production implementation was changed or fix
claimed. Full commands and log hashes are in the
[recovered-host validation record](qualification/2026-10-02-recovered-impact-validation.json).

### Mixed workload: Redo Paste faults after expected text appears

The broader instrumented WebKit workload reproduced another owner fault:
**79 passed / 1 failed**, with no timeouts. In `clipboard none echoes`, repeat
2, cycle 0, Redo Paste faulted the owner with `toolbarDispatchFailed`. The
queue recorded an executor exception; the projection, child, required-property
and impact rejection recorders were all empty. Copy, Cut and Paste had each
completed normally. The test had already checked the expected DOM text before
its liveness assertion failed, so selection restoration or cleanup after
rendering is worth investigating. That is a hypothesis, not a root cause.

The stop-only observer cannot preserve the original exception. Repeating the
same 80-case workload with the existing catch observer passed all cases. This
does not close the fault or establish that the two observers are equivalent.
Another **60 focused catch-observer repetitions** and **30 focused deep-Link
diagnostic repetitions** passed. The latter includes selection/command-adapter
rejection sites but also changes hot numeric predicates. Both focused batches
exclude the seven clipboard-boundary cases that preceded the mixed-run failure;
they cannot rule out an effect from the preceding workload.
A subsequent **160-case catch-observer batch** restored that seven-case prefix
before the no-echo scenario, twenty times, and passed. The new evidence hooks
also add after-test browser/map calls compared with the captured failing batch;
neither this result nor the other passes isolates observer effects.

This investigation also reproduced and fixed an evidence gap: two of the five
mixed-workload suites did not attach the installed recorder and source map.
Their new awaited hooks run only for exact diagnostic configurations, and the
editor captures evidence before fixture cleanup. The coverage regression was
**2 failed / 3 passed** before the fix. All **245 diagnostic tests** and browser
type checking now pass. Six actual Chrome/Firefox/WebKit controls passed, and
every trace was inspected: complete nine-module map, retained clipboard routes,
and empty failure recorders. Ordinary configurations add no browser calls.
The same six cases also pass under the ordinary, uninstrumented configuration.

The full diagnostic suite also caught the opt-in impact probe's HTML file in
the ordinary harness entry directory. It now lives under `impact-contract/`;
the three ordinary Vite entries and their existing assertion remain unchanged.
Both relocated probes passed in all three engines, with all six result
attachments confirming 900 updates each.
No shipping implementation, timeout or validation rule was changed. Commands,
failure trace identities and verification results are in the
[Redo Paste evidence record](qualification/2026-10-02-redo-paste-evidence.json).

### Original exception captured with cold adapter throw sites

The opt-in `BREDITOR_QUEUE_ADAPTER_THROWS=1` observer wraps the emitted command
adapter's existing throw operands. It leaves queue catch blocks, numeric
predicates and successful calls unchanged, and preserves the thrown identity.
Exact-source restoration and single-evaluation tests cover the transform. Three
no-echo workflow controls passed in Chromium, Firefox and WebKit; their traces
confirm stop-only queue handling and all 96 adapter throw sites installed.

The next mixed WebKit run was **159 passed / 1 failed**, with no timeouts. It
naturally faulted in `crossParagraphHtml backward`,
repeat 2, during replacement/typing history Redo at revision 17. The first
exception is now known: `Wasm semantic selection is invalid`, thrown at original
adapter line 1321 after `consumeSemanticSelectionWithCleanup` returns failure.
It propagates through lines 1251 and 572 before the queue stops. Projection
rejection records remain empty. This localizes this failure to selection
conversion after the renderer update; it does not yet distinguish endpoint,
snapshot/order or cleanup rejection within that conversion. The selection
adapter itself was uninstrumented in the captured run.
For this transition, the exception precedes `selectionBridge.write`, so it is
not a failure returned by the browser caret-installation call.

The follow-up `BREDITOR_QUEUE_SELECTION=1` option reuses the existing boundary
recorder at 17 selection rejection sites, without wrapping successful numeric
predicates or rereading generated getters. The original selection module is
recovered byte-for-byte by removing the diagnostic wrappers in its regression
test. Its records use `wasm_selection_adapter` stage names in the shared
`projection` recorder field; the manifest explicitly identifies this extra
instrumentation.

This is a different scenario from the previous no-echo Redo Paste fault; a
shared root cause is not yet established. The injected observer test is also
separate from this natural reproduction. No production fix is claimed.
See the [adapter-throw evidence record](qualification/2026-10-02-webkit-adapter-throw.json).

### Required Link property omission captured separately

The cold-selection follow-up was also **159 passed / 1 failed**, but its failure
was different: formatted clipboard repeat 1, cycle 17, first Undo after
cut/caret/typing. The first marker is the historical `projection:reject:405`.
This time the required-property snapshot shows the mismatch: the Link contract
requires `example/href` and `example/open-in-new-window`; both the validator's
copied array and its accepted array contain only the string-valued `href`.
Their captured lengths are one, while the contract length is two. The resulting
exception is `Wasm projection update is invalid`, not a selection exception.

The original properties array and generated property count were not captured,
so this does not yet show whether the property was omitted upstream or lost
while the validator copied the array. The existing failure-only observer now
also snapshots the local source array through own data descriptors, with no
Wasm rereads or property values retained. Tests distinguish source/copied/
accepted lengths `1/1/1`, `2/1/1` and `2/2/1`.

All **259 diagnostic tests** and browser type checking pass. Six deliberately
injected constructor/selection rejection controls pass across Chromium,
Firefox and WebKit; each trace records the expected site and leaves the mounted
editor live. These are observer controls, not reproductions or fixes for either
natural fault. The shared evidence record above retains both failures separately.
The unchanged production projection/selection adapter suites also pass **86
tests**, including the existing exhaustive 64 required/optional/supplied
property combinations. The required-property rejection is correct for the
captured copied array; the unexplained part is where the property disappeared.
The source-array follow-up passed **40 formatted clipboard/Link cases** with
unchanged assertions and zero retries. It captured no additional rejected
array, so the source/copy boundary and the separate selection rejection remain
open. Passing this differently instrumented sample is not a production fix.

### JavaScript-only property-validator control and mixed follow-ups

Two further mixed WebKit batches passed **160 cases each** with the cold source-
array and selection observers enabled, zero retries and no new natural failure.
Neither the missing property's origin nor the selection rejection branch was
captured. These passes leave both earlier failures open.

A separate diagnostic configuration now exposes the actual production
`validateFormatDetails` function by appending one export to its emitted module;
all existing source bytes and shipping exports stay unchanged. The test passes
ordinary JavaScript arrays directly to that validator, without initializing
Wasm or mounting an editor. It alternates true/false, required/optional boolean
contracts, and present/absent properties. It verifies that valid copies retain
both properties, including false, while missing required properties are rejected.

The final control passed **15 browser cases / 600,000 validations**, five cases
each in Chromium, Firefox and WebKit. All trace result attachments were checked;
the tests observed no Wasm requests. The **261 diagnostic unit tests** and browser
type checking also pass. This rules out a straightforward false-value omission
in this reduced workload, not a context-dependent failure in the full editor.
Calling an exposed private function changes its callers and may change engine
optimization behavior. No production workaround or fix was made.

Commands, hashes and limits are in the
[validator-control evidence record](qualification/2026-10-02-projection-validator-control.json).

### Cut/caret/type history through production adapters without DOM

The earlier adapter-only control covered Link Apply/Undo/Redo, but not the
cut/caret/type sequence from the natural failure. A separate control now keeps
one real Wasm engine warm for 300 cycles with history capacity 20. It alternates
forward/backward cut selections, moves the caret, types, and replays six history
steps. Every transition consumes production projection and selection adapters
and verifies text, Highlight, both Link properties (including false), and exact
selection coordinates. Synchronous and task-yielding variants are separate cases.

The first Chromium calibration failed because the test incorrectly expected
Redo Cut to restore offset zero. `History::observe_state_only` updates adjacent
history boundaries after a caret move, so the correct redo caret is the moved
offset, nine in this fixture. The existing
`state_only_commit_updates_both_adjacent_history_boundaries` test confirms that
contract; all **15 Rust session-history tests** pass. Only the probe expectation
was corrected. This was not a production bug or a natural WebKit reproduction.

The corrected control passed **six cross-browser cases** and **20 additional
WebKit cases**: **109,200 projection updates and 109,200 selection checks**.
All 26 trace result attachments were verified. This narrows the reduction gap,
but does not prove browser event handling is necessary: clipboard routing,
rendering, queues, serialization and production handle-lifetime ordering remain
outside this control. Another source-capture mixed batch passed **160 cases**.

To test whether added observation changes reproduction, the diagnostic-only
`BREDITOR_QUEUE_PROPERTY_SOURCE=0` setting restores the earlier seven-argument
required-property rejection call. The default remains one, retaining source
array capture. The call site is the only generated-source difference between
these modes; successful predicates stay untouched. Two injected WebKit controls
verify the source-capture-disabled manifest. They do not reproduce the fault.
All **267 diagnostic tests** and browser type checking pass.
The earlier-call-layout mixed comparison also passed **160 cases**, with no
retries. This sample does not establish that the source capture suppresses the
fault. Neither natural failure repeated, and no production fix is claimed.

Commands, calibration details and evidence are in the
[history-adapter record](qualification/2026-10-02-history-adapter-control.json).

### Projection absence sentinel and independently captured selection rejection

A focused 300-case cross-paragraph/boundary-only clipboard batch stopped at
**179 passed / 1 failed / 120 unrun**, with zero retries. Backward boundary-only
Redo failed at revision 17. The captured projection impact was `textContainers`,
affected paragraph count one, but `oldChildStart` was **9007199254740991**
(bits `433fffffffffffff`), while the other three range fields were absent. The
projection adapter correctly rejects range metadata on this impact kind.

That number is wasm-bindgen's optional-u32 absence marker. The baseline getter
called the Wasm export then decoded absence using `value === 2**53 - 1`.
The capture establishes a leaked marker in the adapter's snapshot, not the
machine state of the original comparison. The Rust projection update now
returns explicit `JsValue::UNDEFINED` or a number for its five optional-index
bindings, following the already-established selection snapshot transport.
Native Rust methods still return `Option<u32>`. Public TypeScript declarations
and ABI version 5 are unchanged; no input validation is weakened or retried.

A generated-glue structural guard fails against the preserved baseline and
passes against the candidate: these bindings no longer decode a numeric
sentinel. Additional checks distinguish zero from absence for `rootSplice` and
`none`, before and after child projection transfer; existing tests cover
`textContainers`. The native Wasm boundary suite passes **21 tests**, generated
glue passes, and the reviewed Wasm API/ABI check passes. The structural negative
control is not a deterministic reproduction of the intermittent engine fault.

The candidate's first focused follow-up stopped at **7 passed / 1 failed / 292
unrun**. This was a different rejection: selection `readPoint` during Undo at
revision 9, with captured text point `(nodeIndex=2, offset=4, affinity=before)`.
All later numeric checks passed. The new operation-specific history stage
labels identify Undo/Redo typing versus replacement without changing assertions.

An opt-in numeric-return observer then stopped at **174 passed / 1 failed / 125
unrun**. Redo typing at revision 17 rejected a text point `(6, 4, before)`.
Unlike the earlier snapshots, this trace records the original `isU32(6)` result
as **false**. The captured value has exact bits `4018000000000000`; subsequent
safe-integer/nonnegative/u32 checks are all true. This localizes the rejection
to the JavaScript compound numeric predicate but does not yet identify which
of its three operands failed, or prove one root cause for all earlier faults.

`BREDITOR_QUEUE_SELECTION_NUMERIC=1` records original predicate returns;
`BREDITOR_QUEUE_SELECTION_NUMERIC_OPERANDS=1` additionally observes each
evaluated operand, preserving short circuit order and one evaluation. Both are
off by default and confined to the diagnostic build. They wrap hot calls and
can affect optimization even though only false results are retained. Unit
tests verify short circuiting, single evaluation, shape-drift failure, and
explicit configuration. Browser type checking and **278 diagnostic tests**
pass. The earlier missing required Link property remains separately open.

The operand-level follow-up passed **300 cases** with zero retries, so it did
not identify a failing leaf. This passing sample uses a different hot-call
layout and does not erase the original false numeric return. The ordinary
clipboard-boundary suite, with these observers disabled, also passed **21 cases**
across Chromium, Firefox and WebKit. This is bounded regression coverage, not
proof that the intermittent selection rejection has been repaired.
The candidate also passes **12 cross-browser raw-metadata, production-adapter
and history cases**: 2,700 raw metadata updates, 2,700 adapted Link updates,
25,200 history updates and 25,200 history selection checks. All 12 result
attachments were inspected. A separate traced WebKit control confirms the
three operand sites are installed and the recorder stays empty on success.

Commands, artifact hashes and follow-up results are recorded in the
[explicit-index transport evidence](qualification/2026-10-02-projection-explicit-index.json).

### Original selection upper-bound failure captured (2026-10-03)

Repeating the unchanged operand-observed clipboard batch stopped at **155
passed / 1 failed / 144 unrun**, with zero retries. Backward `boundaryOnly`,
repeat 25, failed during Undo replacement at revision 15. The original numeric
recorder retained `wasm_selection_adapter:numeric:265:operand:2` as **false**,
followed by the compound predicate's false return. The captured point was
`(text, nodeIndex=6, offset=0, affinity=after)`. The captured node index has bits
`4018000000000000`; later checks all pass.

The source hash matches the unchanged emitted selection adapter. Operand 2 is
exactly **`value <= 4_294_967_295`**. The preceding safe-integer and nonnegative
checks admitted the value; otherwise JavaScript short circuiting would not
reach this operand. This is an original comparison-result observation, not
just a later recheck. It still does not capture the native instruction's
registers or prove that every historical fault has the same underlying cause.
Diagnostic maps now include the exact static source expression for each
numeric operand, guarded by a production-source mapping test.

The earlier unsigned-shift selection rewrite was already rejected after a
selection-consumption failure (see "Rejected selection-u32 candidate" above).
It was not reintroduced. The proposed additional cold observer was unnecessary
once this repeat captured the leaf, and was not implemented. No shipping code,
timeouts, retries, optimization flags or validation contracts changed this pass.

A new isolated control appends test-only exports for the actual `isU32` and
`readPoint` functions, without rewriting their bodies or existing source bytes.
It exercises 29 valid/invalid fixtures through direct numeric admission and
both endpoint coordinates. Literal and decimal-normalized inputs are separate
cases; zero, negative zero, 6, signed-boundary and maximum-u32 values are covered,
along with fractions, overflow, non-finite values and non-number inputs. Hostile
objects must never be coerced. No Wasm requests or editor owners are involved.

All **18 cases / 15,660,000 checks** passed across Chromium, Firefox and WebKit;
all 18 result attachments were inspected. This control narrows the reproduction
gap, but adding exports and changing callers may change optimization. It does
not establish that Wasm, clipboard events or Rust causes the fault, nor does
it invalidate the full-editor counterexample. The next reduction must retain
more of the failing caller/data-flow context or capture the native comparison.
All **281 diagnostic tests** and browser type checking pass. The existing
projection-validator controls pass in all three engines. A traced WebKit
clipboard control confirms the updated map includes the three exact operand
expressions and leaves the recorder empty on success.

See the [upper-bound evidence record](qualification/2026-10-03-selection-upper-bound.json).

### Four-paragraph history reduction reproduces faults without DOM editing

The earlier history adapter control used one paragraph. A new reduction keeps
the full boundary-only case's four paragraphs, canonical empty block, Unicode,
split strong runs, backward boundary selection, deletion, identical CRLF
replacement, typing, and Undo/Redo sequence. Every cycle creates a fresh engine
and consumes real projection and selection handles through the production
adapters. Every transition checks exact paragraph/run text and strong state,
both selection endpoints, and the specific Undo point `(text, 6, 0, after)`.
No editor owner, DOM renderer, clipboard event, toolbar, or command queue is
mounted. Sync and task-yielding schedules are separate tests.

Each successful case covers **100 cycles, 1,900 commands, 1,800 projection
updates, 1,900 selection checks and 100 target Undo points**. The extra command
is an unchanged reselection, which must have no projection update. Two Chromium
calibration cases passed without changing expected results. The repeated
three-engine matrix then passed all **20 Chromium/Firefox cases**, but its first
WebKit case failed at cycle 30, `select Right`, with `projection.invalid_update`.
Nine further cases did not run. This is an uninstrumented reproduction of a
projection fault, not yet the previously captured selection upper-bound fault.

A dedicated diagnostic build observes only `projection`,
`wasm_projection_adapter`, and `wasm_selection_adapter`. It retains source
hashes and does not instrument the queue or command adapter. The first WebKit
batch stopped at **9 passed / 1 failed / 10 unrun**, at cycle 96, `paste seed`.
The first rejection was `wasm_projection_adapter:failure:303`, in the guard
checking text type, presence/integer validity of format count, and its limit of
32. The outer update rejected the child with `projection.invalid_shape`.
There was no rejected `isIndex` return in that trace. The actual text type and
format count were not captured yet, so no particular operand is blamed.

A failure-only observer now snapshots that guard's already-captured run index,
text **type only**, and format count. It records no document text and never
rereads a generated getter. Tests verify return identity, no observation on
success, no coercion, bounded retention, and fail-closed source-shape checks.

Two follow-ups encountered a different error before that guard: the initial
`select empty` command returned `error`. The first stopped at **11 passed /
1 failed / 28 unrun**, cycle 10, before the command's error code was captured.
The next stopped at **16 passed / 1 failed / 23 unrun**, cycle 86, and recorded
`breditor_wasm.invalid_selection_node`. The diagnostic recorder was empty in
both cases. Error handles are now read once and freed, and rejected selection
commands retain their existing fixture scalar arguments without retrying.

The scalar-capture follow-up stopped at **30 passed / 1 failed / 9 unrun**,
cycle 36, `reselect backward boundary`. The same error code accompanied
`anchor=(children,4,0,after)` and `focus=(text,3,2,before)`. These coordinates
match the checked projection just restored by Undo: paragraph zero has two
text runs at indexes 2/3 and the empty paragraph is index 4. This establishes
the JavaScript call arguments, not which index/kind Rust admitted internally.
The recorder again contained no projection/selection-validator rejection.

These results show that the observed reduced-workload faults do not require
clipboard routing or DOM editing. They do not establish a shared cause with
the original upper-bound comparison, nor prove a Rust logic defect. The
format-count and initial-selection errors remain separate until their values
are captured. Shipping code and browser support status are unchanged.
Final Chromium/Firefox controls pass **four cases**, with all counters and
three-module diagnostic maps verified and empty recorders. All **288 diagnostic
tests** and browser type checking pass. No green WebKit qualification is claimed.

Commands and bounded follow-up results are in the
[boundary-history evidence record](qualification/2026-10-03-boundary-history-reduction.json).

### 2026-10-03: Rust admission disagrees with the captured JS comparison

The next reduction adds **opt-in local diagnostics**, not a shipping fix. The
production JS/Wasm hashes remain unchanged. `diagnostic-selection-inputs` logs
only rejected admitted kind/index/offset and the original node-lookup outcome;
it does not retry or serialize document text. Logger exceptions are caught.
Deliberate kind-mismatch/missing-node controls and a throwing-host-logger control
pass in Chromium, Firefox and WebKit.

With only Rust rejection logging, WebKit passes 21 cases, then fails at cycle 37,
`reselect backward boundary`. JS sends `children,4,0,after`; Rust reports
`text,4,0` and finds an **element**. This is not an out-of-range node index.

An inline sixteen-entry recorder of the generated strict-equality import then
captures the same failure after 22 passing cases, cycle 51. Its final three
comparisons are:

- `children === text`: **false**
- `after === before`: **false**
- `after === after`: **true**

The `children === children` check was not called for this endpoint. Rust again
reports the admitted kind as `text` at element index 4. Both operand lookups and
the comparison execute once; the recorded result is returned unchanged. This
narrows the observed discrepancy to the JS Boolean return/Wasm admission branch.
It does **not** identify the faulty WebKit instruction or prove that every
previous numeric/projection failure shares this cause. Instrumentation can
affect execution: a heavier helper-call recorder had a separate format-count
failure, then a bounded follow-up of 60 passing cases.

#### Unqualified Rust-token candidate

The non-default `candidate-rust-selection-tokens` feature copies primitive kind
and affinity strings into Rust and matches the closed tokens there, avoiding the
imported JS Boolean equality path. Existing generated-glue contract tests pass,
including rejection of boxed strings and conversion-hook objects. However, the
candidate is **not qualified or promoted**: its history run passes eight cases
then stops at a separate projection fault. It also adds string allocations,
including copies of invalid primitive strings; cost and input-size policy need
review before any production adoption. It is not a WebKit engine fix.

#### Format-count return evidence

The candidate's failure is a string-valued text node with an absent format count.
An inline getter recorder narrows a follow-up failure (nine passes, cycle 36,
`redo second bold`, node 9): the **raw Wasm return is already
9007199254740991**, and the generated decoder correctly returns `undefined`.
Thus this occurrence is not explained by the decoder taking the wrong branch.
The exact Rust `Option<u32>` before lowering was not yet recorded in that run.

The separate `diagnostic-projection-format-count` feature stores the last
`(index, Option<u32>)` in a fixed-size Rust cell, without a host call or allocation
in the getter. Its extra diagnostic export returns scalar-only JSON on demand.
Zero/element/missing controls pass in all three browsers. The instrumented history
follow-up passes 60 cases without reproducing the fault, so the Rust-versus-raw
return discrepancy remains unconfirmed. Chromium/Firefox pass four final history
controls. A clean instrumented run is not a repaired-browser claim.

#### Reproduction configuration

Builds are isolated under `target/`; none replace `packages/breditor-wasm/dist`:

```sh
bash scripts/build-selection-input-diagnostic.sh
BREDITOR_SELECTION_EQUALITY=inline playwright test \
  -c playwright.selection-input-diagnostic.config.ts \
  --grep boundary-only --project=webkit --repeat-each=30

bash scripts/build-selection-input-diagnostic.sh --rust-tokens
BREDITOR_SELECTION_TOKENS=rust BREDITOR_PROJECTION_FORMAT_COUNT=inline \
  playwright test -c playwright.selection-input-diagnostic.config.ts \
  --grep boundary-only --project=webkit --repeat-each=30

bash scripts/build-selection-input-diagnostic.sh --rust-tokens --format-count
BREDITOR_SELECTION_TOKENS=rust BREDITOR_RUST_FORMAT_COUNT=on \
  BREDITOR_PROJECTION_FORMAT_COUNT=inline \
  playwright test -c playwright.selection-input-diagnostic.config.ts \
  --grep boundary-only --project=webkit --repeat-each=30
```

The default equality mode is `off`; `calls` and `inline` are explicit alternatives.
Every run stops at its first failure, uses no retries, and attaches build hashes,
observer modes and bounded records to its trace. Use a distinct output directory
for every run to preserve evidence. All observations here use the no-DOM fixture;
no system clipboard access or browser-engine patch is involved.

See the [Rust boundary evidence record](qualification/2026-10-03-rust-selection-boundary.json).

Final validation: **45 native Rust tests**, **25 Wasm boundary tests**,
**295 diagnostic tests**, browser typechecking, default and all-feature Wasm
linting, and both production/candidate generated-glue contracts pass. All eight
recorded artifact hashes were compared with their files. This validates the
diagnostic infrastructure and existing contracts, not WebKit qualification.

### 2026-10-03: fixed-projection reproduction and format-count transport fix

Further history capture first stopped on the already-known selection bound
failure (`6 <= u32::MAX` observed false): 15 passes, one failure. A separate
sync-only history run passed 60 cases. Neither captured the missing-count path.

`projection_count_probe.ts` now removes history, selections, profile/browser
adapters and all editor UI. It creates a base-schema document matching the
four-paragraph shape, including bold/plain runs and an empty paragraph. Each
round reads kind, text and format count for ten nodes plus one absent index.
The retained variant reuses one immutable projection; the renewed variant
creates a projection each round. The engine/document never changes. Each case
checks 110,000 counts across 10,000 rounds. Network evidence and tests exclude
browser-adapter/reference-profile modules.

The **unchanged production package** failed after 16 passes: retained projection,
round 875, text node 6 returned `undefined` instead of one format. Thus history
and selection operations are not required for a missing count.

The first combined-check diagnostic failed while the recorded count was correct
at zero; it did not name the rejecting leaf. The fixture now names that leaf and
offers three distinct controls, without retries or validator changes:

- `strict`: ordinary inequality;
- `same-value`: `Object.is`;
- `decimal`: type plus decimal-string comparison for this fixed 0/1/undefined
  fixture only, not a general-purpose production validator.

The SameValue run failed after seven passes on count `1` versus `1`, with equal
IEEE words `3ff0000000000000`, Rust count one, raw return one, decoded one and a
true cold SameValue recheck. An explicit-JS-value experiment also failed its
first strict case on equal ones. Neither changing the oracle to SameValue nor
changing count transport fixes the separate comparison class.

#### Captured missing-count path

The decimal control then caught the actual missing value after two passes,
retained projection, round 8602, node 3:

- Node kind and text were correct.
- Rust's last-return record was **`{"index":3,"count":0}`**.
- The immediately corresponding raw Wasm return was **9007199254740991**.
- Its original JS decoder returned **`undefined`**.

This localizes the contradiction between Rust's recorded `Option` and the
exported optional-f64 return, before the JS sentinel decoder. It does not name
the faulty engine/compiler instruction or establish a general wasm-bindgen bug.
The raw marker and correct decoder must not be confused with the separate
numeric predicate failures.

#### Narrow production fix and scope

`BreditorProjection::format_count` stays a native `Option<u32>` accessor. The
exported `format_count_js` maps it to a real JS number or `JsValue::UNDEFINED`,
matching the already-established explicit transport for projection-update
coordinates. No validator is weakened, failed read retried, or missing format
count treated as zero. Public TS, ABI 5, document/history formats and raw-index
admission semantics remain unchanged.

The temporary explicit-value experiment passed 60 decimal cases. The actual
rebuilt **production package**, with no Rust/JS diagnostic transforms, separately
passed **60 cases / 6,600,000 count checks**. Chromium and Firefox passed all
three oracles and the complete boundary-history cases: **16 cases**. This is
targeted evidence for the count-return change, not general WebKit qualification.

The generated-glue regression guard fails the old package and passes the new
one, preventing optional-number sentinel decoding from returning to this getter.
A native regression checks 110,000 counts and missing indexes after the engine
has been dropped, confirming retained-snapshot ownership. The reviewed API and
generated-glue contracts pass without declaration or ABI changes.

Production reproduction command:

```sh
playwright test -c playwright.impact-contract.config.ts \
  --grep 'fixed projection.*decimal' --project=webkit --repeat-each=30 --trace=on
```

The old optional-number observer remains for archived/pre-fix artifacts; its
source guard intentionally rejects the new explicit-value getter. To recreate
the old return-path capture, use the `1ae06f9` source with the new fixed-projection
fixture, or the preserved diagnostic artifact hashes in the evidence record.
Do not overwrite a baseline artifact during a live test. Old production assets
were copied to `/tmp/breditor-format-count-baseline.2Ogve3/dist` before rebuilding.

All intermediate failures, the equal-value control failure, and the targeted
passes are retained in the
[format-count evidence record](qualification/2026-10-03-projection-count-transport.json).

The post-fix full-history diagnostic passes **17 cases**, then rejects the valid
backward selection at cycle 33 (`children,4,0,after` to `text,3,2,before`) with
`breditor_wasm.invalid_selection_node`. Its adapter recorder is empty; this
production run did not enable Rust kind-admission logging. The known selection
admission issue remains separate and open. Final validation also passes **67
native tests**, **25 Wasm boundary tests**, **296 diagnostic tests**, browser
typechecking, the reviewed API comparison and strict Rust linting. WebKit remains
unqualified despite the targeted count-return repair.

Direct/path-aliased package reproducibility, runtime integrity and all release
size budgets also pass. Generated-glue tests explicitly retain zero for plain
text and undefined for element, missing and maximum-u32 indexes.
