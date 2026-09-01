# breditor-core

`breditor-core` is the platform-independent deterministic content kernel for
Breditor. It contains no DOM, framework, async-runtime, clock, random-number, or
Wasm binding dependencies.

The current crate exposes immutable validated document readers, the fixed base
schema used by the first proof, a strict JSON codec, and structural points. It is
intentionally smaller than the eventual editor runtime.
