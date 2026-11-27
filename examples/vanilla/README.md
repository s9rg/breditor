# Breditor vanilla example

A dependency-free page that owns one local editor with `openLocalEditor` from
`@breditor/editor`. It has no framework and no runtime dependency beyond the SDK.
It shows the adapter lifecycle contract from the editor package README:

- one owner per host element, opened with a fresh `AbortController` signal;
- a late owner that resolves after `close()` is disposed and never published;
- a serial lane, so "Close and reopen" never races the cleanup of a cancelled opening;
- `checkpointJson()` captured before `dispose()` and reopened with
  `{kind: 'checkpoint'}`, so content and future Undo/Redo survive;
- read-only as live policy through `setReadOnly`, re-read after startup;
- startup failures shown as `Failed` and reported, and cancellation never reported.

The seed document is built from the compiled profile's `schema` and `schemaFingerprint`,
so Rust admits it unchanged.

## Run

`@breditor/editor` is a private candidate whose build is opt-in. Build it, the
packaged local Wasm runtime and the examples from the repository root, then serve
this example:

```sh
npm run build:examples:frameworks
npm run dev:example --workspace @breditor/example-vanilla
```

`npm run test:examples:frameworks` builds everything and runs the Playwright smoke
spec in `tests/framework-examples`. Type-check with
`npm run typecheck:examples:frameworks`. The examples define no default `build` or
`typecheck` script, so the root `npm run build` and `npm run typecheck` do not need
the candidate runtime.
