# Selected local review delivery

Status: SDK-private functional integration, not a public release or a V1 gate closure. The complete qualification record is separate from this contract. All thirteen V1 gates remain open.

## Purpose and unchanged meanings

The independent-local, local-operation-snapshot and local-operation-flat families retain exact independently selected document/comment histories, but their original formats are genuinely unbound. Matching an actor, principal or writer in an inventory is not authenticated adoption.

The new SelectedLocalReviewDelivery coordinator is an explicit opt-in layer over the same constructor-owned sources and native reservation. It does not relabel those old families, add fields to their heads, alter transport defaults, manufacture credentials or mark the room active. The original adapters still authenticate the account, resume the actor lease, verify server/native prefixes and check each actual batch receipt.

## New data contracts

The breditor/selected-local-review-delivery choice selects one new receipt database, the literal complete whole-room before-file, and every actual local review lane. Each lane records its original family, independent native identity and an explicit nonsecret relay binding. Omission, duplication, changed identity and credential fields are refused.

The receipt database has one state store and exactly two canonical records: before and current. Before is immutable. Current contains the complete committed document/comment checkpoint pair, all retained native versions and review progress/receipt for every selected local lane. Document receipt fields remain null: this layer does not invent a document ACK from local persistence. Original nested native limits remain enforced; the complete two-record snapshot additionally has a one-GiB budget. Budget refusal never trims native history.

Each progress write first settles the genuine constructor-owned source save, reads the exact committed pair, checks the actual native prefix/receipt, and atomically compares every previous stored byte before replacing current. Metadata writes are serialized. A receipt callback does not wait on its own adapter's quiescence. Failure after a database commit leaves the committed fact readable; it does not grant permission or install an early in-memory ACK.

The breditor/selected-local-review-room-bundle is deliberately not an old SelectedRoomCurrentFile. Its mandatory multipart slots are the original prepared whole-room file and choice, the exact current whole-room native/packet/upload file and selection, and the entire two-record delivery snapshot with byte length/SHA-256. Persist all slots together. Extracting only current is an old-format snapshot, not a complete backup of this new layer.

## Fresh cold recovery

The separate breditor/selected-local-review-delivery-resume choice pins the original delivery identity, supplied portable bundle, actual stored head revision/length/SHA-256, current whole-room selection and genuine full native server path. Resume reads existing namespaces only, checks the current inventory/provider through authenticated native controls, replays both native lanes and immutable versions, and requires a fresh host decision. It repeats inspection after the decision. A changed head cannot be silently substituted for the head that was approved.

A valid portable bundle may precede a newer committed receipt record, including when a later complete export failed after commit. Recovery requires the same immutable before record, forward receipt/cursor laws and actual native continuation from the portable state to the newer stored state. Equal counters, a shared ancestor or equal final text are insufficient. The newer state must also remain covered by the genuine current sources. A one-shot same-scope admission then creates a new gate anchored at the inspected current cut; it never rewrites or revives the original before-file or old runtime permission.

Source and readonly replay factories are constructor-selected. Readonly factory waits are cancellation-aware and retire late unclaimed Rust results. New gates own cleanup before any post-consumption callback. Complete export stops and drains real adapters; Close waits for actual source/receipt/export work and late completion callbacks before releasing the new namespace. Reentrant authority callbacks cannot construct parallel adapters or exports.

## Deliberate boundaries

A separate [data restoration entry point](SELECTED_LOCAL_REVIEW_RESTORE.md) now implements absent-or-identical restoration of the two metadata namespaces at their original names, followed by separately approved normal resume. Complete empty-room source restoration and relocation remain separate requirements. It is not a complete proposal/revision/version outbox transport, full provider/client reconciliation closure, joint authenticated whole-room activation, stabilized public API, physical IndexedDB crash-durability qualification or cross-device actor fencing proof. Original room reconciliation correctly continues to report the old local families as unbound; its reports are not patched to claim settlement from this new metadata alone.

The native functional workflow uses the real service and normal Wasm, seven actual source families and all three local review families, fresh approvals, cold native owners, outstanding offline document/comment suffixes and future Undo/Redo. Browser storage/locks are controlled Node fixtures, not physical browser evidence. The separate installed-consumer command packs actual archives, installs from the producer lock offline without workspace links, and executes the same workflow. Whole candidate profiles must still be executed and all remaining gates satisfied before V1.
