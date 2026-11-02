# SDK coordination of durable native activation

This is an opt-in bridge from a genuine held SDK room to the authenticated
[native activation endpoint](DURABLE_NATIVE_ACTIVATION_CONTROL.md). It adds a
complete local intent before requesting the irreversible native epoch commit.
Neither a local record nor an HTTP receipt grants an editor writer or settles
an ordinary document, comment, metadata or upload acknowledgement.

## Separate operations

`SharedDurableNativeActivationHost.configure` takes an independently selected
endpoint, exact native control identity, current operator authentication and
live policy. Configuration performs no network operation. Only `commit` sends
the bounded POST. The endpoint must use HTTPS or explicit loopback HTTP, and
must end at the native activation commit route. Requests omit browser
credentials, redirects and caching. Complete canonical responses are required.

The private experimental `SelectedLocalMetadataDelivery` coordinator supplies
three room operations:

- `prepareNativeActivation` captures complete client/server packet, native and
  raster recovery bytes and current reconciliation under one actual parent
  reservation. Its trusted `selectActivation` callback may prepare an inactive
  matching native host after capture completes. It must not activate it. An
  independent `retainChoice` callback must save the choice before the new local
  namespace is created. An existing namespace is refused without overwriting.
- `readNativeActivationIntent` opens the existing namespace, rehashes all bytes
  and reads its advisory state. It creates no placeholder, sends no activation
  request and issues no serving permission.
- `commitNativeActivation` reopens the complete intent, verifies the exact live
  client and metadata cut, uses a separately selected genuine native reader to
  inspect the retained server bytes, and requires fresh approval. It repeats
  source inspection after approval, records `request-started` durably before
  HTTP, then records the exact observed receipt. Real source and namespace
  custody remain checked through request and cleanup. Parent cancellation is
  forwarded to the actual request; it cannot undo an already started native job.

The coordinator remains an experimental private SDK module. The network host,
its options/errors and the data/result contracts are exported at the package
root. This addition does not finish public whole-room activation or API promotion.

## Uncertain outcomes and explicit retry

Intent phases are `prepared`, `request-started` and `receipt-observed`. State
advances by compare-and-swap under the original namespace lease. Every complete
object is retained independently of this phase. A missing reply never implies
that the native epoch did not commit.

After the durable request-start attempt, cancellation, rejected responses,
incomplete bodies, late policy loss or cleanup failure conservatively produce
`activation_outcome_unknown`. There is no automatic retry or rollback. An
application may explicitly retry the same independently saved choice under fresh
current custody, native inspection and approval. The real native controller
returns the same receipt for its actual retained active service without appending
another epoch. A saved receipt alone never reconstructs that service.

If the live source changed, the old intent remains data. Prepare a newly selected
absent namespace for the new source; never rewrite the old intent to conceal the
possibly committed operation. Original Pending and cache flags remain literal,
including valid outstanding offline document/comment work. Native service
activation is distinct from subsequent normal protocol delivery of that work.

## Complete intent format and lifetime

The tagged graph format distinguishes arrays, objects, numbers, undefined and
Blob occurrences. Blob contents are deduplicated by SHA-256 while each occurrence
retains its MIME. It preserves negative zero and ordinary marker-shaped user
data, rejects accessors and unsupported class instances, and restores inert
frozen data. The complete graph, every object and all cross-format source
associations are checked on each cold open. Actual native inspection remains a
separate mandatory admission step before a commit.

Current explicit bounds are 1 GiB for aggregate intent bytes, 64 MiB for the
graph, 16,384 distinct objects, one million graph nodes, depth 128 and 4,096 state
revisions. The independently selected database name is bounded to 512 UTF-8
bytes. Native control request/response bodies remain bounded to 64 KiB.

A cancelled queued database open retains namespace custody until its actual
request drains. The late upgrade is aborted, and no missing database is silently
created. Close refuses to claim cleanup completion while a raw request still
owns that lifetime. Original room data, histories, upload queues and metadata
stores are not overwritten by intent storage.

## Qualification scope

The focused transport/storage suite has 45 cases using the actual packaged Rust
digest implementation with controlled IndexedDB and locks. Strict public and
experimental coordinator declarations are also checked. The dedicated native
fixture admits the complete seven-family SDK workload and exposes a separately
authenticated prepared control; private fixture commands cannot commit its next
epoch. It obtains the active router and reads actual durable deployment state
before resuming the stable client endpoint.

The [qualification](qualification/2026-11-02-sdk-native-activation.json) records
45 focused cases plus one complete genuine Native workflow from source, and the
same 46 cases from fresh independent package archives. Source cases used separate
jobs; the combined source wrapper was not executed. Twenty prior recovery checks
also pass. All 2,400 freshly compiled SDK files and all 2,777 package artifact
files match the independently installed copies. Native example lint, touched-file
formatting and strict declarations pass.

The actual workflow cold-reopens seven owners with fourteen offline document and
comment suffixes and three real upload ACKs. A 15,806,161-byte complete intent is
stored and reopened before a commit request. A lost actual Rust response remains
unknown. Explicit reapproval/retry returns the same receipt, and a separate read
of actual durable authority confirms exactly the planned next epoch. Normal
protocol delivery then resolves the offline heads; exact future document/comment
Undo/Redo and original Pending/cache meanings remain checked. Complete intent
objects, original packets, native public cuts, rasters, binaries and executed
source are retained in the read-back-verified proof.

The dense source workflow took about 45 minutes, including setup, cold admission,
repeated complete inspections and test assertions. This is a functional test
duration, not a typing benchmark or a production performance qualification.

## Remaining architecture and release work

This checkpoint covers the default SDK history-policy configuration across all
seven families; it does not qualify the complete independent policy cross-product.
The public network host and private metadata coordinator do not yet provide a
complete public production whole-room handoff. Its local actor lifetime, normal
delivery and final current reconciliation still need one supported orchestration
contract. Ordinary offline edits and Undo/Redo remain required throughout that work.

Native repeat safety applies to the actual retained controller/service. After
host-process loss, a saved receipt cannot revive that controller or its lease:
fresh operational custody, authentication and native recovery are required.
Complete SDK/host process-crash integration and physical browser storage durability
remain unqualified. This controlled test uses real Rust service/disk operations
with controlled local IndexedDB, locks and raster presentation.

The new build/source/installed component commands are prepared, but full candidate
profile wiring/execution, sustainable recovery cost, remaining parity and all
thirteen V1 gates remain open. Neither historical archive-read/WebKit fault is
declared repaired. Original wire protocols, defaults, normal Wasm and package
versions are unchanged.
