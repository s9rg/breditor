# Pinned Loro history-order patch

This directory retains the complete crates.io `loro-internal` 1.16.2 source,
including its manifest, tests, source instructions and upstream MIT license.
The archive's VCS metadata identifies upstream commit
`af130d97d8b110add13283fc5bfc81d97a9a609f`, path `crates/loro-internal`.
The original crate archive has SHA-256
`8d5806b65ee68c3ae7891959dd968898860dab74fbf6498b312de9b548dce5ec`,
matching the former registry lock entry. A byte comparison of all 197 archive
files found modifications only in `src/handler.rs` and `src/state.rs`.
No registry-cache or shipping-workspace source is modified. The isolated
collaboration workspace alone uses this path override.

The upstream source does not promise byte-identical future native/Wasm history.
Breditor's same-writer journal requires exact causal operations after restart,
not just equivalent visible content. A paragraph join/remote insertion/Undo/Redo
vector reproduced different operation identities in all three browser engines:
equal-depth root/mergeable containers exchanged positions in the authored Redo.

The bounded patch establishes authoring order at three existing engine seams:

- `src/state.rs`: preserve path length and creation-counter ordering, then break
  ties by the canonical container identity string rather than hash-map order.
- `src/handler.rs`: apply a map diff's keys in lexical order.
- `src/handler.rs`: apply each pending text-mark set in lexical key order.

It changes authoring order, not operation schemas, state conflict resolution,
wire encoding or cursor transformation. Parent-before-child order remains the
primary key. Opaque binary dictionary packing is still noncanonical.
The private shared model, engine tag and journal family change explicitly so
old experimental journals/frames cannot silently mix authoring contracts.

Regression coverage belongs to the first-party experiment tests and the native
golden-vector/browser suite. The identical three direct ordering tests fail on
the unpatched registry dependency and pass with this patch: container identity,
map key and text-mark key ordering each have an independent regression.
The historical WebKit runtime fault is unrelated;
this patch does not claim to repair it. Upstream publication or a pull request is
not part of this local checkpoint. Rebase/removal requires retaining the same
tests and auditing the upstream diff; do not silently replace this source.
