# Durable generation source handover

The native relay has a separate opt-in prepared source intent. It durably retains
the complete generation native/raster archive before committing a source-bound
deployment epoch. A cold restart can distinguish preparation, that exact seal,
and an unrelated superseding claim. None is a replacement serving grant.

Existing archives, default routers, ordinary claim semantics and revision-one
104-byte deployment frames keep their meanings. This supplies a durable source
decision prerequisite, not authenticated whole-room activation or V1 approval.

## Prepare complete DATA first

Call `LogGenerationServerBackupHandle::prepare_handover` with current account
authentication, an absent trusted private directory and the selected whole source
identity. It verifies actual owner access, captures the complete native/raster
source under the serving epoch, and checks the selected identity before creating
any intent directory. Source edits can continue after capture while immutable
DATA is written; preparation neither freezes future edits nor claims an epoch.

The existing joined archive is streamed into `source.backup`, synced and read
back under a byte budget. The closed canonical `intent.json` is then synced,
with the actual private directory and immutable file witnesses, complete source
identity, prior epoch, fresh random salt, encoded length and planned epoch.
Retain the returned `PreparedLogGenerationHandoverIdentity` independently
before sealing. A partial preparation is preserved, not silently completed,
overwritten, repaired or interpreted as a committed fence.

Preparing avoids another complete encoded archive copy when writing. Existing
capture/admission payload limits still apply. Cold admission owns native archive
bytes; this is not a streaming-memory or performance qualification.

## Commit the exact selected source

Call `seal_prepared_handover` with the actual prepared owner and its separately
selected identity. It authenticates again and acquires the real exclusive epoch
permit before room and raster locks. It rechecks every immutable intent file,
the exact prior epoch and complete actual source. Physical rotations and
unreferenced rasters count even when document clocks do not change.

Only equality permits an append. The 32-byte nonce commits to a separately
domained canonical tuple of the complete source, prior selection, random salt,
actual intent directory/file witnesses and archive length. The existing frame
encoding is unchanged. An unrelated claim at the same ordinal has a different
nonce and cannot count as this source decision. No caller callback splits the
final source/file checks from the synced fence.

The temporary new lease is closed before exclusion is released and is never
returned. The returned object owns retained DATA, not a replacement router,
permission, provider closure, client ACK or delivery decision. Old participating
native writers and final upload publication remain fenced by their old epoch.
Stale source choices append nothing and preserve newer accepted work.

## Cold reopen and status

`PreparedLogGenerationHandover::open` requires the independently retained intent
identity and exact private root. It re-admits canonical metadata, native/raster
archive bytes, all bounds and actual inodes under exclusive file custody. A
copied directory or identity DTO is not another owner. No file is recreated or
repaired. No account-facing read, prepare, seal or activation endpoint is added;
cold DATA access requires trusted host/filesystem configuration.

`status` rechecks immutable files and complete actual independently configured
authority lineage, including the exact previous selection. Its results are
point-in-time DATA:

- `Prepared`: the prior epoch is still current. This does not prove that the
  source has not accepted newer edits; sealing must compare its full cut again.
- `Sealed`: the exact source-bound planned nonce is retained. Later valid epochs
  can exist; this is a historical source decision, not current serving authority.
- `Superseded`: another decision replaced the prior epoch without this planned
  nonce. A higher counter alone does not establish this seal.

Malformed/incomplete authority histories or changed custody refuse instead of
selecting a convenient older state. Metadata cannot reconstruct a serving lease.
A pre-fence crash may require fresh source custody, a fresh CAS choice and an
explicit new preparation; it never revives the saved old lease or overwrites the
old intent. Post-fence ambiguity is resolved by the actual source-bound lineage,
not an in-memory success flag or a separately guessed completion receipt.

## Concurrency, cancellation and failure

Shared status reads serialize retained descriptor access: cloned file handles
share a cursor and must not race their seeks/reads. Ordinary epoch contention can
return Locked; a healthy read does not manufacture corruption. A warm intent
that observes uncertain custody permanently retires, even if old names later
reappear. Explicit cold re-admission remains a separate operation.

Dropping an awaiting future cannot cancel a started blocking worker. That worker
retains real epoch/source/store custody until it settles. It may finish the fence
after the caller stops waiting. Preserve all files and outside choices on error;
a durable epoch is not rolled back. Tests terminate a real child process before
and after epoch sync, then open original files in a new process context. They
also cancel a wait while a worker demonstrably owns real exclusion. These are
process/interruption tests, not physical power-loss or hardware qualification.

The supported backend assumes cooperating Unix file locks, private trusted
namespaces and durable fsync. Lost history cannot be detected if every independent
witness is rolled back with it. A copied ledger is not multi-machine consensus.

## Scope toward activation

Public tests exercise all ten grammar/transport choices with both server native
history lanes segmented, preserving exact offline document/comment retries,
future Undo/Redo and complete image bytes through cold intent reopen and inactive
restore. This is not a new exhaustive Cartesian claim for every history family.
Fault laws cover partial preparations, actual source changes, unrelated claims,
immutable-file replacement, abrupt process exits, cancellation and shared reads.
The [qualification](qualification/2026-10-28-durable-generation-source-handover.json)
records 523 server-feature tests, 273 no-server tests, 186 plan/verifier
laws, twelve selected native laws and four public laws, all without skips.
Twenty shared-read stress repetitions complete 4,800 successful statuses. Full
logs, exact tested source, and both original failed assertion cases are retained;
this is not a whole-plan or release qualification.

Whole-room adoption still needs complete provider/client reconciliation,
historical packet/outbox settlement, explicit local-comment adoption, retention
of the actual recovered host's original archive and generation-operation custody,
and an authenticated once-only replacement transition. No bare native Room
unwrapping, saved selection or prepared source status substitutes for that closure.
All thirteen V1 gates and the full parity goal remain open.
