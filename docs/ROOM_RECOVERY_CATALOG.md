# Durable room recovery catalog

The opt-in collaboration SDK retains a selected native server bundle, its
participant inventory and every supplied client backup in one durable catalog.
It stages explicitly chosen participants with their original native histories
and whole upload stores, keeping their editors private and read-only. A checked
result describes selected sources; it does not authorize room activation.

## Capture files before writing a catalog

```ts
import {
  captureSharedRoomRecoveryCatalog,
  SharedRoomRecoveryCatalog,
} from '@breditor/collaboration';

const archive = await captureSharedRoomRecoveryCatalog({
  catalog: 'recovery-2026-10',
  inventory: {file: inventoryFile, expected: trustedNativeInventoryIdentity},
  server: {file: serverFile, expected: trustedServerFileIdentity},
  participants: selectedFiles, // Each has an explicit id, file and expected selection.
  checkAuthority,
});

const expected = archive.selection();
await host.retainTrustedSelection(expected);
const catalog = await SharedRoomRecoveryCatalog.begin({
  database: 'new-room-recovery', archive, expected, checkAuthority,
});
```

Choose server and inventory identities independently from owner-authenticated
native capture. The server identity here is its exact byte length and whole-file
SHA-256, not a value copied from an incoming header. Each client file keeps its
original participant selection. The catalog selection hashes canonical metadata
that binds all of these files, including duplicates under different explicit IDs.
Capture performs no database writes; retain its selection before `begin` so a
lost creation acknowledgement can be resolved by `resume`.

The SDK checks whole-file integrity, the native server header's room-cut binding,
the original inventory reader and the existing client archive/raster readers.
Server log replay, native server-raster admission, current owner authentication
and separately protected original resume credentials remain native-host checks.
The catalog neither accepts resume credentials nor turns hashes into those checks.

The private native host's [selected server checks](SELECTED_SERVER_RECOVERY_STATE.md)
combine current owner authentication, original registration credentials and both
exact native files in one transaction. Their host-local proof still grants no
catalog activation or provider/client coverage.

## Stage explicit native factories and destinations

```ts
const result = await catalog.stage(participantRequests);
host.showRecoveryDiagnostics(result);
await catalog.close();

const reopened = await SharedRoomRecoveryCatalog.resume({
  database: 'new-room-recovery', expected, checkAuthority,
});
await reopened.stage(participantRequests); // Reopens and rechecks actual stored data.
await reopened.close();
archive.dispose();
```

Each request names a retained file ID and supplies the existing participant
recovery options: dedicated attempt/database destinations, the explicitly
selected document/paired/search/reviewed family, its native factory and any
declared retained-store ports. The catalog supplies the admitted backup,
independent selection, cancellation and authority guard itself. Factories are
never inferred from a stored plan or incoming JSON.

Return an exclusive, unobserved and not-yet-initialized raw native owner from the
factory. The catalog applies native initial read-only policy before SDK adoption;
do not pre-wrap it with another one-shot initializer. Paired review access is
separately initialized as read-only. Original relay/actor/principal/transport
identities and persistence families remain unchanged. The matching native
initializer is required; there is no live-setter or JavaScript-only fallback.

The catalog checks exact document, review, declared retained-store and upload
bytes through the existing participant coordinator. It then compares actual
native writer prefixes against the selected inventory. All staged native owners
and original origin leases remain private until close. This API has no owner
handoff, connect or activation method and starts no synchronization or delivery.

`checkAuthority` must return synchronously with no value or throw on revocation.
The host must obtain current authority and fences separately; callbacks that
return a Boolean or Promise are rejected. The browser locks are cooperative
origin-wide exclusion, not cross-device writer ownership.

## Retain every supplied copy

Candidate IDs are explicit. Two selected copies of one original writer reject
before participant targets are created. Other copies stay in the catalog and
appear in `unreconciledParticipants`; a report stays `pending` while that list
is nonempty, even when its registered-stream coverage is `covered`. No copy is
silently selected, merged, marked obsolete or discarded.

The catalog does not discover undeclared databases or merge historical/offline
histories. Its file set and staging plan are immutable. A different selection or
expanded source set needs an explicit new catalog retaining the old files; an
existing attempt is never repurposed to write different targets or histories.

## Resume committed work without replacing it

The initial file set and marker commit atomically in a dedicated two-store
IndexedDB database. Participant recovery spans separate databases and is not
one transaction: ordered `reserved`, `started` and `complete` markers track its
progress. Missing inspection aborts creation, and foreign schemas, versions,
extra keys and occupied destinations refuse without upgrade or overwrite.

`retained`, `staging` and `checked` are past control-flow markers, not persisted
proofs. Every staging call checks actual retained files, native participants,
whole uploads and their original completion records. A lost acknowledgement
after a child commits reopens that exact child; it does not restore an empty
document or publish policy again. Changed or missing completed state refuses
rather than repairing it by overwriting newer work. Graceful close is retryable;
explicit discard closes private runtime owners but deletes no committed data.

The selected original cut stops being current after importing updates, changing
selection/policy or beginning ordinary editing. Never reuse this original-file
coordinator against modified operational storage. A durable post-reconciliation
handoff and authenticated activation workflow are still required.

## Budgets and release scope

The catalog envelope permits 4,096 files including server and inventory, 16 GiB
of selected bytes, 16 MiB of canonical metadata, and at most 1,024 active
participant requests. Server transport files have a 1 GiB catalog ceiling;
native component ceilings remain unchanged and may be tighter. Catalog and file
IDs are opaque ASCII identifiers of at most 200 characters; document/account
names and original file contents are not renamed. The control-plan bound covers
all original 64 KiB participant plans and their JSON escaping overhead.

Hashing currently reads one whole file, and staging holds all selected native
owners. Large-room memory, storage quota, actual browser persistence, interrupted
processes and power-loss durability still need operating-envelope qualification.
Node storage/lock/raster fixtures and real Rust/Wasm owners verify the functional
protocol, not those platform guarantees.

Current provider asset closure, protected credential custody, cross-device
fencing, authenticated activation/handoff and the approved cross-generation
Undo/Redo/offline-edit bridge remain unfinished. Source coverage alone cannot
close those V1 gates.
