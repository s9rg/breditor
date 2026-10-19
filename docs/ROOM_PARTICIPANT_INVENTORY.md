# Room participant recovery inventory

The Rust reference relay can capture every registered document writer and review
actor at an exact server-log cut, then check separately supplied original resume
credentials against the actual native registrations. Missing records keep this
check pending. Matching records do not create leases, change permissions or
activate a recovered room.

This inventory closes the server registration list, not the list of client
databases. Pair it with the [server archive](SERVER_ROOM_RECOVERY.md), explicitly
selected [participant files](SHARED_PARTICIPANT_BACKUPS.md), current account
authentication and the host's deployment fencing policy.

## Capture through the authenticated owner

The private `ServerBackupHandle` adds two owner-authenticated operations. Its
existing router constructor and capture method retain their original behavior;
no inventory, backup or credential-verification route is registered.

```rust,ignore
let cut = backups.capture_recovery_state(owner_principal, current_account_token).await?;
let selected = cut.identity();
let (server_archive, participants) = cut.into_parts();
let server_file = server_archive.to_bytes()?;
let inventory_file = participants.to_json();
// Retain selected independently in trusted host recovery configuration.
```

The host first authenticates the current account, then requires the room's
immutable owner. It captures the original server log, raster store and native
registration inventory under the ordinary room-then-assets locks, with matching
room cuts. Blocking native reads run off the async I/O threads. Dropping the
future does not cancel already running blocking work. Stop the old router,
connections and every cloned handle before transferring deployment authority.

Maintenance code that already exclusively owns a `Room` can instead call
`room.participant_inventory(authenticated_owner)`. As with other native Room APIs,
that caller must authenticate the principal before supplying it. Inventory
capture validates the actual retained log bytes, not only an in-memory record
count. Changed or uncertain storage refuses capture without repairing its bytes.

## Retained registrations and native prefixes

The closed `breditor/room-participant-inventory` version-one UTF-8 file contains
the exact original room identity, compiler fingerprint, grammar and transport,
effective room grants, enabled metadata bindings, all document registrations and
all review registrations. Lexical ordering makes its encoding deterministic.
It includes empty streams, permanently non-authoring observers and registrations
whose accounts have since lost room access. Revocation does not erase a causal
author or promote an observer into an author.

Document clocks use the original transport-specific digest and an exclusive
operation end. Review clocks use the original actor, account and inclusive event
end. These are native accepted prefixes; capture neither acknowledges nor flushes
offline document edits or comments. Genesis and accepted suggestion-effect
authors are separate server responsibilities, not invented client registrations
requiring new resume credentials.

Original registration limits remain 1,024 document streams and 1,023 review
actors. The inventory has its own 4 MiB refusal ceiling and a bounded union of
known accounts. It does not enlarge native journal, log, writer, actor or asset
budgets. Active leases, presence, account tokens, raw resume secrets and resume
credential digests are excluded. Treat account names, permission history and
native lineage as private maintenance metadata; files are not encrypted.

## Independently select and verify the native cut

`RoomParticipantInventoryIdentity` contains the exact `RoomBackupIdentity` and
SHA-256 of the complete inventory file. Retain that identity from trusted capture
separately from incoming files. `ServerRecoveryStateIdentity` keeps both the
unchanged server archive identity and this inventory identity; it is not a third
archive or an activation record.

```rust,ignore
let participants = RoomParticipantInventory::from_json(&inventory_file, &selected.participants)?;
participants.verify_native(&mut recovered_room, authenticated_owner)?;
```

File admission enforces the independent selection, byte budget, closed fields,
family and canonical encoding without filesystem writes. A checksum does not
prove that a registration list is complete. `verify_native` recaptures every
registration, effective grant, binding and accepted prefix through the actual
room and exact original log. Freshly checksummed omissions or false prefixes
still fail native verification.

## Verify protected original credentials

Supply `RecoveryRegistrationCredentials` from the host's protected identity
storage. Each document record names its original principal, writer and resume
secret. Each review record names its principal, actor and separate review resume
secret. Account bearer tokens and active connection leases are not substitutes.
These input types intentionally implement neither serialization nor Debug.

```rust,ignore
match backups.verify_recovery_registrations(
    owner_principal, current_account_token, participants, protected_original_records,
).await? {
    RecoveryRegistrationCoverage::Pending { missing } => retain_and_collect(missing),
    RecoveryRegistrationCoverage::Verified(proof) => retain_selected_cut(proof.identity()),
}
```

Every original registration remains required, including revoked streams and
observers. Missing inputs return only their non-secret identities and no partially
usable proof. Unknown, duplicate, foreign, malformed or incorrect supplied
records reject the check. Verification reads the original native credential
digests but returns neither digests nor secrets. It does not resume a writer,
replace a lease, restore grants, publish a record or acknowledge offline work.

`VerifiedRecoveryRegistrations` has no public constructor or deserializer.
`check_live` rechecks the actual native room before reuse. Durable document,
metadata, registration or grant changes stale the proof; an ephemeral resume
alone does not change the captured cut. Native proof checks still require host
authentication and deployment fencing. Matching an old account label does not
make an old bearer token valid under a restored host's current authentication.

## Remaining whole room recovery work

The relay stores only resume credential digests; it cannot reconstruct a lost
raw secret. This API neither discovers nor backs up the host's protected identity
store. The host must retain those secrets independently and decide how to recover
missing devices without cloning an active author.

A trusted catalog must still reconcile all chosen client databases and historic
copies with the server inventory, verify accepted prefixes through genuine
recovered native owners, resolve complete provider and asset dependencies, and
record a durable room-wide activation barrier. These APIs do not implement that
catalog, automatic permission restoration or activation. The approved bridge for
cross-generation Undo/Redo and outstanding offline edits also remains work.
