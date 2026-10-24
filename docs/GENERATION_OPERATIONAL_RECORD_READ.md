# Generation operational parent record reads

`captureGenerationOperationalRecords` reserves a genuine held generation parent
using fresh synchronous read permission and cancellation. Expired original job
permission or cancellation does not prevent this independent read. Original
progress, handoff and writer guards remain unchanged.

## Both actual protected archives

The reader checks genuine source bindings, recovery leases, storage lifetime and
open whole-upload custody. It rereads the ready recovery record and its actual
archive, then the operation record and its actual archive. Both files undergo
complete independent archive admission against the selected identity and digest.
One valid file, cached readiness or a cached backup cannot replace the other.

`verify()` repeats those actual stored-byte checks. `checkCurrent()` is a pure
binding, lease, lifetime and cancellation fence, not a stored-byte check by itself.
Neither operation releases leases, writes storage, starts transport or grants
activation.

## Opaque current-source references

The returned handle exposes metadata, the admitted files and
`captureReferences({restoreSegmented, checkAuthority, editor?, signal?})`. It
exposes no editable source, core, session or upload facade. Unknown fields,
accessors and caller-selected replacement sources or stores are refused.

The SDK selects the actual complete generation source. Its child reference read
covers committed, uncertain-attempt, pending and LIVE records. Parent and source
fences compose; verification includes both parent archives and actual current
source records. Only one child is live at a time. Parent disposal closes its child
before releasing the read reservation. Failed or late factories release their
borrows without transferring namespace or writer custody. Closed reports keep
detached immutable diagnostics while clearing all callbacks.

## Qualification and remaining work

The [qualification](qualification/2026-10-23-generation-operational-record-read.json)
passes thirteen selected normal stages. Source, fresh offline packages and
actual bundled code each pass the same 1,050 laws: 97 new generation-parent laws
and all 953 prior record/reference/storage laws. Eight strict consumer type
fixtures pass. New parent tests cover four genuine generation families, three
selection scopes and every compatible policy mask in the language-3 matrix.
Original-parent regressions and the existing 362 generation asset/recovery laws
also pass. Existing source and installed generation-operation probes each retain
six cases, 24 handoffs and 18 operational cold reopens. Normal Wasm is unchanged.

This is not fresh native/reference replay of historical parent archives. That
closure, synchronous fresh reservations across every room member, whole-provider
and client reconciliation, authenticated activation, sustainable history and
remaining parity are still required. All thirteen V1 gates remain open. No version,
push, tag, publication or deployment is promoted.
