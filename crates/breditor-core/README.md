# breditor-core

`breditor-core` is the platform-independent deterministic content kernel for
Breditor. It contains no DOM, framework, async-runtime, clock, random-number, or
Wasm binding dependencies.

The current crate exposes immutable validated documents with cached exact
measurements, the fixed base schema used by the first proof, a strict JSON
codec, UTF-16-safe points and selections, paragraph-local text splices, atomic
transactions, direct-root paragraph split/join operations, proof-backed local
validation for fixed-base text edits, structural relocation, heterogeneous
change notifications, exact in-memory undo/redo requests, an immutable typed
action registry, a frozen semantic intent router, and base
paragraph-break/backward-delete actions. Registry preparation is the
authoritative integration path for semantic capability and execution: it
preflights and caches an exact transaction result against one immutable state.
Intent routing layers explicit priority, disabled fallthrough/block policy, and
unhandled/blocked/prepared outcomes over that same path without accepting
browser-event syntax. A synchronous `EditorSession` owns exact commit
publication plus bounded
deterministic linear undo/redo history. The crate is intentionally smaller than
the eventual editor runtime and has no observable toolbar-state store, browser
queue, durable replay log, collaboration transform, or Wasm adapter yet.
