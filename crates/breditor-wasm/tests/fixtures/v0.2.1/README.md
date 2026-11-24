# Released V0.2.1 Highlight Session Checkpoint V2 fixture

`history.json` was emitted by a default ABI 3 Wasm build of the released
`v0.2.1` source at `6fb8ffb2e4912d6fabd7b14a4c644ea60446b210`. The documented
Highlight profile applies its routed intent to a selection and inserts Unicode
text. The checkpoint retains the Highlight edit and one available Redo, along
with the exact profile fingerprint and selections. The file SHA-256, including
its terminal LF, is `127751633242df582fdefda50fd8e83cf33d29e49d9c072f5b171e91cc6b84a1`.

Build the tag in a separate checkout with its pinned Rust 1.98.0 toolchain and
wasm-bindgen 0.2.127.

```sh
cargo build --package breditor-wasm --target wasm32-unknown-unknown --release --locked --offline
wasm-bindgen --target web --out-dir target/v021-fixture target/wasm32-unknown-unknown/release/breditor_wasm.wasm
cp target/v021-fixture/breditor_wasm.js target/v021-fixture/breditor_wasm.mjs
```

Set `producer` to that checkout's absolute path. Run this comparison from the
current checkout.

```sh
node crates/breditor-wasm/tests/fixtures/v0.2.1/capture_checkpoint.mjs \
  "$producer/target/v021-fixture/breditor_wasm.mjs" \
  "$producer/target/v021-fixture/breditor_wasm_bg.wasm" |
  cmp - crates/breditor-wasm/tests/fixtures/v0.2.1/history.json
```

The current native and Wasm boundary tests reopen and re-encode this checkpoint
exactly, traverse both history directions, and reject an altered fingerprint,
the unprofiled V1 reader, and a future checkpoint version.
