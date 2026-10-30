# Source-owned materialized metadata assets

The selected metadata owner has two separately named actions:
`captureMaterializedAssets(host, transport, options)` preserves complete raster
bytes, and `inspectMaterializedAssets(bundle, options)` re-admits an archived
cut under the actual parent's inspection slot. These private recovery APIs do
not change existing capture formats, protocol scopes, defaults or package
versions. `SharedRelayAssets.readBytes(contentAsset, signal)` also provides an
authenticated content-addressed byte read without cache mutation.

Capture first performs the complete source-owned reference and availability
workflow. It includes Native base history, exact before/stored/current local
metadata records and all participants' original and selected whole upload
archives. Incomplete Native metadata or provider mappings remain Pending. A
Pending result never returns a partial materialized bundle.

Every asset in the complete provider response is preserved, including server
requirements and unreferenced whole-upload content IDs. Capture uses admitted
local archive bytes first and the genuine transport's private read port for
missing content. Downloaded bytes pass exact SHA-256, MIME, byte-length and
normal raster decoding checks. Capture does not resolve object URLs, mutate a
held cache, acknowledge uploads or change an editor. The complete provider
request is authenticated again before return, so a changed client-only opaque
mapping cannot hide behind an unchanged older server requirement set.

The separately named raster frame uses literal reference-file identity,
recorded availability data, an ordered complete payload table and contiguous
bytes. There are no silent prefixes. Header and file limits are 16 MiB and
1 GiB; normal raster/store budgets apply and callers can only tighten them.
Whole-file Native hashing precedes header decoding. Each payload is separately
decoded, hashed and checked against its declared content metadata.

The raw `LocalMetadataRasterArchive` reader admits bytes and framing only. Its
availability field is untrusted data. Calling it does not prove Native history,
authenticate a controller or establish current opaque asset mappings.

The genuine metadata owner's combined inspector reconstructs the exact older
reference cut with Native aliases even when actual stored/live state is newer.
It verifies the original review/metadata bundle and complete upload roles,
recomputes the canonical provider request identity, checks the complete recorded
response partition, and requires the raster payload table to equal the entire
recorded provider asset set. A rehashed edited Ready bit, omitted metadata
generation, missing upload role or valid payload prefix cannot replace this
work. Invalid incoming data leaves the current owner usable.

Both journals and all seven document/comment sources remain held and checked
through async work. The operation registers its busy slot and actual promise
before detaching input, including Blob subclass hooks. Parent close cancels
inspection and drains actual outstanding byte reads and Native aliases;
committed source and metadata facts remain intact. Inspection performs no
journal writes and needs no network account.

The inspection result explicitly describes a Native client cut and **recorded**
raster payloads. Its provider observation is historical unsigned data, not a
fresh authenticated host or approval. A recorded continuation declaration does
not prove a newer server's Native bytes. Before restoring or serving a complete
room, recovery must retain the actual current server/inventory, authenticate
fresh controllers, reconcile all provider/client/metadata requirements and
complete joint activation. Preserving those assets through that operation,
independent comment/server-log generations and the thirteen V1 gates remain
required. This contract does not declare those capabilities complete.
