# Independent operation recovery lineage

The private lineage archive preserves the complete input to a recovery alongside
its later state. Earlier pending proposals, upload state and image bytes remain
available even when the latest state no longer references them. Shared literal
parts are stored once, and each earlier input file is reconstructible byte for
byte. This implements the provenance data layer; durable restore and operational
source ownership remain required.

## Flat immutable inputs

Each lineage link selects an earlier snapshot or lineage root and one complete
newer operation snapshot. Its domain-separated digest binds both references.
The outer file contains a sorted table of links, exact snapshot headers and
content-addressed literal parts. Snapshot headers are raw parts rather than
recursively escaped JSON. Whole earlier archives are not nested as new payloads.

Every link and state must be reachable from the selected root. Literal part
offsets are contiguous and sorted by digest. Missing predecessors, extra states,
unreferenced parts, overlap, unknown fields and trailing bytes refuse. All literal
hashes and snapshot envelopes are checked before a native factory runs. Shared
original archives, sealed native files, upload archives and pixels retain their
exact bytes without duplicate copies in the part table.

The original operation snapshot format and its reader remain unchanged. They
reject the new lineage file instead of returning an incomplete older-format
export. A lineage digest describes data identity, not an author signature,
current permission or ownership of a persistent source.

## Native continuity and input conservation

Every component snapshot passes ordinary native admission under the host's
explicit read-only factories. Across links, the later acknowledged cut must
continue the input's latest native document and comment histories, retain its
local versions and preserve forward relay progress. The later snapshot's pending
and live states then pass their ordinary continuation checks. A valid descendant
of the legacy original alone cannot prove continuity from a newer restore input.

Every input upload row survives with the same immutable bytes, MIME type and
dimensions. Epochs and attempt counters cannot decrease, and an acknowledged
uploaded reference cannot change. This includes rows added after the legacy
original. Opaque asset identities must also keep the same content across all
selected states, not merely within each component archive.

An explicit Stop or Forget may remove a queued proposal from the latest state.
The input file still contains that older proposal and any pending-only raster
bytes. Lookup follows exact asset and generation bindings in retained snapshot
headers; it does not infer references from the final document tree.

## Read policy and lifetime

Reading requires current synchronous read authorization, explicit read-only
native policy and independently selected data identity. It does not use the live
source's expired write grant. Reading and reconstructing input files create no
persistent owners, database writes or network activation.

Temporary native owners are freed when cancellation or read revocation happens
inside the actual restore factory. Canonical archive methods prevent replaced
public facades from returning false readiness or intercepting internal cleanup.
Closing a lineage during asynchronous reconstruction refuses the result rather
than returning a successful closed-handle operation. Detached immutable files
already returned to a caller remain usable.

## Bounds and functional checks

The new composite family has a 16 GiB file ceiling, at most 1024 lineage links,
1025 distinct snapshot headers and 1048576 literal parts or distinct asset
identities. Its framing header retains the operation header byte bound. Each
literal part and component snapshot keeps its existing independent limits.
Exceeding a bound refuses explicitly; no input is truncated or silently dropped.
These are format bounds, not measured memory or performance guarantees. Existing
native lifetime ceilings, including the 1000-item Undo limit, remain.

Both candidate profiles require 29 focused laws, a strict public type fence and
the full 640-case native-policy matrix in source and fresh installed packages.
The installed laws permit only reversible module and fixture location changes;
the matrix probe is byte-identical. The checks compare exact input files, both
native histories, pending and live state, whole uploads, shared parts and future
Undo and Redo under expired write authority. Native replay in these checks is a
data oracle, not qualification of an operational restore coordinator.

The [selected functional qualification](qualification/2026-10-22-independent-operation-lineage.json)
records both passing matrices and exact installed archives. A separate actual
factory-cleanup regression was retained as open at that checkpoint. The following
[native lifetime repair](NATIVE_OWNER_LIFETIME.md) prevents rejecting an already
owned object from freeing its original editor and retains fresh results until
constructor transfer. Its functional qualification remains separate from durable
restore integration.

## Required durable restore implementation

Restore must be a distinct coordinator under fresh host-selected destinations,
factories, current permission and writer-recovery acknowledgement. It must not
fabricate an older recovered owner or reinterpret stored metadata as a grant.

The coordinator must retain the incoming archive before changing destinations.
The restored source must then own its input provenance through cold reopen,
ordinary editing, close and future export. A separate restored-source and state
family must refuse through older incomplete readers. Advancing its original,
acknowledged, pending and live native states must use actual author leases and
the ordinary checked save path. An interrupted exact attempt must finish before
a later state replaces it.

A genuine recovery hold must keep the journal and original replay alive while
temporary source owners close and their actual author callbacks settle. A read
scope is not that capability: waiting for such a scope during source close would
deadlock a subsequent reopen. Whole uploads must be restored into a new selected
destination or reconciled under actual custody, with every input row conserved.

Final handoff must keep source, input and upload owners held while cleanup and
release callbacks finish. The last current-policy and exact-source check must
run afterward, with no asynchronous gap before genuine ownership is consumed.
Lost permission must leave durable input and readable work available for an
explicit retry. Whole-room adoption, provider/client closure, independently
segmented server comment logs and fresh authenticated activation follow this
restore boundary. All thirteen V1 gates remain open.
