# Schema admission V3

Status: experimental Rust API in the unpublished `0.3.0-alpha.16` checkpoint.

`SchemaAdmissionRequest::try_prepare_v3` explicitly prepares a new Local Log
Checkpoint V3 under a host-selected target schema. The existing `try_prepare`
method and `PreparedSchemaAdmission` retain their V2 contract. There is no
implicit upgrade, decoder fallback, or version negotiation.

V2 admission can already retain document properties through nested Document V2
when its new session has empty history and pending formats. V3 admission is the
explicitly typed bridge into the V3 storage family, not a fix for document
property loss in that V2 case.

## What is preserved and reset

Admission validates the source's exact schema binding and complete document,
then validates the same immutable AST under the target schema and limits.
Boolean, integer, and string formatting properties remain exact. No property
is removed, defaulted, coerced, or translated to make the target accept it.
Successful admission shares the source root allocation with a new target
document proof; an incompatible target fails without modifying the source.

The target fingerprint must differ from the source. Its lineage and durable
session must be distinct from the source's respective identities. These checks
do not prove global freshness or reserve storage identities.

The target intentionally starts at revision zero with empty undo/redo history,
selection, pending typing formats, replay tombstones, and sequence frontier.
The host chooses the new history capacity and checkpoint limits. Source
history is neither transferred nor destroyed, and the source session is not
closed. This is structural admission, not migration of an editing session.

## Owned result and storage preparation

`PreparedSchemaAdmissionV3` is a separate non-Clone owner that retains source
and target identities, the target checkpoint, and its exact canonical V3 JSON.
Its debug output omits document content and checkpoint bytes.
`SchemaAdmissionV3Error` retains the existing stable admission categories but
has a distinct V3 checkpoint-error payload.

`LocalLogStorageRootJsonCodecV3::prepare_root_from_schema_admission` borrows
that V3 result. It rechecks target context and binding, decodes the supplied
checkpoint bytes, compares them against canonical encoding of the owned
anchor, enforces resource limits, and prepares a Frame V3 root selection.
It does not manufacture a tail-compaction proof or claim an accepted physical
prefix. V2 and V3 prepared owners cannot cross the corresponding root API
boundaries; compile-fail tests guard both directions.

## Deliberate limits

Source checkpoint anchors are wire-neutral. Selecting V3 output says nothing
about the source's original serialization generation. Admission does not
authenticate input, prove storage freshness, publish a head, acquire a writer,
write a file, or update IndexedDB. Global identity uniqueness and eventual
adoption remain host responsibilities. A same-fingerprint request is rejected
even if a caller merely wants a new schema label.

No Wasm or browser API changes are included. Browser autosave continues using
its existing Session Checkpoint V3 path. V3 write-authority integration remains
a separate checkpoint after this in-memory preparation boundary.

Tests cover unchanged-tree admission, all three scalar property kinds,
narrowed-domain rejection, source preservation, history reset, exact V3
checkpoint/root round trips, byte/owner mismatch, identity and resource
rejection, and cross-generation type isolation.
