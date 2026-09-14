# WebKit action-state transport regression

## Reproduction and boundary

The post-alpha.22 investigation reproduced
`browser_editor.action_state_failed` / `action_state.invalid_wasm_view`
without React, DOM selection, or page navigation in the failing loop.
The maintained browser regression creates the Size Showcase profile, selects
text, sets Link, Size, and an RGB24 value, traverses undo/redo, removes the color, and undoes
that removal. It then restores that checkpoint 1,000 times. Each owner reads
one full action-state snapshot and two exact cache hits and releases its Wasm
handles. The test checks the exact color value and an available redo branch.

Run it after building the packages:

```sh
npm run build
npx playwright test tests/browser/action-state-restore.spec.ts
```

The initial color-focused probe against the original packaged code failed at
restore 200/read 2. A subsequent A/B
check with the preserved original Wasm binary and unminified generated glue
failed all three runs at restore/read 160/0, 223/0, and 98/1. These are zero-based
positions, not a fixed threshold. The preserved original binary's SHA-256 is
`84047b732cecf570605d1db4b18fe77bc65d17a802e02112719690d3194a926f`.

Local environment: macOS 26.6.2 (25G83), arm64, Playwright 1.62.1, WebKit
revision 2336 (reported package browser version 26.5), Rust 1.98.0, and
wasm-bindgen 0.2.127. The pre-fix source checkpoint was
`37e708c5c85dff7452767bf546af782985204a13`.

Temporary instrumentation observed a valid contract name and typed value
status with an absent version. An instrumented raw Wasm call reported the optional-u32
absence sentinel `9007199254740991`, then returned `1` on an immediate second
call with the same snapshot pointer and index, before another getter ran.
Both minified and unminified generated glue reproduced it. The instrumentation
is not shipped and never replaced a rejected value with the repeated result.

Disabling only JavaScriptCore's FTL tier made the 1,000-restore / 3,000-read
probe pass while leaving the other JavaScript and Wasm tiers enabled. Disabling
all JIT also passed. On this macOS host the options had to reach the page's XPC
process; the initial parent-only environment experiment was inconclusive.
Diagnostic option dumps confirmed the later page-process settings. See
[WebKit's option definitions](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/OptionsList.h).

This isolates a tier-dependent transport failure; it is not a minimized
upstream compiler diagnosis or a claim about every Safari release.

## Breditor mitigation

The exported action-state version getter now returns an explicit `JsValue`
number or `undefined`, instead of relying on wasm-bindgen's f64 absence
sentinel for `Option<u32>`. Native Rust callers retain the original
`Option<u32>` accessor. The generated public TypeScript signature remains
`entryValueContractVersion(index: number): number | undefined`.

The implementation still reads the same immutable Rust state exactly once.
There is no retry, descriptor-derived replacement, validation bypass, browser
detection, JIT setting, or package dependency update. ABI generation 5 and
all profile/document/history/checkpoint wire generations retain their meaning;
the generated JS and Wasm must still be used as a matching package pair.

The numeric mitigation passed five consecutive normal-WebKit runs (5,000 restores,
15,000 reads), then the strengthened regression passed Chromium, Firefox,
and WebKit. A generated-glue test also alternates actual typed versions,
unsupported entries, and out-of-range indexes with exact ownership cleanup.

The longer demo sequence then exposed another action-state rejection in the
UTF-8 scanner: the `bytes > maximum` branch was entered with captured values
`bytes = 1`, `maximum = 9007199254740991`, string length 22, and index 0.
The numeric-only mitigation therefore did not resolve the whole failing path.
This run stopped at demo case 66, after 65 passes; it is retained as negative
evidence, not counted as a passing stress run.

The scanner now requires an explicit bound. Decoded strings and object keys
use the remaining existing 65,536-byte per-value budget; encoded JSON and
descriptor-constrained strings keep their existing explicit bounds. There is
no `MAX_SAFE_INTEGER` default, widened limit, or acceptance of malformed data.
Unit tests cover exact and over-limit ASCII/BMP/non-BMP text, key accounting,
and empty/nonempty text after exhausting the budget. The restore fixture also
sets Link and Size to exercise more string/property payloads alongside RGB24.

With both changes, the expanded fixture passed three runs per browser
(9,000 restores and 27,000 reads total). The full ten-case WebKit demo sequence
then passed ten repetitions, 100 cases total, with temporary redacted boundary
diagnostics and normal browser optimization settings. A short three-run
comparison restoring the old scanner default also passed; the UTF-8 symptom
was intermittent and was not made deterministic by the restore fixture.

A separate validation defect found during the investigation is fixed as well:
a terminal unpaired UTF-16 high surrogate now fails the positive low-surrogate
range check. Previously `charCodeAt` returned `NaN`, which escaped both negative
range comparisons. Unit cases cover terminal/embedded malformed surrogates.
That defect is not the explanation for the valid Rust contract-version failure.

## Release verification

`npm run verify:release` passed all 17 gates for the combined implementation:
1,560 native Rust tests, 25 real Wasm-target tests, 1,232 TypeScript tests,
81 Chromium/Firefox/WebKit browser cases, 30 demo cases, and 9 verifier tests.
Strict formatting/lint/docs/types, clean packed consumers, direct/path-aliased
Wasm reproducibility, all 227 reviewed ABI signatures, and fresh production
size checks passed. No size ceiling was increased and no package was published.
See [the measured size budgets](SIZE_BUDGETS.md).

An additional uninstrumented WebKit stress run stopped after 46 passing cases
on a different, test-only autosave observation race: Undo had restored RGB24,
but the first post-click status poll arrived about 1.8 seconds after click
dispatch, missing the 250 ms dirty window and seeing only the saved state.
The trace and final UI did not show an editor fault. The demo tests now attach
a read-only status observer before the action, require an actual dirty-to-saved
transition, and retain their document and reloaded-history assertions. Dedicated
positive/negative tests prove that a completed transient is retained and initial
idle alone never passes. Application clocks and autosave behavior are unchanged.

The full release pass above precedes that test-only observer correction. Its
first 36-case rerun encountered a Chromium navigation timeout and then the
120-second suite limit during extreme host load (load average above 700):
11 cases passed and 24 did not run. This is not recorded as a passing matrix
or hidden by increasing navigation/suite limits.

The six dedicated observer tests subsequently passed in all three engines,
and demo typechecking passed. A per-browser retry then timed out on WebKit
navigation and an ordinary Apply click before reaching the changed persistence
assertions (2 passed, 2 timeout failures, 8 not run); the loop stopped before
Firefox/Chromium. Further stress was stopped rather than altering unrelated
host processes or weakening the existing limits. The final 36-case demo rerun
is still required on a normally responsive machine.

## Remaining uncertainty

The earlier clipboard/caret fault did not capture its public cause. It remains
unproven whether it shares this transport failure. The 40-cycle cut/caret
regression and subsequent undo/redo checks remain enabled; do not label the
older observation fixed merely because later runs are green.

Other optional numeric getters were not changed speculatively. The regression
and complete browser/demo gates remain the evidence for this narrow mitigation,
not a guarantee against every browser optimizer defect or every input method.
