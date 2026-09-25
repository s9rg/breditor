# Runtime fault containment and WebKit recovery

This is a recovery improvement, not a claim that the original intermittent
clipboard/caret or Link Undo faults have been explained. The separate
[boundary investigation](WEBKIT_ACTION_STATE_REGRESSION.md) retains those
observations and the descriptor transport mitigations.

## User-visible containment

A runtime fault still disables editing and tears down the command queue and
toolbar. The React reference integration now exposes **Download session backup**
for that fault even when autosave is idle, scheduled, or disabled. It instructs
the user to keep the owner open, download before reloading, and use **Recover a
session backup** to open an independent editor.

Export uses the existing Rust-owned Session Checkpoint path. It does not scrape
DOM, retry the failed command, restart the owner, grant storage write authority,
or resolve an uncertain command outcome by guessing. The checkpoint contains
the actual validated session frontier, including typed values, selection, and
retained undo/redo history. Backups include deleted text and must be kept private.
The recovered editor has autosave disabled and cannot overwrite the original
slot. Its changes need another explicit backup before closing or reloading.

If the engine/adapter cannot safely export a checkpoint, the button reports
unavailability and keeps the owner alive. This is not guaranteed recovery from
engine corruption, unavailable Wasm, browser crashes, or a closed tab. A
successful download request is not confirmation that the user saved the file.

## Reproduced recovery blocker

The new demo test deliberately adds uncommitted DOM text and dispatches Undo
in the same synchronous task. Canonical-DOM admission rejects it with
`toolbarDispatchFailed`; no semantic command is retried. This is deterministic
fault injection, not a reproduction of the original unexplained trigger.

Chromium and Firefox could export and reopen the resulting backup. WebKit
repeatedly rejected recovery with `browser_editor.initial_selection_failed`.
Temporary diagnostics narrowed this to `selection.dom_read_failed` while
capturing the previous native selection, before installing the recovered one.

Immediately before Link-form disposal, the focused input and all four native
selection endpoints belonged to that form; the recorded anchor/start were its
label. After removal, WebKit retained
anchor/focus at offset 1 in the empty toolbar mount while `getRangeAt(0)` pointed
at the document root at offset 0. The selection bridge correctly rejected that
incoherent, outside-target selection; weakening that check would be unsafe.

Clearing only the editor host's owned selection did not fix this. Clearing the
form's wholly owned range before removing the form did: three normal WebKit
repetitions passed. A negative-control transform disabling only that form
cleanup restored the same recovery failure. The preserved local traces are
`/tmp/breditor-fault-recovery-selection-failure.zip` and
`/tmp/breditor-form-cleanup-negative-control.zip`.

## Cleanup contract and regression coverage

The internal `clearOwnedNativeSelection` helper uses native DOM intrinsics.
It clears only a single range whose anchor, focus, start, and end all belong to
the retiring subtree. It preserves foreign/cross-host selections, does not trust
own-method shadows, and contains cleanup exceptions so disposal still completes.
It runs before a toolbar form is removed and before a faulted editor host becomes
inert. It does not change Rust selection, history, or selection admission rules.

Tests cover owned/caret/foreign/cross-host teardown, method shadows, fault backup
visibility independent of persistence state, and honest export unavailability
without restart or persistence retry. The real-browser recovery test checks
exact checkpoint re-encoding, typed Link undo and redo, a retained Bold redo
branch, continued faulted status of the original owner, exclusion of injected
DOM text, and a separate fresh reader observing the original saved slot.

Forty focused WebKit main-demo repetitions passed during this investigation,
without reproducing the original spontaneous Undo fault. That negative result
does not close the original issue. The new deterministic regression establishes
the narrower recovery guarantee above.

## Verification and remaining release blocker

The release verifier passed native Rust and real Wasm-target tests, 1,242
TypeScript tests, strict lint/docs/types, clean packed consumers, reproducibility,
all 227 unchanged ABI signatures, and production size budgets. It then stopped
in the browser matrix: 83 passed and one WebKit Link fixture rejected startup
with `browser_editor.engine_bootstrap_failed`, before its interaction began.
The trace is retained at
`/tmp/breditor-webkit-startup-failure-during-recovery-gate.zip`; the harness now
includes the public cause code in this failure message.

An independent 39-case demo run passed 38, including fault recovery in all three
engines, but the WebKit color test rejected startup with
`engine_bootstrap.invalid_profile_descriptor`. Its trace is retained at
`/tmp/breditor-profile-rejection-during-recovery-demo.zip`. Twenty focused Link
runs with diagnostics and three 10,000-read isolated descriptor runs passed
without reproducing the rejection. A subsequent uninstrumented complete browser
recheck passed all 84 cases. Those later passes do not erase either failure.
The final uninstrumented recovery-only matrix passed three repetitions per
engine (9 cases), including byte-exact checkpoint round-tripping and history
recovery. Its runtime was 55.4 seconds under the unchanged test limits.

The full release verifier therefore is **not recorded as passing** for this
checkpoint. The new recovery blocker has a reproducer and negative-control proof;
the intermittent startup and original editing triggers still require explanation.
Startup rejection has no live owner to export, so the runtime backup UI is not
a remedy for it. No validation was relaxed, retry added, or timeout raised.
