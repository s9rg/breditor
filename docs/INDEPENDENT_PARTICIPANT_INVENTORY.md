# Independent participant coverage and native source ownership

Room recovery must preserve independently selected document and comment histories
without treating a local history as an authenticated delivery stream. The separate
independent readers compare genuine native accepted prefixes with an explicitly
selected server inventory. They do not translate journals, discard offline work,
or infer a binding from matching actor IDs.

## Separate public contracts

Both `SharedRoomParticipantInventory.checkIndependentSources` and
`SharedServerLogGenerationParticipantInventory.checkIndependentSources` accept
explicit `independent-local` and `independent-delivery` rows. Each row supplies
the matching genuine backup and its current genuine source capture. The logical
reader retains its existing file limits; the physical reader retains the complete
selected physical source in its `{source, coverage}` result.

The separately named physical `checkSourceCohort` accepts `original`, `generation`,
`independent-local` and `independent-delivery`. Rows contain exactly `family`,
`backup` and `source`. The old `checkMixedSources` and its two-family type remain
unchanged. Existing files, wire versions, history domains, defaults and restore
factories retain their meanings.

A private operational friend additionally accepts an actual `restored-graph`
source. Neither that source capture nor the private friend is a package-root
export. Public readers do not silently acquire journal scopes or accept a
serialized graph-readiness flag.

## Native coverage and explicit uncertainty

Each selected independent source rechecks its actual native document and comment
readers, exact recovery records, room, schema, principal, writer, actor and selected
history kinds. Retained versions and delivery records retain their existing
namespace checks. The four document/comment history combinations remain distinct;
generation data is never flattened into an original journal.

For a registered stream, a sufficiently advanced client must reproduce the exact
native prefix accepted by the server. A shorter client yields `server_ahead` and
Pending, not a false fork. A different accepted prefix refuses as a fork. Missing
registered streams stay Pending. Document observers must have a zero local writer
clock. Bound review observers must match the registered read-only role and have
a zero local actor clock.

An `independent-local` source has no delivery binding. Its exact local comments
and version packets remain retained; coverage includes an `unbound_review` row.
It cannot cover a registered review stream merely because its actor, principal
and content match. There is no fabricated relay, empty outbox wrapper or implicit
publication policy. A complete delivery source must instead carry the genuine
document and review bindings, transport version, namespace and observer policy.

A cohort combines coverage without choosing between duplicate retained copies.
Repeated document writers or review actors across any selected family refuse,
including an unbound local actor. An uncovered registered stream remains Pending
unless another nonduplicate selected source genuinely covers it. Unbound histories
remain explicit even if all registered streams are covered. No file is selected
for deletion or made obsolete by this result.

## Actual source owners and bounded reads

Independent-source admission creates a private runtime token backed by a WeakMap.
Copied token-shaped objects and caller-supplied readers cannot replace the actual
native owner. Input rows are snapshotted once with bounded indexed array reads;
caller iterators and replacement `map` methods are not invoked. All eight public
logical and physical inventory methods share one source-array snapshot. They
read its length exactly once, require a safe integer from zero to 1,024, and
reject missing rows before native admission. Array species constructors and
later lengths cannot change the selected shape. Existing file families and
valid source-row meanings remain unchanged.

The private restored-graph capture requires the genuine editable restored session,
its actual graph archive and a fresh independently authorized journal read scope.
The graph's original, latest operation and LIVE must match the actual restored
source. Capture pins the actual source stamp, records and native readers across
awaited authorization. It freezes returned metadata and dispatches through
captured canonical methods rather than shadowable instance facades.

Expired writer authority still forbids writes, but it does not invalidate a new
independently authorized read. Revoking that read grant, changing the source,
closing the graph or releasing its native owner invalidates the source check.
The actual journal enforces its existing eight-scope bound, releases failed
admissions, and waits for held scopes during shutdown. Dispose the capture before
closing the session; copying detached metadata does not extend a native lifetime.

Readers guard the selected inventory's actual lifetime before and after native
checks, including reentrant input access. A disposed inventory cannot return a
successful result. Private operational dispatch also requires the actual branded
inventory owner, not an object with a similarly named method.

## Prefix coverage is not activation

Checks are synchronous after admission and perform no storage transaction,
publication, upload, lease acquisition or network request. They do not save or
modify native histories. `covered` means the selected registered prefixes match;
it does not establish provider byte custody, a complete set of retained client
copies, current account permissions or readiness to activate a server.

A retired but still readable native owner can support a diagnostic read without
being eligible for editable ownership transfer. Operational handoff still requires
the actual writer leases, complete client/provider reconciliation and fresh host
authority. Durable room adoption must retain all selected copies and explicit
unbound histories before an authenticated activation decision.

## Required functional checks

The fixed source and offline installed-consumer probes exercise all ten native
physical-room fixtures, both writer transports and all four matched independent
document/comment pairs. Genuine reference restores compare future native
Undo/Redo only after releasing the competing writer lease. Source checks compare
exact recovery records and assert that prefix reads start no storage transaction.

The private bridge is exercised after actual recovery, operation restore,
snapshot restore and graph restore, with expired write authority and a separate
read grant. Mixed cohorts combine those genuine graph readers with original,
generation-local, generation-relay, generation-retained, independent-local and
independent-delivery sources in both author directions. Duplicate copies, active
competing writers, revoked reads, forged tokens and closed owners must refuse.
The installed probe repeats the same assertions against fresh matching archives;
only module, runtime and verified native fixture data locations may differ.

The [selected qualification](qualification/2026-10-22-independent-inventory.json)
passes 31 checks from the 296-check functional plan. Source and fresh offline
packages each pass 23 focused laws and the full 480 mixed-cohort matrix, alongside
80 independent cohorts, 160 cold native comparisons and 144 future native
document/comment history pairs. The eight input-snapshot failures pass after the
repair with unchanged regression assertions. Existing source/installed inventory
compatibility and restore contracts pass too. Native implementation and twelve
normal runtime files remain unchanged; the actual native fixture producer is
fresh, but the full Rust suites are not freshly rerun.

A separate development catalog prototype passes 96 cohorts retaining all five
archive families, 480 historic copies and 960 exact cold file comparisons. Five
storage/policy fault checks pass. It is not integrated into the production package
or qualified as an operational room coordinator.

This component does not close the remaining whole-room catalog and activation
work. Native retained-Undo limits, sustainable long-lived storage, large-file
qualification and the V1 release gates remain separate requirements. See the
[restored graph contract](RESTORED_OPERATION_GRAPH.md),
[physical participant contract](SERVER_GENERATION_PARTICIPANT_INVENTORY.md) and
[physical room catalog contract](PHYSICAL_ROOM_RECOVERY_CATALOG.md).
