# breditor-core

`breditor-core` is the platform-independent deterministic content kernel for
Breditor. It contains no DOM, framework, async-runtime, clock, random-number, or
Wasm binding dependencies.

The current crate exposes immutable validated documents with cached exact
measurements, the fixed base schema used by the first proof, strict versioned
document, singular guarded-operation, exact-base transaction-request,
contextual complete editor-state, replay-proved commit, and bounded durable
session-checkpoint plus replay-identified local-log-entry JSON codecs and
bounded atomic recovery of one supplied genesis-anchored log prefix plus a
compact runtime anchor, checked batch or recoverable one-observation successor
admission with fixed cumulative budgets, repeated cumulative compaction, and a
strict trusted-scope local-log-checkpoint JSON codec plus a checksummed,
platform-neutral one-entry binary frame encoder and allocation-free borrowed
scanner plus an owner-derived active-tail cursor with atomic semantic/physical
progress and recoverable cursor compaction,
UTF-16-safe points and
selections, paragraph-local text splices, atomic transactions, direct-root
paragraph split/join operations, proof-backed local
validation for fixed-base text edits, structural relocation, heterogeneous
change notifications, guarded root-text range replacement with a closed
same-type inverse, exact in-memory undo/redo requests, an immutable typed
action registry, a frozen semantic intent router, and base text-insertion,
paragraph-break, backward-delete, and strong-format actions. Registry
preparation is the authoritative integration path for semantic capability and
execution: it preflights and caches an exact transaction result against one
immutable state.
Intent routing layers explicit priority, disabled fallthrough/block policy, and
unhandled/blocked/prepared outcomes over that same path without accepting
browser-event syntax. Actions produce activation and typed observable values in
that same evaluation, and a frozen catalog derives immutable direct, routed,
undo, and redo state batches without retaining executable preparations. A
synchronous single-observation cache keys complete state plus exact history,
coalesces exact duplicate sources, and emits bounded local
full/unchanged/delta updates. A synchronous `EditorSession` owns exact commit
publication plus bounded deterministic linear undo/redo history and an opaque
history-observation stamp. The strong-format action is the first toolbar-shaped
control: it reports inactive, active, or mixed state, toggles explicit pending
formats at a caret, performs one guarded same-paragraph splice for a local
extended selection, and uses one guarded root-text replacement while preserving
every selected paragraph boundary for a cross-paragraph selection. The typed
text-insertion action consumes that pending override, inherits deterministic
context otherwise, replaces one exact direct-root text range, and offers
adjacent edits to the `breditor/typing` history group. Same-paragraph insertion
stays on the local splice path, while
cross-paragraph type-over uses one guarded root-text replacement.
Extended backward deletion likewise uses one guarded root-text replacement for
cross-paragraph selections while preserving its local splice/join paths.
Cross-paragraph paragraph breaks use the same atomic primitive with two empty
replacement fragments, preserving the retained boundary text as two distinct
paragraphs without a delete/split intermediate.
Operation records retain exact optimistic guards and pass checked constructors
plus active-context limits, but deliberately carry no snapshot, ordering,
selection, metadata, deduplication identity, or transaction boundary. The crate
is intentionally smaller than the eventual editor runtime and has no
action-state subscription/delivery layer, presentation manifest, browser queue,
generic formatting-kind or attribute actions, log storage and tail-wide
recovery orchestration,
checkpoint/log atomic replacement, durable append/acknowledgement,
collaboration transform, or Wasm adapter yet.

Checkpoint-linked one-observation admission is synchronous and in-memory. A
typed rejection returns the unchanged active owner and exact rejected entry, so
the caller can retain and retry it after relevant prerequisites change, or
construct another entry without reconstructing the checkpoint. Fresh genesis
is still a complete-vector boundary; an empty genesis generation can be
compacted to bootstrap this successor path. The core does not queue, schedule,
persist, flush, acknowledge, or rate-limit attempts.

Framed successor observation can instead begin from a checkpoint anchor at
generation-relative byte offset zero. The cursor fixes one frame policy and
derives its context, session, and generation binding from the owned semantic
log. Each consuming call scans and admits at most one frame; applied events and
exact semantic duplicates both advance the byte offset, while clean end,
truncation, corruption, decode failure, and admission rejection do not. The
caller still owns storage and asserts that the supplied slice begins at the
reported offset.

The same cursor can compact through the inherited replay-tombstone policy or
through the explicitly named
`try_into_checkpoint_anchor_with_compaction_limits` reauthorization edge. A
typed failure returns the complete unchanged cursor. Success returns one
`LocalLogTailCompactionOutcome` that keeps the next checkpoint anchor together
with the old generation's accepted-prefix length and retained
`LocalLogFrameLimits`. Those values are runtime metadata, not Local Log
Checkpoint V1 fields, physical tail length, byte provenance, durability, or
proof of EOF; the Frame V1 policy is not a selector for future frame versions.
Successful compaction is explicit host authorization to stop admitting that
generation and may abandon an unobserved suffix, including an incomplete frame
prefix. Starting the returned anchor's successor selects new recovery and frame
limits explicitly, derives a new generation binding, and resets its relative
offset to zero.

Proof-dropping compaction has its own host-selected cumulative replay policy.
The first transition selects it; ordinary rotations inherit it, so a new batch
cannot reset the allowance. An explicitly named transition can reauthorize a
different ceiling only after checking the complete prior-plus-active replay
set. Typed failure returns the complete unchanged owner, while its `Debug` and
`Display` omit the session, history, entries, and document. Local Log
Checkpoint V1 does not serialize this runtime policy; strict decode installs
the codec host's current tombstone ceiling.

Repeated rotation preserves global sequence, complete session history, and all
exact replay tombstones. It rejects reuse of the active or immediately
preceding generation ID. Older generation IDs are not retained by V1, so
lifetime generation freshness, storage sealing, and writer fencing remain host
obligations. If an ancestor came from durable decode, later runtime compaction
preserves that merely structural provenance; it does not authenticate or
causally prove the inherited session/tombstone relationship.
