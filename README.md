# Breditor

Breditor is an experimental, original rich-text editing engine. The name combines
the HTML `<br>` element with “editor.” Other editors are research examples only;
Breditor does not implement their document model, operation format, or plugin
protocol.

This repository currently contains the first end-to-end Rust-core slice:

- immutable, structurally shared document values;
- a minimal compiled schema for document, paragraph, text, and strong formatting;
- strict versioned JSON records;
- root-relative paths, UTF-16-safe points, document-aware point ordering, and
  directional range selections;
- immutable `EditorContext` and `EditorState` snapshots with caller-owned
  lineage identity and monotonic revisions;
- paragraph-local `TextSplice` operations over canonical formatted fragments,
  including source guards and exact inverse operations;
- atomic transactions, explicit state updates, relocation maps,
  operation-relative change sets, and typed failures;
- `Commit` helpers that construct undo and redo transactions; and
- document, fragment, and per-transaction operation limits.

This is still a proof slice, not a complete editor. Structural operations, an
action/plugin registry, an actual history stack and coalescer, persistent
operation/state codecs and reload replay, Wasm bindings, a DOM bridge,
collaboration, and incremental validation are not implemented. See
[`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md) for the exact contracts and
current performance limitations.

## Development

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps
cargo check --workspace --target wasm32-unknown-unknown
```

The open-source license is intentionally not selected yet; MIT versus Apache-2.0
remains an owner decision.
