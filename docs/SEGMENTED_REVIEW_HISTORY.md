# Independent native comment generations

`ReviewSession` has an explicitly selected native history family for retaining
comments across independent generation boundaries. A seal preserves original
events, actor counters, native prefix digests, author-local Undo/Redo and every
retained anchor. It does not replace discussions with their visible projection,
clear history or change accepted document content.

The native implementation and normal application Wasm pass the
[functional qualification](qualification/2026-10-20-native-review-generations.json),
including fresh offline public archives. Atomic SDK storage, relay negotiation
and participant/room integration remain separate work. The original review
checkpoint and event-frame meanings and defaults stay unchanged.

## Select and seal explicitly

Call `enable_segmented_history_guarded` with the actual current review
observation, an original-root generation ID and a distinct active generation ID.
The current policy must permit authoring. The boundary retains the exact
canonical original `breditor/review-session` checkpoint as its immutable root.
It authors no event, changes no actor/principal/document binding and invalidates
the old observation only after complete native admission succeeds.

After admitting native inputs, `seal_history_generation_guarded` closes the
nonempty active suffix and starts a lifetime-distinct empty generation. Original
actions, peer contributions and visibility events keep their native identities.
The new boundary does not create a document action or a review Undo item.
Empty seals, stale observations, reused/malformed IDs and capacity failures
refuse without changing the live owner.

Currently read-only owners with a zero authored prefix use the separately named
`enable_observer_segmented_history_guarded` and
`seal_observer_history_generation_guarded` methods. Receiving peer events can fill
an observer's generation; sealing them does not unlock authoring. A current
policy change remains a separate host-authorized operation, not a grant read
from stored files. Immutable observer transport restrictions remain obligations
of the corresponding adapter.

Former authors whose current policy is read-only use separately named
`enable_read_only_segmented_history_guarded` and
`seal_read_only_history_generation_guarded` operations. They preserve a nonzero
authored prefix and future native history without borrowing an author grant or
pretending to satisfy the strict zero-authored observer contract. This
[read-only lifecycle](READ_ONLY_HISTORY_ARCHIVAL.md) is qualified in native and
normal Wasm consumers; independent SDK comment storage remains separate work.

## Retain native files and replay every cut

`segmented_checkpoint_json` returns
`breditor/review-segmented-history-session` version 1. Its outer record retains
the root generation ID, exact original root string, immutable sealed strings
and one active string. Each `breditor/review-history-segment` version 1 binds
its generation, predecessor generation and domain-separated file SHA-256,
global event offset, complete newly appended events and that cut's exact local
history/cursor.

Append order remains causal and actor-contiguous. Late concurrent peer inputs
are appended to the current generation; they never reorder a sealed file.
Materialization still uses deterministic native causal ordering. Actor event
hashes, counters, dependency closure and original principal bindings are
validated across generation boundaries, not restarted at each file.

`restore_segmented_json` takes an independently chosen document/schema binding
and fresh current actor policy. It strictly admits the original root, verifies
every file link and offset, and natively validates each retained event and
author-history cut. A hash-valid file with an invalid action, fork, broken causal
frontier or forged Undo/Redo partition still refuses. Saved access permissions
are absent. Matching file hashes alone are neither native replay nor authority.

The old `checkpoint_json` getter refuses segmented owners. The old restore
function refuses the new outer format, and the new restore refuses the original
format. A prepared native batch likewise has a separately named
`segmented_checkpoint_json` getter. Event frames and batch receipt digests retain
their original native meaning; selecting generations does not itself make an
older client or server capable of retaining a longer stream.

## Preserve actual source continuity

`verify_recovery_origin_guarded` still requires two genuine native owners with
current observations and matching binding/actor/principal. A segmented current
owner retains an original-family origin inside its exact original root. A
segmented origin additionally requires the same root ID/string, unchanged
sealed-prefix files and its active event prefix in the same retained generation.
Equal visible discussions or a re-sliced event set cannot replace those files.
Verification imports no event and grants no current permission.

Mutable staging copies own their event/history buffers. Only immutable root and
sealed strings are shared between staged owners. Failed native admission cannot
publish a partly appended batch, replace the live history cursor or acknowledge
new input. The caller still retains/retries missing-dependency frames under the
existing transport contract.

## Keep explicit limits and remaining integration

Original review owners keep their 8,192-event and 16 MiB checkpoint bounds.
Each new generation also retains at most 8,192 events and 16 MiB; the new archive
has a separate 65,536-event, 64-generation and 64 MiB combined ceiling. The
generation count includes root and active, and archive bytes include nested JSON
escaping. IDs are at most 128 ASCII bytes, start with an alphanumeric character
and otherwise admit alphanumerics plus `.`, `_`, `:`, `-`. Frame budgets remain
128 events and 1 MiB. Reaching capacity refuses atomically; rollover is explicit.
No file, event or history item is silently evicted.

These are bounded retention contracts, not unlimited lifetime, compaction or a
replay-speed guarantee. Document and review families are independent choices.
Replay admission uses an immutable birth index, checked against the preserved
full-prefix validator on valid and corrupted histories. Actual live authority
and visible register materialization retain their original implementation.
Atomic SDK heads must select both native owners explicitly; neither local/relay
transport nor a document segment implies segmented comments. The relay also
needs an explicit native document/comment history profile as well as log
generations. Reconnecting offline peers requires compatible capabilities without
resetting their actors or counters.

The opt-in Wasm owner exposes the explicit version-one family through
`review_history_generation_version`, `review_history_family`, the author and
observer enable/seal methods, `enable_segmented_review` and
`review_segmented_checkpoint`. These are native-owner APIs, not automatic SDK
facade selection. Original event frames remain independently readable by an
original peer within that peer's original capacity.

Source and fresh installed consumers each cover 72 author configurations and
six observers, exact root/sealed files, cold recovery under current policy,
original offline peer frames, native receipts, image anchors and future review
Undo/Redo. The qualification also compares exact original-family data in both
runtime directions. Retention bounds are not a measured latency envelope.

Atomic client storage, authenticated relay delivery, complete
provider/client reconciliation, historic-copy decisions and authenticated
whole-room activation remain required. This native contract does not complete
feature parity or close a V1 release gate.
