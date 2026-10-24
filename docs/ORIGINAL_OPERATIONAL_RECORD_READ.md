# Original operational parent record reads

`captureOriginalOperationalRecords` reads a genuine held operational parent with
fresh independent read permission and cancellation. The old job may have expired
or been cancelled. Its original progress and handoff guards remain unchanged;
read permission cannot reactivate that job or release its writer leases.

## Actual archive and recovery marker

The reader reserves the parent's private busy state and checks its genuine source
bindings, held recovery leases, storage lifetime and cancellation. It rereads the
actual ready recovery marker and the stored operation record and origin archive.
The original recovery journal has a marker, not a second archive. Closed schema,
identity, record count, phase and complete archive integrity checks remain in force.
Cached readiness and a cached backup cannot substitute for those stored bytes.

`verify()` repeats actual stored-byte admission. `checkCurrent()` checks only
SDK-owned binding, lease, lifetime and cancellation state, without callbacks or
I/O. It is not a fresh native clock or stored-byte check on its own.

## Opaque child references

The handle exposes immutable metadata, admitted archive files and
`captureReferences({restore, checkAuthority, editor?, signal?})`. It exposes no
mutable source, session, core or upload facade. The SDK selects the parent's
actual children; caller source/store selectors, unknown fields and accessors are
refused. The explicitly supplied native restore factory remains read-only.

The child reference result owns the original native and selected retained-store
readers. Its currentness checks include both parent custody and source pins; its
verification rechecks the parent archive/marker and the actual source records.
Catalog and shared queue reservations compose without calling writable guards.
Only one child may be live at a time. Disposing it permits another capture.
Disposing the parent closes its child before unlocking the parent reservation.
Late factories cannot return a live child after parent disposal. Closed parent
and child reports retain detached metadata while clearing all callbacks.

The developing first interface returned mutable child objects. An unchanged
isolated control reproduced an edit through that projection after the old job
grant was revoked. Removing the projection and returning opaque reference reads
repairs that control before this new private API is committed. This is not a
defect claim against the earlier saved or released API, nor a JavaScript sandbox
for a host that already owns native factories or other writer handles.

## Qualification and remaining scope

The [qualification](qualification/2026-10-23-original-operational-record-read.json)
passes twelve selected normal stages. Source, fresh offline packages and actual
bundled code each pass the same 953 laws: 52 new parent/reference/lifetime laws
and all 901 prior record/reference/storage laws. Seven strict consumer type
fixtures pass. The unchanged isolated opacity control fails before the repair
and passes afterward. Existing original operational regression covers 66 custody
transfers and 198 cold reopens; existing native inspection, storage and paired
backup checks pass too. Native Rust and normal Wasm bytes are unchanged.

Child references cover the current source's committed, pending and LIVE states,
not fresh native ancestry/reference replay of the historical parent archive.
The separate [explicit historical scope](OPERATIONAL_HISTORY_REFERENCES.md) now
adds that archive replay before current records without changing these defaults.
Synchronous fresh reservations across every selected room member, historical
copy integration, whole-upload/provider/client reconciliation, authenticated
activation and sustainable history remain required. No handoff or activation
capability is issued, and all thirteen V1 gates remain open.
