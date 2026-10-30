# Selected server metadata receipts

This is a separate, opt-in authenticated read. Original document versions,
suggestions, revision receipts, catalog cursors, and recovery inventory meanings
remain unchanged. A page is data from a selected server cut; it is not a writer
grant, an installed receipt, a completed reconciliation, or room activation.

## Reason for the contract

A version publication or proposal revision can advance the server log without
changing document or comment clocks. Client-held acceptance receipts and matching
native clocks therefore do not establish that the selected current server still
contains those receipts. Reading exact original catalog entries and fingerprints
of their retained packet bytes supplies the missing server-side evidence.

## Request and response

The separately authenticated controls expose POST `/recovery/generations/v1/metadata/read`
and `/recovery/physical/v1/metadata/read`. Each request identifies its own protocol
family, format version 1, and the exact current control selection, including its
instance. Neither control accepts the other family's request or selection.

The mandatory `metadata` object names all three lanes: `versions`, `suggestions`,
and `revisions`. Every lane explicitly selects `disabled`, `start`, or `after`
with an original frozen catalog cursor. An enabled lane cannot be skipped with
`disabled`; a disabled lane cannot be queried as an empty enabled catalog.
Missing fields, additional fields, and noncanonical cursor spelling refuse.
Original native readers additionally reject foreign or unaccepted cursor cuts.

Each enabled result contains `kind: page`, its complete original `catalog` page,
and `packets` fingerprints. Original pages remain bounded to 64 entries/events.
Disabled results contain only `kind: disabled`. Fingerprints name the native
packet `id`, its exact UTF-8 byte length, and `sha256` as `sha256:` followed by
64 lowercase hexadecimal digits. This byte digest differs from the native
domain-separated packet identity; neither is an authorization credential.

Version entries fingerprint the first accepted original version packet. Proposal
publication events fingerprint their original proposal packet. Decisions remain
original immutable decision events, including original effect/author attribution.
Revision entries fingerprint only original committed two-record revision packets.
A complete uncommitted Prepare can remain retained for asset closure while
producing no committed revision receipt or child publication in this read.

Catalog permission fields describe the authenticated native server reader. They
never grant permissions to a restored client or replace its current account policy.

The outer response repeats the exact selected control and SHA-256 of the request
bytes. Its scope is
`selected-server-original-metadata-receipts-and-packet-fingerprints-page`.
The request bound is 64 KiB and the complete response bound is 8 MiB. Oversized
results refuse; no usable truncated prefix or fabricated empty lane is returned.

## Ownership and consistency

Existing exact-Origin operator authentication, independent request admission,
native owner authentication, provider proof, native/asset custody, and controller
closure rules apply. The native transaction checks the selected complete server
cut and participant identity before and after reading and encoding the page.
A final provider/source check runs after the transaction. A metadata-only server
change invalidates the selection even when native clocks remain unchanged.
The controller/router does not expose an editing or activation service.

## Requirements for the client reconciliation consumer

A future consumer must start every enabled lane at the selected current cut,
retain each original frozen terminal cursor, consume every page, and recheck the
live selected controller. An arbitrary caller-selected older interval cannot
establish complete current catalog coverage. The consumer must compare every
locally retained accepted receipt and packet against exact original server data,
without treating retry `duplicate` flags as new durable events. Missing or
conflicting original receipts require an explicit Pending/refusal outcome; they
must not be republished with invented sequence numbers or decision order.

Original duplicate admission uses native content identity. The first accepted
packet bytes can differ from a valid retry's outer JSON whitespace or field
order. A fingerprint difference alone must not reject such a known duplicate or
replace its original receipt. Preserve both the local packet variant and the
first server packet bytes; prove their original native identity and receipt
semantics rather than rewriting either retained record to make byte hashes agree.

Complete server packet asset references are already handled by the existing Rust
`room/asset_references` traversal and authenticated asset requirement controls.
This read reuses that ownership boundary; it does not substitute packet presence
for provider byte availability or turn an inert Prepare into publication.

The current implementation is the Rust read foundation. SDK collection, local
receipt comparison, independent installed-consumer qualification, and whole-room
activation remain required. This contract does not close the V1/parity gates.

## Qualification

The [qualification](qualification/2026-10-30-selected-server-metadata-receipts.json)
passes 11 metadata tests and 95 broader recovery-control tests on the same final
source; ten cases overlap, for 96 distinct native checks. Both server and
no-server all-target release Clippy profiles pass with warnings denied. The
normal Wasm and existing pinned Native hosts remain unchanged. SDK collection,
installed consumer qualification and complete catalog closure remain required.
