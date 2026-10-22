# Retained input source restore

The private restored-operation source path turns a detached complete operation
snapshot or flat lineage into a real editable native source. The new journal
retains the entire incoming file and the unchanged legacy original. A later cold
reopen reads that retained input with fresh factories and host authorization;
it does not require the original live owner or a fabricated completed recovery.

This is the source component of complete participant restore. The private
[whole participant coordinator](RESTORED_PARTICIPANT.md) now joins it with actual
upload custody. A complete next-generation provenance export and whole-room
adoption remain integration work. No source-only factory is exported publicly.

## Architectural priorities

First, complete operational recovery without losing offline native edits,
Undo/Redo, review packets, uploads or incoming provenance. A successful backup
read is not sufficient: restore, interrupted commit replay, editing, reopen and
the next complete export must form one continuous lifecycle.

Second, reconcile actual client/provider and independent document/comment log
generations. Local receipts and retained packets must match the selected server
history before any provider resumes delivery.

Third, authenticate whole-room activation with fresh server fencing. A saved
ready marker, local writer lock or upload-custody owner is not a current grant.
Cosmetic changes and browser-specific polish follow these integrity boundaries.

## Explicit identity and closed storage

The host selects snapshot or lineage input, its expected original and manifest,
fresh native factories, current access, synchronous authority check, cancellation
and limits. The restore plan binds that selection, the full incoming file digest
and the two actual journal/source database names under a separate digest domain.
It does not select factories from the file or invent unused legacy destinations.

The parent coordinator selects a separate coordinated plan variant and digest
domain that also binds its actual parent and upload-store names. The standalone
plan remains unchanged. Opening either variant with the other's identity refuses
instead of retargeting existing native work or upload custody.

The source uses dedicated `restored_operation_history_files` and
`restored_operation_history_heads` stores. Its journal has exactly four stores:
stage, immutable original, immutable input and at most two complete cuts. All
store definitions, keys and bounds are checked before value cloning. Both full
file digests and complete cut hashes are checked on admission. Legacy journal
and source readers refuse these schemas; no implicit migration occurs.

## Ordered replay and acknowledgement

Restore replays the legacy original, selected CURRENT, selected PENDING and
latest LIVE in that order. Consecutive byte-identical cuts share one replay.
Only the operation envelope is rebound to the new plan; native checkpoints,
version packets and delivery records retain their exact bytes.

Every stage opens through the real independent source constructor under both
native writer leases. Its normal persistence sequence prepares one exact cut,
commits the actual source and acknowledges that cut in the journal. The stage
cursor advances in the same journal transaction as the acknowledgement. A
previous pending cut must finish before the next selected stage can start.

A source may match the acknowledged cut or the exact pending cut after a lost
acknowledgement. Missing acknowledged data, foreign keys, changed inputs and
other source divergence refuse without overwriting or silently repairing work.
Interrupted preparation, source commit and acknowledgement are cold-resumable.

## Genuine ownership and native continuation

A private restore hold retains the journal, original and independent archive
while intermediate sources close and both actual author callbacks settle. It is
not a borrowed read promise; such a promise would deadlock source closure.
Intermediate native sources never escape the restore coordinator.

Read-only native replays of the original and input LIVE remain owned for the
source lifetime. During bootstrap, native writes must continue the original.
After the last stage, captures must also continue input LIVE and retain its
local versions. Admitted saved cuts cannot regress its relay progress. Neither
AST equality nor a hash alone proves those native-history relationships.

At final handoff, the actual registered source, current policy, native ancestry,
version set and unchanged source stamp are checked synchronously before the
restore hold is consumed. Ordinary source closure then owns journal cleanup.
Authority loss after a committed final acknowledgement refuses the return but
leaves the full input and committed source available for explicit cold resume.
Discard frees unsaved memory and owners; it never deletes durable inputs/cuts.

## Export boundary

The old local and complete-delivery exporters refuse a restored-operation
source. The immutable input remains readable through the private journal, but a
public complete export must combine it with the new current/pending/live state
and real whole-upload owner in an explicit newer snapshot/lineage family. It
must retain older input-only assets without recursively nesting whole archives.
This boundary remains required before the component can become a public
complete-participant restore API or qualify V1.

## Functional qualification

The [selected qualification](qualification/2026-10-22-restored-operation-source.json)
pins 15 passing checks from the 281-check functional plan. Source and fresh
offline installed packages pass the same 31 focused laws, including twenty
interrupted-commit windows, flat-lineage restore and late final-acknowledgement
revocation. Both run the full 640-policy snapshot restore matrix, with 640 cold
reopens and 1,920 exact future document/comment history comparisons each.

Both legacy 640-case journal matrices also pass against the same source and
matching package archives. Workspace/diagnostic tests pass 2,647, editor tests
385 and script tests 2,204, with three existing opt-in skips. Native runtime files
are retained; the full Rust suites were not freshly rerun for this TypeScript
change. Complete upload/source handoff, next export and V1 gates stay open.
