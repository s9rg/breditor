# Native clipboard qualification fixture

This opt-in fixture addresses the gap between controlled `ClipboardEvent` tests
and a person's native browser Copy/Cut/Paste workflow. It is test tooling, not
a shipped editor feature or a declaration of Safari/iOS support.

## Start a disposable run

```sh
npm run demo:clipboard
```

Open `http://127.0.0.1:4185/manual-clipboard.html` in the browser being evaluated.
Port 4185 is separate from the React demo at 4182 and the automated harness at
4173. The command binds only to loopback and does not open a browser or touch
the clipboard. It builds the packages first; avoid running another package
build while a test or demo is using those same generated files.

The manual command and ordinary automated harness use `vite.browser.config.ts`
to scan their three entry pages. Optional diagnostic subdirectories keep their
own Vite configurations and plugins; they are not pre-bundled by this server.

Use the seeded non-sensitive sample. Follow the on-page sequence: native Copy,
Cut, immediate caret movement/typing, toolbar Undo/Redo, native Paste, then Link
apply/Undo/Redo with Highlight preserved. Paste copied/cut content into the
scratch textarea or a separate app to verify the exact text. Only check each
observation after actually inspecting it. Test backward ranges and additional
native menu/keyboard paths in separate runs. Save the report before reloading.

**Your Copy/Cut commands replace your system clipboard.** The fixture itself
does not call `navigator.clipboard`, `execCommand`, or automate native clipboard
shortcuts. There is no persistent storage, autosave, upload, or automatic report
download. Reload discards the disposable document, checks, and recording.

For each saved run, separately record the git revision and dirty-worktree state,
OS/browser version, input method, range direction, and command method used. The
report includes browser-reported user-agent/platform, but does not establish an
exact build identity or distinguish retail Safari from automation by itself.
A physical iOS device cannot reach the Mac's loopback address; testing there
requires a separately prepared private test endpoint. The iOS Simulator on the
same Mac reached this loopback fixture in the recorded run. This command does
not expose the harness to a LAN or deploy anything.

## Recorded native observations

The [October 1 consolidation record](qualification/2026-10-01-consolidation.json)
adds fresh Safari 26.6.2 and running Chrome (user-agent major 152) checklists
against the release-verified runtime. Each browser independently replaces a
different scratch clipboard sentinel with Copy and Cut, round-trips cut and
typing separately, pastes once, and preserves Highlight through Link history.
Both end operator-confirmed with six events, no fault, and no dropped/pending
records. Installed Chrome metadata is 154.0.8037.93; the running process was not
restarted or relabeled as the installed version. Simulator coverage is partial,
and native CJK IME/physical-device coverage remains unverified.

The [September 26 integrated-runtime report](qualification/2026-09-26-safari-integrated-clipboard.json)
repeats all six checks in Safari 26.6.2 on the rebuilt runtime, without the
candidate transform. The editor stays live through native Copy/Cut/Paste,
immediate caret movement and typing, separate cut/typing Undo and Redo, and
Link apply/Undo/Redo with Highlight retained. Its four recorded events include
one trusted Copy, Cut and Paste each; there is no fault or dropped/pending event.
The [integration record](qualification/2026-09-26-boundary-runtime-integration.json)
identifies the exact build and native URL. This is a fresh bounded checklist,
not a relabeling of the earlier candidate run or blanket browser certification.
Only fixture text was used; the system clipboard was left containing Breditor.

The [September 26 boundary-candidate run](qualification/2026-09-26-clipboard-boundary-qualification.json)
adds a bounded **Safari 26.6.2** checklist on the opt-in exact decimal-round-trip
build. Copy and Cut were verified by pasting the selected fixture prefix into
the scratch field; Paste inserted once in the editor. Immediate caret movement
and typing, separate undo/redo of cut and typing, and Link URL undo/redo with
Highlight preserved were visibly checked. The
[redacted recorder report](qualification/2026-09-26-safari-normalized-clipboard.json)
ends live and operator-confirmed, with no fault, pending or dropped event.
An initial accessibility-selected Copy lacked visible scratch confirmation;
the later keyboard-selected Copy provided the behavioral proof. Neither event
was removed from the recorder. This is one candidate run, not native Chrome,
physical-device, IME or sustained-intermittency qualification.

The [September 25 native run](qualification/2026-09-25-native-clipboard.md)
includes operator-confirmed reports from installed Safari 26.6.2, the
iOS 26.5 Simulator, and installed Chrome (reported major version 152).
Physical-device qualification remains pending. The record separates verified behaviors, uncompleted checks,
and automation limitations; it is not blanket platform certification.

## Evidence contract

The fixture independently opens the public Rust/Wasm browser editor with the
ReferenceFormatting profile, without importing the automated harness entry
point or its synthetic target-range shim. No production package, durable format,
validation policy, retry policy, or size ceiling is changed.

The recorder captures only editor-host copy/cut/paste, beforeinput/input, and
composition start/end metadata:

- Ordered sequence, event kind, `isTrusted`, and allowlisted input type. Unknown
  input types are recorded as `other`; input text is never read by the recorder.
- Owner phase, fixed public fault reason, and revision before dispatch and at
  settlement. Settlement runs in the next task: microtasks in a native capture
  listener can run before later event listeners. The settled state may include
  other events from the same task, so it is not a per-event commit attribution.
- Final cancellation state, pending count, and trusted clipboard event counts.
  A temporarily retained event reference is released after settlement; no event
  or data-transfer object is included in the report.
- Self-reported checklist values and the first observed owner/startup fault.
  The first fault survives later status changes and recording truncation.

The newest 256 event records are retained. Evicted records increment an explicit
dropped count; truncation cannot produce an `operator-confirmed` result. Reports
remain available for incomplete runs and faults. An operator-confirmed run
requires a live owner, all checks, at least one trusted editor copy/cut/paste
event each, no pending settlement, no dropped events, and no observed fault.
**It is not automatic certification:** trusted events may also come from browser
automation, checklist observations are self-reported, and one run cannot prove
all clipboard paths or the absence of intermittent WebKit faults.

Reports exclude clipboard contents, input data, scratch content, document HTML,
Link form values, and document/history exports. Owner faults are observed via
the public subscription, including faults from toolbar or selection handling
outside the clipboard events. Capture the redacted report with the button and
inspect it before sharing. Browser identity and revisions are still metadata.

## Automated checks are separate

```sh
npm run build
npx playwright test tests/browser/manual-clipboard.spec.ts
```

These tests use controlled clipboard objects only, prohibit Clipboard API
access, and never issue native clipboard shortcuts. A separate keyboard-typing
case verifies native beforeinput cancellation after dispatch, without a shim.
They verify real core
cut/paste/history behavior, report redaction, synthetic-event non-qualification,
recording bounds, and model-level pending/fault/checklist status. Model-injected
trusted flags test recorder logic; they are not evidence of native clipboard
behavior. The ordinary browser matrix includes these fixture checks.

## Headings/lists: separate human input checks

The experimental list fixture now includes a collapsed **Separate OS input and
screen-reader checks** section below the scratch textarea. It reuses the same
disposable editor; it does not add a recording system or change the meaning of
the clipboard report. The section can be opened with keyboard focus and Enter.

First establish a working control outside Breditor: actual IME preedit/commit in
the plain scratch textarea, or audible VoiceOver navigation in browser chrome.
Only then test heading/bullet/numbered editing, commit/cancel, exact Undo/Redo,
and toolbar/Link focus. Record observations separately, along with the browser,
input method and candidate Wasm hash. Restore every temporary system setting.
Use the main demo separately for autosave/reload/recovery. Merely installing an
input source, enabling a switch, inspecting an accessibility tree or observing
trusted events does not qualify either gate.

The October 4 follow-up could not observe VoiceOver command handling even in
Apple's tutorial. Its final app inventory reported VoiceOver and the temporary
tutorial not running; the last readable switch was off, but a fresh complete
settings window became unavailable. See the
[control follow-up](qualification/2026-10-04-voiceover-control-followup.json)
for exact limits and the isolated human-test preview. Neither IME nor VoiceOver
is qualified by this attempt.
