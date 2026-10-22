# Independent recovery write policy

Complete independent-delivery recovery must check current host policy where
native and upload storage can change, not merely before returning an owner.
This is a local recovery write boundary. It is not server authentication, a new
archive protocol or permission to activate a recovered room.

## Reproduced failures

The older coordinator passed selected read-only factories to ordinary native
restore, waited for its first save, then checked current authority. A factory
that completed after that authority ended could still commit a native head.
Separately, ordinary `RichAssetStore.restoreBackup` could commit both upload rows
after policy ended during raster admission. Both final owner returns refused,
but the refusal came after the writes.

Actual normal-native regressions reproduce one committed native head and two
committed upload rows. The expanded laws target six boundaries across all four
document/comment history combinations: schema request, native factory, head
publication, completed source commit, upload raster admission and upload insert.
Four additional laws check that completed recovery does not retain old policy.
The same added assertions expose twenty failures in the old implementation.

## Private bootstrap selection

`independent_history/bootstrap_policy.ts` selects a synchronous current check in
a private WeakMap. No serialized field, caller-shaped flag or stored completion
record selects it. The delivery facade forwards that selection onto its actual
already-bound lower-level option object. It must not copy that object again:
copying would drop the separate genuine companion binding held in its WeakMap.

The native session checks the selected bootstrap policy before and after writer
lease acquisition, schema opening, retained-cut reads, native replay, source
construction and first flush. Database creation checks inside the actual upgrade
transaction before and after store creation. A denied upgrade aborts; an empty
schema already legitimately created before later denial may remain for retry.

Initial source persistence combines bootstrap policy with the existing native
operation-origin guard. Current checks run before the write transaction and
inside its read/write callbacks, including after the paired head is queued.
Denial before commit aborts the entire native file/head transaction. Both lanes,
local versions, receipts and retained packets still form the same exact cut;
there is no separate unguarded lane save.

An explicit bootstrap signal also subscribes the actual paired write transaction
to Abort. Cancellation after the last head request succeeds but before commit
aborts that transaction, including its native files. Polling cancellation only
between callbacks would leave a late-commit gap. Local and delivery recovery use
the same separately selected runtime signal; no signal or grant is persisted.

After successful first flush and its final current check, the temporary bootstrap
selection detaches before the session returns. Ordinary native ownership,
read-only policy, writer leases and operation-origin guards remain intact. The
enclosing coordinator still checks its current policy through verification and
handoff. This separates a completed recovery grant from later explicitly selected
host policy, rather than poisoning a handed-off source when the old grant ends.

## Held upload import

Missing or empty uploads use canonical `RichAssetStore.restoreBackupHeld`, with
the coordinator's current policy and signal. Actual cooperative custody begins
before insertion and stays with the coordinator through verification and final
handoff. Its guard covers schema creation and the atomic asset/metadata write.
The coordinator does not import through ordinary restore and acquire custody
after the write has already happened.

An already retained upload store is fully admitted, then its actual custody is
acquired and checked. Neither path starts uploads, changes archived statuses or
epochs, replaces unknown data, or substitutes a fabricated custody handle.
Whole-store digest comparison and final native/source checks remain required.

## Interruption and scope

Source, upload and coordinator databases remain separate transactions. This
repair does not pretend to provide atomic rollback across them. If source commit
was authorized and completed before later policy loss, its exact bytes remain;
denial cannot delete or rewind that history. The same applies to a completed
upload commit whose acknowledgement or subsequent check fails. Fresh explicit
Resume re-admits actual components and continues without overwriting them.

The first save's temporary policy is independent of source-history identity.
Original protocol meanings, formats, native limits, default APIs and local-only
comment bindings do not change. The helper now also supports the separately
qualified [complete local-only coordinator](INDEPENDENT_PARTICIPANT_RECOVERY.md).
Provider/client reconciliation, complete room adoption, authenticated
activation, sustainable Undo retention and V1 qualification remain separate.

## Selected functional qualification

The [2026-10-22 qualification](qualification/2026-10-22-independent-recovery-policy.json)
passes 31 selected checks from the 300-check plan. Both the unchanged source
implementation and actual retained pre-repair packages fail the same twenty
added laws; all 127 recovery/custody laws pass against the repair in source and
fresh installed packages. The original one-head/two-upload reproductions also
pass with their files and assertions unchanged.

The full normal source and installed workflow each completes 256 recovery cuts,
512 handoffs, 512 exact whole-upload and original-file comparisons, 1,024 read-only
refusals and 256 fresh-policy source reopens. The workflow includes 120 local
native cases and 88 authenticated network cases. Its fixed case domain and
assertions are unchanged. All semantic results match; timing-dependent transport
poll totals are retained separately in both raw reports and the evidence index.

Four fresh offline consumers pin matching candidate archives. Held-upload,
native-owner and native-origin compatibility probes pass, as do current source
graph and catalog contracts. The two earlier full 480-cohort catalog matrices
are carried only across their nine unchanged data-reader modules; they are not
claimed as fresh matrix runs for this repair. The native fixture producer is
fresh, twelve normal runtime files and 2,857 native inputs are unchanged, and full
Rust suites are carried rather than freshly executed. Workspace/diagnostic tests
pass 2,647, editor tests 385 and script tests 2,349, with three existing opt-in
browser skips. This is functional repair evidence, not platform durability,
browser qualification, unlimited history, whole-room activation or V1 readiness.

The subsequent [complete local qualification](qualification/2026-10-22-independent-participant-recovery.json)
separately closes the late-cancellation gap between the last successful native
head request and commit. That signal subscription was not part of the first
127-law checkpoint above. Its four unchanged failures now pass; restoring the
recorded prior bootstrap implementation in an isolated build reproduces them.
