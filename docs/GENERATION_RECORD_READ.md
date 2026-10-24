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

## Native and packet references from every retained state

`captureGenerationRecordReferences` consumes a genuine complete record reader.
It independently replays the committed, uncertain attempt, pending and LIVE
states in that order. The host supplies an explicitly selected native restore
factory; the reader never chooses a format from caller-provided metadata.

Every replay starts read-only. Exact document and comment checkpoints, native
descriptor, language and sealed history policies must match before dependency
reads. Adjacent replays must preserve native ancestry in both lanes, ordered local
versions and forward relay progress. These comparisons take place entirely in
the selected read runtime, which may be a separately loaded copy of the normal
Rust/Wasm runtime. The writer and its permissions remain untouched.

Native history and retained local versions, proposals, revisions and shared
versions all contribute references. An image absent from LIVE can remain required
by a committed or uncertain packet after forgetting fails. The reader preserves
those references without requiring a current upload store or fetching raster
bytes. Missing packet dependencies and uncached catalog versions remain explicit
pending results; known references alone do not establish complete availability.
The complete union refuses above 100,000 asset/generation pairs and each state
refuses above 1,024 distinct packet reads, rather than truncating them.

The result keeps the underlying record permit and pure source pins until
disposal. `verify()` rereads actual committed bytes; `checkCurrent()` is the final
callback-free fence. Temporary native replicas are disposed after discovery, and
disposing the result clears producer and authorization callbacks while retaining
its frozen detached report. This scope covers the source's four states, not
historical parent files outside them or the upload/provider bytes themselves.

## Functional qualification and integration

The separate [operational parent reader](GENERATION_OPERATIONAL_RECORD_READ.md)
adds fresh independently authorized admission of both protected parent archives
and an opaque current-source reference child. Its historical parent native and
packet reference closure remains a separate obligation.

The [generation-record qualification](qualification/2026-10-23-generation-record-read.json)
passes twelve selected normal stages. Source, fresh offline packages and actual
bundled code each pass the same 290 laws: 188 generation reader laws, 74 original
reader laws and 28 unchanged compound-storage regressions. All three strict type
fixtures pass in the fresh consumer. The existing 362-case generation
asset/recovery domain and local, relay, retained and observer storage regressions
also pass. Native runtime bytes and existing formats and defaults are unchanged.

The [four-state reference qualification](qualification/2026-10-23-generation-record-references.json)
passes ten selected normal stages. Source, fresh offline packages and actual
bundled code each pass the same 755 laws: 268 new reference and disposal laws and
all 487 prior record/storage laws. Five strict consumer type fixtures pass.
The new domain includes separately loaded read runtimes, images retained only
outside LIVE, all three languages and selection scopes, genuine local/paired/
relay/retained factories, compatible reviewed/search policies and future
document/comment Undo/Redo. The existing 362-case generation asset/recovery domain
also passes. Native runtime bytes, formats, policies and defaults are unchanged.

The [original reference reader](ORIGINAL_RECORD_READ.md#native-and-packet-reference-replay)
also covers current original journals and selected independently saved stores.
Selected historical parent files, held coordinator integration, provider/client
reconciliation, authenticated room activation and sustainable history remain
architectural work. All thirteen V1 gates remain open.
