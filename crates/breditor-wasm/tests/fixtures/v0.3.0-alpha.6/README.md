# ABI 4 typed range Session Checkpoint V3 fixture

`history.json` was emitted by the default ABI 4 Wasm build of tagged source
`v0.3.0-alpha.6` at `57b33a67fe7ea0cc155ef86d1d2fe07fea0993a9`. The owner uses
the checked-in, property-bearing `profile.json`. The checkpoint retains a
text insertion on the Undo branch and a typed cross-paragraph `RootTextReplace`
on the Redo branch. Its range spans an empty paragraph and retains a backward
selection and an independent Bold format. SHA-256 including the terminal LF
is `17822015d6f4fa43b306d19dca1697a566eac40374232c26dd788a8d6e14b283`.

Build the tag in a separate checkout with Rust 1.98.0 and wasm-bindgen 0.2.127.

```sh
cargo build --package breditor-wasm --target wasm32-unknown-unknown --release --locked --offline
wasm-bindgen --target web --out-dir target/abi4-fixture target/wasm32-unknown-unknown/release/breditor_wasm.wasm
cp target/abi4-fixture/breditor_wasm.js target/abi4-fixture/breditor_wasm.mjs
```

Set `producer` to the absolute path of that checkout and run this comparison
from the current checkout.

```sh
fixture=crates/breditor-wasm/tests/fixtures/v0.3.0-alpha.6
node "$fixture/capture_checkpoint.mjs" \
  "$producer/target/abi4-fixture/breditor_wasm.mjs" \
  "$producer/target/abi4-fixture/breditor_wasm_bg.wasm" |
  cmp - "$fixture/history.json"
```

The current native and Wasm boundary suites use the explicit V3 factory. They
verify byte-exact restore and fresh reopen at every history cursor, typed
property values, unselected edges, the empty paragraph, both selection
affinities and history depth. The V1 and V2 factories, an unknown checkpoint
version and a profile with the same schema selector but a different
fingerprint each refuse admission with a structured error.
