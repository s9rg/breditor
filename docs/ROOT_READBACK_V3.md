# Root readback V3

Status: experimental, unpublished `0.3.0-alpha.19` Rust API. This is a narrow
observational protocol, not a storage adapter or complete uncertainty resolver.

## Ownership and correlation

`begin_readback` consumes either a V3 uncertain publication attempt or its
accepted terminal owner. The readback retains the original exact plan, attempt
identity, publication-request issuance, and optional historical terminal claim.
It does not convert an uncertain source into a successful publication.

`adapter_request` records a fresh opaque probe identity before issuing one
borrowed comparison view. It exposes exact canonical candidate bytes and the
complete prospective V3 binding. A second issue is rejected, including after
dropping the first view. Rust prevents consuming the owner while that view is
still used. Copies of bytes or tokens are not independent correlated probes.
The shared root-resolution ID primitive is volatile and profile-neutral;
publication request IDs and V3 evidence/owners remain separate types.

## Host obligations

The host must read the selected graph and its profile/database/scope
incarnations, receipt, generations, and committed-head unique-index mapping in
one serialized fixed-scope read transaction. Normalize the full selection with
the V3 codec using facts from that same transaction, with its resource limits.
The request is for observation only: it does not authorize any storage writes.

`LocalLogStorageRootReadbackEvidenceV3::transaction_completed` attests that the
exact read transaction emitted terminal `complete` after every required read.
Individual request success, a cached normalized selection, `commit()` return,
abort, timeout, or another transaction's event is insufficient. Core cannot
authenticate the event, inspect IndexedDB, or establish the host's honesty.

## Exact-current matching

`observe_selected` checks, in order:

1. A probe request was issued.
2. Evidence names that exact request.
3. The observed head-index value names the candidate transaction.
4. The complete normalized binding and canonical selection bytes equal the
   retained plan. Equal lengths or receipt identities alone are insufficient.

Every rejection returns the unchanged owner and unapplied evidence. A wrong
selection is merely a rejected exact-current claim—not validated evidence of
absence, corruption, collision, retirement, or supersession. Request issuance
is not reset after rejection. Corrected evidence can be applied, but it must
still describe the same one-transaction observation, not a new probe.

A match retains the normalized selection and original source provenance. It
means the exact candidate was selected at the host-attested snapshot, not that
it is still selected now, that this particular publication attempt committed,
or that a writer lease exists. Another transaction may immediately supersede
it. Debug and error diagnostics omit document payloads.

## Deliberate limits

There is no storage I/O, browser/Wasm change, automatic restore, retry, writer
acquisition, or negative/superseded/retired observation protocol. Readback does
not reserve identities, stop copied dispatches, prove physical EOF, or resolve
all uncertainty. Lost callbacks leave the probe unresolved. Complete recovery
needs separately specified authoritative observations and write-authority
transitions; none may infer retry safety merely from a failed exact match.
There is no re-probe, read-transaction-abort transition, or reconciliation of
late publication terminal callbacks while the readback owns the source yet.

Tests cover all source terminal categories, pre/post-publication issuance,
one-shot exact egress, fresh probe identity, foreign/missing correlation,
head-index mismatch, same-length payload differences, incarnation mismatch,
lossless rejection, payload redaction, and compile-time API/ownership isolation.
