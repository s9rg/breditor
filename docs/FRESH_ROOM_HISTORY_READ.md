# Fresh history inspection for seven family rooms

`PhysicalRoomClientOperationV3.readHistory` reads a genuine operational room's
protected history under fresh read permission, independently of an expired or
cancelled recovery job. It combines the seven concrete participant families in
one held read, verifies actual coordinator/catalog records and returns immutable
metadata without handing off writers, uploads or archive ownership.

## Scope and explicit factories

The caller supplies one `{id, read}` choice for each participant selected by the
coordinator, plus a fresh synchronous permission check and optional cancellation.
The SDK selects the actual child owner and family. A caller cannot replace a
participant, select a different source or turn a report into parent custody.
Factories use the existing original, generation or family-specific read-only
session contracts. Their configuration is copied before asynchronous work.

This method requires an operational coordinator, live selected children and no
uncertain coordinator-marker transition. An interrupted coordinator must first
finish or cold-resume under explicit current authority. Native/source pending
states remain distinct and are included by the selected history readers.

The report covers held client history and retained catalog bytes. Reference
addresses do not establish current image-byte availability, registered-stream
coverage or permission to activate a room. Unselected historical catalog copies
remain explicitly unreconciled; hashing their retained files does not replay
their native histories.

## Actual stored bytes

The root intent is read through its existing connection with the fresh grant and
cancellation, without opening, repairing or adopting a stored phase. Its exact
canonical record must match the genuine coordinator's operational state.

The catalog reader checks its actual schema, manifest and file set. Bounded
streaming native digests compare every stored file against the immutable copies
already admitted by this coordinator's archive reader. Each selected genuine
parent then verifies its actual protected records and archives and replays its
historical/current native and packet states through the explicit read factories.
Existing snapshot, flat, graph, original and generation protocol meanings remain
unchanged.

## Reservations and cleanup

The root and all selected parents are held before the first fresh permission or
cancellation callback. Nested original/generation checks use a private pure
held-state fence during preparation and verification; the existing public
busy/reentry behavior is unchanged. Every member is checked again after host
callbacks and detached report construction.

Verification rereads actual stored bytes. Pure currentness checks compare held
custody, observed cancellation and source/record pins; they are not a replacement
for durable-byte verification. The read does not flush sources, settle pending
queues, connect editing transports or release real parent/source/upload leases.

Failure closes partial read borrows. A concurrent root close waits for those
borrows to finish before retiring the real owners. Detached reports retain no
read permission callbacks or restore factories. Subsequent cold recovery and
native document/comment Undo/Redo retain their original semantics.

The combined reader inherits the limits of one to 1,024 parents, 100,000 summed
per-participant reference entries and 64 MiB of history-metadata payloads.
Existing per-record, replay and archive limits also apply. A budget failure
returns no partial ready report and never truncates user data.

## Qualification and next dependency

The [qualification](qualification/2026-10-24-fresh-room-history.json) passes fifteen
selected normal candidate stages. Source, fresh offline packages and actual
production-bundled code each pass the same 1,245 laws, including all 1,230 earlier
laws and fifteen new room-history laws. Twelve strict consumer fixtures pass.
The existing coordinator, native-read and participant contracts also pass their
selected regression stages.

The fresh native producer supplies ten real seven-writer rooms with fourteen
protected document/comment streams each. Six SDK orchestration cases cover all
four independent history pairs, both wire modes and rich languages 1–3; they are
not a new forty-case full-profile matrix. Other laws cover expired root/leaf jobs,
actual intent/catalog/file tampering, fresh permission and factory failures,
reentry, late cancellation, partial rooms, close races, callback release, future
Undo/Redo and whole-upload preservation. Client storage and locks are synthetic;
these results do not certify physical browser crash durability.

Current provider/client reconciliation, fresh registered-stream coverage,
authenticated activation, sustainable history and remaining parity are the next
dependencies. All thirteen V1 gates remain open. Normal Wasm, public-root exports,
versions and original protocol meanings are unchanged.
