# Fresh history reads for protected delivery and local parents

The five delivery and local operational families can now inspect their protected
history under a fresh read permission after an old operational job has ended.
Each reader reserves a genuine parent synchronously, reads its actual stored
parent and archive records, and combines them with the held source's historical
reference reader. It never returns an editable source or transfers writer or
upload custody.

## Explicit family admission

These private SDK entry points live beside their corresponding participants:

- `reserveFreshIndependentLocalHistoryRead`
- `reserveFreshIndependentDeliveryHistoryRead`
- `reserveFreshRestoredDeliveryHistoryRead`
- `reserveFreshSnapshotLocalHistoryRead`
- `reserveFreshFlatLocalHistoryRead`

Each takes the genuine family owner, an explicit read-only session factory, a
fresh synchronous permission check and optional fresh cancellation. A detached
report, object with the same prototype, wrong family or caller-selected source
cannot supply parent custody. Read options accept only session factory data and
optional asset limits. Configuration copying rejects field getters, cycles and
non-plain records, with depth, array and field-count limits of 32, 1,024 and 4,096.
Family-specific validation then checks the native identity and read-only policy.

Reservation holds the parent's private busy flag before factory admission.
`prepare()` observes fresh cancellation, checks fresh permission and reads actual
parent/archive bytes before opening the source reference scope. Neither step
calls the old operational permission check or adopts its cancelled signal.
Existing progress, handoff, recovery and source-only read defaults are unchanged.

## Stored records and protocol identity

Local and delivery readers verify the actual completed first recovery record,
protected archive and retired native destination. The local parent additionally
verifies its separate operational marker. The restored graph reader verifies the
coordinated parent marker and literal input file. Snapshot and flat readers
verify their actual parent marker and protected input file.

The flat family keeps its existing canonical manifest identity; it is not
silently converted into the snapshot family's whole-file digest protocol.
Source reference readers still require complete native ancestry, both graph
anchors where applicable, and the distinct imported, committed, pending and LIVE
states. Reference addresses do not certify that an asset provider currently has
the corresponding bytes.

## Read lifetime

`metadata()` returns a deeply immutable report after successful preparation.
`verify()` rereads actual parent/archive and source records. `check()` applies the
fresh permission check. `checkCurrent()` is a pure fence over held custody,
observed cancellation and captured source pins; by itself it does not discover
out-of-band changes to stored bytes. Before preparation it checks custody only.

Failed preparation releases partial read scopes and the private reservation.
Closing releases read borrows, not real parent/source/upload leases. Prepared
reports remain readable after close without retaining permission callbacks or
restore factories. Closed unprepared readers have no fabricated report. Current
author policy, document/comment Undo/Redo and subsequent handoff remain intact.

## Qualification and remaining integration

The [qualification](qualification/2026-10-24-fresh-delivery-history.json) passes
eighteen selected normal candidate stages. Source, fresh offline packages and
actual production-bundled code each pass 1,230 cumulative laws, including 31 new
family/lifetime laws. Eleven strict consumer fixtures pass. All five existing
participant contract and type-fence stages also pass.

The new functional laws use actual recovered parents, archive bytes, nonempty
historical references and native histories. They cover expired permission and
cancellation, invalid/reentrant permission checks, late native factory failure,
modified stored markers/files, future document/comment Undo/Redo, rejected owner
substitutions and closed prepared/unprepared callback/factory release.

These readers and the separate original/generation barrier provide per-family
building blocks. Complete seven-family coordinator integration, current
provider/client reconciliation, authenticated room activation and sustainable
history remain required. All thirteen V1 gates remain open. The normal Wasm,
public-root exports, versions and original protocol meanings are unchanged.
