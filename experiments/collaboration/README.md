# Breditor collaboration feasibility checkpoint

This private, isolated Rust workspace proves ownership, recovery and rich-content
contracts before introducing a CRDT dependency into shipping Breditor packages.
It pins `loro = 1.16.2` and `wasm-bindgen = 0.2.127`, and exercises the actual
opt-in `breditor-core::rich_content` values in matching WebAssembly.

Run from the repository root:

```sh
node scripts/check-collaboration-feasibility.mjs
```

Rust 1.98, the `wasm32-unknown-unknown` target, matching wasm-bindgen CLI, repository
Node dependencies and installed Playwright engines are required. The script uses
private output under `target/collaboration-*`, runs native/Wasm lints, default
and structural core regressions, native contracts, a native-generated journal
vector and Chromium/Firefox/WebKit checks. It never publishes or changes the
default package entry points. `BREDITOR_CARGO` and `BREDITOR_WASM_BINDGEN` can
select explicit tool binaries.

## Recovery and selective ownership

The ordered journal records authored commands, imported engine bytes, undo/redo
outcomes and directional selection metadata. Recovery re-executes local commands
with the original exclusively leased writer. Every authored/replayed undo/redo
step must reproduce the saved operation identities, causal dependencies and
effects. A snapshot or import plus `record_new_checkpoint()` is not sufficient
for mixed history: that route left a local character behind when a prior undo
was transformed as though subsequent local imports were remote edits.

Canonical keyed cell/image/column container activation is committed outside user
undo. Undoing an activation marker otherwise hid a different author's surviving
cell text. Its scaffold remains after user content is undone; retention and
collection need a separate policy.

Metadata uses immutable per-action contributions, not one shared field whose
inverse can erase another writer's later value. Strong-format annotations use
the same ownership rule over replicated text items. A deterministic view selects
the highest active `(causal Lamport, numeric writer, action counter)` contribution.
Priority is checked against the referenced causal operation. Undo retracts only
the local contribution; redo reactivates its original priority. A masked undo
still retracts that contribution, so undoing a second author's winner cannot
unexpectedly revive a value the first author already undid.

The coordinator stages a complete recovered candidate before adopting it.
Invalid steps/imports preserve published values, causal state, selection and
history. Exact duplicate import bytes do not consume another journal entry.
Body selection keeps anchor/focus order, stable text identities and insertion
affinity. Every UTF-16 boundary is checked by conversion and round trip; half
surrogates and coerced/wrapped JavaScript values are rejected.

## Rich core contracts

`experimental-rich-content` adds distinct checked content identities, stable
table axes, non-destructive merge overlays and image asset bindings. It does not
widen existing schemas, reinterpret EntityId or change legacy codecs.

Merge capture retains full original axis context. Resolution sorts by descending
numeric causal priority, then exact merge identity bytes as the final tie-break.
Overlaps deactivate losing regions without flattening source-cell content.
New axes strictly between surviving boundaries expand a region; boundary
insertions remain outside. Original member reordering or movement of an old
outside axis into the interval deactivates the region. Deleted masters select
the first surviving row/column pair. Empty axes hide a table without repair writes.
Splitting retracts observed region identities and restores base-cell visibility.

Image node, immutable asset and binding generation are distinct. Paired display
dimensions and explicit decorative/nondecorative alt intent are checked values.
Completion matching cannot change a deleted node or a replaced asset binding.
Matching an upload token updates host status, not document insertion/history.
This is not validation of raster bytes or implementation of an upload provider.

## Verified checkpoint

On October 13, 2026, the reproducible script passed:

- 703 default core unit tests and 1,213 opt-in structural core unit tests.
- 11 rich-content contract tests, including 256 seeded merge schedules.
- 27 native collaboration/history contracts.
- 36 Chromium/Firefox/WebKit tests, including 24 partition schedules per engine.
- Strict native and wasm32 Clippy checks and isolated Rust formatting checks.
- Native-to-Wasm restoration with exact future operation identities, including
  formatting and writer IDs above JavaScript's safe-integer range.

The tested fixture Wasm is 4,623,985 bytes, or 1,314,703 bytes under gzip, with
SHA-256 `0124a1c3a1060ae7e31a09bd1e2a95a01b19d21762d5e06d1790b0a6c011cd62`.
This is a release-mode feasibility build, not a size-tuned shipping artifact or
an accepted shipping size budget.

## Limits and remaining gates

These are provisional probe limits, not public editor guarantees: 1,000 journal
entries; 16 MiB serialized journal; 1 MiB imported frame; 2 MiB replicated and
materialized views; 64 ordered command steps; 64 KiB inserted text; 10,000
formatted runs; 1,000 annotations per run and 50,000 total projected annotations.
Geometry additionally caps 256 rows, 128 columns, 4,096 cells and 256 merge records.
All independent limits apply. Hosts can tighten the core geometry ceilings.

The candidate is reconstructed from the whole journal for each mutation. That is
a correctness reference, not production throughput or compaction. Frame/view
limits do not establish adversarial decoder memory/time bounds. Writer-collision
checks are not authentication. The journal resumes an exclusively leased writer;
it is not a portable backup import or permission to clone an active writer.

Rich AST admission, identity materialization, table/image CRUD, node/grid
selections, complete format/list/caption planners, toolbar/input/clipboard,
IndexedDB durability, upload queues and the authorized reference relay remain
implementation gates. The fixture exchanges engine bytes in one test host;
it does not implement a production transport or an end-user collaborative editor.
Physical Japanese IME and spoken VoiceOver are deferred at the user's request.

The pinned Wasm normal/build closure contains 139 packages. Loro's facade is MIT,
but `im 15.1.0`, `bitmaps 2.1.0` and `sized-chunks 0.6.5` declare `MPL-2.0+`.
The closure also includes BSL-1.0 and mandatory Unicode-3.0 terms. Optional
package notices and exact upstream source references must be completed and
reviewed before distribution; this checkpoint does not certify packaging
compliance. Existing shipping-package notice inventories remain unchanged.
