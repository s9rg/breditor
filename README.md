# Breditor

Breditor is an experimental, original rich-text editing engine. The name combines
the HTML `<br>` element with “editor.” Other editors are research examples only;
Breditor does not implement their document model, operation format, or plugin
protocol.

This repository currently contains the first end-to-end Rust-core slice:

- immutable, structurally shared document values;
- proof-derived cached document measurements for node count, maximum depth,
  total UTF-8 text bytes, and recursive property-value count;
- a minimal compiled schema for document, paragraph, text, and strong formatting;
- strict versioned document JSON, singular guarded-operation records,
  exact-base atomic transaction-request records, and contextual complete
  editor-state checkpoints, self-contained replay-proved commit records, and
  compact replay-proved bounded session/history checkpoints plus strict
  replay-identified local-log event envelopes and atomic genesis-prefix
  recovery, compact runtime prefix anchors, checked successor-generation
  batch recovery, recoverable one-observation successor admission with fixed
  cumulative budgets, repeated consuming generation compaction with cumulative
  replay retention, and a strict expected-binding durable local-log-checkpoint
  codec plus a platform-neutral Local Log Frame V1 encoder and allocation-free
  one-frame scanner with separate header and payload CRC-32C checks, and an
  owning active-tail cursor that advances semantic admission and a checked
  generation-relative byte offset atomically and compacts without losing its
  accepted-prefix length or retained Frame V1 policy, plus six bounded
  storage-generation identity/version types, distinct database/scope
  incarnation IDs, strict root and rotation codecs with exact nested-checkpoint
  and outer canonical bytes, trusted root/rotation selection normalization,
  byte-exact selected-envelope retention and comparison, and next-rotation
  validation against that normalized selected state;
- root-relative paths, UTF-16-safe points, document-aware point ordering, and
  directional range selections;
- immutable `EditorContext` and `EditorState` snapshots with caller-owned
  lineage identity and monotonic revisions;
- paragraph-local `TextSplice` operations over canonical formatted fragments,
  including source guards, exact inverse operations, and proof-backed local
  result validation with authoritative fallback;
- direct-root base-paragraph `ParagraphSplit` and `ParagraphJoin` operations
  with whole-paragraph guards, exact content inverses, and structural
  relocation laws;
- guarded `RootTextReplace` operations for one- or multi-paragraph root text
  ranges, with complete source guards, multiline replacement fragments,
  same-type closed inverses, and deterministic deleted-point relocation;
- atomic transactions, explicit state updates, relocation maps,
  heterogeneous operation-relative change sets, and typed failures;
- an immutable, deterministic action registry with namespaced identities,
  bounded versioned inputs, exact prepared capabilities, and fail-closed
  extension conflicts;
- a frozen semantic intent router with declared input contracts, named
  bindings, explicit priority and disabled fallback policy, and distinct
  unhandled, blocked, and prepared outcomes;
- one-call action observations that keep availability, active/inactive/mixed
  state, independently versioned values, and conservative effects coherent;
- a frozen observable action-state catalog with presentation-independent
  identities, immutable exact-base direct/routed/history batches, and a
  synchronous single-observation cache with domain invalidation, exact-source
  coalescing, and bounded local deltas;
- semantic `insert-text`, `insert-paragraph-break`, `delete-backward`, and
  `toggle-strong` actions exposed through the same registry for future
  keyboard, toolbar, palette, and API adapters; typed insertion consumes
  pending formats, insertion, paragraph breaks, and extended deletion
  atomically replace cross-paragraph selections, while `toggle-strong`
  publishes tracked inactive/active/mixed state and preserves selected block
  boundaries during cross-paragraph formatting;
- a synchronous `EditorSession` publication boundary with exact-base commit
  acceptance, intent/action execution, bounded linear history, deterministic
  merge groups, atomic undo/redo replay, and durable local checkpoint restore;
- `Commit` helpers that construct lower-level undo and redo transactions; and
- document, fragment, operation-record, and fixed-width per-transaction
  operation limits plus host-configurable aggregate session-checkpoint
  admission budgets, a separate complete replay-tombstone checkpoint limit,
  and an inherited proof-dropping compaction lifetime ceiling whose typed
  failures return the unchanged log owner.

This is still a proof slice, not a complete editor. Structural edits beyond
direct-root base-paragraph text structure, generic formatting kinds and
attributes,
action-state subscriptions and asynchronous delivery, presentation metadata
and plugin lifecycle management, ordered log storage and tail-wide recovery,
checkpoint/log atomic replacement, storage-generation publication and initial
scope provisioning, durable append and acknowledgement,
cryptographic integrity/authenticity, rollback protection, and
crash-tail recovery,
Wasm bindings,
a DOM bridge,
collaboration-aware or selective undo, and generic incremental validation for
structural or custom-schema edits are not implemented. See
[`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md) for the exact contracts and
current performance limitations. Fresh-genesis admission remains batch-only;
hosts that need one-entry admission can compact an empty genesis generation
into its first in-memory successor. That does not provision a storage scope,
authoritative head, or first storage-generation manifest.

Version `0.0.32` implements only the pure validation layer of the proposed
platform-neutral [storage-generation transaction](docs/STORAGE_GENERATION_TRANSACTION.md).
It adds six bounded storage identity/version values, a trusted
ordinary-rotation binding, a private-constructor non-`Clone` manifest,
independent input/output/checkpoint limits, and separate strict
`prepare_rotation`, `encode_rotation`, and
`decode_rotation` operations. Preparation borrows the compaction outcome;
decoding requires an already validated prior manifest; nested Checkpoint V1 and
complete outer bytes must each be their exact canonical encoding. There is no
public seed/bootstrap manifest, storage I/O, capability, receipt, ownership
typestate, compare-and-swap, durability claim, or writable-owner release. The
caller-supplied binding and prior manifest are not authority, and successful
validation cannot prove ID/fence freshness or an empty successor. The
implemented validation-only `breditor/local-log-storage-generation@1` shape
remains a pre-`0.1` contract rather than a permanent compatibility promise.

Version `0.0.33` is contract-only. It freezes one correctness-first
[IndexedDB local-log profile](docs/INDEXEDDB_STORAGE_PROFILE.md): a distinct
canonical initial root selection, O(1) trusted restart selection without a
manifest-chain walk, database and scope incarnations, one authoritative head,
exact-then-retired transaction identity records, permanent generation
tombstones, atomic empty-successor reservation, lost-completion resolution,
revocable per-mutation writer epochs, and independent retired-payload cleanup.
Only IndexedDB transaction `complete` attests historical commit; missing
terminal observation stays uncertain, and `strict` durability remains a
browser hint.

Version `0.0.34` implements the profile's pure Rust value boundary. It adds
distinct bounded database/scope incarnation IDs, a private-constructor
non-`Clone` root selection with separate strict preparation, encoding, and
decoding, independently trusted receipt and generation bindings, and a
private-constructor non-`Clone` selected root normalized from either a root or
one current rotation plus its immediate predecessor. Next-rotation
preparation, encoding, and decoding can validate against that selected summary
instead of retaining a complete manifest chain. The selected value privately
owns its decoded checkpoint anchor and exposes inspection facts only. The
selected-aware actions are named `prepare_rotation_from_selected`,
`encode_rotation_from_selected`, and `decode_rotation_from_selected`.

Version `0.0.35` closes the selected-envelope identity gap. The non-`Clone`
selected root now retains its complete checked selected binding together with
the byte-exact canonical current selection and, for a rotation, its byte-exact
immediate predecessor. Public inspection exposes borrowed current/predecessor
receipt bindings and exact byte lengths, while the retained raw selection JSON
remains core-private. `validate_exact_selection_envelope` publicly compares
caller-supplied bytes without parsing, canonicalizing, or hashing them. Its
typed failures, and the selected root's `Debug`, reveal no raw selection or
checkpoint JSON, document content, or session-state payload. `Debug` may still
show bounded identity values such as the session ID. Retained selection receipt
bindings remain caller-supplied validation facts, not commit evidence.

Here O(1) means constant in rotation-history length, not constant bytes.
Rotation normalization still reads bounded current and immediate-predecessor
selection bytes and strictly decodes both nested checkpoints; the current
checkpoint is decoded again to retain its anchor. The selected root additionally
keeps up to two complete canonical selection envelopes, each of which may embed
a full checkpoint. Work and retained memory may therefore scale with those byte
limits and with both checkpoints' document/session sizes. This release performs
no IndexedDB, JavaScript, Wasm, or other storage I/O; proves no compare-and-swap,
head currentness, global ID/fence freshness, generation emptiness, writer
authority/epoch, durability, commit evidence, or ownership release; and does
not provision a database, scope, head, or generation. Exact byte equality is
not storage currentness or authority. The profile's per-mutation epoch remains
revocable and therefore cannot itself release a long-lived exclusive Rust
writer. All storage V1 shapes remain unstable pre-`0.1` contracts rather than
permanent compatibility promises.

## Development

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps
cargo check --workspace --target wasm32-unknown-unknown
```

The open-source license is intentionally not selected yet; MIT versus Apache-2.0
remains an owner decision.
