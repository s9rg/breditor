# Root publication preparation V3

Status: experimental, unpublished `0.3.0-alpha.17` Rust API. This is preparation
only, not a complete publication or storage-I/O implementation.

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

## Deliberate boundary

There is no `begin_attempt`, adapter request, dispatch, terminal-result,
uncertainty-resolution, retry, rotation-publication, writer-acquisition, or I/O
API for this plan yet. The next checkpoint must define request correlation
and conservative uncertainty before exposing a payload-bearing dispatch view.

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
compile-time absence of cloning and premature dispatch.
