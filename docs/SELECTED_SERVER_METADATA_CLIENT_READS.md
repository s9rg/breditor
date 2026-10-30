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

This component does not yet implement complete local receipt containment,
retention of every remote packet through room reconstruction, independent
comment/server-log generation recovery, or authenticated whole-room activation.
Those are still required for V1. No catalog or packet response is a ready flag,
recipient grant, local ACK installation, or whole-room activation capability.

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
