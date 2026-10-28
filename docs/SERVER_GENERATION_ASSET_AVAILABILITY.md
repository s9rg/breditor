# Server generation recovery asset availability

The standalone `PreparedLogGenerationRecoveryHost` can verify live provider-backed
image availability against its genuine native recovery proof. Its complete
original archive, current server archive and current participant inventory keep
their own identities. A physical-recovery ancestor is neither invented nor used
as a substitute for the archive actually restored by this host.

## Native and provider admission

`verify_recovery_asset_availability` requires current owner authentication, an
actual same-host `VerifiedServerLogGenerationRecoveryState`, and the host's live
`ServerRecoveryAssetProvider`. Every protected document and review registration,
including revoked or permanent observer streams, must already be verified by
the native proof. Missing credentials do not produce a partly usable proof.

The provider operation reauthenticates native continuity before invoking any
provider callback. It then rechecks the independently selected complete cut
inside the actual room-then-raster transaction. A newer registration, native
operation, physical log rotation or raster addition cannot silently replace the
selected current state, even when visible content or required images is equal.

All server-native causal and retained packet references belong to that exact
cut. Native Pending remains explicit in the complete state. Missing opaque
mappings or unavailable raster bytes return `Pending` with the whole selected
state and missing requirements, not a proof with partial coverage.

The existing server resolver admits actual PNG, JPEG and WebP bytes through the
native raster owner. Canonical content-addressed identifiers keep their existing
meaning; other asset/generation pairs require exact current mappings. An
immutable asset cannot map to different bytes across binding generations. A
receipt or hash-looking name is insufficient. The final actual native and raster
comparison follows the last provider callback before either Verified or Pending
publication. Changed files are preserved for recovery, never repaired or deleted
as a side effect of verification.

Callbacks are synchronous under the native room and raster locks. They must be
bounded, must not reenter those owners, and must check their own current mapping
and account authority. This is not a transaction over an arbitrary external
service; acquire remote authority before entering the native operation.

## Live proof and detached metadata

`VerifiedServerLogGenerationRecoveryAssets` has no public constructor, default or
deserializer. It retains the native proof and a weak reference to the exact
provider object, not a strong native host, provider lease or bearer token.
Equal-looking replacement providers cannot reuse it. Holding the proof does not
prevent native owners from closing and their actual directories from reopening.

`identity()` and `metadata()` expose detached selections and the immutable bounded
read. The read has the independent revision-one family
`breditor/server-log-generation-asset-availability`; it cannot be relabeled as a
physical-recovery proof or an original server availability result.

`check_live` repeats current authentication, same actual native owner identity,
the exact selected source comparison, current provider identity and authority,
complete reference/mapping/byte admission, and metadata equality. A byte-identical
cold reopen requires a fresh native and provider verification; saved metadata
cannot revive the former proof. Provider revocation invalidates later checks.

## Functional boundaries

Verification does not upload, fetch, change a role, bind local comments, append a
native event, acknowledge a client packet or create a router. Original source
files, both native history lanes and outstanding offline work remain unchanged.
The existing native, raster and whole encoded-result ceilings are retained.

This is server-scope availability at a checked instant, not a held activation
reservation. Complete browser-client and outbox reconciliation, historical-copy
requirements, complete parent integration through the [generation control](SERVER_GENERATION_RECOVERY_CONTROL.md), serving exclusion and a
durable authenticated whole-room decision remain required. Original protocols,
default constructors and the separate physical-recovery family are unchanged.
The full feature-parity goal and all thirteen V1 gates remain open.

## Native functional coverage

Forty combinations exercise five native grammars, two writer transports, and
independently selected original/segmented document and comment histories. They
verify three actual raster formats, retain distinct original/current selections,
drop the real host with the proof held, cold-reopen the operational source, and
continue old offline document/comment work and future peer-preserving Undo/Redo.

Negative cases cover wrong authentication, foreign hosts, byte-identical cold
reopens, new registrations and missing credentials, physical/raster-only changes,
missing bytes or mappings, divergent/changing mappings, revoked providers and
equal-looking provider replacements. Four final-callback cases alter actual
native or raster files before Verified or missing-byte Pending publication.
Native packet Pending retains the existing reference-reader contract; these
callback cases specifically exercise missing-byte Pending.

The public Rust example uses only exported APIs. It persists the selected server
archive, verifies all protected native streams and an opaque mapped raster,
rejects a revoked provider, drops and cold-reopens the standalone host with the
proof still alive, and delivers retained document/comment suffixes plus future
Undo/Redo. It starts no network service or replacement deployment. These are
functional laws, not browser, physical-crash or full release qualification.

## Functional qualification

The [native qualification checkpoint](qualification/2026-10-28-server-generation-asset-availability.json)
records the complete server and no-server relay suites, exported public-consumer
suites, strict lint/documentation checks and candidate-plan contracts. A separate
locked offline Cargo caller repeats the unchanged exported example against real
path dependencies; this is not a registry or npm installation claim. Both the
example and independent caller cold-reopen with the proof alive and deliver
retained document/comment work plus future Undo/Redo. The example also refuses an
occupied destination without changing its existing bytes. These results qualify
this native server-family join, not a complete V1 release.
