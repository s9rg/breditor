# Recovery bytes and current reconciliation in one reservation

The opt-in metadata coordinator adds `captureReconciledServerPacketRecovery`.
It captures complete resolved client/server packet and raster bytes, then checks
current Native, client, metadata and provider state while the same parent
reservation remains held. This is a step toward coordinated room activation.
It returns data; the Native serving transition remains a separate operation.

## One source cut with two literal outcomes

The input is the existing closed recovery input: a genuine continuation host,
selected server archive, participant inventory and asset transport, with optional
bounded raster limits. Copies of live owners and extra readiness fields refuse
admission. The coordinator publishes its actual busy reservation before input
preparation can invoke application code.

The capture first uses the existing complete resolved-byte recovery operation.
It then continues the existing current-reference read with the original
reconciliation captured inside that same work item. Independently saved data
cannot enter this internal continuation. The original standalone current-read
operation still obtains its own fresh original reconciliation.

The new version-1 result has format
`breditor/reconciled-server-packet-recovery` and scope
`same-held-client-native-metadata-server-bytes-and-current-provider`. It retains:

- the complete existing recovery outcome and its original bundle;
- the complete current reconciliation outcome, including its Pending reasons;
- byte-length and SHA-256 bindings for references, packet manifest, Native
  dependency response and source resolution.

The reference cut, original metadata facts, complete Native dependency response,
server archive, participant inventory and control selection must agree before
composition. Actual selected owners, cancellation, current authority and every
held Native document/comment publication stamp are checked after composition.
The final result and its data graph are frozen.

Byte retention and current reconciliation stay independent. Retained offline
bytes cannot acknowledge a client head. A checked current read does not imply
that every backup byte was retained. Original uncached versions and packet
Pending diagnostics remain literal even when complete current source knowledge
is available. No combined ready flag, writer, acknowledgement or activation
capability is returned.

## Lifetime and failures

The reservation covers parent capture, original metadata journals, actual Native
owners, whole-upload custody, complete-byte collection and the current provider
read. Current Native source knowledge and provider requirements are rechecked
through their genuine ports. A source change or disposed selected archive
refuses the result, including changes during final result construction.

The parent keeps its existing failed-capture law: an error during a full capture
retires that attempt. Persisted content and Pending operations remain retained;
callers close the failed owner and use deliberate recovery under fresh policy.
They must not retry a new capture through the retired object. Input-admission
refusals that occur before the parent capture retain their original behavior.

A returned observation is point-in-time data. Persisting or copying it cannot
reserve a future server epoch, keep a browser owner alive or authorize serving.
Future activation still needs current authenticated Native and client ownership.

## Functional qualification

The complete source and independently installed worksets each require twenty
cases: eleven data-association laws, six deliberately simulated transport-fault
checks, two genuine seven-family recovery workflows
and the original reference-only current-read workflow. Both require nine strict SDK declaration
checks, the exact source-matched Native executables and unchanged normal Wasm.

The real workflows retain all fourteen whole-upload roles, save and read back
complete recovery blobs, reconstruct the selected Native server into an inactive
destination and inspect the retained data through genuine readers. The checked
workflow uses actual managed-upload acknowledgements and two original protocol
delivery passes, leaves historical catalog packets uncached and checks future
Native document/comment Undo/Redo after the held work ends.

A destructive final-result disposal check runs only after the successful complete
capture has been retained. It requires refusal, unchanged persisted metadata
lanes and Native stamps, and refusal to reuse the retired metadata owner. The
fixture does not continue positive capture checks through a deliberately failed
owner. Interrupted earlier fixture runs are retained separately.

Reproduce the mandatory worksets with these scripts, in order:

1. `node scripts/build-reconciled-packet-native.mjs`
2. `node scripts/check-reconciled-packet-recovery-source.mjs`
3. `node scripts/check-reconciled-packet-recovery-installed.mjs`

The separate Native target has a monitored 3 GiB build ceiling and protects
previous executables and normal Wasm. Both functional and full candidate plans
require these checks and retain the existing byte-recovery and current-read gates.
The [qualification record](qualification/2026-11-02-reconciled-packet-recovery.json) retains both completed worksets, exact source, Native binaries, package archives, public recovery data and a read-back-verified proof.

## Remaining boundaries

IndexedDB, locks and raster presentation are controlled fixtures. These checks do
not establish real-browser storage, physical process-crash or power-loss recovery,
cross-device exclusion, a public hosting deployment or complete candidate profiles.
Production authenticated whole-room activation and remaining parity are still
required. All thirteen V1 gates remain open. Original protocols, defaults, normal
Wasm and package versions retain their existing meanings.
