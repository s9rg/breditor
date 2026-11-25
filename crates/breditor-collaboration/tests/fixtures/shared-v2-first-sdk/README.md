# Historical shared structural V2 journal

`journal.json` is the exact output, plus one LF, of the normal shared Wasm
producer built from `e73805b26ec880e26b2c4333b442919942419a99`. This October 15
commit first integrated the explicit structural V2 SDK and relay. The build used
the pinned Rust 1.98.0 and wasm-bindgen 0.2.127. It is a source-built historical
fixture, independent of the archived input-rule reference runtimes.

The producer uses `profile.json`, private ABI 1, model 12, journal 13, and writer
`101` for room `historical-shared-v2`. It inserts text, converts a paragraph into
a Rust code block, undoes that conversion and saves with an explicit empty
pending-format override at offset three with `before` affinity. The saved
bytes have SHA-256 `b5bbb6b306b2842cf2cb1b2a406d809e6006fd73c8ffae3bca78744b65cc3abf`.

Build the pinned commit in a separate checkout using its normal application
build. That producer's Linux and macOS debug paths may differ. The journal
comparison verifies the serialized output of the capture.

```sh
node scripts/build-collaboration-runtime.mjs
cp target/promoted-shared-web/breditor_shared.js target/promoted-shared-web/breditor_shared.mjs
```

From the current checkout, set `producer` to the absolute path of the pinned
checkout and reproduce the bytes.

```sh
fixture=crates/breditor-collaboration/tests/fixtures/shared-v2-first-sdk
node "$fixture/capture.mjs" \
  "$producer/target/promoted-shared-web/breditor_shared.mjs" \
  "$producer/target/promoted-shared-web/breditor_shared_bg.wasm" |
  cmp - "$fixture/journal.json"
```

The [native reader test](../../historical_shared_v2_journal.rs) and the installed
interchange consumer exercise one explicit current V2 reader. They verify exact
cold reopen at each cursor, the structural Redo, an edit after recovery with its
own Undo and Redo, and refusal by other rooms, profiles and journal families.
