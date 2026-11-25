# First shared layout SDK journal

`journal.json` records a journal emitted by the ordinary application build of
`a79df99d50e52106bb86250e7c8f7343f6f133a6`, the first shared language 3 Wasm SDK.
Its SHA-256 is `523503c789139c403b819ba58ff7311cc7e39ed1dc92530468b7988a0aba167b`.
It uses model 13 and journal 14. Writer 101 inserts text and changes four layout
fields. Writer 202 applies a distinct layout to another paragraph using the
original bound update protocol. The capture saves after writer 101 undoes its
layout change and sets an explicit selection and pending formats.

The capture uses a fixed clock. It also records the original producer's next five
checkpoint hashes after traversing both branches of the saved history, reopening
before each operation. The current independently installed collaboration check
matches those clocks, bytes, and hashes. It checks the writer's visible fields,
selection, history depths and surviving peer layout. It refuses the same bytes
under another room, schema, typing policy, or adjacent language reader.

Reproduce from a separate clean checkout of the specified commit. Build its
application runtime with its pinned Rust toolchain and Wasm Bindgen CLI:

```sh
(cd "$producer" && node scripts/build-collaboration-runtime.mjs)
runtime="$producer/packages/breditor-collaboration/dist/runtime"
fixture=crates/breditor-collaboration/tests/fixtures/shared-v3-first-sdk
node "$fixture/capture.mjs" "$runtime/breditor_shared.js" \
  "$runtime/breditor_shared_bg.wasm" | cmp - "$fixture/journal.json"
```

The current check runs in the installed SDK's collaboration-only consumer. Its
scope is the original explicit journal and ordinary native/SDK recovery.
The recorded capture used Rust 1.98.0 and `wasm-bindgen` 0.2.127. Its Wasm
SHA-256 was `eefe0c8428a16a0b689fced430373e68fa5a23f13161892881c1b71948b41579`.
