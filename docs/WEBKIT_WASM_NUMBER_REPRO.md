# Rust/Wasm-free numeric comparison reproduction

Later same-day editor qualification is still blocked: the lifecycle-hardening
build has new Link/clipboard history and selection-restore counterexamples.
Those are not yet linked to the native FCSEL capture. See
[the current editor checkpoint](qualification/2026-09-28-generation-lifecycle-and-webkit-followup.json)
and [browser support status](BROWSER_SUPPORT_AND_ACCESSIBILITY.md#webkit-fault-investigation).
Earlier successful runs below remain evidence for their exact builds and scope,
not a claim that all WebKit faults are resolved.

Latest September 28 checkpoint: register-only snapshots bracket an incorrect
first `FCSEL` result in the pinned native comparison path. A child-only explicit
branch replacement passes bounded paired runs and 1,300 semantic checks; this
is not an installed engine fix. Breditor's private boundary normalizer now
avoids comparing incoming numbers before conversion, including zero. See
[select isolation and zero hardening](#select-isolation-and-zero-hardening).

Runtime integration (latest checkpoint): the four-site decimal-round-trip
mitigation is now in the browser adapters, without the diagnostic transform.
Original and experimental builds are preserved separately; see
[integrated runtime qualification](#integrated-runtime-qualification).
This is a bounded mitigation, not a fix to JavaScriptCore itself.

Reproduction status: **reproduced; exact JavaScriptCore cause unresolved**.
The reduced case is diagnostic evidence, not release qualification. The later
runtime mitigation and its separate qualification are described above and below.

September 28 root-cause follow-up: two fresh unmodified-engine captures confirm
the bad native comparison, including a new `2048 / NaN` register outcome. A
single-step replay of the latter reaches the correct result with unchanged
inputs. This is **not fixed**. See [native replay and conversion guards](#native-replay-and-conversion-guards).

Full-editor follow-up: the existing exact-value boundary-normalization candidate
now has native Safari runs and the complete browser-runtime contract suite
behind it. The paired full-editor controls remain necessary because passing
candidate cases alone cannot establish a fix. See
[full-consumer qualification](#full-consumer-qualification-follow-up).

The same candidate now passes an additional bounded native Safari clipboard
checklist and 126 automated interactive cases across WebKit, Chromium and
Firefox. See [interactive qualification](#interactive-and-native-clipboard-qualification).
It remains opt-in; no production adoption is implied.

The next follow-up measures the isolated conversion cost and adds another
150,000 native Safari restores without a failure. See
[cost and extended native stress](#conversion-cost-and-extended-native-stress).

Newest result: authorized native debugging caught two encoded **2048** operands
on the false-return path of `JSC::objectConstructorIs`, while the floating-point
comparison registers contained **0 and 2048**. This reproduced in two baseline
debugger runs and through the interpreter with JIT disabled. The exact point
where the value becomes wrong remains unresolved. See
[the native register captures](#authorized-native-register-captures).

Latest narrowing: a source-level capture now records a **false comparison
result before mismatch reporting**, with both loaded locals later captured as
2048 and immediate equality rechecks true. This reproduced twice, then once in
an independent browser rerun. A smaller last-result-only capture also fails.
See [captured comparison controls](#captured-comparison-result-controls).

Newest result: the unchanged small JS bundle now reproduces in the standalone
JavaScriptCore shell with a 4 ms host-timer control: **no browser, DOM execution,
Playwright transport, Rust or Wasm is required**. Browser runs also fail with
`useJIT=false` in the startup option dump. Earlier short JIT-off passes therefore
do not establish a compiler-tier fix. See [the tier and shell controls](#compiler-tier-and-standalone-shell-controls).

Latest finding: **Wasm is no longer required.** A JavaScript `DataView` source
reproduces the same inconsistent comparison report in WebKit, including after
removing the private property validator. See [the independent source audit](#independent-source-audit-and-javascript-only-failure).
The next reduction preserves an unexecuted branch and reproduces in a single
4,480-byte JavaScript bundle with no imports or Wasm assets. Native Safari and
Playwright's WebKit results are now tracked separately below.

"Tiny Wasm" here is our nickname for a 48-byte test module, **not a library,
compiler or runtime used by Breditor**. Browsers execute it using their own
WebAssembly engines. Replacing this test does not replace a production
dependency. An independent assembler audit and alternative sources are
described below.

## Select isolation and zero hardening

The [machine-readable checkpoint](qualification/2026-09-28-select-conversion-and-boundary-hardening.json)
preserves raw native register captures, injected instruction bytes, per-run
hashes, outcomes, and browser qualification totals. All native modifications
below affect newly launched disposable debugger children only. Installed
Safari/JavaScriptCore files and security settings are unchanged.

The strongest new snapshot is around the first `FCSEL` at original file address
`0x112ce98`. With both tagged inputs representing 2048, register-only `FMOV` and
`MRS NZCV` observations capture the double candidate as IEEE bits
`0x40a0000000000000` immediately before and after the select. Both saved flag
values are zero. Therefore `HI` is false and the double candidate should be
selected; the captured result is instead zero. This run uses unconditional
false-return breakpoints, so no breakpoint-condition expression is evaluated.
The original unmodified path also fails with unconditional breakpoints.

This narrows the observation interval to the first select, but does **not**
establish whether the ultimate cause is the engine build, OS, CPU, or another
execution-context effect. Instrumentation changes layout and timing. The
preserved registers are evidence, not proof of a hardware defect.

Controls and experimental replacement:

- Swapping FCSEL source operands and inverting its condition still fails:
  two failures in five runs, as does its paired unchanged control.
- Relocating the original conversion without changing its instructions still
  fails: three of five runs in the first series and five of five in the second.
- Explicit integer branches replacing the two floating-point selects pass
  all ten interleaved 10,000-iteration runs. The same replacement passes 1,300
  SameValue checks covering signed zero, NaN, infinities, integer/double boxing,
  extreme numbers, and non-numeric identity.
- Disabling GC as well as JIT still fails twice in five runs. Neither option
  is a fix.

Reproduce using the hash-pinned native runner's `probe-select-snapshot`,
`probe-select-relocated`, `probe-select-branch`, and
`select-branch-conformance` scenarios. The runner refuses a different framework
or reduced bundle. Assembly templates accompany the child-memory patch helper.
These are diagnostics, not a supported browser patch or release workaround.

Separately, the production normalizer previously tested `value === 0` before
decimal conversion. That left a numeric comparison ahead of the mitigation
and bypassed re-materialization for positive zero. It now converts first and
uses the IEEE sign byte for the zero case, preserving negative zero without
coercing objects or re-reading getters. This is defensive hardening of an
identified dependency, **not** a newly reproduced failure of the old zero path.
Only the existing four capture sites change; validation and the Rust ABI do not.

Qualification of this production change:

- All 17 release gates pass, including 153 browser and 39 demo cases.
- The separately rebuilt minified runtime passes another 153/153 browser cases
  with no skips, flakes, or unexpected failures.
- Automated WebKit and visible native Safari each pass 50,000 restores and
  150,000 selection reads on the rebuilt runtime.
- Deterministic IEEE-754 round-trip tests retain both zero signs and exact
  numbers. The production demo gzip budget has only 104 bytes remaining; no
  budget was raised.

This checkpoint does not repeat native clipboard qualification. The underlying
engine fault and any separately reproducible clipboard faults remain distinct
from these passing, bounded mitigation checks.

## Native replay and conversion guards

The September 28 investigation returns to the failing original, not the
normalization candidate. Decisive captures and all replay steps are preserved in
[the root-cause evidence record](qualification/2026-09-28-native-root-cause.json).

Fresh reproduction in the pinned WebKit 2336 standalone shell:

- JIT disabled: two completed cases, then a native stop with both encoded
  operands representing 2048 but `d0=0, d1=2048`.
- Baseline: one completed case, then a native stop with the same encoded
  operands but `d0=2048, d1=NaN`.
- Both stops are at file address `0x112cf60` in `JSC::objectConstructorIs`,
  immediately before its false return. These are not successful JS completions;
  the diagnostic child is terminated after capture.

For the second stop, `probe-replay` records the original state first, then moves
only that failed child's PC to `0x112ce80` and single-steps the numeric path.
It does not replace operands, repair a result, or resume application execution.
The original instruction bytes and call-frame arguments are captured. Replaying
the same inputs reaches the true-return block, with both converted values 2048.
Therefore the second observation cannot be explained solely as a persistent
wrong input or a consistently wrong result from that instruction sequence.
It does **not** distinguish an engine, compiler, OS, hardware, or execution-context
cause, and it does not identify which instruction first misexecuted originally.

The source-level location is the numeric conversion/comparison used by
[`objectConstructorIs`](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/ObjectConstructor.cpp)
and [`sameValue`](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/JSCJSValueInlines.h).
These links describe current upstream source, not proof of the exact source
revision used to build the pinned binary. Native disassembly is the evidence
for addresses and instructions in this investigation.

Additional controls:

- Direct C calls to the actual, hash-checked engine function, without creating
  a JS VM: 20,000 calls across five numeric cases, pausing 4 ms every ten calls,
  passed. Its fabricated call frame is only valid for the audited numeric leaf
  path; this is not a public engine API or production code.
- Both standalone assembly conversion variants passed the same 20,000-call
  frequent-pause test. Earlier tests paused every 100,000 calls, not continuously.
- Smaller JS single-value and mixed-tuple controls did not reproduce. Keep the
  original 4,480-byte bundle as the failing reproduction; do not replace it with
  these passing controls.

`probe-guard` now installs low-overhead checks in a **disposable child only**.
The first conversion remains in place. A checked 16-byte jump redirects execution
after it to a debugger-allocated read/execute mapping; the displaced instructions
and second conversion execute there before returning to the original function.
The guards retain source bit patterns and condition flags, and stop only on an
inconsistency. `jsc_conversion_guard.S` documents the emitted instructions.
The second conversion is relocated, and timing/layout change, so guarded success
is not evidence of a root-cause fix. No installed file or existing browser process
is modified, no executable is re-signed, and no host security policy changes.

The final deliberate-mismatch control was captured correctly, and five final
baseline guarded cases completed without a natural stop. An earlier ten-case
exploratory run changed the helper between cases 4 and 5; its embedded payloads
identify the versions, and it is excluded from clean totals. The launcher now
hashes the runner/helper and refuses source drift during a batch.

Examples (absolute paths are required; a nonzero exit after a native stop is
expected and must not be counted as an infrastructure failure or a pass):

```sh
node scripts/debug-jsc-number-repro.mjs /absolute/webkit-2336 /absolute/index-a-Ao9ALN.js no-jit probe 5
node scripts/debug-jsc-number-repro.mjs /absolute/webkit-2336 /absolute/index-a-Ao9ALN.js baseline probe-replay 5
node scripts/debug-jsc-number-repro.mjs /absolute/webkit-2336 /absolute/index-a-Ao9ALN.js no-jit guard-control 1
node scripts/debug-jsc-number-repro.mjs /absolute/webkit-2336 /absolute/index-a-Ao9ALN.js baseline probe-guard 5
```

Verification: all 81 diagnostic tests passed; C controls compile with warnings
as errors; emitted guard instructions were inspected; whitespace checks passed.
No editor runtime code changed in this follow-up. **Proper fix remains open.**
The next required evidence is a natural mismatch at an instrumented conversion,
or an equivalent lower-perturbation capture that establishes the first bad
instruction/state transition. Do not label the decimal-round-trip mitigation,
single-step replay, or passing instrumented cases as that fix.

## Authorized native register captures

September 26 follow-up: the user explicitly authorized developer debugging.
`DevToolsSecurity -enable` succeeded; developer mode is now enabled on this Mac.
This supersedes the earlier authorization blocker, not the historical failed
attempts below. No executable was re-signed, no other security policy was
changed, and no existing Safari, Chrome, demo or other application was attached.
LLDB launches only a standalone diagnostic `jsc` child and terminates that child
after a stopped register capture.

The new `scripts/debug-jsc-number-repro.mjs` checks the SHA-256 of both the
framework and unchanged 4,480-byte JS bundle before using native addresses.
It ignores user LLDB initialization, clears inherited JSC option overrides,
sets explicit framework paths, and records startup options. These are opt-in
debugging tools, not changes to the editor or its validation.

The false-return breakpoint is file address `0x112cf60`, offset +316 in
`JSC::objectConstructorIs` in the pinned arm64 framework. It stops **before**
the instruction that returns false. The relevant failed snapshots agree:

```text
x0 = 0x40a2000000000000  double-encoded input: 2048
x2 = 0xfffe000000000800  integer-encoded input: 2048
d0 = 0                 left comparison value
d1 = 2048              right comparison value
x8 = 0x0000000000000000  bits copied from d0
x9 = 0x40a0000000000000  bits copied from d1
```

The integer-register copies corroborate the floating-point display: this is
not just two JavaScript values serialized after the failure. Both representations
legitimately encode the same number. At this stop the native routine is about
to return false after observing different comparison values. We do not know
the failing loop iteration because the child is stopped before JS reporting.

Runs stop at their first native capture; the unexecuted remainder is not counted:

- Baseline attempt: one complete pass, then a native contradiction in case two.
- Independent baseline attempt with `--no-lldbinit`: four complete passes,
  then the same contradiction in case five.
- JIT-disabled attempt: the same contradiction in the first case, with the
  LLInt native-call trampoline in the stack.
- A later JIT-disabled, startup-option-logged attempt passed all five cases;
  each completed report confirmed all three JIT options were zero before and
  after execution. These intermittent passes do not erase the native failure.
- Deliberately unequal 2049/2048 controls: native false-path captures correctly
  retain 2049 and 2048 in both baseline and JIT-disabled modes.
- Early-conversion control: two 2048 inputs correctly produce `d0=d1=2048`
  immediately after the first conditional floating-point select (+120).
- A full probe with that earlier conditional breakpoint exceeded the unchanged
  30-second watchdog. This is inconclusive debugger overhead, not an arithmetic
  counterexample or a completed pass. The parser now names it explicitly.

The first baseline attempt predated `--no-lldbinit`; subsequent independent
captures do not depend on user LLDB initialization. Startup option dumping was
added after these initial captures; the machine-readable evidence distinguishes
the later option-logged run.

```sh
node scripts/debug-jsc-number-repro.mjs \
  /absolute/path/to/webkit-2336 \
  /absolute/path/to/index-a-Ao9ALN.js no-jit probe 5
```

Other scenarios are `negative-control`, `conversion-control`, and
`probe-conversion`; tiers are `normal`, `baseline`, and `no-jit`. Counts are
bounded to 1–10. The script does not enable debugger authorization itself.
A native stop exits the wrapper nonzero to preserve the first counterexample;
that is distinct from a debugger launch error or watchdog timeout.

**Interpretation and limit:** the reduced fault is observable inside the
engine's native numeric comparison path, including interpreter callers. Rust,
Wasm, DOM/clipboard handling and optimizing JS compilers are not necessary for
this case. This does not yet identify a faulty instruction, prove a CPU or OS
defect, or connect every historical editor fault to this one. The next useful
capture is where the left value first differs from its correctly decoded input;
the always-hit early breakpoint is currently too disruptive. No production
workaround, validator relaxation or renewed Safari/editor qualification is
claimed. See [machine-readable evidence](qualification/2026-09-26-native-number-conversion.json).

## Native-only and engine-context follow-up

The next controls test possible explanations for the captured 0/2048 native
comparison without changing production code. They do **not** establish a fix.

`arm64_number_conversion.c` / `.S` run the relevant conversion instructions in
a standalone executable with no JavaScriptCore linkage. The original `fcsel`
sequence and a branch-based equivalent each pass **100,000,000 conversions**.
Five independently expected cases cover both operand directions, an unequal
2049/2048 pair, negative integers and negative zero. Periodic 4 ms sleeps allow
scheduling; they do not emulate browser timers. Disassembly verifies the
intended conversion instructions. This does not rule out engine context,
asynchronous interruption, code layout, or a rarer platform fault.

An interleaved five-round standalone-JSC matrix keeps JIT disabled and varies
one requested setting per control. The original unmodified JS bundle remains
hash-pinned. Every failed case reports mismatch mask 16, maximum 2048 and true
cold equality rechecks; initial and final options are recorded.

| Requested control | Pass / fail | Failure iterations |
| --- | --- | --- |
| JIT disabled, other defaults | 4 / 1 | 3961 |
| Additionally disable concurrent GC | 2 / 3 | 4061, 9541, 2311 |
| Additionally request polling traps | 3 / 2 | 9790, 6631 |
| Additionally disable Mach exception handling | 4 / 1 | 801 |

The runtime already sets `usePollingTraps=1` when JIT is disabled: that row is
an explicit-setting repeat, **not a distinct effective configuration**. Neither
disabling concurrent GC nor changing exception handling is sufficient to fix
this case. Do not infer failure-rate differences from five cases per row.
The new runner modes verify each requested context flag both before and after
execution. These flags affect only diagnostic child processes, not installed
browsers or editor configuration.

The new `probe-conversion-slow` debugger scenario allows 120 seconds for its
always-hit early breakpoint; normal qualification retains its 30-second
watchdog. One JIT-disabled case completes all 10,000 iterations without a
native stop. This makes the earlier inspection feasible but is not evidence
that the conversion is always correct: the breakpoint changes execution timing.
Floating-point control/status registers are now included in stopped captures.
A baseline-only early-breakpoint attempt subsequently exceeds even this
120-second diagnostic watchdog; its second requested case is not run. That
timeout is inconclusive and is not counted as an arithmetic failure.

An exploratory interleaved SameValue run produced 9/10 original passes and
10/10 candidate passes. The host's diagnostic-timeout code changed during that
run, so it is **not clean comparative qualification**. A host SHA-256 is now
recorded with each shell result, and multi-case invocations reject host drift.
The original module is never overwritten by a comparison transformation.

A clean five-pair rerun, with an identical recorded host hash in every case,
then gives **2 original passes / 3 failures** (iterations 3491, 2311 and 4621)
versus **5 SameValue passes / 0 failures**. A separate early-conversion debugger
child runs concurrently, but neither comparison variant is attached to it.
This is a promising reduced-case candidate, not an editor fix: other production
numeric predicates remain implicated by earlier failures and have not been
qualified by replacing this diagnostic comparison.

Current upstream source provides useful context: `objectConstructorIs`
[delegates to SameValue](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/ObjectConstructor.cpp),
whose numeric path [converts both inputs before comparing their bits](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/JSCJSValueInlines.h).
These moving upstream links are not an exact source revision for the pinned
framework; its local disassembly remains the instruction-level reference.

Build the native control on arm64 macOS with:

```sh
xcrun clang -O2 -Wall -Wextra -Werror \
  tests/browser/diagnostics/arm64_number_conversion.c \
  tests/browser/diagnostics/arm64_number_conversion.S \
  -o /absolute/temporary/path/conversion
/absolute/temporary/path/conversion fcsel 100000000
/absolute/temporary/path/conversion branch 100000000
```

See [the follow-up evidence](qualification/2026-09-26-native-context-controls.json)
for hashes and subsequent debugger/comparison outcomes. No engine library,
production comparison, validation rule or executable signature was patched.

## What we learned

An isolated check reported a mismatch between a Wasm-returned bound and the
expected `2048`. On the rejection path, both captured numbers serialized as
`2048`, both had IEEE-754 words `0x40a00000 / 0x00000000`, and both `Object.is`
and strict equality rechecks returned true. The mismatch mask was `16`, naming
only field four (the maximum string bound). The failure occurred **before**
the property validator was called for that tuple.

The same pattern reproduced using a **48-byte hand-written Wasm module**:

```wat
(module
  (func (export "bound") (param i32 i32 i32) (result f64)
    f64.const 2048))
```

This module has no imports, memory, Rust, wasm-bindgen, editor, document,
selection, or clipboard. The three ignored parameters resemble the descriptor
method's call shape. The failing tiny-mode trace loaded only the fixture HTML
and its JavaScript bundle; it did not load Breditor's generated glue or Wasm
binary. The cold numeric report describes the original captured pair, not a
second Wasm call.

**Initial inference (subsequently broadened by the JS-only failure below):**
the Rust document model is not required to reproduce this comparison fault.
The evidence initially pointed toward JavaScriptCore's execution or
numeric-representation handling on a Wasm-to-JavaScript path. It did not prove
which compiler, calling convention, boxing operation, array access, or equality
operation is responsible. Cold rechecks are not machine-level snapshots of the
original comparison. Nor does this prove that every earlier clipboard,
selection and startup failure shares this cause.

## Reproduce and inspect

```sh
npm run test:property:diagnostics
```

This builds `target/property-isolation` and runs twenty independent repetitions
of three cases in optimized WebKit: JavaScript literals, the tiny module, and
real Rust-backed descriptors. Each case checks 10,000 iterations / 20,000
property tuples. Timeouts and zero retries remain standard; the first failure
stops the run. Expected declarations are independent fixed fixture values.
The finalized JS and tiny controls allocate fresh actual tuples independently
of expected tuples. Only the source of the numeric maximum differs.

`property-rejections.json` is attached to a failed Playwright trace. It records
bounded numeric values, tags, IEEE-754 words and explicitly named **rechecks**;
no document, schema-name, checkpoint, clipboard or arbitrary string contents.
The separate source mapping retains emitted-JavaScript hashes and rejection
locations. Build/test output directories are replaced by subsequent runs;
preserve the trace and exact bundle before repeating.

The module's binary is in
`tests/browser/diagnostics/constant_bound_wasm.ts`. The isolated input check is
in `property_boundary_probe.ts`; cold bit/equality reporting is in
`numeric_comparison_diagnostic.ts`. The actual private property validator is
exposed only by the dedicated diagnostic Vite build, not the package API.
The mismatch above occurs before that private function is invoked.

## Captured sequence

All runs used the repository's Playwright 1.62.1 on macOS. Native installed
Safari was not used for these new minimal controls.

1. Full startup diagnostic: six complete cases passed, then case seven failed
   restore 6,677. The descriptor reader rejected an action-state source or
   state contract at emitted `readActionStates:317`, propagating through
   `readDescriptor:131`. This is distinct from the previous property-value-type
   branch and remains only branch-localized.
2. Expanded selection diagnostic: eleven cases passed, then case twelve failed
   restore 98/read 2. `pathAtPreorderIndex:224` fell through with requested index
   2, running index 3 and expected kind text; the caller retained index 2 /
   offset 14. This agrees with the earlier native tree-lookup capture, but does
   not establish the original machine-level comparison operands.
3. Real-descriptor isolation first failed at iteration 451 with mismatch mask
   16 while reporting maximum 2048. The refined run failed at iteration 981 and
   additionally captured expected 2048, identical IEEE-754 words, and true
   equality rechecks. The validator had not run for the rejected input tuple.
4. Tiny-module isolation failed at iteration 1,871 with the same mismatch mask
   and identical-bit report. An independent normal-optimization run passed two
   full tiny cases, then failed at iteration 131 of case three. Rust and its
   generated glue were not loaded in either tiny case.

Before the final fresh-array control refinement, the same static bundle had
these cross-engine/tier results:

| Control | Result | Meaning / limit |
| --- | --- | --- |
| Chromium + Firefox, JS and tiny Wasm | 20/20 passed | Five cases per mode per engine; bounded comparison evidence |
| WebKit, all JIT disabled | 10/10 passed | Five cases per mode; `useJIT=false` appears in JSC option output |
| WebKit, only DFG/FTL disabled | Three passed, then tiny failure at iteration 3,521 | Disabling advanced JS optimizers is insufficient; do not blame only DFG/FTL |
| WebKit, only Wasm JIT disabled | Two separate navigation timeouts | The control did not execute; inconclusive |

The initial Chromium/no-JIT control attempts completed their tiny loops but
failed a test-only network-count assertion: an inline module correctly fetches
zero `.wasm` URLs. That assertion was corrected; only the subsequent completed
runs are counted above. A temporary independent-run config also initially used
the wrong preview working directory; it failed before executing tests and is
not evidence about the runtime.

The earlier JS control reused the expected tuple; final controls below use
distinct arrays to eliminate that asymmetry. Tiny and real-Wasm inputs were
always independently captured. Historical results retain their exact scope.

### Final independent-array controls

The finalized bundle uses fresh actual arrays for both JavaScript and tiny-Wasm
inputs. Its SHA-256 is
`13ccf24403e427e862da2ffe49213f3884d580114098277666b1b2c46eca9337`.

- Normal WebKit: JavaScript case passed, then the first tiny case failed at
  iteration 3,351 / property zero / field four. Eight planned cases did not run.
  The attachment again contains actual/expected 2048, identical IEEE-754 words,
  and both equality rechecks true. Log:
  `/tmp/breditor-property-fresh-arrays-webkit-20260926.log`.
- Chromium and Firefox: all eight cases passed (two per mode per engine).
  Log: `/tmp/breditor-property-fresh-arrays-other-engines-20260926.log`.
- All-JIT-off WebKit: all ten cases passed (five per mode). JSC option output
  confirms `useJIT=false`. Log:
  `/tmp/breditor-property-fresh-arrays-no-jit-20260926.log`.

The final failing trace is
`/tmp/breditor-tiny-wasm-fresh-arrays-failure-20260926.zip`, SHA-256
`ac4253f8f2a9a263315eaa6eac7d93da471ea17dfcbe2e6b8b298a9439dae687`.
Its exact build is preserved at
`/tmp/breditor-tiny-wasm-fresh-arrays-build-20260926`. The bounded report is
retained in [the evidence record](qualification/2026-09-26-wasm-number-reproduction.json).

Successful cases each check 20,000 tuples; these are bounded tests, not proof
of universal correctness in the other engines or modes. The no-JIT pass
strengthens the execution-path hypothesis but is not a deployable fix.

## Engine controls are diagnostic only

Use `playwright.property-no-jit.config.ts` for all-JIT-off and
`playwright.property-baseline-jit.config.ts` for DFG/FTL-off controls. Both use the
same built assets as normal mode. Set `DEBUG=pw:browser` to retain JSC option
dumps. The browser launcher emits option reports from multiple processes;
reports include the requested flags, not per-instruction compiler attribution.
The separate `playwright.property-wasm-interpreter.config.ts` currently cannot
complete navigation in this environment and must not be reported as passing.

These flags are documented by WebKit's
[environment-variable guide](https://trac.webkit.org/wiki/EnvironmentVariables)
and [JavaScriptCore option definitions](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/OptionsList.h).
They are **not fixes**: changing engine flags alters execution, and users cannot
be expected to disable JIT. Ordinary release tests keep normal settings.

## Preserved artifacts

The tiny failure build is preserved at `/tmp/breditor-tiny-wasm-build-20260926`.
Its JS SHA-256 is
`717b975f003aa036cd55529a53df596ffadb3220e60ab38c1bab425c0cb51457`.

- First tiny trace: `/tmp/breditor-tiny-wasm-equal-bits-failure-20260926.zip`,
  SHA-256 `997fb46d0adde9015b89e4f8c91b196db273d159142f259182f9dd1baf6928ae`.
- Independent tiny trace: `/tmp/breditor-tiny-wasm-independent-failure-20260926.zip`,
  SHA-256 `0e6ca4ae71bac96b08d225aa59f8431459fec74ea54348cb359d41959f8c2a18`.
- DFG/FTL-off trace: `/tmp/breditor-tiny-wasm-baseline-jit-failure-20260926.zip`,
  SHA-256 `d3e13cf2c7e40e9e14180e24a948caa12c61444a2f1aa49ec22d9fd5dedd7b61`.
- Real-descriptor identical-bit trace: `/tmp/breditor-property-equal-bits-failure-20260926.zip`,
  SHA-256 `b8c77a43f446b9dd44096bb62dc9f320513a014fbc7e86151e0c2f3844f5f318`.
- Selection fallthrough trace: `/tmp/breditor-selection-path-failure-20260926.zip`,
  SHA-256 `bc2fdc3a29917b2a65fc126b48edb3fc097388c1b82aa60aa9728dd9e0780c0b`.
- Action-state branch trace: `/tmp/breditor-action-contract-branch-20260925.zip`,
  SHA-256 `7c0a1532700f1c3503a163121784e3f6295b491d5bca96d49b2e2ba2aad7135c`.

No production contract, validation policy, runtime source or Wasm binary was
changed by this follow-up. No issue was filed externally and nothing was
published. Subsequent comparison-only and numeric-transport controls are
recorded below; they do not accept invalid values or retry getters until
validation passes.

Verification of the diagnostic additions: 1,299 workspace/diagnostic unit tests
pass (including 21 diagnostic tests), browser tooling typechecking passes, and
ordinary browser discovery remains 153 cases. The full release verifier was
not rerun. The ordinary production fixture remains byte-identical, JS SHA-256
`7f619b5583e111dd6b42c3d7a6f84acc7ac443810cb733362b7f84a36d1b88fc`.
These tooling checks do not waive the reproduced runtime failure.

## Further reduction and transport controls (September 26)

A new comparison-only fixture removes the property validator and Breditor
packages entirely. It checks JS literals, the tiny f64 module, a 42-byte i32
module, f64 followed by unsigned conversion, and f64 followed by
`Number(String(value))`. All 25 WebKit cases and all 20 Chromium/Firefox cases
passed. **The raw f64 negative control also passes, so this reduction masks the
failure and cannot establish that any conversion fixes it.** Its changed call
sites and bundle shape remain possible influences, not established causes.
Run it with `npm run test:number:diagnostics`.

The unchanged known-failing property fixture still failed in the second of
five planned cases, at iteration 3,531 (one passed, three did not run). We then
applied isolated build-time substitutions to that fixture without editing its
source. Five independent cases per variant gave:

| Tiny-module transport | Passed | Failed |
| --- | ---: | ---: |
| Unchanged f64 | 4 | 1 |
| i32 result | 5 | 0 |
| f64 followed by unsigned conversion | 5 | 0 |
| f64 followed by text-to-number conversion | 5 | 0 |

Each passing case checks 10,000 iterations / 20,000 property tuples, with
normal JIT, standard timeouts and zero retries. Variant runs were launched
concurrently, each with one worker and its own server. The failing f64 build
is byte-identical to the earlier final fixture (SHA-256 `13ccf24403e427e862da2ffe49213f3884d580114098277666b1b2c46eca9337`).
Its fourth case rejected iteration 541 / property zero / mismatch mask 16;
cold reports again show 2048, identical bits and both equality rechecks true.
These bounded results support testing a conversion candidate, not shipping it.

Repeat a single variant after the usual package build:

```sh
BREDITOR_NUMBER_VARIANT=text npx vite build --config vite.property-transport.config.ts
BREDITOR_NUMBER_VARIANT=text npx playwright test -c playwright.property-transport.config.ts --project=webkit --grep tiny-wasm
```

The initial variants are `f64`, `i32`, `u32`, and `text`; additional source
controls are listed below. Fail-closed transforms
require the expected module/call-site count and write a build manifest. The
unsigned conversion is deliberately **not** a general runtime proposal: it
would alter fractional, negative and large numeric values, including malformed
metadata that must remain rejected.

### Full-consumer candidate

`npm run test:number:candidate` builds an opt-in full-editor restore fixture.
It normalizes captured numeric values through text only at descriptor scalar
returns and the selection snapshot capture. Zero is returned unchanged to
preserve negative zero; non-numbers are not coerced. Existing checks, getter
receiver, once-only reads, cleanup and the exact selection oracle remain.
Unit tests cover fractions, subnormals, safe-integer boundaries, infinities,
NaN, signed zero and foreign objects with coercion hooks. There is no getter
retry, relaxed validation, Rust ABI change or production-source edit.

The candidate retains normal engine settings and checks 10,000 restores /
30,000 selection reads per case, stopping on the first failure. The initial
twenty-case attempt completed sixteen cases without a runtime rejection, but
then hit the unchanged 480-second suite deadline and reported teardown timeout
as well. Four cases were not completed. **That run failed at the suite level;
it is not a twenty-case pass.** No failing runtime trace was produced. The
maintained config now defaults to five-case batches under the same timeouts;
no timeout, retry or correctness criterion was relaxed.

A separate four-case WebKit batch passed in 44.6 seconds using the exact same
assets. Across both attempts, twenty **completed** cases cover 200,000 restores
and 600,000 selection reads without a reported runtime rejection. This is not
one uninterrupted twenty-case suite pass; the original suite timeout remains
part of the evidence. Log:
`/tmp/breditor-numeric-normalization-candidate-batch2-20260926.log`.

The same candidate subsequently passed four Chromium/Firefox cases (two per
engine) in 50.5 seconds, checking another 40,000 restores / 120,000 reads.
Log: `/tmp/breditor-numeric-normalization-other-engines-20260926.log`.
These bounded controls do not qualify native Safari or trusted clipboard
behavior. Before proposing a runtime change, repeat bounded candidate/control
batches, test native Safari and measure conversion cost. Earlier mitigations
also passed long runs before later failures; do not promote this result alone.

This is an experiment, not a production fix or native Safari/clipboard
qualification. The exact candidate build is preserved at
`/tmp/breditor-numeric-normalization-build-20260926`; its JS SHA-256 is
`81c75327df04135e535b22f379037f8f288ab501558aca3aa13fda6d3a1b71ac`.
The Wasm binary remains unchanged.

## Full-consumer qualification follow-up

This follow-up tests the **decimal round-trip boundary candidate**, not the
explicit SameValue comparison used only by the reduced JS experiment. The
production source remains unchanged. Both full-editor builds use identical
Wasm bytes; the normalized bundle is byte-identical to the earlier preserved
candidate (`81c75327df04135e535b22f379037f8f288ab501558aca3aa13fda6d3a1b71ac`).

`playwright.boundary-qualification.config.ts` provides separate original and
normalized ports/output paths while retaining normal engine options, the same
30-second case deadline, eight-minute suite deadline, zero retries and the exact
selection oracle. Each completed case performs 10,000 real editor restores and
30,000 selection reads. Both startup/descriptor admission and absent, forward,
collapsed and backward selections are exercised; DOM and clipboard are not.

Two five-case WebKit pairs pass on both builds: **10 original and 10 candidate
cases**, with no timeout, failure or retry. Consequently those pairs are not a
fresh failing-control demonstration. A further unchanged-build batch and native
control are recorded with their exact outcomes in
[the qualification record](qualification/2026-09-26-full-boundary-qualification.json).
The third unchanged-build batch then passes seven cases and fails case eight
at restore **8351** with `engine_bootstrap.invalid_profile_descriptor`; two
remaining cases are not run. This is a runtime rejection, not a timeout. The
runner's additional max-failures notice is expected early-stop bookkeeping,
not another engine defect. The failing trace and artifact hashes are retained
in the qualification record. This is a fresh full-editor counterexample.
The identical candidate is then rerun immediately and passes another five
cases. This checkpoint totals **15 automated candidate passes** plus the ten
native candidate passes below: **250,000 restores / 750,000 selection reads**,
without a runtime failure or timeout. No partial failed-control work is included.

The opt-in `vitest.boundary-candidate.config.ts` applies the same fail-closed
four-site transform to the runtime modules under the existing test suite.
All **1,188 browser-runtime tests pass with the candidate active**, including
malformed metadata, ownership, getter receiver/once-only reads and cleanup
checks. The config fails if both boundary modules were not transformed.
An additional deterministic 10,000-pattern IEEE-754 test checks preservation
of numeric semantics. Normal `npm test` still tests unchanged production code.

Native **Safari 26.6.2** passes two independent five-page candidate runs through
visible controls: **100,000 restores / 300,000 selection reads**. The first uses
the initial native runner; the second uses the hardened runner that rejects
over-limit active session state and exposes its own SHA-256. The same candidate
JS and Wasm are served unchanged in both. Outcome and hashes were verified in
Safari's visible report; screenshots were used where AX text was truncated.
These are native startup/selection tests, **not trusted clipboard or caret tests**.
The unchanged build also passes a five-page Safari control. Thus the native
passes do not establish a native failure-to-success comparison in this window;
the fresh control failure was captured in Playwright WebKit.

The new native server binds only `127.0.0.1:4203`, serves an exact resource
whitelist, has no write endpoint and never modifies the probe assets. Its
five-page runner stops on a failed count, rejection, interruption or the
unchanged 30-second deadline; tests cover those accounting paths. It does not
automatically retry a failed batch.

```sh
# Build both fixtures after the package build.
npx vite build --config vite.selection-stress.config.ts
npx vite build --config vite.numeric-normalization.config.ts
BREDITOR_BOUNDARY_VARIANT=original npx playwright test \
  -c playwright.boundary-qualification.config.ts --project=webkit
BREDITOR_BOUNDARY_VARIANT=normalized npx playwright test \
  -c playwright.boundary-qualification.config.ts --project=webkit
npx vitest run --config vitest.boundary-candidate.config.ts
node scripts/serve-boundary-repro.mjs normalized
```

**Decision:** keep the candidate opt-in. This expands contract and native
coverage and now includes a fresh failing full-editor control, but does not
prove a general WebKit repair. Remaining gaps include longer native stress, isolated
conversion-cost measurement, and the independent clipboard/DOM-restoration
failures. Do not relax validation, retry rejected getters, or change the Rust
ABI on the strength of these passes.

## Interactive and native clipboard qualification

The same four-site boundary transform is now applied to the real interactive
harness and the independent manual clipboard page, through
`vite.clipboard-boundary.config.ts`. The candidate has its own artifact directory;
the original build remains available separately. Both retain identical Wasm
bytes. These multi-entry bundles differ from the isolated restore fixture;
all JS hashes and the transformed source hashes are recorded independently in
[the interactive record](qualification/2026-09-26-clipboard-boundary-qualification.json).

`playwright.clipboard-boundary.config.ts` uses the existing 21 clipboard/Link/
history/manual-fixture cases without changing their assertions. The oracle
includes Unicode/backward ranges, rejected-paste redo preservation, optional
and stale input echoes, real DOM caret movement, a 60-cycle formatted clipboard
lifecycle and a 300-cycle Link/history lifecycle. Normal engine options, one
worker, zero retries, 30-second cases and the eight-minute suite limit remain.

- Original WebKit interactive control: **21 passed**.
- Candidate WebKit: **21 passed**, then a three-repeat run of **63 passed**.
- Candidate Chromium and Firefox: **21 passed each**.
- No failures, skipped cases, retries, flaky cases or global errors in these runs.

Those automated clipboard events are controlled, not OS clipboard evidence.
The independent native page was also exercised in **Safari 26.6.2** using native
keyboard shortcuts and toolbar controls. Scratch-field inspection verified
Copy and Cut; editor Paste inserted once. Caret movement and typing stayed live.
Undo/redo reversed typing and cut separately. Link URL changes and their undo/
redo kept the form and rendered link target synchronized, with Highlight intact.
The [native report](qualification/2026-09-26-safari-normalized-clipboard.json)
is operator-confirmed: a live owner, all six checks, two trusted Copy events,
one Cut and one Paste, and no pending/dropped events or recorded fault.
The first accessibility-selected Copy lacked visible scratch confirmation;
the subsequent keyboard-selected Copy supplied that proof. Both events are
preserved. Only seeded fixture text was copied; prior clipboard contents were
not read, and the system clipboard was left containing the fixture prefix.

```sh
# After building the packages, preserve both interactive variants.
BREDITOR_BOUNDARY_VARIANT=original npx vite build -c vite.clipboard-boundary.config.ts
BREDITOR_BOUNDARY_VARIANT=normalized npx vite build -c vite.clipboard-boundary.config.ts
BREDITOR_BOUNDARY_VARIANT=original npx playwright test \
  -c playwright.clipboard-boundary.config.ts --project=webkit
BREDITOR_BOUNDARY_VARIANT=normalized npx playwright test \
  -c playwright.clipboard-boundary.config.ts --project=webkit --repeat-each=3
BREDITOR_BOUNDARY_VARIANT=normalized npx playwright test \
  -c playwright.clipboard-boundary.config.ts --project=chromium --project=firefox
BREDITOR_BOUNDARY_VARIANT=normalized npx vite preview \
  -c vite.clipboard-boundary.config.ts --host 127.0.0.1 --port 4206 --strictPort
# Native page: http://127.0.0.1:4206/manual-clipboard.html
```

**Decision:** retain the candidate as opt-in pending isolated conversion-cost
measurement, longer native stress, and the full release verifier. This closes
the absence of interactive/native-clipboard coverage, not the intermittent-fault
investigation. The original interactive control passed too; the fresh failing
control remains the separately preserved restore case. One native checklist
is not a platform certification, physical-device result, or IME qualification.
All **1,351 ordinary JavaScript tests** and browser tooling typechecking pass.
No Rust ABI, validation, runtime source, retry policy or release status changed
in this checkpoint.

## Conversion cost and extended native stress

The diagnostic helper is now measured in a separate minified fixture, not by
comparing total Playwright durations. Each page measures two Float64Array
workloads through an identity function and the exact normalization helper:
common nonnegative integers, and mixed finite numbers including fractions and
negative values. Both arms retain independently checked checksums. There are
one million values per arm, two warmups per arm, and nine paired samples with
alternating arm order. Three independent pages run in each engine, serially.
No timing threshold determines correctness or release status.

The clean run passes all nine pages with no concurrent build or native stress
job. Across page-level paired medians, additional cost per value is:

- Chromium: **5.5–5.8 ns** for common integers; **32.2–33.4 ns** for mixed numbers.
- Firefox: **8–19 ns** for common integers; **75–90 ns** for mixed numbers.
- WebKit: **18–19 ns** for common integers; **38–40 ns** for mixed numbers.

These are local microbenchmark observations, not editor or typing latency,
cross-device guarantees, or confidence intervals. Timer resolution, source
shape, engine optimizations and host activity affect the result. In particular,
Firefox's integer runs vary substantially. The first benchmark run overlapped
tooling work and is excluded from performance conclusions. All raw pairs from
the clean run, independent checksums and exact artifact identities are retained
in [the cost/native evidence](qualification/2026-09-26-boundary-cost-native.json).
The cost is small enough to continue qualification; no Rust redesign or numeric
contract relaxation is justified by these timings.

Installed Safari 26.6.2 additionally completes **three five-batch runs** of the
unchanged full-consumer candidate. Each batch is a fresh page with 10,000 restores
and 30,000 selection reads under the unchanged 30-second watchdog. All fifteen
pass: another **150,000 restores / 450,000 reads**. Final counts and hashes were
verified through native UI screenshots where accessibility text truncated the
report. This is bounded fresh-page stress, not an hours-long warm-owner soak,
physical iOS qualification, or another native clipboard run. The server now
accepts a validated optional port, allowing this run on loopback 4208 without
replacing the earlier original-control server. Probe and runner bytes did not
change.

```sh
npx vite build -c vite.boundary-cost.config.ts
npx playwright test -c playwright.boundary-cost.config.ts --repeat-each=3
node scripts/serve-boundary-repro.mjs normalized 4208
```

### Full-matrix packaging

The broader candidate gate uses `vite.boundary-matrix.config.ts` and
`playwright.boundary-matrix.config.ts`. It keeps every ordinary browser test,
including the tests' original individual deadlines. Six existing probes are
dynamically imported by `.ts` URL in development; the full production fixture
compiles them as separate minified entries and redirects only their exact URLs
to the compiled modules. Build-time export checks prevent silent tree-shaking
of the probe functions. The fixtures remain separate from the earlier qualified
clipboard and restore builds, so those artifacts are not overwritten.

Two setup attempts stopped before the first probe could run: the clipboard-only
build lacked the probe modules, then the first multi-entry build removed their
unreferenced exports under Vite's application defaults. Both failures are retained
in the evidence, not counted as engine failures or successful tests. Explicit
`preserveEntrySignatures: "strict"` and a six-export build guard correct the latter.
No production source or test assertion was edited for these packaging fixes.

The corrected build passes **all 153 existing cases: 51 each in Chromium,
Firefox and WebKit**, with no skipped/flaky cases or retries. This includes
action-state restores, Unicode, controlled composition, persistence, ShadowRoot,
toolbar accessibility, axe, clipboard, Link/history, raw getters, descriptor
lifecycles and validated selection restoration. Exact test outcomes and every
artifact hash are retained in [the full-matrix record](qualification/2026-09-26-boundary-full-matrix.json).

**Decision:** these results support proceeding to a scoped production integration
of the four-site mitigation. Keep validation and once-only getter semantics
unchanged, preserve the original control artifacts, then qualify the exact
rebuilt runtime and run the complete release verifier before adoption. This
checkpoint itself changes no production source and does not claim to repair
JavaScriptCore. All **1,354 ordinary JavaScript tests**, including 76 diagnostic
tests, and browser-tooling typechecking pass. The full 17-stage release verifier
was not run in this checkpoint.

```sh
BREDITOR_BOUNDARY_VARIANT=normalized npx vite build -c vite.boundary-matrix.config.ts
BREDITOR_BOUNDARY_VARIANT=normalized npx playwright test \
  -c playwright.boundary-matrix.config.ts --max-failures=1
```

## Integrated runtime qualification

`packages/breditor-browser/src/normalize_wasm_boundary_number.ts` now contains
the exact-value mitigation previously tested as an opt-in transform. Its only
call sites are the three captured descriptor-result returns (`readScalar`,
`invoke`, `invoke2`) and the single selection snapshot capture. Existing thenable,
ownership, shape, range, canonicality and cleanup checks remain in place. Every
getter/method is still read once with its original receiver. There is no retry,
clamping, integer truncation, object coercion, Rust ABI change or public API
addition. The helper is not re-exported from either package entrypoint.

The mitigation is uniform across engines rather than UA/version-gated: there
is no reliable engine-build cutoff for the observed fault, and the preceding
cross-engine contract/cost checks support preserving one deterministic boundary
path. It applies only to these captured boundary values, not document text or
arbitrary editor arithmetic. Removal requires fresh original-path qualification,
not merely a newer Safari version string.

The runtime helper has its own tests for signed zero, non-finite and out-of-range
values, non-coercion of foreign objects, and 10,000 deterministic IEEE-754 bit
patterns. Existing malformed-input, receiver, once-only read, ownership and
cleanup tests now exercise the mitigation through ordinary `npm test`.

The exact pre-integration package and fixture outputs were copied to
`target/boundary-preintegration-v93i3r` before rebuilding. The original and
experimental fixture directories are also retained at their old paths with
their old hashes. These are local ignored build artifacts, not a published or
Git-backed binary archive; cleaning `target` removes them. The evidence records
retain hashes and results, not the binary contents. A legacy-build guard now
rejects attempts to rebuild them
from integrated sources **during config resolution, before output cleanup**.
Actual rejected-build checks verified all three preserved control entry hashes
remained unchanged. Previewing the old artifacts remains possible. The retired
candidate transform also rejects integrated modules instead of wrapping twice.

Current untransformed builds use explicit `runtime` naming and separate output
directories. `vite.selection-stress.config.ts` now emits to
`target/selection-runtime-production`; `vite.boundary-original.config.ts` previews
the frozen original. The interactive/full-matrix configs accept
`BREDITOR_BOUNDARY_VARIANT=runtime` without installing either diagnostic plugin.
Historical commands using the original/normalized variants are evidence-replay
commands; their rebuilds are intentionally blocked after integration.

```sh
npm run build
npx vite build -c vite.selection-stress.config.ts
BREDITOR_BOUNDARY_VARIANT=runtime npx vite build -c vite.boundary-matrix.config.ts
BREDITOR_BOUNDARY_VARIANT=runtime npx playwright test \
  -c playwright.boundary-qualification.config.ts --project=webkit
BREDITOR_BOUNDARY_VARIANT=runtime npx playwright test \
  -c playwright.boundary-matrix.config.ts --max-failures=1
node scripts/serve-boundary-repro.mjs runtime 4214
npm run verify:release
```

Initial integrated restore JS SHA-256:
`465e19e9586ca245e99497295b2f345111d39786aded311e89ab8c7e6bf5233b`.
The Wasm hash remains
`8bdb6afec021dff91384f739908357936369c9c9f9d100119043bf666a505a41`.
This JS differs from the pre-integration experiment, so earlier candidate passes
are not relabeled as passes of the integrated runtime. Verification of these
new bytes is recorded separately; source integration is not a blanket platform
certification or grounds to discard historical failures.

**Integrated-runtime results:** five automated WebKit restore cases and five
native Safari cases pass, totaling **100,000 restores / 300,000 selection reads**
on the rebuilt runtime. Its minified full matrix passes **153/153** cases.
Safari 26.6.2 also passes a fresh native clipboard/caret/history/Link checklist:
live owner, all six checks, one trusted Copy/Cut/Paste each, and no fault or
pending/dropped event. These are separate from earlier experimental results.

The complete non-publishing release verifier passes **all 17 gates**, including
Rust format/lint/tests/docs, Wasm target tests, **1,359 JavaScript tests**, type
checks, isolated packed consumers, 227 unchanged ABI signatures, production
build/size budgets, the ordinary **153-case browser matrix**, and **39 demo
tests**. The rebuilt package adapters remain byte-identical to those used for
the qualified minified fixtures. No validation or size budget was relaxed.
The demo has only **198 bytes** of compressed-JavaScript budget headroom;
future feature work must account for that limit.

**Decision:** retain the four-site mitigation in the runtime based on these
bounded checks. Keep the JavaScriptCore investigation open and retain the
original failure evidence. This is not a promise of an engine repair,
physical-iOS/IME certification, or absence of all intermittent faults.
No version, publication, push, or commit was created in this checkpoint.
Exact hashes, counts and remaining limits are in
[the integration evidence](qualification/2026-09-26-boundary-runtime-integration.json).

### Additional preserved evidence

- Unchanged positive-control trace:
  `/tmp/breditor-property-positive-control-failure-20260926.zip`, SHA-256
  `af1b32ac3f086b27105f33e7359cc3e786fb59ca907caa0d0fbeca4f0fc7f60a`.
- Matrix f64 trace:
  `/tmp/breditor-property-transport-f64-failure-20260926.zip`, SHA-256
  `436217c721219e9647c8644f6ef2f582bcde375111eed4f53793707ca8e94c46`.
- Variant logs: `/tmp/breditor-property-transport-{f64,i32,u32,text}-20260926.log`.
- Comparison-only logs: `/tmp/breditor-number-transport-matrix-20260926.log`
  and `/tmp/breditor-number-transport-other-engines-20260926.log`.

All 1,315 workspace/diagnostic unit tests pass (37 diagnostic tests), and browser
tooling typechecking passes. The ordinary production JS remains byte-identical
to the earlier SHA-256 `7f619b5583e111dd6b42c3d7a6f84acc7ac443810cb733362b7f84a36d1b88fc`.
The full release verifier and native browser checks were not rerun for these
diagnostic additions.

## Independent source audit and JavaScript-only failure

The concern that our hand-encoded module might itself be incorrect was tested
using [WABT](https://github.com/WebAssembly/wabt), the WebAssembly binary toolkit.
Version 1.0.39 was installed only in `/tmp/breditor-wabt-audit.fpLnb3`, with
installation scripts disabled; no project dependency or lockfile changed.
`audit_number_modules.mjs` independently assembles `constant_bound.wat`, validates
and disassembles the binary, and compares it byte-for-byte with our literal.
**All 48 bytes match.** A second independently assembled 65-byte module reads
the value from private linear memory instead of using `f64.const`.

Both modules validate, have no imports, export only `bound`, and pass 100,000
calls each in Node. WABT's separate interpreter also executes each module and
returns `f64:2048`. This is evidence against an encoding error, not evidence
that every browser executes the modules correctly. Audit command:

```sh
node tests/browser/diagnostics/audit_number_modules.mjs /absolute/path/to/wabt/index.js
```

The existing source-variant build now also supports `js-call`, `js-dataview`
and `wasm-memory`. They replace only the factory; the comparison harness and
expected tuples remain unchanged. `js-call` returns a JS literal from an
ordinary function. `js-dataview` reads a primitive number from a private
eight-byte `ArrayBuffer`, without instantiating Wasm. First five cases of each
variant, including the f64 control, passed. A subsequent ten-case batch gave:

| Source | Passed | Failed | First rejected iteration |
| --- | ---: | ---: | ---: |
| Original f64 constant | 9 | 1 | 1,171 |
| Alternative Wasm memory load | 9 | 1 | 2,601 |
| JavaScript DataView | 9 | 1 | 2,366 |

Runs used normal WebKit settings, one worker per variant, zero retries and
unchanged budgets; variants ran concurrently on separate servers. The DataView
failure again reports field four / mask 16, actual and expected 2048, identical
IEEE-754 words and both cold equality rechecks true. Its loaded entry bundle
contains **zero `WebAssembly` references**; the trace requests only the HTML
and that entry bundle, not the dynamic Rust/glue assets. The fixture still has
unexecuted alternative mode code, but the failing path is JavaScript-only.
Therefore neither Rust, wasm-bindgen nor WebAssembly execution is required for
this isolated inconsistent comparison path.

Further controls on the exact DataView bundle:

- Chromium/Firefox: 10/10 pass, five per engine.
- WebKit with all JIT disabled: 5/5 pass; launcher logs confirm `useJIT=false`.
- `js-dataview-bare`, which removes the property validator call but retains
  the independent input oracle: 8/10 pass, two fail at iterations 441 and 341.
  The first failure has the same equal-bit/cold-recheck report.
- `js-dataview-strict`, replacing only the hot `Object.is` check with `===`:
  10/10 pass. These fixture inputs contain neither NaN nor signed zero, so
  this is a valid experimental control, **not** a general replacement for
  `Object.is`, a runtime fix, or proof that Object.is itself is the faulty
  operation. Changed code shape and timing can hide this intermittent issue.

The evidence now points more broadly toward WebKit/JavaScriptCore execution
of this JavaScript numeric comparison path. It does not isolate the array
load, number representation, comparison, mask accumulation or compiler tier.
The hot check reports a mismatch; the cold report is not a machine-level
snapshot of that check. All current reduced failures occur before the property
validator, which is now demonstrably unnecessary. Whether the original
startup/selection/clipboard failures share this cause still needs proving.

For context, JavaScriptCore has different internal integer/double encodings;
its [current sameValue implementation](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/JSCJSValueInlines.h)
converts numeric operands before comparing their bits. This source reading
explains why representation is a useful hypothesis; it does **not** identify
the code running at the failure or establish a matching upstream bug.

Repeat the DataView case using the existing variant commands with
`BREDITOR_NUMBER_VARIANT=js-dataview`. The test title retains `tiny-wasm` because
that is the original fixture mode; the build manifest identifies the actual
substituted source. The all-JIT-off control is
`playwright.property-transport-no-jit.config.ts`, never a release gate.

Preserved evidence:

- `/tmp/breditor-js-dataview-equal-bits-20260926.zip`, SHA-256
  `c84425e8b23601ce67879f530e459c8ccb3b0167941a33c71a53a34f2a56512a`.
- Exact DataView build: `/tmp/breditor-js-dataview-build-20260926`; entry JS
  SHA-256 `1c81711b57206f7b049a7b2c90281b94684dacfdeec3e2f98cab626e58b1b6f6`.
- `/tmp/breditor-js-no-validator-equal-bits-20260926.zip`, SHA-256
  `569075407472487207cfa5f3ec08eacc80ede9a90196d7280aa43afdaad7d1bc`.
- `/tmp/breditor-wasm-memory-equal-bits-20260926.zip`, SHA-256
  `5d2401443febfe0a0e4e53cda68a346d2461e3ef4d88ac0ae74cdbac37612b60`.
- `/tmp/breditor-f64-source-control-20260926.zip`, SHA-256
  `c34f2ec753b88cc5dadc820f12f5cff5c3e1eee7782726831606abd233ebe7fd`.
- Assembler audit: `/tmp/breditor-independent-module-audit-20260926.json`.
- Interpreter logs: `/tmp/breditor-{constant,memory}-interpreter-20260926.log`.

Production runtime and validation remain unchanged. Nothing was filed upstream
or published. These new controls were not run in installed native Safari.

The validator-free DataView variant reproduced independently again: four of
five cases passed and one rejected iteration 356. Its trace is
`/tmp/breditor-js-no-validator-independent-20260926.zip`, SHA-256
`b9b5b5982953d1d7a123b2f5d4f95d95a541f8231c805833df04e8cb55c1a972`;
the exact build is `/tmp/breditor-js-no-validator-build-20260926`.

A further `js-only` reduction removes the entire unexecuted Wasm import branch
as well. The build has a single 3,785-byte JS chunk, zero module dependencies
and no Wasm assets; a fail-closed build guard enforces that isolation. Its
first ten cases and an independent twenty-case run all passed. That narrower
reduction is not yet a confirmed reproducer and must not replace the preserved
failing artifact. Removing
unexecuted code can change compilation, inlining, layout and timing without
fixing a runtime problem.

All 1,320 workspace/diagnostic unit tests pass, including 42 diagnostic tests;
browser tooling typechecking passes. Full release and native browser gates
were not rerun. The [evidence record](qualification/2026-09-26-javascript-number-reproduction.json)
keeps passing, failing and non-reproducing controls separate.

## Native Safari comparison and preserved cold branch

The previously passing `js-only` reduction removed an unexecuted alternative
branch. Restoring that branch's shape, but replacing its Wasm import with a
JavaScript-only placeholder, makes the failure reappear:

- `js-cold-branch`: 8/10 pass, two failures at iterations 461 and 3,571.
- `js-cold-minimal`: additionally replaces unused profile JSON with a fixed
  empty object string, allowing all editor profile data to be eliminated.
  5/10 pass, five failures at 3,241, 2,441, 2,141, 1,021 and 3,071.

The latter is a **single 4,480-byte JS chunk** with no static/dynamic imports or
Wasm assets; the build fails if those dependencies return. The selected fixture
mode never enters the placeholder branch. The unsupported real-Wasm mode must
not be used with either cold-branch variant. The first minimal failure again
shows mask 16 / field four, 2048 on both sides, identical bits, and true cold
equality rechecks. This is strong evidence that code shape affects reproduction,
not a proof of which compiler optimization is wrong.

The new `serve-number-repro.mjs` serves only the exact selected entry bundle,
a visible native runner and its HTML on loopback port 4202. It cannot serve
repository files, Wasm binaries or dynamic chunks. The runner performs ten
reload batches of 10,000 iterations / 20,000 tuples, stops at the first failure,
and treats interruption as failure rather than silently retrying. Its progress
is visible in Safari's accessibility tree. No clipboard access or injected
JavaScript automation is used in native Safari.

Installed Safari 26.6.2 (bundle 21624.5.1.11.3), on arm64 macOS 26.6.2 / 25G83,
passed two independent ten-batch runs of the preserved validator-free DataView
bundle: 200,000 iterations / 400,000 tuples total. The native run uses the same
JS SHA-256 `37bdf950ac887c2e2e420091c608ffc4ac5295e4f02ebd2ff248c1886a8bbe40`
that reproduced in Playwright.

Safari also completed ten native batches of the smaller `js-cold-minimal`
bundle without failure: another 100,000 iterations / 200,000 tuples. That is
the exact small JS bundle that failed five of ten automated WebKit cases.
Both native results were observed in the visible accessibility report. They
are bounded non-reproductions, not a claim that the editor is fixed.

The **same visible click/reload workflow** in Playwright WebKit then passed
three batches and failed batch four at iteration 5,225 with the same equal-bit
report. Six later batches did not run. Thus direct `page.evaluate(probe())`
invocation is not required. The initial wrapper-test attempt inherited a
five-second action wait and timed out before completion; that tooling error
was corrected to a 25-second batch observation inside the unchanged 30-second
test budget. It is not counted as a runtime failure or pass.

Playwright's pinned WebKit revision is 2336, labeled 26.5, whereas installed
Safari reports 26.6.2. **These labels do not order the underlying engine commits.**
[Playwright documents](https://playwright.dev/docs/browsers#webkit) that its
WebKit comes from main-branch sources and can include changes not yet in Safari.
Native passes therefore do not prove that Safari "already fixed" this bug;
nor do they supersede the earlier native editor selection counterexample.

Repeat after the usual package build:

```sh
BREDITOR_NUMBER_VARIANT=js-cold-minimal npx vite build --config vite.property-transport.config.ts
BREDITOR_NUMBER_VARIANT=js-cold-minimal npx playwright test -c playwright.property-transport.config.ts --project=webkit --grep tiny-wasm --repeat-each=10
npm run demo:number:diagnostics -- js-cold-minimal
```

Open the printed localhost URL in Safari and click **Start 10 batches**. The
visible report includes the actual served bundle hash. The maintained
`playwright.native-number.config.ts` compares the native runner using the
`js-dataview-bare` build; it verifies the server's hash before starting.
Stop a differently configured server on port 4202 before running that config.

The minimal build is preserved in `/tmp/breditor-js-cold-minimal-build-20260926`;
JS SHA-256 `bb0387bfa73e13eec77611ca9b8cfcb70cbbd51f8f99a18d066ca2ceb88f277b`.
Failure traces, browser versions and native observations are in
[the evidence record](qualification/2026-09-26-native-number-and-cold-branch.json).
All 1,325 workspace/diagnostic unit tests pass, including 47 diagnostic tests;
browser tooling typechecking passes. Production sources and validation remain
unchanged; full release qualification is still open.

## Compiler-tier and standalone shell controls

All controls below load the same preserved `js-cold-minimal` file, SHA-256
`bb0387bfa73e13eec77611ca9b8cfcb70cbbd51f8f99a18d066ca2ceb88f277b`.
No production source, expected value, validation rule or hot probe body changed.

`playwright.number-tiers.config.ts` strips inherited JSC overrides, installs
matching `JSC_` / `__XPC_JSC_` flags in diagnostic child processes, and requests
an option dump. The four ten-case runs used separate ports, one worker each,
no retries, and the existing 30-second per-case budget. They ran concurrently:

- Normal: 8 passed, 2 comparison failures (iterations 2,721 and 571).
- FTL disabled: 9 passed, 1 comparison failure (861).
- DFG and FTL disabled: 8 passed, 2 comparison failures (5,761 and 681).
- JIT disabled: 5 passed, 5 comparison failures (8,141, 3,331, 7,961, 9,461, 8,641).

An independent five-case JIT-disabled browser run, without other browser-matrix
jobs, then passed four and failed at iteration 7,131. The first preserved
JIT-disabled failure has mask 16 and identical 2048/IEEE-bit cold captures.
The option dumps contain `useJIT=false`. These results supersede any inference
from earlier short passes that disabling JIT reliably prevents the fault.
They are not measurements of relative failure rates or proof of the executing
machine-code tier at the failing instruction.

The bundled `JavaScriptCore.framework/.../Helpers/jsc` also runs the original
file as a module. `jsc_number_runner.js` supplies only a global `window` alias
and a minimal `document.createElement('link').relList.supports('modulepreload')`
shim to skip Vite's preload polyfill. It does not load a browser, editor,
Playwright, or Wasm. Dynamic-loader logging confirms that the shell loads
Playwright revision 2336's bundled JavaScriptCore framework, not the system
framework. Native Safari remains a separate engine-build control.

Forty fresh shell processes using the native zero-delay timer passed (ten per
tier). With a separate host wrapper imposing a minimum 4 ms delay, normal JSC
passed eight and failed two of ten, at iterations **51 and 2,851**. Both failures
have mask 16, identical captured number bits, and true cold equality rechecks.
The paced JIT-disabled shell control passed ten of ten. A further normal paced
five-case run passed, as did five paced baseline-only cases; intermittency
remains. The delay approximates browser
pacing, not browser timer-nesting semantics. It changes no bytes in the module.

This establishes a standalone, timing-sensitive reproduction. It does **not**
establish that timers, GC, a specific compiler pass, or `Object.is` itself is
the faulty operation. The hot array read, representation, comparison and mask
path remain to be separated. Browser JIT-disabled failures must not be omitted
because the shell JIT-disabled run passed. The relationship to every historical
editor/clipboard failure is still unproven.

### Running the standalone case

Use the explicit JSC binary and matching framework directory from your local
WebKit installation. On this investigation's machine:

```sh
DYLD_FRAMEWORK_PATH=/Users/s/Library/Caches/ms-playwright/webkit-2336 \
DYLD_LIBRARY_PATH=/Users/s/Library/Caches/ms-playwright/webkit-2336 \
node scripts/run-jsc-number-repro.mjs \
  /Users/s/Library/Caches/ms-playwright/webkit-2336/JavaScriptCore.framework/Versions/A/Helpers/jsc \
  /Users/s/code/breditor/target/property-transport/js-cold-minimal/assets/index-a-Ao9ALN.js \
  normal 4 10
```

The runner checks the preserved hash before every case, bounds each process to
35 seconds, prints every result without retries, and exits nonzero if any case
fails. Modes are `normal`, `no-ftl`, `baseline`, `no-jit`; delay controls are `0`
and `4`; case counts are restricted to 1..20. Importantly, JSC's `quit()` exits
successfully even after a reported failure; the Node wrapper validates the full
JSON outcome, iteration/read counts, and empty diagnostic rather than trusting
the shell exit status. Three regression tests cover this fail-closed parsing.
See the official [shell implementation](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/jsc.cpp)
and [engine options](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/OptionsList.h).

Results, preserved trace hashes and remaining limitations are recorded in
[the shell/tier evidence](qualification/2026-09-26-jsc-shell-and-tiers.json).
All 1,331 JavaScript workspace/diagnostic unit tests pass, including 53 diagnostic
tests; browser typechecking and script syntax checks pass.

## Captured comparison result controls

The new opt-in transform starts from the pinned 4,480-byte file and rejects any
source-hash drift. `captured` reads each array operand once into locals, stores
the boolean returned by `Object.is`, and records those locals and the boolean
on the rejection path. The expected tuples and original rejection function are
unchanged. `strict` and `same-value-js` use the same capture structure but change
the comparison expression. The latter implements SameValue explicitly,
including NaN and signed zero; unit tests also cover symbols, bigint and object
identity. Strict equality is equivalent only for this fixture's values, not a
general Object.is replacement.

The browser config serves each variant by intercepting only the known module
request, records original/executed hashes, and verifies exactly one fulfillment
and no Wasm requests. Its routed `original` control receives unchanged bytes.
This routing differs from the earlier directly served browser controls; it is
not silently combined with them.

Ten WebKit cases per variant, with one worker per run, no retries and the same
30-second case budget, produced:

- Original: 8 passed, 2 failures at iterations 2,841 and 421.
- Captured `Object.is`: 8 passed, 2 failures at 368 and 3,781.
- Strict equality: 10 passed.
- Explicit SameValue: 10 passed.
- Smaller `result-only` capture: 9 passed, 1 failure at 1,711.

Both captured failures record field 4, actual/expected 2048, `equal: false`,
`maskBefore: 0`, `maskAfter: 16`, `strictEqual: true` and
`objectIsAgain: true`. A separate five-case captured run passed four and failed
at 3,621. The result-only variant preserves the original array reads and
short-circuit expression, adding just a local for the last comparison result;
its failure records `lastComparisonResult: false`, `lastField: 4`, mask 16.

Chromium and Firefox each passed three cases of the identical captured variant.
An initial cross-engine invocation collided with an already-running diagnostic
server before tests started; only the later completed rerun is counted.

This is stronger than inferring a comparison failure from the mask alone:
the captured source-level result is already false. It also avoids attributing
the contradiction solely to rereading the operand arrays in the diagnostic.
However, storing values and entering the cold path can box values or trigger
deoptimization. These observations do not reveal the exact machine operands
or identify a faulty C++ instruction. Do not label every Object.is call broken,
or treat the passing alternatives as editor fixes.

The corresponding standalone-shell round passed all forty cases (ten each for
original, captured, strict, and explicit SameValue). Because the original also
passed, that round does not distinguish the variants. A separate unchanged
shell run with JIT/GC logging passed while logging DFG compilation, a BadType
OSR exit in the comparison function, and garbage collections. Those events
also occur on a passing run; they are not root-cause evidence by themselves.

The current upstream source registers Object.is as an intrinsic and its native
implementation calls `sameValue`; that helper normalizes numeric operands to
doubles before its bit comparison. This identifies paths for further inspection,
not a verified match to the installed revision's failing machine code. Sources:
[ObjectConstructor.cpp](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/ObjectConstructor.cpp),
[JSCJSValueInlines.h](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/JSCJSValueInlines.h).

Reproduce the source-level capture after generating the preserved build:

```sh
BREDITOR_NUMBER_VARIANT=js-cold-minimal BREDITOR_COMPARISON=captured \
  npx playwright test -c playwright.comparison-capture.config.ts --project=webkit --repeat-each=10
```

Allowed comparison controls are `original`, `captured`, `strict`, `same-value-js`
and `result-only`. The standalone command accepts the same choice as an optional
sixth argument after the case count. It generates a temporary diagnostic module,
records its distinct hash and removes only that generated module/directory on
completion; the original file is never overwritten. Do not run two browser jobs
for the same comparison and tier simultaneously because they share a fixed
diagnostic port. Different tiers now use separate ports and output directories.
These configs are excluded from ordinary product browser tests.

Preserved traces, hashes and captures are in
[the comparison evidence](qualification/2026-09-26-captured-comparison.json).
All 1,335 JavaScript unit tests pass, including 57 diagnostic tests; browser
tooling typechecking passes. Production sources remain unchanged in this slice.

## Baseline and native-path controls

The identical 4,913-byte captured module was tested under normal, baseline-only
and JIT-disabled settings, ten cases each. Normal and JIT-disabled passed ten;
baseline-only passed nine and failed at iteration 7,371. A separate baseline-only
run with `BREDITOR_JSC_LOG=1` passed four and failed at 6,171. Both failures retain
the false returned boolean, 2048 locals, true immediate rechecks and 0-to-16 mask
transition. DFG and FTL were explicitly disabled in both runs.

Across five logged baseline cases, the log records 1,242 generated-code entries,
including 89 baseline entries and five specialized `is` stubs, with zero DFG/FTL
compilation entries. The captured failure therefore does not require optimizing
tiers in this control. This does not distinguish the baseline caller, Object.is
stub, native fallback, or value representation.

Ten original-module JIT-disabled cases with logging passed, with zero generated-
code entries. These are fresh passing samples, not grounds for discarding earlier
JIT-disabled failures. Logging, source shape and intermittency still matter.

The standalone runner now reads `jscOptions()` after VM initialization and after
completion. The Node parent checks requested settings in both snapshots. Five
normal and five JIT-disabled captured shell cases passed. Normal snapshots were
1/1/1 for JIT/DFG/FTL; disabled snapshots were 0/0/0. Tests reject missing, changed
or string-valued option evidence. Browser logs are not these shell snapshots.

### Native inspection and current blocker

Read-only LLDB disassembly of the installed arm64 framework resolved
`JSC::objectConstructorIs` at file address `0x112ce24`. Its numeric path decodes
tagged integer/double inputs, handles NaN, and compares resulting double bits.
Framework SHA-256:
`7f5f6858e7c990f616850c129757548483f56041f9cc7acff2771581ecfa903d`.
This inspects the actual binary, but cannot reveal what a failing call received.

A conditional breakpoint resolved at the native false-return block, offset 316,
for the two encoded forms of positive 2048. The corrected LLDB launch was denied
with `attach failed (Not allowed to attach to process...)` before the probe ran.
An earlier argument-parser error is also excluded. Neither is a runtime probe
result or an observed breakpoint hit.

Read-only checks show developer mode disabled and an ad-hoc signed shell with
no `get-task-allow` entitlement. They do not prove the exact authorization
subsystem responsible. The local DevToolsSecurity manual explains that enabling
developer mode changes debugger authorization policy for admin/developer users;
it is not a project-local setting. No policy, privacy preference, signature,
cached binary, or system protection was changed. Such changes require a separate
user decision. No existing Safari/demo process was attached.

Evidence is in [the tier/native record](qualification/2026-09-26-captured-tiers-native.json).
All 1,337 JavaScript unit tests pass (59 diagnostic tests), and browser tooling
typechecking passes. Production behavior and release qualification are unchanged.
