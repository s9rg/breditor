# breditor-core

`breditor-core` is the platform-independent deterministic content kernel for
Breditor. It contains no DOM, framework, async-runtime, clock, random-number, or
Wasm binding dependencies.

The current crate exposes immutable validated documents with cached exact
measurements, the fixed base schema used by the first proof, a strict JSON
codec, UTF-16-safe points and selections, paragraph-local text splices, atomic
transactions, direct-root paragraph split/join operations, proof-backed local
validation for fixed-base text edits, structural relocation, heterogeneous
change notifications, and exact in-memory undo/redo requests. It is
intentionally smaller than the eventual editor runtime and has no browser or
Wasm adapter yet.
