# Physical server recovery asset availability

`PreparedPhysicalRoomRecoveryHost::verify_recovery_asset_availability` joins a
genuine same-host protected-stream continuity proof with actual provider-backed
image availability. Retained ancestor A, the archive actually restored as local
origin B, and the complete current server cut C remain separate. Older
single-origin recovery contracts are not widened.

## Admission and source ownership

The caller supplies current owner authentication, a genuine
`VerifiedPhysicalServerRoomRecoveryState`, and a live
`ServerRecoveryAssetProvider`. Native continuity is reauthenticated before any
provider callback. Its independently selected complete cut is checked again in
the room-then-raster transaction; a queued transaction cannot silently choose a
newer C. Actual native/raster ownership and both A/B retention remain required.

All conservative native causal and packet references use that exact source cut.
Native Pending remains explicit in `state.references.outcome`, not an empty
successful dependency list. Unresolved opaque mappings or absent actual payloads
return Pending with the selected state and explicit missing requirements, never
a partially usable proof.

The existing server-private resolver is reused. Canonical content identifiers
retain their exact meaning. Other native asset/generation pairs require exact
current mappings; prefixes and upload receipts are insufficient. An immutable
asset cannot map to different bytes across generations. Available payloads are
read through the actual raster owner, hashed and decoded under the existing
PNG/JPEG/WebP and size rules. Mappings and provider authority are checked again.
No network fetch is performed and no resolver helper becomes public.

The final actual native/raster comparison follows every provider callback before
Verified or Pending publication. A callback returning success after changing
selected files cannot publish a stale result. Changed bytes are preserved for
explicit recovery; verification never repairs or deletes them incidentally.

Provider callbacks are synchronous under native room/raster locks. They must be
bounded and must not synchronously reenter those owners. The provider checks its
own live mapping/authority epoch; these checks are not a transaction over an
arbitrary external service.

## Weak proof and detached read

`VerifiedPhysicalServerRecoveryAssets` cannot be deserialized or default-created.
It retains the native proof, not a strong host, and a weak identity of the exact
provider object. Equal-looking replacements cannot reuse it. Detached metadata
has the distinct `breditor/physical-server-asset-availability` revision-one
family. Its immutable bounded read is shared internally, avoiding another full
DTO clone per live check. Metadata is not a capability.

`check_live` repeats authentication, exact native continuity, same live provider
identity, full reference/mapping/byte admission and metadata equality. A
physical-only rotation, raster-only addition or new protected registration
stales the old proof even if content or required images are unchanged. Fresh
credentials can verify the new C without resetting B. Proofs retain no native
directory lease; cold operational resume still uses genuine B after all host
handles drop.

## Boundaries

This is server-scope coverage, not an atomic activation reservation. It creates
no file, writer, role, upload, router or deployment marker. All client
journals/outboxes, source mappings, historic-copy decisions, matching SDK-parent
integration and fenced whole-room activation remain separate. Checks must run
again at any later authorized use.

Existing native archive, raster and complete encoded-result ceilings are
unchanged. Full replay, retained-history traversal and archive admission still
scale with retained history; long-session costs are not certified here.

## Functional laws

Both candidate profiles require `physical-host-assets-plan-contracts`,
`relay-physical-host-assets-native` and `relay-physical-host-assets-public`, in
addition to existing ancestry, original-provider, full-native and no-networking
checks.

Positive native cases cover five grammars and both wire transports with
independent document/review generations, actual later C, original PNG and later
JPEG/WebP bytes, seven protected streams, offline document/review work and future
peer-preserving Undo/Redo. An exported-only Rust consumer independently exercises
ten modes and cold resume with the proof still held.

Negative laws cover absent bytes/mappings, invalid or changing mappings,
cross-generation divergence, wrong authority, different/dead providers, stale
physical/raster/registration cuts and fresh complete re-verification. Four
successful-final-callback cases change actual selected native or raster files
before Verified or missing-byte Pending publication; all must refuse while
preserving changed bytes. Native packet Pending keeps its existing reader
contract; these callback fixtures exercise missing-byte Pending specifically.

These are functional checks, not release, platform durability, browser or
accessibility certification. All thirteen V1 qualification gates remain open.

The [2026-10-21 qualification](qualification/2026-10-21-physical-server-asset-availability.json)
passes all 21 selected stages, 358 server-enabled and 267 complete no-networking
Rust checks, and 1,531 script tests with three existing opt-in skips. A separate
locked offline Cargo project repeats the unchanged exported-only consumer. Fresh
source and installed client-operation probes retain their existing native-history
assertions; they qualify that SDK parent separately, not the still-missing
native/SDK join. All six normal shared runtime files and three public archives
remain byte-identical. This is not the entire 204-check functional plan.
