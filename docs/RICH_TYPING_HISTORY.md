# Native typing history and integration contract

The local Rust owner can combine adjacent user typing into natural Undo units
while preserving every original edit record, revision and inverse. The native
local owner now reaches additive Wasm commands and opt-in local vanilla/React
editing. Shared grouping remains unfinished, so the full history feature is
still partial. Existing owners, checkpoints and browser defaults retain explicit
history.

## Native local API

`enable_typing_history(snapshot)` explicitly selects grouping for one owner.
Existing retained edits remain individual units, including a retained Redo
branch. The mode is immutable for that owner's lifetime. Enabling advances the
publication without a content/history entry; repeated admission is a no-op.
First-time enable is forbidden while read-only.

`insert_typing_text(snapshot, text, clock_ms)` accepts collapsed-caret user
insertion. `delete_typing_range(snapshot, target, direction, clock_ms)` accepts
a nonempty same-block span immediately before or after the actual caret.
Reversed target endpoints are supported; the ordered span must touch the
correct side of the caret. Scalar and schema admission still happen in Rust.
The actual pre-edit caret, not the temporary browser deletion target, is saved
for Undo.

`close_typing_group(snapshot)` ends an active burst without editing content or
discarding Redo. An effective close advances the native publication so earlier
queued input becomes stale. Closing an inactive burst changes nothing.
Each mutating API has its own named and documented source file.

## Grouping rules

Input may extend the previous unit only when its direction/kind, stable caret,
effective formats and native context agree. The host supplies a monotonic
millisecond hint. Adjacent events must be at most 750 ms apart and one group
may retain at most 64 original edit publications. Backwards clocks start a new
unit rather than merging or rejecting valid content.

Insertion, backward deletion and forward deletion are distinct kinds. A changed
caret or an effective publication through pending styles, explicit commands,
Undo/Redo or read-only policy closes the active continuation. CR, LF and Unicode line/paragraph
separators are isolated on both sides, including when a deletion crosses them.
True no-ops, including empty typing, do not reset the clock or continuation.
Hosts use the explicit close method when a physical intent should form a boundary
even without a resulting document or selection change.

Paste, composition commit, selected-range replacement, formatting, structure and
other programmatic edits use the existing explicit methods. They remain isolated
units; only the named user-input methods may extend a burst. Browser integration
must not classify every plain-text API call as typing.

## Exact records and bounded recovery

Every keystroke still produces its own admitted explicit history record and
actual publication revision. Grouped Undo checks and applies all retained
inverses before one atomic native publication; Redo checks all forward records
before publishing. A late failure or revision exhaustion leaves the complete
document, selection, cursor and partition unchanged.

`undo_depth()` and `redo_depth()` count user-visible native units when grouping
is enabled. `history_step_count()` exposes the original retained-step count.
The existing history capacity still limits original steps, not groups. Trimming
the oldest record may leave a retained suffix of the first group; grouping never
recovers discarded content or raises the original storage budget. Capacity zero
retains no groups. New authoring after Undo discards the complete Redo branch at
an admitted group boundary.

`RichTypingSessionJsonCodec` uses the separate
`breditor/rich-typing-session` version 1 envelope. It contains an unchanged,
replay-proved rich-local-session version 1 checkpoint and a bounded partition of
original records. Group lengths must be nonzero, no greater than 64, sum to the
retained record count and leave the saved cursor on a group boundary. The entire
envelope uses the original 16 MiB/1000-entry defaults and supports tighter limits.
Duplicate/unknown fields, wrong bindings, invalid replay and bad partitions reject.

The original local codec rejects a grouped owner rather than silently dropping
its partition. It also rejects the new family. The new codec requires explicit
grouping and does not reinterpret old envelopes. This partition declares Undo
boundaries; it does not authenticate past timestamps or physical keystrokes.

Recovery restores exact grouped future Undo/Redo, but deliberately closes the
active typing continuation. New input after recovery begins a fresh burst.
The existing read-only rule is unchanged: policy is not stored permission and
recovered owners start editable until their host reapplies it.

## Local Wasm and SDK integration

The native owner advertises `typingHistoryVersion() === "1"` and guarded
`enableTypingHistory`/`closeTypingGroup` methods. `insertTypingText` and
`deleteTypingRange` use strict `data` records with `clockMs` as a canonical decimal
u64 string. Numeric, signed, fractional, duplicate or unknown fields reject.
Frozen observations expose `historyGrouping: "typing-v1"` and `historyStepCount`
only after admission; original view bytes remain unchanged by default.

`openLocalEditor({host, history: "typing-v1"})` selects the mode explicitly.
Omitted history or `"explicit"` retains existing behavior. The same initial
option works through React `initialOptions`; ordinary parent renders do not
replace the owner. `editor.closeTypingGroup(revision?)` and the React handle
provide explicit host boundaries without inventing a content-change outcome.

New-mode `checkpointJson()` uses the separate typing-session family. Reopen it
with `initial: {kind: "typingCheckpoint", checkpointJson}` and the matching rich
language. This declared initial kind itself selects grouping; combining it with
`history: "explicit"` rejects before claiming the host. Original
`initial: {kind: "checkpoint", checkpointJson}` still uses only the original
factory. Add `history: "typing-v1"` to that original recovery route to enable
grouping while preserving existing entries as individual units. No envelope
shape is guessed, migrated or silently flattened.

Headless profiles expose explicit `restoreTypingEditor`; `restoreEditor` remains
original-only. Older matching runtimes reject requested grouping/recovery instead
of substituting TypeScript history. Native factories, not the JS AST, admit the
checkpoint and every user-input command.

The local coordinator sends ordinary collapsed-caret `insertText` and valid
directional, adjacent deletion targets to the native APIs. Replacement, paste,
composition, hard breaks and programmatic edits remain explicit. Navigation,
pointer/blur and toolbar intent close continuation even at an unchanged caret.
Boundaries update the cached publication without replacing children or moving
focus. Internal rendering does not create spurious blur boundaries.

An asynchronous `focus: false` content edit restores the Rust selection if the
surface already owned focus. This prevents the next key from landing at the root
or first heading after image insertion. An outside host control keeps focus.
Document-level selection events only sync while this editor owns focus: a
temporary range left by background rendering cannot overwrite the Rust caret.
The same fix applies to explicit history; it is not a Rust or engine repair.

## Remaining shared integration requirements

Shared grouping must preserve author-owned causal contributions and the original
model/journal meanings. Its native aggregate Undo/Redo needs staged atomic
publication, bounded group membership, exact recovery and remote-text/format
retention, including hidden or deleted contributions. Underlying wall-clock
merging must remain disabled. A separately versioned history envelope must keep
causal update frames and the original replay journal intact.

The next shared implementation follows these decisions; they are not a current
shared grouping capability:

- Partition actual writer-owned history keys, not command counts or journal
  positions. A remote deletion may make a contribution invisible: one engine
  Undo can consume multiple keys and produce only one opposite-stack item.
- Mirror every popped key, including skipped keys, before assigning the actual
  opposite contribution to a group. Continue through the retained group of the
  last engine-effective contribution, without blindly issuing another call for a key
  already consumed. An entirely invisible newest group follows the existing
  engine policy of searching older history for an effective contribution.
- Stage all required original history operations, preserving each original
  entry and its replay checks, then publish once. A false content-change result
  can still consume invisible history and invalidate the publication guard.
  A truly empty history call remains a no-op.
- Recover the exact live key stacks by original journal replay and separately
  admit a bounded partition over those keys. Keep the new recovery family
  explicit, reject silent flattening, and close active continuation on recovery.
  Do not encode timing hints as causal operations or lease permissions.
- Keep original engine wall-clock merging disabled. Effective remote admission,
  selection/pending-style changes, host policy, explicit edits and history calls
  fence continuation; unchanged retries do not author a new history unit.

`rich_history_visibility_contracts.rs` proves the existing invisible-key behavior
in both shared languages, including a three-key input sequence whose middle key
is remotely deleted. Two engine Undo calls consume all three keys; a naive third
call removes an older unrelated edit. Exact recovered future history and the
false-result/publication distinction are also tested. These are prerequisites,
not acceptance of shared natural typing.

Shared Wasm, SDK/React and DOM integration must carry the same explicit capability,
guarded command/recovery and real intent-boundary principles without weakening
remote queues, read-only or asynchronous guards. Final public default/API decisions
remain open. The shared SDK currently accepts only explicit history and rejects
requests for natural grouping rather than silently substituting explicit history.
Installed local/shared V1/V2 tests
must cover real keyboard bursts, time gaps,
deletions, formatting/paste/composition boundaries, exact reload, offline peer
edits and future selective Undo/Redo in all three browser engines. Native-only
tests do not complete that acceptance.
