# Native clipboard observations — 2026-09-25

## Build and scope

Tested the local, unpublished `0.3.0-alpha.22` worktree based on
`64fcee8529fc0784759cf347729de87e79b97853`, including the uncommitted numeric
transport/validation mitigations, plain-paste paragraph admission fix, and manual
clipboard fixture. This is not a test of the clean commit alone. Packages were
the same local build used by the preceding 17-stage release verification and
160-case WebKit clipboard stress run; they were not rebuilt during UI testing.

The fixture was served only at `http://127.0.0.1:4185/manual-clipboard.html`.
Interactions used native application UI, not injected clipboard events,
`navigator.clipboard`, or the automated harness's target-range shim. Only the
disposable seeded sample and test URLs were used. macOS reports version 26.6.2,
build 25G83. No production code, ABI, package version, or size budget changed
in this qualification checkpoint.

## Installed Safari 26.6.2: bounded smoke passed

The [redacted fixture report](2026-09-25-safari-clipboard.json) records an
operator-confirmed run: live owner at revision 28, no first fault, no pending
or dropped events, and trusted Copy ×1, Cut ×2, Paste ×1. All five recorded
events, including one `beforeinput/insertText`, were cancelled and settled
with a live owner. Checklist values are operator observations, not automatic
proof inferred from the trusted flags.

Verified using native double-click word selection, Command-C/X/V, arrow keys,
one-character typing, and the editor's toolbar:

- Copy of `Breditor` pasted exactly into the separate scratch textarea.
- Cut removed that word once. A second cut, after independently copying a
  different scratch sentinel, replaced the sentinel with exactly `Breditor`.
  This distinguishes a successful cut write from reusing the preceding copy.
- Immediately after the first cut, native caret navigation and `!` insertion
  worked near the emoji. Undo twice and Redo twice replayed cut and typing
  separately; a final pair of undos restored the original sample.
- Native paste appended `Breditor` exactly once; undo restored the sample.
- Link apply, Undo and Redo reflected the changed/original/changed URL in the
  form, with Highlight preserved.

An earlier selection-setup attempt was abandoned before this fresh run:
accessibility `selectText` focused the editable but did not establish the
expected range. Native double-click plus explicit selection inspection did.
No abandoned-run content is included in the saved report.

## iPhone 17 Pro Simulator, iOS 26.5: bounded checklist passed

Safari in the Simulator reached the Mac loopback fixture and opened the real
Rust/Wasm editor. Screenshots, rather than a complete web accessibility tree,
were needed to inspect the editor. Observations in portrait and landscape:

- Native double-click selection exposed iOS Cut/Copy/Paste menus. The Copy
  menu was invoked, but its clipboard write was not independently checked
  before the subsequent cut; this first Copy alone was not a qualified result.
- Native menu Cut removed `Breditor` once, leaving the emoji and `clipboard`.
  Arrow-key navigation worked; an explicit Shift-1 keypress inserted `!`.
  Toolbar Undo twice and Redo twice replayed cut and typing separately.
- After restoring the original, native menu Paste replaced the selected
  `clipboard` word with exactly `Breditor`, yielding `Breditor 🙂 Breditor`.
  Undo and Redo round-tripped that replacement, and a final Undo restored it.
- Native menu Paste into the separate scratch textarea produced `Breditor`.
  Because the preceding Copy and Cut used the same word, this does not
  independently distinguish the two writes as the desktop sentinel test did.
- At the initial checkpoint, the visible owner status remained
  `live · incomplete`; Highlight remained visible. The continuation below
  completed the remaining checks in the same fixture session.

The continuation independently seeded the native clipboard from the scratch
textarea with `S`, then copied `Breditor` using the editor's native menu and
pasted over the scratch selection. The result was exactly `Breditor`. Repeating
with a new `T` sentinel and native editor Cut removed the word once and pasted
exactly `Breditor` outside the editor. Unlike the first pass, these checks
independently distinguish each clipboard write from the preceding one.

After undoing the cut, Command-A selected the full sample. Link apply changed
the URL to `https://example.test/changed`; toolbar Undo restored the original
URL and Redo restored the changed URL. The form reflected each value and
Highlight stayed active and visible. Closing the form, focusing the editor,
selecting all and pressing Right positioned the end caret without using the
Simulator's rotation shortcut. Command-V appended `Breditor` exactly once,
yielding `Breditor 🙂 clipboardBreditor`; one toolbar Undo restored the sample.

All six observations were checked after verification. The
[captured redacted report](2026-09-25-ios-simulator-clipboard.json) is
`operator-confirmed`, with a live owner at revision 41, no first fault, no
pending/dropped events, and seven trusted, cancelled, settled events:
Copy ×2, Cut ×2, Paste ×2 and one `beforeinput/insertText`. The report was copied
through the iOS native menu and pasted into the desktop fixture's scratch field
for accessibility-text extraction; this did not modify either editor or the
saved desktop report. The Simulator was returned to upright portrait.

The runtime label says iOS 26.5; its browser user agent reports both
`CPU iPhone OS 18_7` and `Version/26.5`. The report preserves those values
verbatim rather than treating the user agent as independent OS identification.

This is mixed native-menu and simulated hardware-keyboard evidence, not a
complete touch/soft-keyboard run or a physical-device result. Checklist
confirmation is bounded operator evidence, not automatic certification.

Automation constraints were visible independently of editor behavior: text
typing into Safari's address bar produced an incomplete URL; the app paste
helper timed out; setting the address field explicitly succeeded. The helper's
`typeText('!')` did not insert visible text, while explicit Shift-1 did.
Command-Right rotated the Simulator instead of moving the document caret.
Scroll/drag attempts did not move the page; the native next-input control did
reach the scratch field. The continuation found that explicit keypresses could
enter the Link URL, Command-V could paste, and Page Down (`Next`) could scroll
to the report controls. Do not classify the helper failures as core failures
or claim these successful hardware-key routes prove soft-keyboard support.

## Installed Chrome: bounded checklist passed after idle-window confirmation

The dedicated fixture tab loaded with a live owner. The active tab subsequently
changed to the user's existing tab while selection was being prepared. Testing
stopped without sending further keys into that tab. No native Chrome clipboard
pass is claimed; the automated Chromium results are separate evidence.

A later retry following the renewed WebKit investigation was also interrupted
by a user window change during separate-window setup. The isolated Chrome
browser-control backend reported unavailable. Native input stopped and an idle
testing window was requested. This does not indicate a Breditor/Chrome failure.

After the user confirmed Chrome was idle, the local fixture loaded in a New
Tab window and the complete checklist passed. This run preceded the subsequent
selection-u32 candidate change; it used the same pre-candidate packages as the
Safari/Simulator reports. Existing browsing tabs were left unchanged.

Native Command-C copied the keyboard-selected `Breditor` word and replaced
`COPY_SENTINEL` in the scratch textarea with the exact word. Independently
copying `CUT_SENTINEL`, then cutting the same editor word, removed it once and
pasted exactly `Breditor` over that second sentinel. Immediate arrow navigation
and Shift-1 inserted `!` near the emoji. Toolbar Undo twice and Redo twice
replayed cut and typing separately. After restoring the original, end-caret
Command-V appended one `Breditor`; one Undo restored the sample. Link
apply/Undo/Redo reflected changed/original/changed URLs with Highlight retained.

The [saved Chrome report](2026-09-25-chrome-clipboard.json) is operator-confirmed,
with a live owner at revision 38, no first fault, no pending/dropped events,
and four trusted, cancelled, settled events: Copy, Cut, insertText and Paste.
The browser reports `Chrome/152.0.0.0`; this reduced user agent is preserved
verbatim and is not an independently checked full build number. This native
desktop smoke is separate from automated Chromium and does not qualify every
clipboard, IME, accessibility, or cross-application rich-HTML path.

## Remaining release limits

These are bounded smoke observations, not absence-of-failure proofs. They do
not close the older intermittent WebKit startup/caret/DOM-restoration history.
The subsequent [current-production investigation](../WEBKIT_CLIPBOARD_INVESTIGATION.md#renewed-production-reproduction-after-native-smoke)
actually reproduced a no-DOM selection-consumer rejection after 27 green
production runs; the native smoke reports must not be treated as clearing it.
Installed Safari 26.6.2 also failed the unchanged production bundle during
sustained selection testing: nine batches passed before restore 7,082/read 2
of batch ten rejected with `selection.invalid_wasm_view`. See the
[separate native stress observation](2026-09-25-safari-selection-stress.json).
Physical iPhone/iPad, IME and soft keyboard, backward or cross-block native
ranges, cross-application rich HTML, accessibility technology, and sustained
native repetition still need qualification. The scratch textarea checks plain
text only. Simulator success must not be relabeled as real-device success.
