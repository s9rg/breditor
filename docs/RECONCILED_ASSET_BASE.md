# Retaining a selected asset base

`RichAssetReconciliation.exportRetainedBase()` preserves an actually applied
local upload-state decision as a portable binary file. The file embeds both
complete input archives, every explicit conflict choice and the exact selected
union. Selecting a different uploaded receipt therefore does not discard the
losing receipt or reinterpret an old participant's recovery baseline.

`RichAssetReconciledBase.read(file)` independently admits this new file family.
It recomputes the explicit union instead of trusting a selected-file checksum or
an applied marker alone. This supplies a retained input for room adoption, not
automatic adoption, provider authentication or permission to edit a room.

## Export and current ownership

The exporter uses the genuine reconciliation attempt and its existing ordinary
or explicitly held ownership mode. It reads the actual applied ledger and both
unchanged input files, encodes the selected union, rereads the ledger after
encoding callbacks, and compares the actual entire target in one transaction.
Missing rows, changed queue state or a changed byte budget refuse. The comparison
performs no asset, budget, ledger or source-file writes and never repairs a target.

Current source permission, cancellation, store context and any borrowed custody
remain required throughout export. An in-memory applied report is insufficient.
A target commit with a still-decided ledger needs the existing explicit retry;
the exporter does not advance that ledger. Closing an attempt or the base reader
does not discard the durable reconciliation input files.

## Portable admission and limits

The independent `breditor/reconciled-asset-base` version-one format uses
`BREDITOR-ASSET-BASE1` framing and the MIME type
`application/vnd.breditor.reconciled-asset-base`. Its canonical header pins the
source database's exact opaque spelling, original store limits, ordered choices
and the lengths and SHA-256 hashes of `current`, `original` and `selected` files.
The header's own SHA-256 covers those pins. No credential or executable callback
is serialized; hashes are integrity checks, not signatures.

Admission checks framing bounds before parsing or raster decode, admits both
whole inputs through the existing raster verifier, replans their union and
requires the selected bytes to match its canonical output. Altering a choice or
substituting another valid raster archive does not pass by recomputing outer
checksums. Host limits may tighten the archived policy; the file cannot widen
them, including on every later predecessor/successor continuity edge. Omitting
fresh limits does not fall back to a larger default than the archived ceiling.
The raster/archive/ledger V1 formats and ordinary methods remain unchanged.

The outer file permits three existing raster-archive maxima plus a 16 MiB header.
Its selected union still fits one store's original limit, at most the existing
100 MiB raster budget. Retaining three complete files has real space and decode
cost; these refusal bounds are not a qualified memory or latency budget.

## Continuity before and after the decision

`verifyPredecessor(priorWholeUploads)` verifies that the retained `current`
input extends an independently selected prior baseline. Every prior raster must
survive with identical immutable bytes and metadata. Epochs and attempt counters
cannot decrease, and a prior uploaded state must keep its uploaded status and
exact receipt. Those are the existing continuity rules, not a relaxed substitute.

Only the explicit decision crosses to the selected side.
`verifySuccessor(currentWholeUploads)` then applies those same continuity rules
from `selected` to a later whole store. Neither losing input can justify a later
receipt change. Another conflict requires another retained decision; callers can
verify adjacent before/after edges while preserving every earlier base file.

Both checks are pure file admission. They open no database, start no network
work and return no lease or native source. The reader's metadata and entries are
immutable detached evidence. Disposal releases its file references; metadata
does not become current authority after disposal.

## Room adoption still required

The room coordinator must durably retain the exact base file, its independent
selection pin and destination roles before publishing a new operational base.
It must bind the predecessor edge to the actual original participant and the
successor edge to the actual held target. A bare file or successful check cannot
substitute for these bindings or for current host permission.

All seven recovery families must retain their original native histories, pending
and offline work, review packets and version files. Their existing cold-open
defaults continue to reject incompatible receipt rollback. The coordinator must
select the new base through an explicit successor contract rather than rewriting
those original files or quietly changing the meaning of an old baseline.

Whole retained-copy reconciliation, current provider byte admission and fresh
registered document/comment coverage must precede authenticated activation.
Activation must bind the native A/B/C selection and current control instance,
fence stale writers and recover uncertain publication without overwriting data.
This portable base provides none of that authority by itself. Sustainable history,
remaining feature parity and all thirteen V1 release gates remain open.

## Functional qualification

The [selected qualification](qualification/2026-10-24-reconciled-asset-base.json)
passes fourteen normal candidate stages. Source, fresh offline-installed packages
and the actual production bundle each pass the same 111 laws, with four strict
consumer type fixtures. This includes all 67 earlier held-reconciliation laws,
40 new base laws and four new native integration cases.

The four new cases preserve 28 original client instances across all independent
document/comment history pairs while separately retaining and restoring 28
incompatible selected queue branches. Every original client cold-reopens with
its exact native histories and old upload bytes unchanged; future document and
comment Undo/Redo remain usable. The older mutation cases add another 28 cold
client reopens. These are repeated recovered instances, not 56 distinct server
registrations. The SDK cases select language 3 standard with atomic wire; the
fresh native producer covers ten profile/wire inputs.

The tests use controlled IndexedDB, locks and raster presentation. They exercise
explicit receipt changes, repeated decisions, cold file admission, target and
ledger divergence, late encoding changes and refusal without repair. The normal
Wasm and native producer binary remain unchanged. This qualification establishes
the portable base and its separate restoration, not room-level adoption or final
platform durability.

An unchanged installed regression control reproduces the initial new reader's
archived-budget defect: both oversized-successor tests fail with the retained
before-fix reader and pass with the actual fixed package, before substitution
and after restoration. Only that reader module changes in a separate fresh
consumer. Every continuity edge now intersects archived and current host limits;
neither defaults nor explicitly larger host limits widen the selected base.
