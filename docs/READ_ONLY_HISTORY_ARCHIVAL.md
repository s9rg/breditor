# Read only history archival

A former author can archive retained native history while its current policy is
read-only. The operation keeps the same actor, causal inputs, Undo/Redo and
immutable files. It does not unlock editing, reset a writer, import a saved grant
or create an accepted-document or comment event.

The [architecture qualification](qualification/2026-10-21-read-only-history-architecture.json)
passes fresh Rust suites, both normal Wasm producers and 65 selected checks.
Identical source and fresh installed consumers exercise 144 independent native
document/comment configurations and 216 managed document-generation
configurations, including exact cold/future histories, aborted saves and lost
acknowledgements. The subsequent
[SDK/storage qualification](qualification/2026-10-21-independent-history-storage.json)
adds the explicit SDK comment lifecycle and atomic independent history storage;
neither checkpoint qualifies server negotiation or whole-room activation.

This capability closes a lifecycle gap between two existing operations. The
author archive API requires current authoring permission. The strict observer
API requires a zero authored prefix. Neither is a valid way for a revoked former
author to retain further peer input at a full generation boundary. Both old
requirements remain unchanged; the new API is selected separately.

## Native policy and publication

`RichReplica::enable_read_only_segmented_history_guarded` and
`seal_read_only_history_segment_guarded` require the actual current observation
and current document read-only policy. `ReviewSession` has separately guarded
`enable_read_only_segmented_history_guarded` and
`seal_read_only_history_generation_guarded` operations. The document-bound review
adapter checks both genuine owners and every retained anchor. Comment policy is
independent of accepted-document policy.

All ordinary family, identity, nonempty-suffix, capacity, file-link and native
history admission rules still apply. Enabling retains the exact original root;
sealing retains exact prior immutable files and starts a distinct active file.
Current role, observations and local publication revisions are not causal writer
counters. A boundary refreshes live guards without authoring a new input.

Cold recovery takes fresh host policy separately from retained bytes. A later
explicit host regrant can permit future Undo/Redo. Archival itself cannot supply
that regrant, and current writable policy is not read-only archival authority.

## Explicit application capability

Normal application Wasm exposes separate document and review lifecycle version
markers and guarded enable/seal methods. The SDK document facade requires the
complete version-one document capability before offering
`supportsReadOnlyHistoryLifecycle`, `enableReadOnlySegmentedHistory` and
`sealReadOnlyHistoryGeneration`. A missing or future capability refuses before
publication. It is never emulated with a temporary writable policy.

An unmanaged owner must select generations before attaching durable storage.
Old pinned document or paired stores cannot silently change family. The existing
generation session and relay-session wrapper expose `sealReadOnlyGeneration`;
the managed operation uses the privately registered original owner, flushes the
atomic document/comment cut and rechecks live storage custody. Failed and
uncertain saves retain their ordinary exact retry semantics.

The existing managed generation cut still pairs document generations with
original comments. The separately selected
[independent history store](INDEPENDENT_HISTORY_STORAGE.md) can pair either
document family with either comment family. Its explicit read-only document and
comment seals save the exact pair without changing current authoring permission.
The SDK review facade exposes `supportsReadOnlyReviewHistoryLifecycle`,
`enableReadOnlyReviewHistoryGenerations` and
`sealReadOnlyReviewHistoryGeneration`. Old database keys and families remain
unchanged. No server generation profile is negotiated by selecting these APIs.

## Admission and operating limits

Archival keeps the existing bounded native generation formats. It does not add
unlimited retention, compaction, automatic rollover or an eviction policy.
Current transport restrictions, writer recovery, provider authentication and
whole-room activation remain independent obligations. Synthetic storage tests
exercise functional transactions and retry, not physical crash durability.

The review replay validator uses immutable thread/message births rather than
rebuilding a full causal discussion view for every action. Live authority and
visible register materialization still use their original contracts. A preserved
full-prefix oracle checks valid and corrupted histories, and old/new native
checkpoints, event frames, views, clocks and future histories remain exact.
Controlled development timing is diagnostic, not an approved V1 latency envelope.
