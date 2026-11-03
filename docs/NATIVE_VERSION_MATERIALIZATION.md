# Preparing known version bodies under native custody

[Source and independent installed qualification](qualification/2026-11-03-native-version-materialization.json): both commands pass 83/83, strict declarations and 2,827 matching distribution files. This is a component qualification; all thirteen V1 gates remain open.

A retained version catalog can know an accepted immutable version without having
its packet cached. That entry is sufficient for lazy browsing; reconstructing a
complete source requires the body. Preparation must fetch it rather than mark an
incomplete source ready or submit unrelated pending work.

The SDK-private `NativeVersionDelivery.materializeVersion(id)` action downloads
only an already-known original catalog entry. It uses fresh credentials, the
existing authenticated packet GET and the actual source-bound Native store loan.
The existing Native packet/receipt checks and real cache persistence remain in
force. Catalog discovery, document/comment submission and queued version
publication are separate actions. Ordinary delivery defaults remain unchanged.

The action deduplicates requests for the same ID and permits four simultaneous
distinct requests. Unknown IDs are refused before network work. Cached bodies
are verified and flushed through the same real store. A failed local write can
leave verified in-memory content with `localSaved: false`; explicit local retry
must confirm persistence. An error after a successful commit does not erase that
commit. Cancellation drains actual work, and closing blocks new requests before
joining HTTP/cache promises and releasing the genuine loan.

Run `node scripts/check-native-version-materialization-source.mjs` and
`node scripts/check-native-version-materialization-installed.mjs` after building
the collaboration package and the existing Native relay fixture. Each command
requires all 83 cases: 11 materialization laws, 48 existing delivery policies and
24 durable authentication/failure/retry cases. The installed command uses fresh
package archives and locked offline dependencies, compares all distribution
files and checks strict declarations without workspace links. Real Rust HTTP
and unchanged normal Wasm execute; browser storage and locks are controlled.

These component checks do not establish complete joint activation, cold joint
owner reconstruction, physical storage durability or V1 readiness. Missing
source bodies remain Pending until actual dependencies are available. Full
workflow composition and the thirteen release gates remain separate work.
