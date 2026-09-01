# Breditor

Breditor is an experimental, original rich-text editing engine. The name combines
the HTML `<br>` element with “editor.” Other editors are research examples only;
Breditor does not implement their document model, operation format, or plugin
protocol.

This repository currently contains the first end-to-end Rust-core slice:

- immutable, structurally shared document values;
- proof-derived cached document measurements for node count, maximum depth,
  total UTF-8 text bytes, and recursive property-value count;
- a minimal compiled schema for document, paragraph, text, and strong formatting;
- strict versioned document JSON, singular guarded-operation records, and
  exact-base atomic transaction-request records;
- root-relative paths, UTF-16-safe points, document-aware point ordering, and
  directional range selections;
- immutable `EditorContext` and `EditorState` snapshots with caller-owned
  lineage identity and monotonic revisions;
- paragraph-local `TextSplice` operations over canonical formatted fragments,
  including source guards, exact inverse operations, and proof-backed local
  result validation with authoritative fallback;
- direct-root base-paragraph `ParagraphSplit` and `ParagraphJoin` operations
  with whole-paragraph guards, exact content inverses, and structural
  relocation laws;
- guarded `RootTextReplace` operations for one- or multi-paragraph root text
  ranges, with complete source guards, multiline replacement fragments,
  same-type closed inverses, and deterministic deleted-point relocation;
- atomic transactions, explicit state updates, relocation maps,
  heterogeneous operation-relative change sets, and typed failures;
- an immutable, deterministic action registry with namespaced identities,
  bounded versioned inputs, exact prepared capabilities, and fail-closed
  extension conflicts;
- a frozen semantic intent router with declared input contracts, named
  bindings, explicit priority and disabled fallback policy, and distinct
  unhandled, blocked, and prepared outcomes;
- one-call action observations that keep availability, active/inactive/mixed
  state, independently versioned values, and conservative effects coherent;
- a frozen observable action-state catalog with presentation-independent
  identities, immutable exact-base direct/routed/history batches, and a
  synchronous single-observation cache with domain invalidation, exact-source
  coalescing, and bounded local deltas;
- semantic `insert-text`, `insert-paragraph-break`, `delete-backward`, and
  `toggle-strong` actions exposed through the same registry for future
  keyboard, toolbar, palette, and API adapters; typed insertion consumes
  pending formats, insertion, paragraph breaks, and extended deletion
  atomically replace cross-paragraph selections, while `toggle-strong`
  publishes tracked inactive/active/mixed state and preserves selected block
  boundaries during cross-paragraph formatting;
- a synchronous `EditorSession` publication boundary with exact-base commit
  acceptance, intent/action execution, bounded linear history, deterministic
  merge groups, and atomic undo/redo replay;
- `Commit` helpers that construct lower-level undo and redo transactions; and
- document, fragment, operation-record, and fixed-width per-transaction
  operation limits.

This is still a proof slice, not a complete editor. Structural edits beyond
direct-root base-paragraph text structure, generic formatting kinds and
attributes,
action-state subscriptions and asynchronous delivery, presentation metadata
and plugin lifecycle management, persistent state/commit/history codecs,
ordered durable logs, deduplicated delivery and reload replay, Wasm bindings,
a DOM bridge,
collaboration-aware or selective undo, and generic incremental validation for
structural or custom-schema edits are not implemented. See
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
