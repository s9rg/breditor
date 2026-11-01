# Selected server metadata reads and first accepted packet bytes

This opt-in recovery component reads original server catalogs and packets at an
independently selected server cut. It does not change original document/review
protocols, default synchronization, receipt meanings, or local persistent data.

## Original catalogs

Both `SharedServerLogGenerationRecoveryHost` and
`SharedPhysicalRoomRecoveryHost` expose `readMetadata(query, signal?)`.
The query declares all three lanes: versions, suggestions and revisions. Every
lane explicitly selects disabled, start, or its original frozen continuation.
Enabled-empty is different from disabled. A revision lane requires its original
suggestion lane. Returned permissions describe the authenticated server reader;
they are data and never become a restored recipient's permissions.

`captureSelectedServerMetadata(host, query, signal?)` starts every enabled lane
fresh and follows all original pages. A finished enabled lane retains its
terminal cursor while another lane advances. Frozen binding/through values,
original receipt fields, cross-lane revision decisions/publications and first
packet fingerprints must remain unchanged. A source change refuses success.
The original server catalog ceilings determine the 33-round bound; the complete
catalog data ceiling is 32 MiB. Exceeding a bound refuses the operation rather
than returning a truncated catalog as complete.

The SDK keeps a private association between a genuine captured catalog and its
actual branded host. A detached/serialized copy cannot manufacture that
association. Internal use rechecks the actual host before and after work.
This association is catalog provenance, not client custody or activation.

## Literal packets

Both hosts expose `readMetadataPacket({kind, expected}, signal?)`. `kind` is
version, suggestion or revision. `expected` is the exact fingerprint from the
selected original catalog: `{id, bytes, sha256}`. The Native content ID is not
the packet byte digest. Both IDs use `sha256:` plus 64 lowercase hexadecimal
characters. Packet bytes are bounded at 4 MiB; the complete escaped JSON
response is bounded at 16 MiB.

Separate authenticated routes are:

- `/recovery/generations/v1/metadata/packet/read`
- `/recovery/physical/v1/metadata/packet/read`

The request format is `breditor/<family>-metadata-packet-request`, version 1,
with the exact selected control identity and closed packet query. The response
format is `breditor/<family>-metadata-packet-read`, version 1, with that identity,
the unprefixed SHA-256 of the exact request bytes, scope
`selected-server-original-accepted-metadata-packet-bytes`, and
`packet: {kind, fingerprint, text}`. The literal text is the first stored accepted
packet. It is never replaced by a parsed/reformatted JSON representation.

The server checks current owner, Native source, provider and asset custody
before capture, after capture and after the final provider callback. An inert
uncommitted revision Prepare cannot be read as a committed revision packet,
including after log replay. The SDK detaches own data properties before
authority/token callbacks or I/O; it checks response family, selection, request
digest, exact fingerprint, UTF-8 length and SHA-256. The request remains reserved
during asynchronous byte verification. Cancellation, close or authority loss
before return refuses success and releases the reservation.

## Duplicate and recovery semantics

A Native-valid retry can retain its original content ID while differing in JSON
whitespace or field order. Original publication accepts such a duplicate and
returns its original receipt. These APIs preserve that behavior. The selected
packet read returns the first accepted body, and refuses a request whose byte
expectation describes the later variant. Recovery must retain the original
server body and local retry body separately; it must not normalize either body,
republish a proposal, accept twice, rewrite receipt sequences, or silently settle
an offline queue by assuming the two byte digests are equal.

The separately named local containment read below compares original retained
client receipts with these catalogs. The [additional packet/asset capture](ORIGINAL_METADATA_PACKET_RECOVERY.md) now preserves literal committed-catalog bodies and local variants with selected server files. Complete Native source closure through
room reconstruction, independent comment/server-log generation recovery, and
authenticated whole-room activation remain separate work.
Those are still required for V1. No catalog or packet response is a ready flag,
recipient grant, local ACK installation, or whole-room activation capability.

## Held original local receipt containment

The genuine continuation host also exposes `readMetadata`. It uses the current
server reader's original protocol, with the real previous/current continuation
checked before and after each request. The catalog collector accepts this
branded host as well as the two original host families. Public method shadows
and copied controller data do not supply a live port.

`SelectedLocalMetadataDelivery.captureReceiptContainment({host, inventory})`
is a separate, opt-in candidate-owner read. That operational owner remains an
internal candidate module; the package root exports the additional immutable
containment DATA types. The existing metadata owner holds all selected actual
Native sources from the seven supported families and its original reference-capture reservation. It first runs
the original `captureReconciliation` checks, then compares every original local
server receipt with complete current-cut server catalogs. It checks:

- Original stores' committed, pending and live records, plus the literal
  operation-origin participant backup.
- Generation committed, attempted, pending and live records, plus both original
  recovery and operation backups.
- Independent delivery and restored-graph current, pending, retained and live
  cuts, their original participant backups, and every restored parent-input
  target.
- The three separately bound local metadata lanes' before/current snapshots.
  Their original unbound Native-source diagnostics keep their old meaning.

Versions include cached catalog entries, accepted packet receipts and the
original catalog cursor. Suggestions include original publications and final
decisions. Revisions include their committed receipt and any recorded final
conflict decision/committed successor. Receipt fields, sequence numbers, server
bindings, effect writer and packet Native identities must agree. A cached
version cursor ahead of the current server is reported as server-behind.

The returned data has format
`breditor/selected-local-metadata-receipt-containment`, version 1, and scope
`same-held-native-original-local-receipts-in-current-server-catalogs`.
Its kind is `contained` only when the original reconciliation is checked and
every original receipt is present unchanged. Otherwise its kind is `pending`;
the original reconciliation remains nested unchanged. Diagnostics name the
participant, retained point, original receipt kind and ID, with relation
missing, different or server-behind. Malformed original records, a changed
binding, a stale source, authority loss or cancellation refuses the read.
More than 100,000 unsatisfied receipt requirements refuses rather than truncates.

Native packet identities are read through captured Rust facade methods. A
valid local packet whose JSON formatting differs from the first accepted body
still compares against the actual original receipt by Native ID and metadata.
The read neither rewrites either packet body nor treats a byte difference as
an absent receipt. It installs no ACK, clears no retry, drains no queue and
changes no role. The original metadata capture may persist its normal capture
checkpoint; original receipt, retry and packet facts remain unchanged.

The actual Native source heads, current server cut and provider requirement
inventory are checked around the comparison. This result is evidence about one
held cut. It does not itself retain every remote packet and asset dependency in a
reconstructable successor, prove independent generation recovery, or activate a
whole room. A later restore must reauthenticate and recheck its actual sources.

## Qualification

The dedicated Native examples must be built separately under
`target/server-metadata-native`; older pinned fixture executables remain intact.
Source tests and the independent npm-archive consumer use the same seven test
files. Native factories and authenticated publications produce the receipts;
transport-only data tests make no Native proof claim. Each Native run writes a
fresh evidence directory and keeps private IPC credentials out of public files.

The all-lane SDK workflow publishes 65 versions and a 65-revision proposal chain,
checks complete original catalogs over three rounds, compares exact cross-lane
receipts, reads original packet bodies, and retries one Native-valid JSON variant.
Separate Rust HTTP tests cover both families and all ten original profiles,
wrong requests/expectations/accounts/origins, stale source and last-callback
Native/raster mutations. Installed checks repeat all SDK cases from npm archives
with strict public types and no workspace package links. These are component
qualifications; the thirteen V1/parity gates remain open.

## Complete server Native dependencies

The separately named [server Native dependency read](SELECTED_SERVER_NATIVE_DEPENDENCIES.md)
includes complete physical packet sources, including inert revision preparations.
It does not broaden this committed-catalog/first-accepted-packet contract or turn
a client Pending result into Ready.
