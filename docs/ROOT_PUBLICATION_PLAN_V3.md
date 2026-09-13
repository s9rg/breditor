# Root publication lifecycle V3

Status: experimental, unpublished `0.3.0-alpha.18` Rust API. Preparation,
one-shot request issuance, and correlated host terminal claims are implemented.
This is not a storage-I/O implementation or a complete publication protocol.

`LocalLogStorageRootJsonCodecV3::prepare_root_publication` borrows a checked
Storage Root V3 selection plus host-selected database and planned scope
incarnation IDs. It canonical-encodes the candidate, derives its complete
prospective receipt and V3 generation binding, then strictly normalizes those
facts against the exact bytes. This final pass enforces input policy as well
as the output and nested-checkpoint policies used during encoding.

The result, `LocalLogStorageRootPublicationPlanV3`, is a private-constructor,
non-Clone owner of the complete binding and exact canonical candidate bytes.
The temporary validation anchor is dropped; the plan retains no editor session
or writable tail. Its inspection API exposes prospective binding facts and the
payload byte length, but not raw JSON. Debug output omits document content.

## Plan identity

`same_plan_as` compares the entire binding and exact candidate bytes. Equal
JSON alone is insufficient because database and planned scope incarnations
are absent from Storage Root JSON. Equal byte lengths and receipt facts alone
are also insufficient: different documents may have the same length.

Equality is not evidence of a committed transaction and does not authorize a
retry. It allocates no attempt ID and claims nothing about storage freshness.
The borrowed source can prepare equivalent plans again; non-Clone ownership is
API discipline, not a unique publication capability.

## Dispatch and terminal claims

`begin_attempt` consumes a closed plan into a non-Clone
`LocalLogStorageRootPublicationAttemptV3`. It allocates a fresh opaque volatile
attempt identity and enters uncertainty before payload egress. Equivalent plans
still receive distinct attempt identities.

`adapter_request` records a fresh request identity before returning its one-shot
borrowed view of the exact candidate JSON and full V3 binding. A second call is
rejected even if the first view was dropped without dispatch. The view borrows
the owner so it cannot be consumed while the view remains in use. The host can
copy JSON or correlation tokens; ownership is not an exactly-once I/O guarantee.
One token must cover at most one publication-capable transaction.

`observe_terminal_attestation` accepts only the V3-specific host claim type:

- `publication_completed(request_id)`: the exact publication-armed transaction
  emitted `complete` after all independent preconditions were checked and the
  complete exact atomic mutation set was enqueued. Request success, `commit()`
  returning, a resolver/read-only transaction, or a no-write idempotency check
  is insufficient.
- `transaction_aborted(request_id)`: that one transaction rolled back. It says
  nothing about copied payloads dispatched in other transactions.
- `not_attempted(attempt_id)`: the invocation closed before creating a
  publication-capable transaction. Valid before or after request issuance,
  but neither a timeout inference nor plan-wide noncommit evidence.

Attempt mismatch is checked first, then request issuance and exact request
identity for completion/rollback. Rejection returns both unchanged inputs.
Accepted terminal owners retain the plan, invocation and issued-request
identity, and an explicit category. All diagnostics omit the document payload.
These are host assertions: core verifies correlation, not host truth, database
state, transaction event provenance, or currentness. Terminal owners are
inspection-only, not writer grants or retry capabilities. No arbitrary success,
error, timeout, cancellation, or dropped callback clears uncertainty.

The shared volatile ID primitives and terminal categories are protocol-neutral;
V3 request, attempt, attestation, and terminal owners remain separate from
legacy owners. There is no public conversion into a legacy lifecycle.

## Deliberate boundary

There is no uncertainty-resolution, retry, rotation-publication,
writer-acquisition, or I/O API yet. Payload egress does not specify the full
adapter transaction/read-set/write-set contract. Actual V3 writes remain
disabled; the next checkpoint must specify authoritative readback and
resolution without treating a host completion claim as current writer authority.

Preparation proves no empty scope, identity reservation, current head,
provisioning, publication, durability, or writer authority. Incarnations remain
trusted host assertions. Payload hiding is not secrecy: the original root
selection remains independently serializable.

V1 publication types and behavior remain unchanged. No V3 plan can be unwrapped
into a legacy attempt owner. No durable record, Wasm ABI, browser autosave, or
demo UI changes are included.

Tests cover exact candidate binding and bytes, database/scope differences,
same-length payload changes, input/output boundaries, internal binding
mismatch, typed properties, source preservation, debug redaction, and
compile-time absence of cloning and premature dispatch. Lifecycle tests add
one-shot exact egress, fresh invocation identity, all terminal categories,
pre/post-egress not-attempted claims, crosswired attempts/requests, lossless
rejection, profile isolation, and borrow-lifetime enforcement.
