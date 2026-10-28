# Mixed current/journal generation reconstruction

The separate generation-component-reconstruction family preserves complete work
when actual source saves and a generation execution journal stop at different
per-client frontiers. It does not loosen retained-only reconstruction or ordinary
resume, change native protocols, grant source acknowledgements or activate a room.

## Reproducible failure

An actual native accepted-page import can save its recipient before its journal
append fails. Other sources can reopen older than unsaved work already retained
in PREPARED. One whole-room cut then has a newer recipient while the other has
newer peers. Neither complete cut contains the other. Selecting either cut as
the winner loses work; pretending a composite was a journal event forges progress.

The functional case injects one real recipient append failure after the first
source's native import/save, and six actual source-save failures. It genuinely
reopens disk sources and keeps the original journal unchanged.

## Complete component contract

Each participant records three provenance labels: native records, original
uploads and selected uploads. Each is current or journal. These labels are not
evidence by themselves. Complete input files must share their exact root,
approval and literal catalog bytes. Native comparison uses actual independent
readonly Rust replay, never text, AST equality, timestamps or version counters.

A native candidate must extend both inputs and conserve both complete packet
sets. Equal native histories do not allow choosing a stale packet copy: current
may be selected when the journal candidate drops a row. Journal is canonical
only when its whole candidate passes. Known order/packet mismatches are negative
proofs; cancellation, corrupt input, missing storage and grant failures propagate
and cannot be treated as permission to choose the other side.

Original and selected upload inventories are selected independently. Both full
input inventories must continue into the chosen inventory, including exact
raster bytes, epochs, attempts and existing uploaded references. No receipt or
network decision is synthesized. Incomparable inventories or packet decisions
still need an explicit merge; both complete inputs remain preserved.

The output copies complete actual records and their literal input files. It
does not manufacture native frames. Its diagnostic report is conservative
Pending: a composite DATA file is not a claim that one live source save or
provider observation produced that whole cut. The original reports are retained.

## Durable framing and admission

This family has its own magic, MIME, manifest, plan, selection, choice and intent
store. The plan binds the original journal identity/head, actual current cut,
actual journal-tail cut, composite output, every component label and the complete
ordinary room execution. The retained-only family still requires its output to
equal the actual journal tail; it cannot accept this different family.

The file contains the full original accepted input, every saved journal cut,
every diagnostic evidence payload and the complete execution file. That execution
retains both actual before-state and composite output. Admission replays and
recomputes the exact component join, checks its bytes and labels, then proves
that the original input and every saved cut fit the output, including packets
and both inventories. A final READ or list of hashes cannot replace evidence.

Limits remain explicit: one GiB for a complete file, sixteen MiB for its header
and the original 4,096-event journal bound. Overflow refuses without truncating
history. Existing-only reads create no placeholder. New immutable intent writes
are absent-only; corrupt or different existing bytes are never repaired in place.
Decoded journal DATA cannot append to the genuine original journal.

## Authority, lifetime and actual replacement

The genuine generation host is checked before incoming options are reflected.
The genuine selected owner reserves its native aliases before reads or callbacks.
Native factories are detached and bounded to the actual job, with source/asset
cancellation linked before the first capture. Real visitor cleanup remains
awaited before native exclusion releases; a pending durable open is not abandoned.

Inspection creates DATA only. Preparation freshly rebuilds the entire file,
reauthenticates every original accepted page, obtains an affirmative decision and
rechecks actual source bytes and the original head before and after persistence.
All bridge, preparation, execution, participant and upload targets must be
disjoint from original namespaces. Original sources and the journal stay intact.

Materialization requires another fresh choice binding actual source bytes and
the unchanged original journal. It saves only an ordinary immutable execution.
Actual warm/cold execution still retires the old owner and acquires real target
actors independently. Snapshot input uses its actual flat reconstruction recipe;
it is not relabelled in place. Promotion transfers native, packet and asset
ownership. A saved phase cannot grant a source lease, native actor or writer.

Replacement namespaces require a fresh generation input and journal for later
accepted imports. The composite never resumes the original execution under a
relabelled identity. Native Undo/Redo in both lanes and outstanding offline work
must survive replacement and those subsequent imports.

## Remaining parity work

This contract addresses mixed comparable components at one pinned authenticated
server cut. Genuine native forks, incomparable packets/queues, cross-server-cut
provider/client reconciliation, historical outbox settlement, explicit local
comment adoption, authenticated old-serving exclusion and durable whole-room
activation remain required. The full feature-parity objective and all thirteen
V1 release gates remain open. No release qualification is claimed here.

Functional tests use actual Rust histories and authenticated standalone controls
with controlled Node storage, locks and raster presentation. They do not certify
physical crash durability, native UI behavior or remote serving activation.

## Functional checkpoint

The [exact-source qualification](qualification/2026-10-28-generation-component-reconstruction.json)
passes 119 source, 119 freshly installed and 119 actual production-bundle laws,
with no failures, skips or cancellations. Each preserves the prior 107 laws and
adds twelve component laws. The fixed mixed case covers seven actual source
families, both native history lanes, reversed complete inputs, a validly rehashed
false-provenance archive, real interrupted saves, fresh cold actors, complete
uploads and a subsequent authenticated native import. It is one selected grammar
and segmented history pair, not the complete new mixed-case Cartesian domain.

Sixty-nine genuine native fixture hosts, 180 control laws, 182 candidate-plan laws
and seven strict consumer fixtures are preserved. Production Rust and the normal
Wasm remain unchanged here: the prior 310-test native baseline is carried, not a
new native run. Separate live-server/epoch repairs are not integrated or counted
in this package checkpoint. This is not full candidate-plan, crash, browser or
V1 release qualification; all thirteen gates remain open.
