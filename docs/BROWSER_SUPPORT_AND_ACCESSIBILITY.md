# Browser support and accessibility gate

Most recent completed shipping qualification, October 3: the unpublished
`0.3.0-alpha.22` source plus selection fix `5a6e57a` passes all 17 local release
gates, including 165 browser and 39 demo cases. The reproduced selection-u32
upper-bound rejection now has a targeted compatibility fix: 300 production
WebKit clipboard cases and 400,000 restores pass, as do 100,000 additional
restores in native Safari 26.6.2. See the
[production selection qualification](qualification/2026-10-03-selection-u32-production.json).
Safari/WebKit remains **experimental** beyond this bounded evidence. The
historical JavaScript-only engine counterexamples are not repaired by changing
one application predicate; fresh native system-clipboard and iOS checks remain
necessary for broader claims. Experimental Rust heading work does not extend
the browser feature/support boundary.

The tested desktop-browser baseline is the exact Playwright matrix
locked by this repository: Chromium, Firefox, and WebKit. `npm run test:browser`
serves a real page, initializes the generated `@breditor/wasm` package, and
opens the public `@breditor/browser` runtime in every engine. A missing browser
capability or browser executable is a test failure; the core matrix is never
silently skipped.

Native Safari 26.6.2 and the running Chrome process (user-agent major 152;
installed app metadata is 154.0.8037.93) pass fresh clipboard/caret/history/Link
checklists on this build. Copy and Cut each replace a distinct scratch sentinel.
The iOS 26.5 Simulator loads the editor and round-trips a selected prefix through
Cut/Undo, but input automation did not reliably deliver the requested key
sequences; no complete mobile pass is claimed. At that shipping checkpoint,
native CJK IME, physical devices and a second computer remained unverified.

October 5 isolated candidate `d0f75ee`: a physical Japanese–Romaji suffix
insertion in native Safari now survives focus loss and exact visible-text
Undo/Redo, with numbered items retained and no recorded fault. The trace
includes the delayed empty `compositionend` previously associated with rollback
and recursive recovery. This is a bounded pass for that reported regression,
not complete CJK/IME certification or a new shipping qualification. Replacement,
cancellation, other IMEs and the separate historical WebKit engine fault remain
outside this physical check. See the
[native Japanese fix verification](qualification/2026-10-05-native-japanese-composition-fault.json).

A [later simulator follow-up](qualification/2026-10-01-structural-foundation.json)
independently verifies whole-sample Copy/Cut, native typing history and single
Paste using explicit focus checks and simulated hardware keys. It remains a
partial result: Link history, touch selection and the soft keyboard are not
qualified by that follow-up.

The entries below are historical checkpoints, not cumulative claims that every
listed build is currently supported. See the
[October 1 consolidation evidence](qualification/2026-10-01-consolidation.json)
for exact scope and remaining work.

## WebKit fault investigation

October 1 checkpoint: a reproduced projection-update child double-consumption
bug is fixed. All 1,378 runtime tests, 170 diagnostic tests, 159 browser cases
and 39 demo cases pass, with application gzip at 224,950/225,000 bytes under
unchanged limits. This does not establish a fix for either historical WebKit
fault. See [the child-ownership record](qualification/2026-10-01-projection-child-ownership.json).

Latest descriptor checkpoint: overlapping profile-descriptor reads and
premature inspection of protected views are fixed, with 1,365 runtime tests,
170 diagnostic tests, 159 browser cases and 39 demo cases passing. The
unchanged application gzip limit now has 89 bytes of headroom
(224,911/225,000). These fixes do not resolve the separately tracked WebKit
numerical or selection-endpoint faults. See
[the descriptor ownership record](qualification/2026-09-28-descriptor-ownership.json).

Latest September 28 checkpoint: action-state reentrant ownership and diagnostic
Vite entry discovery are fixed. All 1,345 runtime tests, 170 diagnostic tests,
159 browser cases, 39 demo cases and ten extra instrumented WebKit cases pass.
The standalone numerical fault still fails twice in five debugger-free no-JIT
runs. The historical endpoint rejection remains unproven and unresolved, not
cleared by successful editor tests. Current application gzip is
224,989/225,000 bytes; no limit changed. See
[the ownership and WebKit recheck](qualification/2026-09-28-action-state-ownership-and-webkit-recheck.json).

September 28 broader audit: all 17 non-publishing release checks pass after the
executor-binding fix, including 159 browser and 39 demo cases. The subsequent
ordinary-harness Vite configuration fix passes all 168 diagnostic-tool tests
and a fresh 159-case browser run without the prior dependency-scan error.
Current application gzip is 224,936/225,000 bytes; limits are unchanged.
The historical WebKit numeric fault and intermittent selection-endpoint
rejection remain open; neither is cleared by a passing matrix. See
[the broader audit](qualification/2026-09-28-remaining-issues-audit.json).

September 28 selection-ownership follow-up: a deterministic same-view reentry
bug is fixed, with nine new regressions, 1,208 passing runtime tests and all 153
uninstrumented browser cases and all 39 rebuilt demo cases passing. The latest production gzip check passes
at 224,986/225,000 bytes (14 bytes remaining). Before this fix, an ordered
diagnostic run also captured a distinct WebKit interactive failure: selection
endpoint validation rejects during formatted clipboard Link Undo/Redo. Its
precise failure-return site is now known, but the cause remains unresolved.
Five further instrumented WebKit passes (255 cases) do not reproduce it and do
not establish a fix. The full release verifier and native Safari were not
rerun for this checkpoint. See [the checkpoint evidence](qualification/2026-09-28-selection-reentry-and-endpoint-rejection.json).

September 28 lifecycle checkpoint: seven regressions now reject reads whose
profile generation becomes invalid during reading or cleanup. Native Safari
passes 50,000 restores on the rebuilt runtime, but the full release verifier
stops at **152/153 browser cases**: the warm Link fixture faults on its first
Undo with `toolbarDispatchFailed`. Twenty isolated repetitions subsequently
pass; they do not erase the original failure. An ordered diagnostic run also
faults in clipboard Undo/history, and a longer series rejects selection restore
at iteration 9 after 101 passing cases. See [the exact checkpoint record](qualification/2026-09-28-generation-lifecycle-and-webkit-followup.json).
This checkpoint is **not release-qualified**;
the first trace is preserved and test-only exception-site diagnostics are being
used to identify the precise failing boundary. No retry or assertion relaxation
is used. The unchanged demo gzip budget has 82 bytes remaining.

Separate follow-ups pass 39/39 demo cases, 50,000 minified automated WebKit
restores, and 153 fully instrumented WebKit cases. Native Safari's 50,000
restores use the same minified bundle hash. These checks do not clear the failed
release browser gate or identify the intermittent rejecting branch.

Earlier integration checkpoint: the exact-value boundary mitigation is now in the runtime.
The rebuilt, uninstrumented minified fixtures pass 153 browser cases and
50,000 automated WebKit restores, while native Safari passes 50,000 restores
and a fresh clipboard/caret/history/Link checklist. The JavaScriptCore fault
itself is still unresolved; these are bounded results on the recorded builds.
See [integrated runtime evidence](qualification/2026-09-26-boundary-runtime-integration.json).
Historical opt-in-only descriptions below no longer describe the current source.
All 17 non-publishing release checks pass for this integration, including the
ordinary 153 browser and 39 demo cases. This qualifies the recorded desktop
matrix/checkpoint, not every device, native IME or future engine version. The
demo compressed-JavaScript budget has only 198 bytes of headroom; no limit was
raised to admit the mitigation.

The full minified candidate now passes **153/153 ordinary browser cases** across
the three engines, after correcting two fixture packaging failures. A further
15 native Safari batches also pass. The local isolated cost is small enough to
continue to scoped runtime integration, but this is not qualification of a
rebuilt production runtime or a complete engine repair. See
[the exact artifacts and outcomes](qualification/2026-09-26-boundary-full-matrix.json).

The opt-in boundary candidate now also passes 84 interactive WebKit cases,
21 each Chromium/Firefox cases, and one native Safari 26.6.2 clipboard/caret/
history/Link checklist. No retry or assertion relaxation was used. The original
interactive control passes too, so these results expand coverage without proving
an interactive repair. Production adoption and the release gate remain pending.
See [interactive evidence](qualification/2026-09-26-clipboard-boundary-qualification.json).

Full-consumer candidate qualification now includes native Safari and the
existing malformed-input/ownership test suite. A fresh unchanged-build profile
rejection is preserved; the immediate candidate rerun passes. This strengthens
the candidate but does not close the release gate. That restore-only suite does
not exercise clipboard behavior; the separate bounded run above does.
See [full-consumer evidence](qualification/2026-09-26-full-boundary-qualification.json).

Native-only controls pass, but the JS reduction still fails with concurrent GC
or Mach exception handling disabled. A reduced SameValue candidate passes five
interleaved cases against three original failures; it has not been adopted or
qualified for production. The release gate remains open. See
[follow-up controls](WEBKIT_WASM_NUMBER_REPRO.md#native-only-and-engine-context-follow-up).

Authorized native debugging catches equal encoded inputs but unequal internal
comparison values in JavaScriptCore, including with JIT disabled. Developer
mode was enabled with explicit user approval, resolving the earlier debugger
authorization blocker. This is stronger diagnostic evidence, not a production
fix or renewed release qualification. See
[native register evidence](WEBKIT_WASM_NUMBER_REPRO.md#authorized-native-register-captures).

New captured-comparison controls reproduce a false comparison result before
the mismatch report is assembled. Passing strict/SameValue alternatives are
diagnostic evidence only, not a release workaround. See
[the capture investigation](WEBKIT_WASM_NUMBER_REPRO.md#captured-comparison-result-controls).

The small numeric reproduction now also fails in standalone JavaScriptCore
with a paced host timer; browser/Playwright execution is not required. Browser
JIT-disabled runs still fail, so prior short JIT-off passes must not be treated
as a fix. This is diagnostic progress only; full release qualification remains
open. See [shell/tier controls](WEBKIT_WASM_NUMBER_REPRO.md#compiler-tier-and-standalone-shell-controls).

Native comparison now separates the reduced fault from release claims:
installed Safari passes twenty validator-free DataView batches and ten smaller
standalone batches; Playwright WebKit still reproduces both, including through
the same visible click/reload runner. These engine builds are not interchangeable
and the earlier native editor selection failure remains unresolved. See the
[native and cold-branch evidence](qualification/2026-09-26-native-number-and-cold-branch.json).

Latest narrowing: a JavaScript `DataView` control reproduces the same comparison
failure **without executing Wasm**, including after removing our private
validator. The tiny module also independently matches WABT's output byte for
byte. Thus neither Rust nor Wasm is necessary for this reduced fault; the exact
engine operation and connection to all historical editor failures remain
unproven. See the [source audit and JS-only controls](WEBKIT_WASM_NUMBER_REPRO.md#independent-source-audit-and-javascript-only-failure).

A new [Rust-free numeric comparison reproduction](WEBKIT_WASM_NUMBER_REPRO.md)
reports inconsistent equality on a 48-byte hand-written Wasm module. Rust and
the editor model are not required for this isolated failure. It remains a
release blocker; passing altered-JIT diagnostic controls is not qualification.

Further transport controls reproduce the unchanged f64 failure while tiny i32,
unsigned-conversion and text-conversion variants pass five cases each. These
are bounded diagnostic results. A separate full-consumer normalization build
is experimental, not shipped; see the [transport controls](WEBKIT_WASM_NUMBER_REPRO.md#further-reduction-and-transport-controls-september-26).

The current provisional selection mitigation captures the twelve generated
getters once through a generic call site, retaining validation and cleanup.
Two 20-run automated WebKit checks and two 20-batch native Safari checks pass;
the staged source and tested bundle match. A third automated run still fails
startup with `engine_bootstrap.invalid_request`. WebKit qualification remains
open; this is not a blanket Safari fix. See the
[current investigation status](WEBKIT_CLIPBOARD_INVESTIGATION.md#status).

The opt-in startup recorder now locates one descriptor rejection in the
format-property value-type validator. A refined diagnostic also reproduces
the selection rejection at restore 113/read 1 with the generic getter capture
still present. Both paths remain unresolved. The repeatable debug command,
bounded metadata policy and captured evidence are documented in the
[startup diagnostic workflow](WEBKIT_CLIPBOARD_INVESTIGATION.md#maintained-startup-rejection-diagnostics).

An earlier extended production check **reproduced a selection consumer
failure** after 27 passing runs, at restore 113/read 1 of run 28. The no-DOM
probe rejected with `selection.invalid_wasm_view`; two planned runs did not
execute. A separate 45-case React stress run passed. Native smoke and earlier
green gates do not close this current counterexample. See the
[renewed investigation](WEBKIT_CLIPBOARD_INVESTIGATION.md#renewed-production-reproduction-after-native-smoke).

Installed Safari 26.6.2 subsequently reproduced the unchanged production
consumer failure at restore 7,082/read 2 of native batch ten, after nine
passing batches. Sustained native Safari reliability is therefore also an
open release blocker, not merely a Playwright-engine concern. See the
[native stress result](qualification/2026-09-25-safari-selection-stress.json).

A fresh, byte-identical baseline control after the candidate runs reproduced
the same restore 113/read 1 selection rejection, this time in case nineteen
after eighteen passes. That supports retaining the narrow selection experiment
but does not explain or waive the candidate's newer bootstrap failure.

The latest follow-up fixes a separate, deterministic oversized-paragraph paste
fault reproduced in all three engines: plain paste now preflights Rust's
10,000-paragraph source limit before queue dispatch. All 17 release gates pass
with 153 browser and 39 demo cases; the expanded WebKit clipboard stress run
passes 160/160. This is not evidence of a common cause for the older intermittent
faults. See the [boundary regression and verification results](WEBKIT_CLIPBOARD_INVESTIGATION.md#cross-paragraph-follow-up-deterministic-oversized-paste-fault).

The latest targeted schema-version validation mitigation passes all 17 release
gates (114 browser / 39 demo cases) and twenty maintained production stress runs
(200,000 restores / 600,000 selection reads) with normal optimization, no
diagnostic transforms, and zero retries. It retains the same strict positive-u32
contract. The original native clipboard/caret and separate DOM-restoration
faults are still not directly proven resolved; see the latest
[mitigation evidence and limits](WEBKIT_CLIPBOARD_INVESTIGATION.md).

The direct runtime follow-up also passes 45 mixed React demo and 90
clipboard/Link stress cases in WebKit without instrumentation or retries.
A new combined formatted cut/caret/history regression passes in all three
engines, and the expanded ordinary browser matrix passes 117/117 cases.
These runs did not reproduce the earlier runtime faults, but their
controlled clipboard events do not qualify trusted OS clipboard behavior.
Use `npm run test:demo:stress` and `npm run test:clipboard:stress` to repeat the
maintained schedules; their exact scope is recorded in the investigation notes.

The opt-in `npm run demo:clipboard` fixture provides a separate native event
path for manual browser qualification. It records bounded, redacted event order
and sticky owner faults without the synthetic target-range shim or automatic
clipboard access. See [the manual protocol and evidence limits](MANUAL_CLIPBOARD_QUALIFICATION.md).
No manual Safari/iOS qualification result is implied by its automated checks.

A subsequent [native UI run](qualification/2026-09-25-native-clipboard.md)
passes the bounded clipboard/caret/history/Link checklist in installed Safari
26.6.2, with a saved redacted report and no observed owner fault. Safari in the
iOS 26.5 Simulator also completes the bounded checklist using native menus and
simulated hardware keys, with its own operator-confirmed report. These observations narrow
the native-testing gap without clearing intermittent failures, physical-device
support, or every native input/clipboard path. After idle-window confirmation,
installed Chrome also passed the bounded native checklist with a saved report.
Those reports preceded the subsequent selection-u32 candidate change.

Earlier September 25 extended verification reproduced rejection in the patched
selection path and the separate profile-startup path. The numeric transport
mitigation below is not a complete fix; see the latest
[counterexamples and boundary isolation](WEBKIT_CLIPBOARD_INVESTIGATION.md).
Production branch capture subsequently identified an absent required format
revision. That export now uses explicit number/undefined transport, but the
patched production stress test still rejected startup after six passing cases.
Neither startup nor clipboard support is considered cleared by this change.
The prior full release run passes 111 browser cases but fails the demo gate
(38/39) on another WebKit profile-descriptor startup rejection.

The observations have different evidence; a green matrix is not a waiver:

- The alpha.22 clipboard test committed a cut, then faulted at revision 4
  during the following caret move. The original trace did not capture the
  public fault reason. Current and pre-Range-preservation implementations each
  passed 100 later clipboard repetitions and 200 cut/caret cycles across five
  long-lived sessions. The earlier implementation still replaces exact native
  Ranges, but the comparison did not reproduce the fault, so Range preservation
  is not a proven fix.
- Under concurrent browser-test load, the current React color demo once
  rejected startup after reload with `browser_editor.action_state_failed` /
  `action_state.invalid_wasm_view`. That trace is a distinct observation, not
  proof that the clipboard fault has the same cause. The later investigation
  reproduced its action-state rejection in a no-DOM checkpoint-restore loop:
  the optional numeric version getter transiently returned an absence sentinel
  with WebKit's FTL tier enabled. Returning an explicit JavaScript value from
  that Rust export mitigates the reproduced failure without changing the
  public signature or relaxing validation. A longer run caught a second false
  rejection against the UTF-8 scanner's MAX_SAFE_INTEGER default; scans now
  require their actual contract/remaining byte budget. The 1,000-restore / 3,000-read
  regression now runs in all three engines. See
  [the reproduction and mitigation evidence](WEBKIT_ACTION_STATE_REGRESSION.md).
- September 24 demo stress captured `toolbarDispatchFailed` on Link Undo and,
  in a separate run, `engine_bootstrap.invalid_profile_descriptor` at startup.
  A new descriptor-only loop reproduced a missing action-state contract version;
  explicit number/undefined transport now also covers the descriptor's three
  contract-version getters. The 1,000-descriptor regression checks all properties
  and absence sentinels without DOM or React. The earlier property-sentinel
  rejection and Link Undo fault are not proven resolved by this mitigation.
- A no-DOM selection restore probe subsequently exposed a missing present
  anchor node index. The four numeric selection exports now use explicit
  number/undefined transport, retaining their native/public contracts. The
  pre-fix control fails; the patched build passes 30,000 restores / 90,000
  reads, and the maintained 3,000-restore fixture passes in every engine.
  A separate post-Link `DomReconciliationRequired` failure has also been
  captured; neither it nor the original clipboard/caret trigger is proven
  fixed by this transport mitigation. See the
  [selection and DOM-transition evidence](WEBKIT_CLIPBOARD_INVESTIGATION.md).

The committed regression now performs 40 cut/caret cycles in one owner lifetime,
then verifies two Undo and two Redo steps. Demo startup failures report only
their public redacted error/cause codes. No production validation or recovery
rule was relaxed. The original clipboard observation remains unresolved; the
action-state mitigation has its own repeatable before/after evidence.

Runtime faults now expose the demo's explicit backup recovery path. A separately
reproduced WebKit selection inconsistency on removal of a focused Link form is
fixed with ownership-scoped native selection cleanup; a negative control restores
the failure. This enables recovery of exportable sessions, not automatic retries
or guaranteed recovery from every fault. See [fault containment](WEBKIT_FAULT_RECOVERY.md).

The clipboard follow-up now covers five optional/delayed/stale event schedules,
forward/backward selections, exactly-once history, and continued typing. A
separate 1,000-owner test alternates fresh typed-profile startups and checks exact
canonical documents. These are additional regressions, not resolution of the
intermittent fault; synthetic clipboard events do not qualify native system
clipboard behavior. See the [follow-up evidence and limits](WEBKIT_CLIPBOARD_INVESTIGATION.md).

## Covered contracts

The matrix covers the supported `0.1.0` base and `0.2.0` profile browser
contracts:

- programmatically dispatched `beforeinput` coverage for Unicode insertion and
  backward deletion across non-BMP text;
- Playwright keyboard-driven ASCII typing, Backspace, and Delete;
- ordinary Chromium typing after a formatted trailing-space boundary, with
  only the exact collapsed U+0020 target-range alias admitted;
- forward/collapsed and backward browser selection mapping;
- composition lease settlement into one canonical Rust commit;
- Bold, Undo, and Redo through the public toolbar and shared history, including
  mixed-format `aria-pressed="mixed"` presentation;
- synchronous copy, cut, and paste events, including plain-text preference and
  flattening of admitted HTML-only clipboard markup;
- an IndexedDB checkpoint flushed before and restored after page reload, with
  its persisted undo and redo history exercised after restoration, plus exact
  public plain-text and canonical Document V1 exports correlated to the live
  revision both before and after reload;
- toolbar names, orientation, roving tab stop, arrow/Home/End focus, keyboard
  activation, `aria-pressed` state, and a computed visible focus outline on the
  keyboard-focused control and editor;
- an axe-core scan of the mounted editor, toolbar, status, and surrounding
  fixture; and
- the actual `@breditor/reference-highlight` package with Document V2 startup,
  Highlight intent/state/toolbar behavior, Strong/Highlight nesting, undo/redo,
  export/copy, plain paste, persistence reload, restored history, and teardown.

Alpha.4's separate clean tarball-only Chromium consumer opens the unchanged
Highlight profile beside the additive Bootstrap-V2 Highlight + Link profile,
executes typed Link set/remove/set commands, checks canonical safe-Link
attributes and wrapper nesting, and disposes both editors without workspace
imports.

The separate `npm run test:demo` gate covers the complete React page in
Chromium, Firefox, and WebKit:
its canonical Highlight + Link sample, runtime-owned native URL and new-window
controls, typed Link set/remove, canonical anchor attributes, Bold/Highlight
coexistence, undo/redo, ordinary keyboard editing, dirty-to-idle Session-V3
autosave and reload restoration, a full-page axe scan, and toolbar containment
at a 320-pixel viewport. It complements rather than replaces the three-engine
package harness.

Alpha.5 extends that demo gate without changing the browser protocol. One safe
Link must preserve its exact `href`, `rel`, and `target` plus its Highlight peer
through Enter, multiline plain-text paste, paragraph-boundary Backspace, undo,
autosave/reload with an intact redo branch, and redo. The assertion exercises
the ordinary public event, toolbar, projection, and persistence paths; it does
not inject a browser-side operation or restore from retained DOM.

Alpha.6 adds a multi-paragraph Link Apply/Remove gate through the same React-
owned form and Chromium demo. It verifies Highlight peers and unselected edge
text, generated mixed/presence state, undo/redo, and reload without adding a
native toolbar control or broadening the desktop, synthetic-IME, mobile, or
assistive-technology claim.

Alpha.7 moves those controls into a native callback-free toolbar declaration.
The APG toolbar retains a Link launcher button while the interactive nonmodal
form is a sibling, so field Arrow keys do not enter roving-toolbar navigation.
The gate covers launcher/field/Close focus, Escape, URL and Boolean input,
Apply/Remove, selection preservation, state, history, teardown, and axe. It
does not establish a screen-reader, mobile, or WCAG-conformance claim. See
[`TYPED_TOOLBAR_CONTROLS.md`](TYPED_TOOLBAR_CONTROLS.md).

Alpha.8 adds the state-value cases to that form gate: exact uniform values seed
pristine URL/Boolean fields, unset and whole-map mixed use defaults, refresh
preserves dirty input, rejection retains it, and completed dispatch plus close/
reopen hydrate again from authoritative state. The accessibility scope remains
unchanged; this behavior adds no broader assistive-technology claim.

Alpha.9 adds the package-owned Showcase profile to the real browser and React
demo gates. They assert all eight controls in declared order, independent
Italic/Strikethrough/Code state, deterministic six-format wrapper nesting,
multi-paragraph selection, one-command undo/redo steps, safe Link and Highlight
peer preservation, persistence reload, responsive containment, and axe. The
new assertions reuse the existing generic toggle and projection protocols;
they do not claim extension shortcuts, block code, rich paste, mobile support,
screen-reader conformance, or runtime plugin loading.

Alpha.10 keeps that support boundary and adds the ninth **Clear formatting**
button immediately before Undo and Redo. The browser and React demo gates
select fully formatted text, clear base Strong plus every extension format and
typed Link property through one Rust-owned command, verify the plain canonical
DOM, and restore the exact wrapper/property tree with one Undo. The demo covers
a backward cross-paragraph selection and persistence after restoration. These
assertions also cover the stateless enabled/disabled presentation and native
`formatRemove` routing; they do not broaden the desktop, mobile, IME,
screen-reader, or WCAG-conformance claim.

Alpha.11 passes the package-owned Showcase shortcut manifest to the public
runtime in the Chromium, Firefox, and WebKit harness. The gate checks exact
`Control+B`, `Control+I`, `Control+Shift+S`, `Control+E`, `Control+Shift+H`,
`Control+Z`, and dual Redo ARIA declarations; it then selects text and executes
Bold, Italic, Strikethrough, Code, Highlight, Undo, and both Redo aliases through
Playwright's genuine primary-modifier keyboard path. The React demo uses the
same exported manifest. Unit and browser-owner gates additionally cover exact
physical `KeyboardEvent.code` and modifier matching, independence from
generated `KeyboardEvent.key` text, repeat policy, disabled shortcuts,
hostile/forged manifests,
profile mismatch, and ARIA omission/drift detection at guarded toolbar
interactions and explicit canonical-DOM validation. No mutation observer faults
or repairs ARIA drift immediately.

This is evidence for the bounded physical-letter contract, not arbitrary input
hardware or layouts. Only an exact `KeyboardEvent.code` from `KeyA` through
`KeyZ` selects a binding; generated `key` text does not. Those codes identify
US physical-key positions. Virtual keyboards and assistive devices that do not
emit a conforming code may not invoke a shortcut, and browser or operating-
system reservations can intercept a chord. The tests do not establish
Alt/AltGraph, multi-key sequence, typed-input shortcut, operating-system IME,
screen-reader announcement, mobile, or WCAG-conformance support.

Alpha.12 moves the React demo and the dedicated Color Showcase browser scenario
to `example/color-showcase-editor@1`. The gate submits a native-picker value,
observes canonical lowercase `style="color:#rrggbb"` and Rust-state form
hydration, combines it with every peer format in the fixed seven-wrapper order,
and covers Remove, Clear formatting, Undo, Redo, safe copy, formatting-losing
HTML-only paste, Session-V3 flush/reload, and the distinct demo slot. Unit gates
prove the exact RGB24 integer conversion plus descriptor/recipe correlation,
hostile values and style shapes, field/state hydration, and manifest bounds.

This is desktop-engine evidence for one semantic contract, not proof of a
uniform native color-picker UI, keyboard experience, screen-reader
announcement, high-contrast result, or WCAG contrast. CSP `style-src-attr`,
forced-colors modes, user styles, and browser preferences can suppress or
override the visible author color. Text color has no shortcut, and paste does
not preserve the source RGB24 value. See [`TEXT_COLOR.md`](TEXT_COLOR.md).

Alpha.13 moves the React demo and dedicated profile scenario to
`example/size-showcase-editor@1`. The React demo gate now runs in Chromium,
Firefox, and WebKit and exercises the exact native
Small/Large/Huge select, uniform-state hydration, Apply and Reset, the fixed
`data-breditor-integer-token` projection, all eleven controls, and the complete
eight-wrapper chain with Text Size outside Text Color. It also covers one-step
Undo/Redo, Clear formatting, semantic copy, formatting-losing HTML-only paste,
and the distinct Session-V3 persistence slot. Unit gates cover dense exhaustive
option/token admission, descriptor correlation, hostile shapes, canonical DOM,
composition, and clipboard inverse admission.

The WebKit run additionally exercises post-render selection restoration after
formatting, paragraph joins, and history traversal. WebKit may transiently make
anchor/focus disagree with `getRangeAt(0)` after Breditor replaces an owned
subtree. Breditor overwrites that incoherent state only when either complete
endpoint pair independently maps inside the current canonical projection; it
does not accept mixed-pair, one-sided, cross-host, or null-selection evidence.

This proves the closed native single-select and token contract in the tested
desktop engines. It is not a screen-reader announcement, custom-select,
arbitrary-number, exact cross-device typography, mobile, or WCAG-conformance
claim. Arrow-key interaction remains native browser behavior, visual ratios
remain host CSS, Text Size has no shortcut, and paste discards the source step.
See [`TEXT_SIZE_PRESETS.md`](TEXT_SIZE_PRESETS.md).

Run the gate after generating the three public packages:

```sh
export WASM_BINDGEN_BIN=/absolute/path/to/wasm-bindgen
npm run build --workspace @breditor/wasm
npm run build --workspace @breditor/browser
npm run build --workspace @breditor/reference-highlight
npm run typecheck:browser
npm run test:browser
npm run typecheck:demo
npm run test:demo
```

The Wasm package build requires the repository's pinned Rust toolchain and the
matching `wasm-bindgen` CLI. The browser test itself consumes package exports;
it does not import TypeScript source or substitute a JavaScript editor engine.

## Representative Safari accessibility-tree audit

On 2026-09-06, the package-built local harness was inspected through the macOS
accessibility API on arm64 macOS 26.6.2 and Safari 26.6.2. The tree exposed:

- the page heading and a named `Editor controls` toolbar;
- a named Bold toggle with off/on value, plus named Undo and Redo buttons with
  their disabled state;
- a settable text-entry area named `Release gate rich-text editor`; and
- the live status text containing lifecycle, revision, and persistence state.

The editor was focused and edited through accessibility actions, its text was
selected through the accessibility API, Bold was activated, and Undo was then
activated. The observed tree changed Bold from off to on and back to off,
enabled Redo after Undo, retained the editor's name/value, and advanced the
live revision status. This is recorded evidence for native Safari/macOS role,
name, value, and state exposure in one representative environment.

VoiceOver was not enabled for this audit, so no spoken announcements,
screen-reader navigation commands, or rotor behavior were tested. The result
does not extend the support claim below.

## What the automated gate does not prove

An axe pass catches a useful subset of machine-detectable accessibility
problems. It does not certify WCAG conformance or correct announcements and
interaction in VoiceOver, NVDA, JAWS, TalkBack, switch control, voice control,
screen magnification, high-contrast/forced-colors modes, or user styles. Those
remain manual release checks with representative assistive technology.

The clipboard scenarios use real dispatched browser events with a bounded
synchronous `clipboardData` capability. They deliberately do not grant or
claim operating-system clipboard permissions, async Clipboard API behavior,
file/image transfer, or browser chrome integration.

The ordinary Unicode scenario dispatches cancelable `beforeinput` directly so
it can cover non-BMP payloads deterministically. The separate ASCII scenario
uses Playwright's keyboard path for typing, Backspace, and Delete in every
engine. Neither is evidence for arbitrary hardware keyboards, mobile virtual
keyboards, autocorrect, dead-key layouts, or platform text services.

The Alpha.11 primary-modifier scenario uses Playwright's desktop keyboard path
in all three engines and verifies the resulting semantic intent/history work.
It does not prove that every keyboard layout, remapping tool, browser-reserved
shortcut, or assistive technology will deliver the same event sequence. Hosts
must choose `control` or `meta`; Breditor does not sniff the operating system.

The composition scenario exercises the complete native-event/DOM-settlement
path in all three desktop engines, but synthetic composition cannot reproduce
an operating system IME. Japanese, Korean, Chinese, Indic, handwriting,
dictation, autocorrect, and hardware/software keyboard behavior—especially on
iOS/iPadOS Safari and Android browsers—require manual testing on real devices.
Breditor's support claim remains the documented paragraph-local composition
subset, not blanket mobile-IME support.
