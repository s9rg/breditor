# Released V0.1.0 Session Checkpoint V1 fixture

`history.json` is a checkpoint emitted by the default WebAssembly runtime
built from the `v0.1.0` tag at
`d3d274c138de02ba27d32217079b8be40f0d3099` (Wasm ABI 2). It captures Unicode
text, strong formatting, caret affinity, a retained pending format
and a history cursor with entries on both sides. The fixture file SHA-256,
including its terminal LF, is
`dc6896ceea6b2477206b60ca978c9bf26925338cdc2672520e9b0302dd98b467`.

To reproduce the capture, build the tag in a separate worktree with its
pinned Rust 1.98.0 toolchain and wasm-bindgen 0.2.127. Run the first commands
from that worktree.

```sh
cargo build --package breditor-wasm --target wasm32-unknown-unknown --release --locked --offline
wasm-bindgen --target web --out-dir target/v010-fixture target/wasm32-unknown-unknown/release/breditor_wasm.wasm
cp target/v010-fixture/breditor_wasm.js target/v010-fixture/breditor_wasm.mjs
```

Set `producer` to the absolute path to that worktree. The capture script
compares its output with the fixture from the current checkout.

```sh
node crates/breditor-wasm/tests/fixtures/v0.1.0/capture_checkpoint.mjs \
  "$producer/target/v010-fixture/breditor_wasm.mjs" \
  "$producer/target/v010-fixture/breditor_wasm_bg.wasm" |
  cmp - crates/breditor-wasm/tests/fixtures/v0.1.0/history.json
```

The current reader tests in `wasm_boundary.rs` compare the canonical checkpoint, visit every
Undo and Redo state, and verify explicit unknown-version and foreign-schema
refusal. The fixture covers the default legacy checkpoint reader.
