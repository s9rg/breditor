# Checking room history and upload availability

The private `PhysicalRoomClientOperationV3.readHistoryAssets(host, options)` path
checks current server availability while the genuine room, all selected clients,
their protected history records and their complete upload stores remain held.
It includes uploads with no surviving document reference. A local uploaded
receipt cannot establish that the current server still has the bytes.

## Actual ownership and fresh permission

The room and every selected parent are reserved before fresh read grants run.
Original and generation participants acquire temporary whole-upload custody;
the five newer families keep their existing custody. No store is selected by a
caller-supplied report, database-shaped object or saved completion flag.

The independent read grant and signal govern this inspection. Expired operational
jobs remain expired. Existing history-only reads neither acquire these additional
upload locks nor send a provider request; their permission and cancellation
semantics remain unchanged.

The protected-history readers preserve original, committed, pending and LIVE
states as distinct records. Their existing native replay and continuation checks
cover review packets, retained versions and historical asset addresses. The
upload reader captures complete files from the actual held stores, not just rows
referenced by the visible document. Root-private policy limits govern archive
admission even when a store facade or archive advertises larger limits.

## Authenticated server check

The host must be a genuine `SharedPhysicalRoomRecoveryHost` created with an
independently selected endpoint, expected native control identity and fresh
operator authentication. Prototype overrides cannot replace its private check
port. The selected ancestor, current server and participant inventory must match
the actual retained catalog before any read grant runs.

For a complete selection with no unresolved native packet dependencies, one
request covers the union of protected-history addresses and every whole-upload
content ID. The existing Rust endpoint checks its actual native/provider owners.
The response must match the exact control selection and request digest, partition
all requirements into available or missing, and preserve content metadata for
any bytes also present locally.

A missing mapping, missing referenced payload or missing unreferenced upload
keeps the result pending. Incomplete historical-copy selections and unresolved
packet dependencies also remain pending; they reauthenticate the host but do not
send a partial asset request that could be mistaken for complete coverage.

## Revalidation and cleanup

After the request, every protected reader re-admits its actual persisted records
and checks native state. All whole uploads are captured and hashed again. The
actual root intent and every retained catalog file are then reread and checked.
The detached result is projected before the final callback-free current-state
fence, so late cancellation cannot publish a successful result.

Temporary upload locks remain owned until their actual cleanup promises finish.
The root stays busy during that wait. Failed cleanup remains in the root's
recovery cleanup scope for retry; no returned report carries a release callback,
mutable source, store or writer credential. Cleanup does not need a continuing
read grant and never closes the caller's original clients. After actual cleanup,
a callback-free root lifetime and observed-signal check rejects a prepared result
if cancellation or root close happened during that wait. It does not consult a
mutable caller signal getter or reuse the now-closed child readers.

The source capture refuses more than 512 MiB of complete upload archives in one
pass. Existing per-store, protected-history, provider request and response limits
also apply. Oversized complete input is refused rather than truncated; these
ceilings do not establish a qualified memory or latency budget.

## Remaining operational handoff

The result is point-in-time availability for the selected held state. It does
not approve upload-base choices, settle a queue, authenticate copied receipts,
replace participant baselines, restore a room, or activate a writer. Staged
selected clones still need their own independently trusted choice pin or fresh
explicit approval, complete pending/offline/review/version admission and one
durable ownership handoff.

The catalog's ancestor/current-server identity does not select the host's separate
local origin or control instance for activation. Full reconciliation must bind
those identities, current registered document/comment streams and stale-writer
fencing without reinterpreting the original catalog protocol. Cross-device
fencing, sustainable history and the remaining V1 parity gates stay required.

## Functional qualification

The [selected qualification](qualification/2026-10-24-held-history-provider.json)
passes twelve normal candidate stages. Source, fresh offline-installed packages
and actual production-bundled code each pass the same 1,421 laws, with eighteen
strict consumer type fixtures and no failures, cancellations or skips. All 1,245
earlier history laws and 161 asset laws remain, alongside fifteen new native
provider scenarios. Nine Rust asset-requirement tests also pass; this is not a
fresh full-workspace Rust suite or the full 445-stage candidate plan.

Four new cases cover all seven recovery families across independent document
and review history policies. Each execution path cold-reopens 28 genuine client
instances and exercises both future native Undo/Redo lanes. They reuse language
3 standard/atomic data, not 28 unique server registrations or the full native
profile-by-history matrix. Two source-matched native producers cover ten
profile/wire rooms each, with all 100 input files verified.

A reproduced development-path cleanup race is repaired: abort or root close
while actual upload-lock acknowledgements remain pending must reject the
prepared report. In a separate fresh offline consumer, both unchanged assertions
pass with the fixed package, fail with the captured actual pre-repair
history-read module, and pass after restoring the fixed module. No assertion or
other product module is substituted. Superseded pre-repair and fixture-failure
runs are retained separately, not counted as final qualification.

These functional tests use controlled IndexedDB, locks and raster presentation.
They do not qualify physical-browser durability or memory and latency budgets.
Rust sources, normal Wasm bytes, public-root export names and package versions
remain unchanged. The next implementation remains complete durable native/record
retention, independent approval of exact choices and genuine operational
handoff, followed by current registered-stream reconciliation and authenticated
activation. All thirteen V1 gates remain open.
