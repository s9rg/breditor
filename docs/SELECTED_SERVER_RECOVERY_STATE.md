# Selected native server recovery checks

The private Rust reference host can check current owner authentication, protected
original registration credentials and an exact selected server archive together.
The result belongs to one live native host. It is a prerequisite for a later
recovery handoff, not permission to activate a room.

## Verify one selected cut

Use `ServerBackupHandle::capture_recovery_state` to obtain the owner-authenticated
selection and independently retain its `ServerRecoveryStateIdentity`. Restore
the selected server bundle through the existing native `ServerRoomRecovery`
path, configure fresh `Authentication`, and keep the resulting router unserved
while reconciling recovery requirements.

Call `verify_selected_recovery_state` with that selection, its admitted inventory,
the current owner account/token and separately protected original document/review
resume credentials. Under the ordinary room-then-assets locks, the check compares
the actual native participant inventory and complete log/raster archive with the
selection, then verifies every original registered credential. Revoked accounts'
original registrations remain required; verification does not restore roles or
replace leases.

Wrong credentials or changed native files reject. Missing original credentials
return `ServerRecoveryCoverage::Pending` only after the selected native files
have matched. A complete match returns `VerifiedServerRecoveryState`. No token,
resume secret or connection lease enters that proof or its detached identity.
The proof has no public constructor, deserializer or default constructor.

## Recheck at later use

`VerifiedServerRecoveryState::check_live` authenticates the owner again and
rechecks the complete actual files. A changed log, registration, permission or
raster inventory invalidates the original selection. Even a byte-identical
second restored host cannot reuse the proof; that host must perform its own
current authentication and credential checks. A cloned handle to the same live
host can recheck it.

The proof keeps only a weak reference to its native room owner. Retaining a proof
does not keep a stopped service or its file locks alive. Its `identity()` method
returns a detached copy, not another proof or an activation capability.

This check is valid at one instant. It neither reserves a later mutation nor
combines a later operation into the same transaction. An activation controller
must establish its own atomic native barrier and deployment fencing rather than
persisting a successful Boolean and treating it as current authority.

The [operational storage handoff](OPERATIONAL_SERVER_RECOVERY.md) now provides
durable native storage provenance for later server edits and reopen. It does not
extend an earlier exact-cut authentication check over those edits or provide the
remaining global activation barrier.

Use the separate [current continuity check](CONTINUED_SERVER_RECOVERY_STATE.md)
for a freshly selected later cut that retains the original history and rasters.
It requires all current protected registrations and leaves this original
exact-cut proof's semantics unchanged.

## Remaining activation requirements

The checked raster store contains exactly the selected original server files.
That does not prove that every asset referenced by accepted/deleted history,
versions, suggestions or offline client histories exists in the current provider.
Current provider reference closure, protected credential custody, all client and
historical copies, post-reconciliation operational provenance and cross-generation
Undo/Redo preservation remain separate requirements. The browser
[recovery catalog](ROOM_RECOVERY_CATALOG.md) starts with private read-only
participants. [Operational room recovery](OPERATIONAL_ROOM_RECOVERY.md) now
provides durable custody handoff, but neither path grants room activation.

Verification reads and hashes complete archives and natively admits every raster
using the existing bounds. It is an explicit private-host operation, not a cheap
per-keystroke check or a newly exposed HTTP endpoint. Existing router defaults,
wire protocols and storage formats are unchanged.

## Functional checks

The public native regression suite covers missing and incorrect original
credentials, current authentication and owner role, changed selections, detached
identity mutation, cloned handles, stopped/byte-identical restored hosts, a real
HTTP asset upload, and changed native log/raster bytes without overwrite. The
native fixture producer also requires a complete check and recheck after original
restore across all ten existing compiler/transport combinations, retaining its
earlier registration, fresh-authentication and no-exported-secret assertions.

The [focused qualification](qualification/2026-10-19-selected-server-recovery-state.json)
retains the source-bound results and scope. They supplement the
previous [catalog qualification](qualification/2026-10-19-room-recovery-catalog.json);
they do not rerun or replace its complete installed-consumer qualification.
All 13 V1 readiness gates remain open.
