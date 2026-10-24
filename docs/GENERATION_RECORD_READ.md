# Complete generation record reads

`captureSegmentedPersistentRecords` and `captureRelayGenerationRecords` discover
the actual committed generation cut without flushing or editing a source. They
also retain the uncertain save attempt, newer pending capture and LIVE state as
separate values. A successful commit whose acknowledgement was lost must not be
mistaken for the older acknowledged capture.

These private readers require genuine local, paired, relay or retained generation
owners and independent synchronous read authorization. They expose data for later
recovery admission, not native ancestry, asset custody or activation permission.

## One committed cut

The existing selected driver reads the actual head and every referenced root and
sealed file in one read-only transaction. Existing head, file-role, identity,
digest and storage-family checks stay in force. A compound retained head contains
its native pair, relay progress, retained proposals, revisions and shared versions
together. Separate LIVE child exports or cached acknowledgement flags cannot
substitute for that committed head.

The returned metadata contains four distinct states:

- `committed` is the complete actual stored cut, including its head, immutable
  files and reconstructed native checkpoint.
- `attempt` preserves the uncertain capture and its encoded cut when available.
- `pending` preserves the complete newer capture waiting behind that attempt.
- `live` reads current native checkpoints through captured facade methods, ordered
  local versions and the selected driver's current companion state.

An unsaved newer revision may occur only in LIVE while an older proposal and
document remain in the committed or attempted cut. The reader keeps those states
separate; it never acknowledges the revision or rolls LIVE backward.

## Currentness and lifetime

`check()` brackets current read authorization with genuine source and lifetime
checks. `verify()` additionally rereads and validates the complete committed cut,
including every referenced immutable file. `checkCurrent()` performs a final
callback-free and I/O-free comparison of native revisions, companion state,
private persistence epoch, attempt, pending and acknowledged capture identities.
A current local epoch alone cannot prove stored-byte integrity.

Every save attempt invalidates an older read pin, even when the attempt is a
no-op or subsequently fails. Read-only status inspection does not. In-flight
source persistence refuses instead of being flushed by a read. Ordinary edits,
staged retained changes, retirement and closure invalidate readers rather than
being blocked or reversed. Native read-only and review-access policies remain
unchanged; reading cannot restore an author grant.

There are at most eight live readers per actual native source. Dispose readers
in `finally` to release permits. Disposal clears source and authorization
callbacks without closing a source or releasing its writers. Frozen detached
metadata remains readable after disposal but cannot act as source custody.

## Functional qualification and integration

The [generation-record qualification](qualification/2026-10-23-generation-record-read.json)
passes twelve selected normal stages. Source, fresh offline packages and actual
bundled code each pass the same 290 laws: 188 generation reader laws, 74 original
reader laws and 28 unchanged compound-storage regressions. All three strict type
fixtures pass in the fresh consumer. The existing 362-case generation
asset/recovery domain and local, relay, retained and observer storage regressions
also pass. Native runtime bytes and existing formats and defaults are unchanged.

The readers do not replay native histories, resolve asset bytes or decide which
historical copies to retain. Complete original and generation reference capture,
held coordinator integration, provider/client reconciliation, authenticated room
activation and sustainable history remain architectural work. All thirteen V1
gates remain open.
