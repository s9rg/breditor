# Recoverable local/provider raster union

`captureRecoverableAssets(host, transport, options)` is a separately named V2
byte-recovery action. It preserves a complete Native reference cut and all local
and provider raster bytes even when the provider still reports missing upload
bytes. `inspectRecoverableAssets(bundle, options)` re-admits that union under the
genuine metadata owner's parent inspection slot.

The reproduced case uses a third valid PNG stored in all three local-source
histories' upload archives. Pending proposal/revision packets refer to it, but
the real server has never received it. The original V1 materialized capture
correctly remains Pending under its provider-checked scope. V2 can preserve the
locally complete union while retaining that exact Pending observation.

V2 does not change the original availability API, V1 materialized capture,
upload acknowledgements, queues, history packets, defaults or source protocols.
The new bundle family and `BREDITOR_METADATA_RASTERS_V2` frame have a distinct
`complete-client-cut-and-local-provider-raster-union` scope. V1 and V2 readers
refuse each other's frames. Both use the same bounded framing, digest and normal
raster checks; each public reader retains its exact metadata type and scope.

The complete union includes every original/selected whole-upload entry, every
provider asset and every content ID required by the exact Native references and
recorded mappings. Content-addressed IDs keep their literal SHA identity.
Opaque asset/generation pairs require an exact recorded mapping; the presence
of one local blob never supplies a guessed mapping. Conflicting immutable
metadata refuses. Missing byte metadata, unresolved mappings or unavailable
payloads yield Pending without a partial recovery bundle.

Locally admitted bytes are preferred; missing available provider content uses
the genuine authenticated byte transport. Each raster is decoded and checked
again, and the full provider request is repeated before return. All seven
document/comment stamps and the actual source lifetime remain held. Server
Pending is recorded unchanged. No upload queue item becomes uploaded and no
storage reference or upload receipt is fabricated.

The combined inspector recomputes Native history and both upload-archive roles,
checks the original provider request/response partition, derives the same full
union and requires its exact payload table. Rehashed omission of a locally
durable but server-missing image must refuse. The read requires no network and
does not write either metadata/review journal. Old provider data is historical;
it cannot activate a room or authorize a current opaque mapping.

Capture still authenticates a live provider observation. This action does not
promise network-independent capture or preservation of actual newer server and
participant inventory bytes. Those, complete reconciliation, fresh joint
activation, independent comment/server-log generations and all other V1 gates
remain separate required work. No V1/parity completion is claimed.
