# Local Log V3

Status: experimental Rust API, implemented in the unpublished 0.3.0-alpha.14
source checkpoint.

## Explicit wire contract

The format names and canonical field order follow V2. Each new outer codec
accepts and emits only format version 3:

- Local Log Entry V3 has format, formatVersion, schema, schemaFingerprint,
  sessionId, logId, sequence, replayId, and event. Commit, undo, and redo
  events embed Commit V3 exactly. CloseHistoryGroup and ClearHistory carry
  their schema binding without a commit.
- Local Log Checkpoint V3 has format, formatVersion, schema, schemaFingerprint,
  sessionId, checkpointLogId, successorLogId, coveredThrough, replayTombstones,
  and sessionCheckpoint. The nested session is Session Checkpoint V3 exactly.
- Local Log Frame V3 retains the magic bytes 89 42 52 44 54 4c 0d 0a and
  28-byte big-endian header: eight-byte magic, u16 version, u16 zero flags,
  u64 payload length, u32 payload CRC-32C, and u32 header CRC-32C. The header
  checksum covers its first 24 bytes; payload checksum covers the exact
  UTF-8 Entry V3 JSON bytes.

Document V2 remains the nested document format through Editor State V3.
Existing V1/V2 types, bytes, error codes, and generation routing remain frozen.
No decoder negotiates, converts, or retries another generation.

## Admission and resource policy

JSON limits are checked before parsing. Strict outer shape and schema selector,
then fingerprint, are checked before reconstructing nested values. Every
nested codec checks the same complete runtime context and durable binding.
Checkpoint session/log identities must match independently supplied host
expectations. The claimed identities in JSON grant no authority.

The frame scanner borrows input without allocating a payload. Header checksum
validation precedes version, flags, payload limits, platform length checks,
payload availability, and payload checksum. Semantic decoding rechecks the
receiving codec's limits, UTF-8, Entry V3, trusted session, and active log.
The effective payload limit is the smaller of the frame policy and context
JSON policy. All length and offset arithmetic is checked.

## Owned tail and replay

LocalLogCheckpointAnchor::begin_successor_tail_v3 creates a
LocalLogTailCursorV3 at byte offset zero with owner-derived schema, session,
and active-log bindings. try_observe_frame consumes at most one frame from
the exact accepted origin. Only scan, decode, and semantic admission success
jointly advance the cursor. An exact duplicate advances physical bytes and
observation count without reapplying its event.

End-of-input and truncation return the unchanged owner; retrying truncation
requires the whole accumulated prefix at the same origin. Every failure
returns the unchanged cursor. Admission failure also retains the decoded
entry. Failure and frame diagnostics omit document payloads.

Compaction preserves the session, history, frontier, cumulative replay
tombstones, limits, and binding. LocalLogTailCompactionOutcomeV3 also retains
the accepted physical prefix length and statically identifies Frame V3.
A successor starts at offset zero. Reauthorization changes only the tombstone
lifetime limit.

Runtime LocalLogEntry, LocalLogRecovery, ContinuedLocalLog, and checkpoint
anchors remain wire-neutral. Their equality/replay checks include complete
typed properties, but an already-decoded runtime value does not prove its
source wire version. A host must explicitly select the codec and tail family.

## Limits of this checkpoint

CRC-32C detects accidental corruption; it does not authenticate data. Scanning
empty input proves neither durable EOF nor storage freshness. A decoded
checkpoint proves structure and trusted binding, not shared causal history
between the session, frontier, and tombstones.

At alpha.14, Storage Root and Storage Generation remained V1/V2. Alpha.15 adds
matching [V3 storage envelopes and selected-storage paths](STORAGE_V3.md).
V1/V2 preparation still cannot accept a V3 tail outcome. Publication, writer fencing,
append queues, and executable adapter I/O require their own integration work.
Browser autosave continues to persist complete Session Checkpoint V3 through
its existing IndexedDB profile. This Rust addition exposes no new Wasm method.

Tests cover typed properties through entries, frames, tail admission, repeated
compaction, checkpoint restoration, and both history directions; exact
canonical bytes; cross-generation rejection; malformed bindings and shapes;
checksums, every truncation cut, and byte/tombstone limits.
