# Held metadata continuation evidence

A restarted service can make an earlier metadata control unavailable while its
client journals still contain acknowledged or pending work. The SDK now has a
separate read action for those existing destinations. It never resumes their
retired HTTP host or overwrites them with an earlier snapshot.

## Contract

`withHeldMetadataContinuationEvidence` requires an actual finite
`withOriginalMetadataJournals` visit under the privately held replacement target.
A WeakMap admission check runs before destination input reflection. Existing
journals retain their own leases; missing namespaces are reserved and leased too.
The read recognizes absent, intent-only, preparation, partial review and complete
metadata stages. It validates original bindings, packets, revisions and ACKs and
returns the complete canonical original/current journal observations. Existing
stores remain read-only and are reread before exit. The guard expires before
cleanup releases custody.

`withHeldAbsentMetadataContinuation` separately preserves an unstarted set of
four destination names. Existing data refuses rather than being hidden by an
invented old choice. A retained observation is DATA: it grants neither a client
actor nor activation/publication authority.

Each action and its contract lives in its named file under
`selected_local_metadata_continuation/`. The original continuation formats,
public-root exports and default execution route remain unchanged.

## Verified integration

Two source cases and the same two cases in independently packed/offline-installed
packages passed with the exact frozen source retained. The workload uses seven
real participant families and three metadata lanes, interrupts every destination
prefix, checks all leases/no writes/expiry, retains real acknowledged and pending
facts, compares original bytes and verifies future document/comment Undo/Redo.
Seven existing continuation/new admission checks pass after integration. A fresh
TypeScript emit matches current main output names and bytes. Normal Wasm stays
pinned and unchanged.

Run `npm run test:collaboration:metadata-evidence` for the source workset and
`npm run test:collaboration:metadata-evidence:installed` for its independent
package workset, using the recorded Native fixtures and pinned dependencies.
The installed runner's watchdog owns only its detached test child's process
group. `npm run check:generated-sdk` refuses missing, stale or changed compiler
output before a new package qualification; it does not rebuild Wasm.

The qualification record is
[2026-11-04-metadata-continuation-evidence.json](qualification/2026-11-04-metadata-continuation-evidence.json).
The local proof retains 221 references as 169 deduplicated/read-back-verified
objects plus the executed source archive, totaling 47,010,740 compressed bytes.
Its immutable index SHA-256 is
`a88db39bff07febefa915cbcf6b7635753fbef5944ba12703038ef80d4cc9191`.
Main integration checks have a separate index.

## Limits

The reader workset did not save the original four client multipart input Blobs;
it retains Native fixture output and canonical journal observations plus exact
source for reproducing a fresh workload. The historical installed archives also
retain six unused generated paths from older builds. They are kept as executed,
with that provenance limitation explicit. The current main output check removes
that ambiguity for new packages.

The full service-restart/client-owner composition remains in isolation. These
readers do not qualify pending/existing-metadata/repeated complete ownership
cycles, physical browser durability, historical WebKit/archive short-read faults
or V1. All thirteen V1 gates remain open.
