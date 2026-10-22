# Independent reads from a restored source

The private restored journal can lend an independently authorized read scope to
its genuine, fully restored source. This keeps recovery possible after the
source's write grant or write signal expires. It does not authorize a save,
change transport identity, start a provider or activate a room.

## Separate authority and native lifetime

Archive admission and writable bootstrap still require current write policy.
Once admission succeeds, the journal's actual read-only original and input-LIVE
native replicas prove data identity and lifetime independently of that grant.
Every write hook continues to check current write authority and native ancestry.

A borrowed scope requires the actual registered source, a consumed real
bootstrap hold, completed replay, a synchronous current read-authority callback
and its own optional cancellation signal. It never inherits the writer signal.
Metadata, Boolean flags, foreign sources and asynchronous permission callbacks
cannot manufacture this capability.

Checks retain both original native lanes, input-LIVE ancestry and local versions.
The actual source, storage host and journal must remain live. Changing either
grant or signal is checked again after asynchronous I/O. Renewing read permission
does not renew writer permission.

## Exact data, no implicit save

The scope reads the actual journal twice around the dedicated source-database
read. Both journal records must agree, and observed durable source bytes must
match exact CURRENT or PENDING. Existing cut, file-digest, relay-progress and
schema checks remain intact. It returns the unchanged original and complete
incoming archive alongside current/pending intent; newer unsaved LIVE is read
from the real source separately.

Selected cuts can be decoded as recoveries, and input-only raster bytes remain
available through the genuine admitted input archive, including flat-lineage
lookups. No source flush, retry, upload or network call is performed by these
reads. A complete exporter must additionally bind LIVE and whole-upload capture
to an unchanged actual source stamp across all its awaited work.

## Closing and outstanding I/O

The journal shares a bound of eight outstanding scope/I/O holds. Scope release
is idempotent and prevents later use. Releasing a scope does not remove a digest
or raster operation already in flight from the lifetime ledger.

Source shutdown closes admission to new reads, then waits for actual scope and
I/O holds before disposing the input and native origins or releasing the journal
lease. A caller must release its scope rather than await source closure while
still retaining it. Cancellation causes refusal; it does not silently discard
durable source, pending work or the incoming input.

## Scope and remaining work

The [2026-10-22 qualification](qualification/2026-10-22-restored-operation-read.json)
pins 13 selected checks from the 287-check functional plan. Source and fresh
offline installed packages repeat the same 15 read laws. The ordinary parent and
standalone recovery/write matrices each repeat all 640 cases in both source and
installed packages. Those full matrices are write-path compatibility evidence,
not a claim that all 640 policies were separately tested after writer expiry.

The private [complete graph](RESTORED_OPERATION_GRAPH.md) now uses this component
for complete native, upload, older-pixel and input-provenance conservation across
repeated restore cycles. Its qualification is separate from the read-scope
checkpoint above. Old portable formats stay closed to restored sources.
Whole-room reconciliation and authenticated activation remain separate.

Functional contracts use actual normal native owners under controlled IDB,
lock and raster fixtures. They do not qualify physical durability, large-file
hashing/memory, browser behavior, accessibility or V1 release readiness.
