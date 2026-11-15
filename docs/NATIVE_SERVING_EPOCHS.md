# Native serving epochs

The opt-in native relay can fence an old serving host through an independently
provisioned deployment authority. A replacement appends a new durable epoch; each
old host then refuses native transactions instead of accepting new document,
review, version or asset work. The serving permit covers the real transaction
and fsync, not only its initial permission check.
The exact authority is checked again before the permit is released. Detected
namespace uncertainty retires the affected local authority instead of returning
success or silently re-enabling it if the old path later reappears.

This is a prerequisite for coordinated recovery, not automatic activation of a
recovered room. A host must separately prove that its selected native room,
clients and providers preserve the accepted cut and outstanding work. Existing
router defaults and editor protocols remain unchanged.

## Authority and trust boundary

`RoomDeploymentAuthority` owns an actual private directory and append-only file,
outside every room-backup and client-recovery namespace. Provision this path
through trusted host configuration, not through an incoming archive or browser
account. Retain `RoomDeploymentIdentity` independently before later opens.

`create` accepts only an absent directory. `open` admits existing complete bytes
against the outside identity and grants no serving lease. The additive
`open_at_least` additionally requires an independently retained exact selection
to remain in the current lineage; it also grants no lease. Neither method repairs,
truncates or adopts an occupied path. The initial generation is zero and cannot
serve. `claim` compares the exact selected identity, generation and nonce under
an exclusive operating-system file lock, appends and syncs one new epoch, then
returns a genuine `RoomDeploymentLease`. A stale choice writes nothing. Busy
transactions return `Locked`; a takeover must obtain a new exact choice and
retry after contention settles.

Use `RoomDeploymentAuthority::create_with_coordinated_recovery` for a new
deployment that must refuse an ordinary restart after a verified handover.
The returned identity has revision two. Ordinary claims can initialize and
restart the original deployment before its first coordinated transition.
Once a coordinated seal or takeover commits, `claim` refuses even with the
exact current selection. Continue through the selected recovery or handover
approval. The legacy capture-and-seal calls require revision one because
they lack a coordinated continuation. The original `create` provisions
revision-one authority with its existing claim policy.

All participating hosts must select the same authority and use the fenced
constructors. Ordinary constructors remain unfenced. This reference backend
requires cooperating processes on a filesystem with working shared/exclusive
file locks and durable fsync. Its inode checks currently support Unix only;
unsupported backends refuse before creating or opening storage. A live authority remembers its observed prefix; an observed replacement
permanently retires its old lease. An independently retained cold selection can
refuse a restored shorter or divergent prefix. Rolling back every independent
witness with the authority remains outside this trust boundary. Restoring an
authority with a room backup is prohibited; identity-only opening cannot know
about omitted history for which it retained no independent witness. A portable multi-machine consensus backend remains
release work; a copied ledger is not one.

## Transaction contract

`Host::transaction` acquires and verifies the actual shared serving permit before
locking the native room. It retains that permit through the native closure,
including room and raster publication. A takeover needs the corresponding
exclusive lock, so it cannot succeed while admitted native work remains in
flight. Work admitted before takeover may finish; a later transaction under the
old epoch does not execute its native closure. Native backup captures use the
same boundary.

Before releasing the permit, the transaction checks the actual namespace and
leased record again. A change during native work refuses the result and retires
the uncertain local authority. Explicit unlock cleanup still runs. Native work
that was already durable is preserved; a storage error is not a rollback.

Asset upload intentionally does not hold a room lock while awaiting the request
body or decoding raster data. Its final publication reacquires the serving
permit. A body admitted before takeover therefore cannot publish afterward.
Fencing does not retract a response or bytes already read before takeover.

One local mutex serializes access to each actual file descriptor. Authority
clones share that descriptor; independently opened authorities use independent
descriptors. This avoids relocking a cloned descriptor, whose behavior is
platform-dependent. Rust also does not promise that file locks block unrelated
raw writes; host configuration must protect the authority namespace. See the
[Rust file locking contract](https://doc.rust-lang.org/std/fs/struct.File.html#method.lock_shared).

## Native binding and serving

`Room::deployment_binding` hashes a separate domain, the immutable native asset
binding, the explicit document compiler/standard-inline profile and the writer
transport family. Mutable clocks, roles and transient credentials are excluded.
A lease for a different binding cannot construct a fenced router. A matching
binding is not account authentication or proof of a complete recovered cut.

Use `router_with_deployment_lease` for native serving,
`router_with_assets_and_deployment_lease` for native and raster serving, or
`router_with_server_backups_and_deployment_lease` when private host capture is
also needed. The backup handle creates no account-facing capture route. All
constructors retain ordinary authentication, Origin checks and existing wire
messages. Superseded leases use the existing `lease_rejected` result. Damaged
authority framing admitted through serving becomes a storage failure, not an
invalid editor request.

```rust,ignore
// The application owns these native objects and this separate trusted path.
let authority = RoomDeploymentAuthority::create(
    authority_path,
    &room.deployment_binding()?,
)?;
let independently_retained_identity = authority.identity();
let selected = authority.current_selection()?;
let lease = authority.claim(&selected)?;
let (router, backups) = router_with_server_backups_and_deployment_lease(
    room, authentication, assets, lease,
)?;
```

The example is host orchestration, not an automatic recovery policy. A recovered
host must not claim a serving epoch merely because it has a matching room name,
backup identity, local approval or provider availability report.

## Storage and failure contract

Both authority revisions use fixed 104-byte epoch records. Each record binds
its ordinal, owner nonce, previous digest and header digest. Revision two has
its own header and records the switch to coordinated recovery in the same
synced epoch as the handover. Replay refuses a later ordinary record after
that switch. The serialized selection continues to expose the ordinary
decimal epoch and the exact authority identity. Retain the latest selection
independently and use `open_at_least` on a cold restart to reject a complete
older prefix.

Operator reads, opens and claims replay the complete bounded lineage.
There are at most 1,048,576 claims. Exhausting that takeover budget refuses
without rotating or resetting authority.

Hot serving checks read the fixed header, exact current length, witnessed
prefix anchor and leased tail record; they do not replay a growing takeover ledger on each keystroke. The
backend assumes that only its cooperating operators append to its protected
namespace. Full lineage replay remains at operator admission boundaries.
Replaced directory/file inodes, incomplete tails, a shortened current epoch or a
changed leased record refuse. No older complete prefix can erase a live authority's witnessed history.
See [generation handover and continuity](NATIVE_GENERATION_CONTINUITY.md) for
shared clone attachment, exact cold pins and the independently retained witness
limit. A saved pin is not a recovered-room activation capability.

An uncertain append, sync or unlock retires usable local authority. Retrying a
claim through that poisoned instance cannot hide uncertainty. Reopen existing
complete bytes with the outside identity, obtain a fresh choice and append a
new epoch; the old saved choice never reconstructs a serving lease. An incomplete
ledger requires operator recovery outside this API, with old bytes preserved.

`RoomDeploymentLease::close` retires every clone of that lease.
`RoomDeploymentAuthority::close` retires all its local leases immediately and
attempts actual lock cleanup. In-flight work keeps custody until it settles;
close returns `Locked` instead of unlocking beneath that work. Explicit cleanup
can recover poisoned mutex custody for unlock only. A retired instance never
becomes writable again, even after cleanup succeeds. Files stay intact and file
descriptors remain owned until the final clone drops. A failed response does not
roll back work that was already durable; ordinary exact retry receipts still
resolve that ambiguity.

## Coordinated activation still required

Safe whole-room cutover must freeze old writes, verify the final native cut and
every declared client/provider obligation under that exclusion, persist the
activation decision, then grant the replacement epoch. It must preserve native
Undo/Redo, offline groups, review decisions, packets and all retained uploads.
The current constructors do not perform that workflow or expose an inactive
prepared recovery host as an editor router. Complete reconciliation,
authenticated activation, portable deployment authority and sustainable history
remain open architectural work. No V1 gate closes on a lease alone.
