# Current server recovery continuity

`ServerBackupHandle::verify_continued_recovery_state` checks fresh owner
authentication, a selected current native server cut and all current protected
document/review registration credentials while retaining an independently
selected original server archive. It covers genuine later server edits and
images without treating the original snapshot as the latest state.

## Select the original and current state independently

```rust
use breditor_collab_relay::{ServerRoomBackup, server::{
    ServerRecoveryContinuationCoverage, ServerRecoveryContinuationIdentity,
}};

// Keep trusted_original and original_file from the independently selected backup.
// The private native host already owns the reopened operational room and assets.
let captured = backups.capture_recovery_state(owner, current_token).await?;
let expected = ServerRecoveryContinuationIdentity {
    origin: trusted_original.clone(),
    current: captured.identity(),
};
let (_, inventory) = captured.into_parts();
let checked = backups.verify_continued_recovery_state(
    owner,
    current_token,
    ServerRoomBackup::from_bytes(&original_file)?,
    expected,
    inventory,
    protected_current_registrations,
).await?;

match checked {
    ServerRecoveryContinuationCoverage::Verified(proof) => {
        proof.check_live(&backups, owner, current_token).await?;
        // Still establish the separate deployment/client/provider activation barrier.
    }
    ServerRecoveryContinuationCoverage::Pending { missing } => {
        // Preserve every file and collect the missing protected records explicitly.
    }
}
```

Never choose either expected cut from incoming archive metadata. The original
archive's admitted identity must equal `expected.origin`; the inventory must
match the freshly selected current cut. The actual current native room
inventory and complete log/raster archive must match that current selection.
A transaction between capture and verification makes a stale selection refuse;
capture again explicitly rather than updating the original selection.

## Retain original native history and every raster

Under one room-then-assets lock, the check compares the original immutable
document, owner, compiler, transport and raster namespace with the actual native
room. An admitted checksummed header is not native evidence for those fields.
The complete original log must be an exact byte prefix of the current native
log. A valid alternate history with the same seed refuses.

Every original raster record and the original store manifest must remain
byte-for-byte identical. Complete later images are allowed, including
unreferenced records. A valid current store with an equal image count can still
be missing an original image and must refuse. All current rasters undergo the
ordinary bounded native admission and decoding.

This is a live file-continuity check, not verification or creation of
`.operational.json`. Use the separate
[operational server recovery](OPERATIONAL_SERVER_RECOVERY.md) contract for
durable storage provenance and resumption. The check neither repairs files nor
removes a torn tail, pending upload or unknown entry to force a match.

## Require every current protected registration

Credential verification uses the complete current native inventory, including
original and later document/review registrations, revoked accounts and permanent
observers. Missing records return `Pending` only after both current state and
original continuity have matched. Wrong, duplicate, foreign or malformed supplied
credentials reject instead of producing a partially usable proof.

The host supplies raw resume credentials separately from account bearer tokens.
The API discovers no credential vault and exports no secret or credential digest.
Checking an old registration neither restores a role nor replaces a connection
lease. Account authentication is fresh host configuration; old backup tokens
are not revived.

## Recheck on the same live host

`VerifiedServerRecoveryContinuation` has no public constructor, deserializer or
default constructor. Its `identity()` returns a detached original/current pair,
not another proof. The proof retains neither credentials nor a strong host
reference. A stopped host can release its native locks while the proof exists;
even an identical restored second host must perform a new check.

`check_live` authenticates again and verifies the exact same current native
files and inventory. Their equality preserves the checked original relationship.
Any later valid append, registration, grant or raster makes that proof stale;
obtain a new current selection and verify again. The existing
[selected-state proof](SELECTED_SERVER_RECOVERY_STATE.md) keeps its original
exact-cut semantics and is not silently extended over later edits.

The check is valid at one instant. It does not reserve a later mutation, hold an
activation barrier or grant access to a browser participant. Keep the private
handle unserved while coordinating an inactive restore. Actual deployment
fencing, client and historic-copy reconciliation, complete current-provider
reference closure and a final atomic activation transition remain required.
The approved cross-generation Undo/Redo and outstanding offline-edit bridge also
remains work.

## Qualification scope

The [current server qualification](qualification/2026-10-19-continued-server-recovery-state.json)
records the 23 selected checks, frozen source, before/fixed native regression and
fresh installed-package evidence. It is not V1 release approval.

Native tests cover later accepted edits and registrations, retained and missing
original images, revoked observers, wrong/missing secrets, alternate histories,
false checksummed original headers, stale selections, host lifetime and restart.
A real loopback HTTP upload invalidates an earlier proof; a fresh current
selection verifies again. The fixture producer additionally checks and rechecks
all ten original compiler/transport families after operational reopen, without
exporting raw credentials.

These checks do not qualify power loss, browser/native input, the large-room
operating envelope, complete provider/client activation or history compaction.
Original protocols, stored formats, router routes/defaults, package versions and
native bounds remain unchanged. All thirteen V1 release gates remain open.
