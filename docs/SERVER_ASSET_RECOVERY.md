# Server recovery image dependencies

Server recovery can now check the complete retained server image requirements
against actual current raster bytes and current host mappings. The combined
`ServerBackupHandle::verify_recovery_asset_availability` API requires a genuine
original/current credential-continuity proof for the same native host and cut.
It proves server scope only; client and historic-copy reconciliation and the
final activation barrier remain separate requirements.

## Read the complete retained server sources

`Room::retained_asset_references(owner)` reads conservative native causal history,
the native suggestion-effect history and every complete typed packet in the
original durable log. It includes deleted and losing image bindings, saved
versions, rejected proposals and complete revision preparations that were
abandoned before Commit. An inert Prepare is a dependency source, not an
accepted edit or a committed revision publication. Revision chains retain their
original parent packets and admit children only after matching adjacent Commit
records.

The read uses native packet source and intent readers, not the rendered tree,
current publication caches or searches through arbitrary strings. A proposal
that replaces and then deletes an image can still require both original image
bindings. Missing native historical source produces whole `Pending`, with no
partially usable reference list. Unknown or invalid native forms refuse the
read. Neither outcome repairs, compacts or changes a file, role, lease or packet.

`ServerBackupHandle::capture_asset_recovery_state(owner, token)` additionally
authenticates the current owner and captures complete native log, raster and
registration identities under room-then-assets locks. `references.room` must
match that exact current server cut. The returned DTO is detached metadata, not
provider authority or a live native verification.

## Require actual bytes and current mappings

`verify_server_asset_availability` takes an independently selected current
`ServerRecoveryStateIdentity` and an explicit `Arc<dyn ServerRecoveryAssetProvider>`.
It reauthenticates, verifies actual current files and reads all native server
requirements before resolving any opaque bindings. A stale selection refuses;
it does not silently choose a newer cut.

Original canonical `sha256:` asset IDs resolve only to their own native payload.
The provider cannot remap them. Opaque IDs require a mapping for the exact
original asset and binding generation to a canonical SHA-256 ID in this room's
raster store. All generations of one immutable asset must map to the same bytes.
The mapping does not rewrite any original history, packet or asset identity.
Valid opaque IDs with a hash-like prefix, such as `sha256:opaque`, still require
host mapping. Only an exact canonical lowercase SHA-256 ID takes the direct path,
matching the existing SDK byte-capture policy.

The check admits complete actual raster records and decodes native PNG, JPEG or
WebP data under the existing store limits. An upload receipt or equal image count
is insufficient. Required payload metadata is deduplicated by content ID while
every original reference pair remains in the result. Mapping and authority
checks repeat during resolution; changed mappings refuse. Resolver errors are
sanitized before crossing the native host boundary.

The final actual native/raster source comparison runs after every provider
callback, including the last authority guard, before either Verified or Pending
is returned. No later callback can invalidate that comparison inside the native
transaction. A source changed during a successful callback refuses immediately;
verification preserves the changed files rather than repairing them. This is
still a check at one instant, not a reservation against a later external change.

`ServerAssetAvailabilityCoverage::Pending` returns the selected current state
and missing mappings or bytes. When native packet source is incomplete, the
missing source records stay in `state.references.outcome` and no mapping scan
runs. Neither case yields a partial proof. Invalid mappings, corrupt native
files or failed authority guards are errors rather than missing-data success.

## Keep provider authority explicit

The host implements `ServerRecoveryAssetProvider::check` to validate its current
mapping epoch, account/provider authority and guard lifetime. Its `resolve`
method returns a mapping or `None`; a saved Boolean, digest or receipt establishes
no authority. `ContentAddressedServerAssets` is an explicit opt-in provider for
native SHA-256 IDs; opaque IDs remain Pending.

Callbacks execute synchronously under the serialized native room/assets locks.
They must not reenter the host, perform remote I/O or wait for those locks. Acquire
external authority before the native call and retain a checked mapping guard.
The caller must keep the original provider `Arc` alive for later rechecks.

## Join genuine recovery continuity and bytes

```rust
use std::sync::Arc;
use breditor_collab_relay::server::ServerRecoveryAssetCoverage;

// continuation came from verify_continued_recovery_state with the independently
// selected original archive, current native cut and all protected credentials.
let continuation = Arc::new(continuation);
let checked = backups.verify_recovery_asset_availability(
    owner, current_token, continuation.clone(), provider.clone(),
).await?;

match checked {
    ServerRecoveryAssetCoverage::Verified(proof) => {
        proof.check_live(&backups, owner, current_token, provider.clone()).await?;
        // Coordinate all other inactive sources and the final activation barrier.
    }
    ServerRecoveryAssetCoverage::Pending { state, missing } => {
        // Retain continuation, provider, every original file and all owners.
        // Resolve missing native sources/mappings/bytes, then retry explicitly.
    }
}
```

The combined proof can be constructed only by joining genuine host-local
continuity and availability checks at the same exact current cut. Another live
host with identical restored bytes cannot reuse it. It retains no raw credential,
writer lease or strong native/provider reference. `identity()` and `metadata()`
expose detached read data, not proof constructors. Both proof types have no
deserializer or default constructor.

`check_live` authenticates again and repeats both checks with the same host and
original provider object. A durable append, registration change, raster upload,
changed mapping or expired provider guard makes the previous proof unusable.
Capture and verify a fresh current selection rather than updating saved metadata.
Each successful check is valid at one instant, not a reservation over a later
mutation. It grants no browser activation, collection right or service start.

## Bounds and release scope

Complete native reference reads have independent limits of 100,000 unique pairs,
100,000 combined missing source ends and 8 MiB encoded output. Complete server
availability results have an independent 32 MiB encoded limit. Whole-read
overflow refuses; it never truncates sources or returns partial completeness.
Original document, packet, log, raster and registration limits are unchanged.

Native tests exercise all ten compiler/transport combinations with direct and
opaque references and actual PNG/JPEG/WebP bytes. Separate tests cover rejected
proposal history, abandoned revision preparations, malformed mappings, changed
guards, missing payloads, weak host/provider lifetime, identical-host restart and
an authenticated HTTP upload that stales a selected cut. Native recovery fixture
checks also join the genuine server proofs after operational reopen; their
original paragraph-only archives remain unchanged.

This API does not include browser participant stores, outstanding offline copies,
extension sources, credential-vault discovery, cross-device fencing, a global
provider/reference reconciliation or an atomic final activation transition.
Cross-generation Undo/Redo and offline-edit preservation remain required work.
No persistent format, HTTP route, default policy, package version or dependency
changes here. The V1 release gates remain open.

The [server recovery qualification](qualification/2026-10-19-server-asset-recovery.json)
records the 23 passing selected checks, source and artifact hashes, reproduced
opaque-ID regression and fresh installed-package evidence. It is not V1 release
approval.

Four permanent public Rust regressions cover final successful callbacks changing
an actual native log or raster manifest on both Verified and missing-byte Pending
paths. All four fail before the ordering repair and pass with identical assertions
after it. Both candidate profiles require `relay-provider-callback-custody` in
addition to the existing full native and server-recovery checks.

The [callback ordering qualification](qualification/2026-10-21-provider-callback-source-ordering.json)
retains the failing and passing identical tests and independent caller binaries.
All 16 selected stages pass, including 345 server-enabled Rust checks, 41 public
recovery cases, five fresh no-networking public cases and 1,529 script tests with
three existing opt-in skips. The prior complete 267-case no-networking suite is
explicitly carried across server-only changes, not reported as rerun. Normal
runtime and public package bytes remain unchanged.
