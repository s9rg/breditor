# Native typing history and integration contract

The local Rust owner can combine adjacent user typing into natural Undo units
while preserving every original edit record, revision and inverse. The native
local implementation is available; shared grouping, Wasm commands and browser
integration are still required before natural history is a product feature.
Existing owners, checkpoints and browser defaults retain explicit history.

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

## Remaining integration requirements

Shared grouping must preserve author-owned causal contributions and the original
model/journal meanings. Its native aggregate Undo/Redo needs staged atomic
publication, bounded group membership, exact recovery and remote-text/format
retention, including hidden or deleted contributions. Underlying wall-clock
merging must remain disabled. A separately versioned history envelope must keep
causal update frames and the original replay journal intact.

Wasm needs a separate additive capability, exact guarded commands, frozen history
counts and explicit grouped recovery. Millisecond hints must cross the bridge as
canonical decimal strings, not a new large-number getter protocol. Older owners
must reject requested grouping without a TypeScript history fallback.

DOM integration must route only appropriate `beforeinput` user events to the
native typing/deletion APIs. Paste, replacement, composition and hard breaks stay
explicit. Blur, pointer/navigation intent and toolbar commands need real history
boundaries even if the resulting logical caret happens to be unchanged. Queue,
read-only and asynchronous intent guards must remain effective.

SDK/React integration must make initial history configuration and checkpoint
recovery explicit, retaining the same native owner through ordinary renders.
Final public default/API decisions remain part of V1 distribution preparation.
Installed local/shared V1/V2 tests must cover real keyboard bursts, time gaps,
deletions, formatting/paste/composition boundaries, exact reload, offline peer
edits and future selective Undo/Redo in all three browser engines. Native-only
tests do not complete that acceptance.
