# Native typing history and integration contract

The local Rust owner can combine adjacent user typing into natural Undo units
while preserving every original edit record, revision and inverse. The native
local owner now reaches additive Wasm commands and opt-in local vanilla/React
editing. Shared grouping uses explicit native engine spans and a separate
replay family, now exposed through opt-in Wasm, SDK/React and durable DOM sessions.
The full history feature stays partial. Existing owners, checkpoints and browser defaults retain
explicit history.

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

## Native shared groups

The shared Rust owner exposes guarded `enable_typing_history_guarded`,
`insert_typing_text_guarded`, `delete_typing_range_guarded` and
`close_typing_group_guarded` methods, each in its own documented action file.
The same 750 ms, 64-input, caret/style/direction and separator rules apply.
Enabling preserves existing Undo/Redo as explicit units and changes no causal
operation. Recovery closes continuation and restores no read-only permission.

One natural burst is one explicit native engine group, not a loop issuing Undo
once per keystroke. Every input retains its actual forward commands, history key,
before/after UI and expected causal effects. The first group key owns its initial
caret recipe; later inputs extend its cursor span and final UI recipe. Native
Undo/Redo acts on the complete span and publishes atomically once. Actual popped
keys and original input counts mirror both native stacks, including invisible
items consumed without an opposite contribution. Wall-clock merging remains
disabled; no engine/vendor source is changed.

This replaces the earlier proposed repeated-Undo approach. If a peer deletes the
beginning of a burst while its end remains visible, a second engine call could
skip that invisible beginning and undo an older unrelated group. Tracking popped
keys does not prevent that mutation. A single native span retracts the entire
burst before the engine considers another group. An entirely engine-invisible
group retains the existing policy of searching older history for an effective
contribution. Materialized text being absent does not establish invisibility:
format ownership can still produce an effective inverse.

Joined insertion/deletion/format steps require an already prepared permanent
text root. Their preparation is checked to author no operation; the coordinator
never pauses an open group or includes new infrastructure in its span. Effective
selection, pending-style, host-policy, explicit-action, history and remote
publications close continuation. Exact duplicate incoming frames and true no-ops
retain it. Prepared writer admission preserves the same fence and provides a
separate grouped checkpoint method.

### Separate shared replay family

`typing_checkpoint()` and `SharedRichProfile::restore_typing()` use the explicit
`breditor/shared-typing-session` version 1 envelope. It binds the existing causal
model and original journal version, but contains a separately tagged
`breditor/rich-replica-typing-journal` version 1 and bounded join indices. A join
names a local input immediately following another local input; indices are sorted
and unique and cannot cross a remote or history entry. No burst exceeds 64 inputs.
Native replay still checks every saved forward and inverse effect, key and UI.

The new family is necessary because grouped native inverses differ from the old
per-step inverse sequence. It does not claim its inner events are an independently
valid original journal. Original `checkpoint()` rejects an enabled owner rather
than flattening it, and original restore factories reject both the envelope and
its tagged inner journal. Old journals keep their original interpretation.
Enabling an old owner replays its retained original units without grouping them.
Forward event records remain byte-equivalent to explicit authoring up to grouped
history; causal update frames, model semantics and writer lineage are unchanged.

The entire envelope retains the original 16 MiB byte ceiling and 1000 journal-entry
limit. Join collection allocation is bounded, as is journal-entry decoding.
Unknown or duplicate typed record fields, wrong room/profile/model bindings,
invalid partitions and divergent replay reject before exposing an owner. Join
metadata declares history boundaries; it is not evidence of physical keystrokes,
trusted timestamps or authorization. The append-only journal lifetime and storage
compaction work remain unchanged.

`rich_history_visibility_contracts.rs` retains the original explicit-mode
reproductions. `rich_typing_history_contracts.rs` checks the grouped implementation,
including partial/complete invisibility, old forward-record equivalence, exact
future recovery, native step ceilings and atomic late revision failures.

## Shared Wasm and SDK integration

The generated application owner advertises `typing_history_version() === "1"`
and guarded enable, close, insert and delete methods. Insert/delete requests use
closed JSON records with canonical decimal u64 `clockMs` strings; numeric,
duplicate, unknown, signed and overflowing fields reject. Stale observation and
read-only rejection precede payload parsing. Separate `typing_checkpoint()` and
profile `restore_typing()` methods carry grouped recovery. Original factories
remain strict. `SharedRichEditor.supportsTypingHistory()` checks the complete
capability, and `restoreSharedTypingEditor` requires the exact matching factory.
Older runtimes do not fall back to explicit history or JavaScript inverses.

`openSharedEditor({history: "typing-v1", ...})` selects grouping through both
vanilla and React initial options, for either rich language. Omitted history
retains explicit history. The persistent coordinator seals the admitted policy
for its lifetime, so a borrowed core cannot change its checkpoint family behind
storage. Parent renders do not change that policy or replace the React owner.
The session and React handle expose `closeTypingGroup(revision?)`.

`initial: {kind: "typingCheckpoint", checkpointJson}` explicitly selects grouped
recovery. It cannot be combined with `history: "explicit"`. Original
`kind: "checkpoint"` uses only original recovery; an additional explicit
`history: "typing-v1"` enables grouping for future input, retaining old units and
Redo. Failed retirement recovery includes `historyPolicy()` alongside the exact
journal and close/discard handles. Hosts must retain both language and history
family when transferring that recovery to a new store.

### Durable family selection

IndexedDB schema version 1 and room/writer keys are unchanged. Explicit sessions
still store the original exact journal string. Grouped sessions store exactly
`{format: "breditor/shared-typing-checkpoint-record", formatVersion: 1,
checkpointJson}`. This discriminator declares the native restore family outside
its opaque JSON; neither SDK nor storage guesses history from document shape.
Unknown records reject. The old string-only storage reader rejects new records.

Reopening a grouped record requires explicit `typing-v1` configuration. A default
opening rejects before restoring or overwriting it and releases its writer lease.
An explicitly opted-in session can upgrade an existing legacy journal: original
native restore runs first, then guarded enable, then one atomic transaction saves
the grouped record. If that transaction fails, the original durable string stays
intact and the unannounced upgraded owner is discarded. No document-only import
or flattened-history fallback is used.

Persistence subscribes to changed publications, not the Boolean command result.
An Undo that consumes only invisible native history can return false while
changing revision and stacks; that exact new journal must still be autosaved.
Read-only remains a live policy, not a saved permission.

The relay adapter selects this identity check from the native owner's declared
history mode, not from a guessed JSON shape. Original and grouped owners retain
the same room/writer/model and byte-limit checks, writer-stream protocol and
server acknowledgement rules. A grouped local recovery envelope is not a new
relay operation or a reason to bypass identity validation.

### Browser intent and timing

Collapsed-caret insertions and valid adjacent directional deletions use the named
native methods. Paste, composition commit, replacement, hard breaks and
programmatic edits remain explicit. Pointer, navigation, blur and toolbar intent
close continuation without replacing editable children or moving focus. Internal
rendering does not manufacture blur boundaries. Remote queues, composition holds
and exact asynchronous guards retain their existing ownership rules.

The shared coordinator also restores an owned caret after asynchronous content
changes, while preserving outside focus. Document selection events cannot replace
its Rust selection while another control owns focus.

The 750 ms rule applies to actual supplied input hints, including delays caused
by editor processing. Instrumented Firefox runs observed gaps above this threshold
during mixed-document typing/deletion. Such gaps legitimately split history but
remain a responsiveness concern, not a qualified performance result. Browser
tests check boundaries against captured hints; real-Wasm tests separately prove
exact grouping at 750 ms and separation above it. No timing window or release
deadline is raised to mask latency.

Installed boundary tests cover formatting, movement, queued peers during
composition, asynchronous images and React retirement in all three engines.
Sustained responsiveness and the remaining general selection/navigation/interchange
work still govern V1 promotion. Synthetic composition is not physical IME
qualification.
