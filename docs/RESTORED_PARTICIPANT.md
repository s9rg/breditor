# Whole input participant restore

The private restored participant joins a detached complete input, a real native
source and a whole upload store under one resumable coordinator. It retains the
incoming snapshot or flat lineage before changing either component, holds actual
upload custody throughout native replay and returns the ordinary source/store
together after a final current-policy check.

This implements participant ownership, not the next complete provenance export
or room activation. The factory stays private until that complete export can
preserve the input alongside subsequent native work, uploads and older pixels.

## Four real destinations

The host selects distinct coordinator, source-journal, source and upload database
names, expected input identity, explicit native factories, current access and
synchronous authority. The callback must return `undefined` or throw; thenables
and Boolean permission flags refuse. Storage hosts are pinned throughout work.

The parent plan binds the input kind, manifest, complete file digest and all
four actual names. Its two-store schema holds one plan/stage row and the whole
immutable input. Row counts are admitted before values are cloned. Unknown
stores, definitions, keys, inputs and plans refuse without migration.

The source has a distinct coordinated-restored plan variant and digest domain
binding the coordinator and upload names. A journal for another parent/store,
or a standalone restored source, cannot be silently adopted. This is data
identity, not an authority grant. Standalone source plans and legacy formats
retain their meanings and defaults.

## Upload ownership before native replay

The parent advances each component through reserved, started and complete. It
publishes started before mutating that component and complete only after actual
readback. Uploads complete before native source replay starts.

A new upload destination uses the genuine held-import factory. Actual exclusive
custody is acquired before any raster or queue row is inserted and stays held
through all native opens and final handoff. Ordinary cooperating handles cannot
cancel, retry or upload through that scope. No provider is started automatically.

A cold started upload stage may import into missing/exactly empty storage or
admit an exact already committed archive after a lost acknowledgement. It never
merges with an occupied different store. Completed storage must exist: it is not
rebuilt from an older input. Later operational rows may grow, counters may
advance and cancelled uploads may be retried. Every input row still retains its
bytes, dimensions, nondecreasing epoch/attempts and acknowledged uploaded reference.

If opening retained storage succeeds before custody acquisition is interrupted,
the attempt keeps that actual store handle. Retry acquires genuine custody on it
before verifying or advancing the upload stage. It does not treat an open handle
alone as custody or require discarding the complete input to retry.

The real source component restores original, CURRENT, PENDING and LIVE through
normal native writer leases and save acknowledgements. Exact pending work is
finished before a later cut. The actual source journal owns an independent copy
of the complete incoming archive, including pending-only pixels absent from LIVE.

## Cold resume and final handoff

Resume reads the actual parent input with fresh host factories and authorization.
It verifies the plan, source identity, source-owned input, native ancestry/local
versions and actual held upload records. Missing completed components and foreign
or changed data refuse. A saved complete marker does not substitute for owners.

The final path awaits coordinator lease callbacks while the source journal,
native writer leases and upload custody remain owned. It then checks current
authority, actual native ancestry, upload custody and an unchanged source stamp
synchronously before releasing upload custody and transferring the ordinary pair.
The returned store waits for its real release callback before ordinary mutations.

Late permission loss retains both real components and the complete input. The
same owner can reacquire coordinator leases, reopen its retained metadata and
retry after authority is renewed. Source ownership is independent of the retired
parent archive, so successful source editing continues after handoff. Permanent
cancellation requires explicit discard and a fresh cold-resume policy.

Close first saves the native source and keeps custody on a save failure. Explicit
discard drops unsaved memory and releases actual owners, not durable input,
native cuts or upload records. Failed unreturned opens remain covered by the
existing actual cleanup ledger; returned owners are never automatically drained.

## Functional evidence

The [2026-10-22 qualification](qualification/2026-10-22-restored-participant.json)
pins 17 selected plan checks, not the entire 285-check plan. Both source and fresh
offline installed packages repeat 29 focused laws and the normal full 640-policy
snapshot-input matrix. Focused tests additionally cover flat lineage, pending-only
pixels, interrupted acknowledgements, missing/changed components, cross-parent
refusal and same-owner retry after late permission loss. The partial-store-open
retry repair retains the exact failing assertions from before the fix.

An earlier normal matrix refused raster admission after 137 successful cases.
The original failure, instrumented diagnostics and later ordinary passes are
retained separately. Its cause is unresolved; no decoder guard was weakened and
no browser or physical-durability conclusion follows.

## Remaining integration

The old complete exporters still refuse the restored source. The next format
must combine its incoming graph with current/pending/live native state and the
real whole upload owner, preserving old input-only assets without recursively
nesting full archives. Read authorization must remain independent of an expired
write grant or signal.

Whole-room mixed-family custody, provider reconciliation, independently segmented
server comments/logs and fresh authenticated activation follow that export.
Local custody, data hashes, retained uploaded references and ready rows are not
new server receipts or permission to resume delivery. Browser, accessibility,
long-session, performance and physical-durability gates remain separate.
