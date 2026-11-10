# Durable activation intent across a sealed handover

The handover intent is a separate retained-data family. It keeps the complete
`HandoverReconciledServerPacketRecoveryCapture`, including its original path
observation, alongside the independently selected activation target and path.
Its graph header, choice and advisory state have explicit handover family names.
Original V1 intents retain their original formats and meanings.

A reselected path controller must select the exact same current native source,
sealed deployment and earlier cuts. Its successor path must include every
captured ancestor in order, including repeated observations. Controller instance
identities may change; the captured observation remains literal in the graph.
The complete packet/server/raster capture must be retained. Original Pending,
cache, receipt and metadata facts remain part of that capture.

`encodeRoomHandoverActivationIntent`, `decodeRoomHandoverActivationIntent` and
`RoomHandoverActivationIntentStore` are private experimental modules. Creation is
absent-only. A cold existing-only read rehashes the graph and every retained
object, then rechecks the closed family and its source/lineage associations.
Interrupted creation either rolls back or leaves the exact committed intent for
a fresh read. Unexpected database closure, late cancelled opens, failed cleanup
and monotonic observations use the same custody machinery as the original family.
An existing namespace is never converted or overwritten.

The graph codec and custody engine are shared. The original encoder keeps its
tag traversal, graph header, object order, byte pins and original binding checks.
The original decoder continues retaining exact admitted wire provenance for
restart reassociation. Final binding admission retains the integrity context
selected before hashing; mutating caller options cannot select a different
policy afterward. Both families use the existing explicit byte, object,
node, nesting and state-revision bounds.

These are retained DATA contracts. A declaration, stored `request-started`
phase or receipt does not verify a seal, acquire a writer or activate a service.
The next integration must provision a genuine inactive Native control, reacquire
the same sealed path under fresh authentication, inspect the complete current
client/metadata/provider cut before and after fresh approval, and retain unknown
outcomes before the actual request. Whole-room activation and publication remain
open until that orchestration and its functional installed tests pass.

Run `node --test scripts/handover-activation-intent-storage.test.mjs` for storage
laws over real retained bytes with synthetic control declarations. Run
`node --test scripts/native-handover-activation-intent-data.test.mjs` for the
complete seven-family native handover, fourteen offline lanes, actual current
provider, complete intent cold/disk readback and future Undo/Redo workflow. Its
activation target is explicitly synthetic DATA and no activation is requested.
Controlled Node IndexedDB, locks and image decoding support these checks.

Run `node scripts/check-handover-activation-intent-installed.mjs` for the same
native data workflow, twelve handover storage cases and twenty-eight original
intent/cancellation/wire cases against independent offline package archives.
The functional and full candidate profiles retain separate types, storage,
native and installed gates after complete handover-byte recovery.

The original byte corpus now has a pinned compressed repository fixture.
`prepareActivationRetentionFixture` verifies the compressed archive, original
index and every member, then creates only absent files under the test target.
Changed files, unexpected entries and linked destinations refuse. Clean source
checks therefore reproduce the same retained bytes without a previous ignored
build directory. Installed checks copy and verify the expanded corpus explicitly.
