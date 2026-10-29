# Accepted server handover barrier

The opt-in native relay can retire an original-storage server's native serving
authority at an exact selected accepted log and raster cut. It validates that cut
while excluding old serving
transactions, then durably advances the deployment epoch without issuing a new
serving lease. This closes the late-write window between an ordinary backup
check and an unrelated epoch claim. It does not activate a replacement room.

## Why an epoch claim is insufficient

An ordinary backup can be valid when captured and become stale before takeover.
If the old server accepts another edit or image in that interval, an epoch-only
claim still succeeds: it compares the serving epoch, not the accepted room data.
Starting a replacement from that older backup would omit accepted work.

The existing `RoomDeploymentAuthority::claim` intentionally retains its epoch-only
contract. Callers that use it directly remain responsible for selecting complete
replacement data. No existing router, archive or transport protocol changes.

## Explicit host operation

`ServerBackupHandle::seal_for_handover(expected)` accepts a separately selected
`ServerRoomBackupIdentity`. Obtain the whole archive through `capture()` and retain
or persist it before sealing. Both operations require the private native handle;
no browser or account-facing backup, seal or activation endpoint is registered.

The method requires an actual current deployment lease on this host. It acquires
the exclusive authority-file permit before the actual room and raster mutexes,
captures the complete original server archive, and compares its whole identity
with `expected`. A stale choice returns an error without appending an epoch. The
caller can capture and select a new complete archive explicitly; the operation
does not silently refresh its selection or truncate it to matching records.

On equality, the same exclusion remains held through the append and sync of one
fresh deployment epoch. The temporary lease for that new epoch is closed before
the exclusion releases and is never returned. All old participating server
transactions either finish before capture or fail their old-epoch check before
entering native work afterward. An admitted HTTP upload body cannot publish its
raster after the fence.

## Data and ownership

The returned `SealedServerHandover` contains the exact complete accepted archive
and detached previous/sealed epoch selections. Its archive includes deleted
native history, protected registration digests and every retained raster,
including unreferenced files. Keep it host-only. `into_backup()` transfers DATA;
neither it nor either selection creates a serving lease or a live activation
proof. Later epoch claims can supersede these historical selections.

The original log, raster files, account policy and client states are not changed
or deleted. The operation does not acknowledge pending client work or clear any
client queue. Full native restore can use the returned ordinary archive through
the existing absent-only recovery contract. Starting another server remains a
separate explicitly authorized operation.

Sealing is not listener shutdown. Stop the listener and drop every router,
connection and private handle when releasing the actual source file owners.
Health responses retain their existing meaning; they are not a serving grant.

## Lock order and failure semantics

The order is deployment permit, room mutex, then raster mutex. The seal must not
call `Host::transaction` while holding its exclusive deployment permit: that
method acquires a shared permit and would reenter the authority mutex. The
internal append primitive checks both actual authority identity and exclusive
permit mode; a shared permit or another authority's exclusive permit cannot
append through it. No caller/provider callback splits the final source check
from the fence.

Busy exclusion returns `Locked`. Callers may retry contention against the same
selected cut; changed data, retired leases and uncertain storage are not
contention. Capture or selection failure leaves no new epoch. An uncertain
append, sync or unlock can already have changed the durable epoch and must not
be interpreted as permission to resume the old server. Preserve original files
and the selected archive, and inspect/reopen the actual authority before deciding
what to do next. No rollback, truncation or automatic takeover is attempted.

Blocking native work is not cancelled by dropping its awaiting future. A started
seal can finish after the caller stops waiting. The cancellation test pins native
entry, observes real exclusive file custody, cancels the awaiting task and then
verifies the durable fence and exact recoverable original source bytes.

## Scope toward whole room activation

This barrier covers the accepted original native log and actual server rasters
for all ten existing profile/transport combinations. Independent server-log or
comment generations retain their separate custody and archive contracts. The
[separate live generation handover](NATIVE_GENERATION_CONTINUITY.md) now supplies
a whole-source seal for an actual serving generation room without adopting an
inactive recovered host or discarding its original custody. A
complete room activation still needs their lifecycle integration, authenticated
current provider mappings, every registered and retained client/outbox source,
historic asset dependencies, durable decisions and the approved cross-generation
Undo/Redo and offline-edit bridge. A server backup or sealed epoch does not stand
in for that closure. The full feature-parity goal and all thirteen V1 gates remain
open; this checkpoint changes no version, tag, publication or deployment.

## Functional coverage

Native loopback workflows verify stale late text and unreferenced image refusal,
no epoch append on refusal, exact whole archive recovery, old socket and upload
rejection, exact offline retry with duplicate detection, and future Undo/Redo.
Additional tests cover unfenced/closed/busy sources, internal permit ownership,
queued native work, a genuine second-process authority contender and cancelled
awaiting tasks. Qualification results are recorded separately; these contracts
are not a browser or physical-crash qualification.

## Functional qualification

The [native qualification checkpoint](qualification/2026-10-28-accepted-server-handover.json)
records 267 server tests, 171 no-server tests, 23 doctests and ten additional
handover runs. The [public API example](../experiments/relay/examples/server_handover_functional.rs)
persists the selected archive before sealing, re-admits its bytes from disk and
restores into an inactive destination. It rejects the old writer connection lease
and requires resume with the separately retained credential before replaying
offline groups and future Undo/Redo. A second run refuses its occupied destination
without changing existing bytes. These are native functional checks, not a full
release qualification.
