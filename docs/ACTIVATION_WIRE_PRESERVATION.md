# Activation capture byte identity and input snapshots

Accepted wire bytes and a logical capture are different values. The original
fresh encoder remains canonical. A new, explicit
`rebindDecodedRoomActivationIntent` action retains the graph and object order
selected by a completed decoder, while binding a separately selected Native
association. It rehashes every original object and the graph, checks the current
Native cut against the capture, and returns inert encoded DATA. It neither
contacts a control nor creates a namespace, actor, receipt or service.

The decoder retains immutable wire provenance in a private weak map. The capture
has no new public properties; a copied logical capture cannot invent this
provenance. The original graph, blob indices, MIME tags, literal numeric-property
entry order and byte pins survive rebinding. New graph serialization and the
original wire format, limits, defaults and fresh encoder are unchanged.

## Reproduced failures

A saved complete Native capture (13 objects, 15,928,371 bytes) admits a different
JSON header-key order in both its initial and cold store reads. Re-encoding its
logical capture changes the graph hash, so the old reassociation path cannot
retain its independently selected identity. The explicit rebinding action keeps
that admitted graph verbatim; it does not narrow the accepted format.

A second reproducer changes a caller's mutable graph after the actual Rust
digest finishes. The old decoder parses the replacement and returns its marker
even though it checked the original graph's hash. The old store can also create
a namespace containing that unverified replacement, then fail its first read.
Both failures reproduce without a live Native control or actor.

The decoder now snapshots graph, choice and object members before asynchronous
validation. Absent-only store creation separately retains the validated input
snapshot rather than reading mutable caller values again during its transaction.
Existing-only reads and creation retain their original lease, schema, cancellation,
absence and no-overwrite checks. Changing a caller DTO after selection cannot
change which bytes are validated or persisted.

## Focused checks

```sh
node --test --test-concurrency=1 scripts/activation-intent-wire.test.mjs scripts/room-native-activation-intent.test.mjs
node scripts/check-activation-wire-installed.mjs
```

The source workset passes 20 cases: eight new wire/input laws and the twelve
original intent laws. It covers header order, object-index permutation, numeric
property order, canonical fresh encoding, a foreign Native cut, mutable graphs
and arrays during genuine hashing/storage, accessor refusal, copied provenance,
and digest cleanup on abort. The independent checker packs and installs the same
assertions, verifies exact emitted output/package bytes and checks private types.
Independent results must accompany integration; the command is not itself a pass.

The explicit action is wired into both capture and preparation-resume in this
isolated coordinator candidate. The separately running baseline restart workflows
keep their original frozen implementations. Complete source and installed checks
of the composed byte-preserving candidate remain required before Main integration.
These DATA checks do not repair the historical archive-read/WebKit faults or
qualify physical durability, whole-room activation or V1.
