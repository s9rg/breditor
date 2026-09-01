# breditor-core

`breditor-core` is the platform-independent deterministic content kernel for
Breditor. It contains no DOM, framework, async-runtime, clock, random-number, or
Wasm binding dependencies.

The current crate exposes immutable validated documents with cached exact
measurements, the fixed base schema used by the first proof, a strict JSON
codec, UTF-16-safe points and selections, paragraph-local text splices, atomic
transactions, direct-root paragraph split/join operations, proof-backed local
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
formats at a caret, and performs one guarded same-paragraph splice for an
extended selection. The typed text-insertion action consumes that pending
override, inherits deterministic context otherwise, replaces one exact
direct-root text range, and offers adjacent edits to the `breditor/typing`
history group. Same-paragraph insertion stays on the local splice path, while
cross-paragraph type-over uses one guarded root-text replacement.
The crate is intentionally smaller than the eventual editor runtime and has no
action-state subscription/delivery layer, presentation manifest, browser queue,
semantic cross-paragraph deletion/break/formatting planners, durable replay log,
collaboration transform, or Wasm adapter yet.
