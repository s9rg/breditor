# Preserve native history across generations

Segmented history is an explicit Rust document-recovery contract. A generation
boundary preserves the current selective Undo and Redo stacks, original native
operation identities, pending causal inputs, selection and pending formats. It
does not replace the document with its visible AST or clear history to make a
smaller checkpoint.

The optional Wasm/SDK exposes explicit selection, seals and recovery, with
[dedicated local storage](SEGMENTED_SESSION_RECOVERY.md) for document generations
and paired comments. Generation-aware relay delivery and retained review stores
have their [own integration](SEGMENTED_RETAINED_RECOVERY.md). Independent comment
history rollover, assets and operational participant bindings, and room-wide
activation remain work. This is not the completed whole-room cross-generation bridge.

## Select the separate recovery family

Configure the existing range or document-selection scope, natural typing,
authenticated reviewed history and search history before enabling segmentation.
Those choices remain pinned to the original recovery family. Segmentation does
not silently enable a capability or migrate an old checkpoint format.

```rust
// `owner` is an admitted RichReplica with host-authorized writer ownership.
// Configure optional capabilities before this boundary.
let observed = owner.observe()?;
owner.enable_segmented_history_guarded(
    &observed,
    "generation-root".into(),
    "generation-active-1".into(),
)?;
let saved = owner.segmented_checkpoint()?;

// After at least one journal entry, explicitly close the active generation.
let observed = owner.observe()?;
owner.seal_history_segment_guarded(&observed, "generation-active-2".into())?;

// Reacquire this exact writer's exclusive lease before restoring or publishing.
let restored = profile.restore_segmented("room", &saved)?;
```

Enabling and sealing invalidate previous observations without authoring document
operations. Both close the runtime natural-typing continuation. They preserve
the original grouping of already retained entries; they do not combine typing
across a generation boundary. Cold recovery likewise starts without a live
typing continuation while retaining previously grouped Undo items.

Generation IDs are opaque, valid and lifetime-distinct within the retained
chain. They are not sortable clocks, writer credentials or provider receipts.
Repeated enable, empty seals, reused IDs, stale observations and read-only
calls to these writable APIs refuse without changing the original checkpoint.
[Observer-only sealing](SEGMENTED_OBSERVER_RECOVERY.md) is a separate capability:
it requires read-only policy and a zero authored prefix, and never unlocks editing.

## Retain the original replay inputs

The new outer format is `breditor/shared-segmented-history-session`, version 1.
It contains the exact canonical old-family checkpoint as its root, exact sealed
segment strings and one active segment string. Each segment uses the separate
`breditor/shared-history-segment` version 1 format. It binds its generation and
global entry offset to its parent's identity and SHA-256 hash.

The root selects its original profile, schema and capability-specific factory.
Cold restore first admits that exact root, then replays every retained command,
remote input, original native effect and typing join in order. Saved UI is
restored at the precise generation cuts. Hash links are not a substitute for
semantic replay: a changed native effect still refuses when the attacker has
recomputed the surrounding hashes.

Old checkpoint getters refuse a segmented owner. Old restore factories refuse
the new outer format. Existing journal, transport and profile format meanings
are unchanged. The active in-memory journal remains a complete flattened input
history, so existing native reference and ownership checks retain their basis.

## Stage independent native owners

New-mode mutations stage an independently owned native document and history.
Mutable Undo and Redo transform rows, container remaps, metadata and history
cursors cannot be shared with the live source. The fork preserves default text
style configuration as well as named styles; future native Redo must reproduce
the same provenance operations, not merely equal visible text.

Pending causal inputs are not all part of the applied operation log. Staging
therefore re-admits every retained input before comparing the native applied
state and operation versions. Missing dependencies can arrive after sealing
and cold recovery. The original input bytes remain retained until then.

Only segmented owners opt into retaining the exact last closed native group
for a subsequent typing-stage fork. Reopening checks the applied cut, local
counter end and top history span. Reentrant, paused, detached, uncommitted or
mismatched sources refuse. Ordinary owners retain their original staging path.
Cold restore uses complete semantic replay rather than the live-fork path.

## Refuse capacity without losing history

Each original root and individual segment keeps the existing maximum of 1,000
entries and 16 MiB of JSON. The new archive has its own maximum of 64 generations
including root and active, and 64 MiB including JSON escaping. An application
must seal before appending beyond the active entry budget; rollover is explicit.

The existing native maximum of 1,000 Undo items is not raised. A new independent
edit that would evict an older item refuses atomically in segmented mode.
Reviewed-history, causal-view, transport and document limits also remain in
force. Reaching any retained-history budget requires an explicit future product
decision; this API does not prune history or silently start a fresh writer.

Segmentation is bounded retention, not unlimited document lifetime, operation-log
compaction or garbage collection. It retains the original root and every sealed
input. It does not promise faster replay or smaller total storage.

## Verify continuity without granting authority

`verify_segmented_recovery_origin_guarded` checks actual admitted native owners,
not caller-provided summaries. A legacy origin must lie within the retained
original root. A segmented origin must retain the same exact root and sealed
files, its original active generation ID and an exact native input prefix.
Equal visible content is insufficient.

This check grants no current lease, account access, authenticated review
decision, network acknowledgement or permission to activate a generation.
The host must separately fence the exact writer, bind the current room and
provider, persist files without overwriting competing work, publish a durable
generation pointer and coordinate document, comments, assets and offline
participants. Restoring a document does not restore current editing permissions.
These integration and activation obligations remain open V1 gates.

## Native functional checkpoint

The [native qualification](qualification/2026-10-19-segmented-native-history.json)
passes 650 shared Rust checks, strict lint and documentation checks, and nine
existing application-runtime regression stages. The fresh official shared Wasm
matches the prior runtime across 144 original-family configurations, 288
cross-version restores and 2,880 future Undo and Redo steps. These comparisons
qualify existing formats at that native-only checkpoint. The separate application
and local-storage contract is described in
[segmented session recovery](SEGMENTED_SESSION_RECOVERY.md).
