# breditor-core

`breditor-core` is the platform-independent deterministic content kernel for
Breditor. It contains no DOM, framework, async-runtime, clock, random-number, or
Wasm binding dependencies.

The current crate exposes immutable validated documents with cached exact
measurements, the fixed base schema used by the first proof, strict versioned
document, singular guarded-operation, exact-base transaction-request,
contextual complete editor-state, replay-proved commit, and bounded durable
session-checkpoint plus replay-identified local-log-entry JSON codecs and
bounded atomic recovery of one supplied genesis-anchored log prefix plus a
compact runtime anchor, one checked successor generation, and a strict
trusted-scope local-log-checkpoint JSON codec,
UTF-16-safe points and
selections, paragraph-local text splices, atomic transactions, direct-root
paragraph split/join operations, proof-backed local
validation for fixed-base text edits, structural relocation, heterogeneous
change notifications, guarded root-text range replacement with a closed
same-type inverse, exact in-memory undo/redo requests, an immutable typed
action registry, a frozen semantic intent router, and base text-insertion,
paragraph-break, backward-delete, and strong-format actions. Registry
preparation is the authoritative integration path for semantic capability and
execution: it preflights and caches an exact transaction result against one
immutable state.
Intent routing layers explicit priority, disabled fallthrough/block policy, and
unhandled/blocked/prepared outcomes over that same path without accepting
browser-event syntax. Actions produce activation and typed observable values in
that same evaluation, and a frozen catalog derives immutable direct, routed,
undo, and redo state batches without retaining executable preparations. A
synchronous single-observation cache keys complete state plus exact history,
coalesces exact duplicate sources, and emits bounded local
full/unchanged/delta updates. A synchronous `EditorSession` owns exact commit
publication plus bounded deterministic linear undo/redo history and an opaque
history-observation stamp. The strong-format action is the first toolbar-shaped
control: it reports inactive, active, or mixed state, toggles explicit pending
formats at a caret, performs one guarded same-paragraph splice for a local
extended selection, and uses one guarded root-text replacement while preserving
every selected paragraph boundary for a cross-paragraph selection. The typed
text-insertion action consumes that pending override, inherits deterministic
context otherwise, replaces one exact direct-root text range, and offers
adjacent edits to the `breditor/typing` history group. Same-paragraph insertion
stays on the local splice path, while
cross-paragraph type-over uses one guarded root-text replacement.
Extended backward deletion likewise uses one guarded root-text replacement for
cross-paragraph selections while preserving its local splice/join paths.
Cross-paragraph paragraph breaks use the same atomic primitive with two empty
replacement fragments, preserving the retained boundary text as two distinct
paragraphs without a delete/split intermediate.
Operation records retain exact optimistic guards and pass checked constructors
plus active-context limits, but deliberately carry no snapshot, ordering,
selection, metadata, deduplication identity, or transaction boundary. The crate
is intentionally smaller than the eventual editor runtime and has no
action-state subscription/delivery layer, presentation manifest, browser queue,
generic formatting-kind or attribute actions, log framing/storage,
checkpoint/log atomic replacement, repeated generation recovery,
collaboration transform, or Wasm adapter yet.
