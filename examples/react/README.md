# Breditor React reference

This example demonstrates the intended React ownership boundary. React renders
two permanently empty mount elements; `BreditorBrowserEditor` owns all toolbar
and editor children beneath them. It initializes `@breditor/wasm` once, survives
React Strict Mode's setup/cleanup probe, subscribes through
`useSyncExternalStore`, and enables the single-slot IndexedDB checkpoint.

Prop changes and unmounts immediately make both Breditor mounts inert, request a
checkpoint flush, and always dispose the old runtime afterward. Replacement
startup is serialized behind that retirement, so two runtimes cannot race for
the same host. Because React does not await effect cleanup, this retirement flush
is best-effort and bounded to five seconds; a hung storage operation cannot hold
the host forever.

From the repository root:

```sh
npm install
npm run dev --workspace @breditor/example-react
```

The lifecycle regression suite covers Strict Mode, prop-driven replacement,
failure recovery, stale asynchronous startup, dirty retirement ordering,
rejected and hung flushes, truthful persistence status, and exact disposal:

```sh
npm run test --workspace @breditor/example-react
```

The example intentionally does not wrap the runtime in an `@breditor/react`
package. The framework-neutral owner remains the product API for `0.1.0`.

## Controlled navigation

Browser or process termination can stop JavaScript without waiting for React
cleanup, so no component cleanup can guarantee a final write on tab close,
reload, a crash, or power loss. For a route change, document switch, or other
navigation your application controls, flush *before* changing the React tree:

```tsx
import { useRef } from "react";

import {
  BreditorEditor,
  type BreditorEditorHandle,
} from "./src/BreditorEditor.js";

function DocumentRoute(): React.ReactElement {
  const editor = useRef<BreditorEditorHandle>(null);

  async function leaveDocument(): Promise<void> {
    const outcome = await editor.current?.flushBeforeNavigation();
    const durable =
      outcome?.status === "settled" &&
      (outcome.result.status === "committed" ||
        outcome.result.status === "disabled");

    if (durable) {
      // Change route state only here, after the flush completed.
    } else {
      // Keep the editor mounted and let the user retry or confirm leaving.
    }
  }

  return (
    <>
      <BreditorEditor
        ref={editor}
        label="Example document"
        primaryModifier="control"
      />
      <button type="button" onClick={() => void leaveDocument()}>
        Leave document
      </button>
    </>
  );
}
```

`flushBeforeNavigation()` does not dispose the editor. It has a 15-second
default bound and returns an explicit `settled`, `editor_unavailable`,
`timed_out`, or `unexpected_failure` outcome. A settled persistence result can
still be `failed`, `disposed`, or `rejected`; applications should inspect it and
choose whether to retry, remain on the page, or ask for confirmation.
