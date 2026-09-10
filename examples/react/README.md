# Breditor React reference

This example runs the complete `@breditor/reference-highlight` Showcase
profile through the public browser API: the canonical Document V2 sample,
Bootstrap V2 semantic profile, render manifest, and toolbar manifest. The
runtime-owned toolbar exposes Bold, Italic, Strikethrough, Code, Highlight,
Link, Undo, and Redo. A sibling runtime-owned Link form is launched by its
toolbar control and
demonstrates typed extension input with a required URL string and Boolean
new-window choice. Select some text, apply or remove a link, toggle a format,
use the platform primary-modifier+B shortcut, and watch the truthful autosave
status.

It also demonstrates the intended React ownership boundary. React renders two
permanently empty mount elements; `BreditorBrowserEditor` owns all toolbar,
typed-form, and editor children beneath them. It initializes `@breditor/wasm`
once, survives React Strict Mode's setup/cleanup probe, subscribes through
`useSyncExternalStore`, and enables an explicit demo-slot IndexedDB checkpoint.
The callback-free Link declaration is correlated with the Rust-compiled set
surface, and the runtime submits its complete-map input through the shared
typed intent queue. Rust's preserved semantic selection remains authoritative
while keyboard focus is in the URL or checkbox control. Rejected and blocked
results are reported without echoing the URL or exposing internal routing.
The current action-state projection reports exact unset, uniform, or whole-map
mixed Link state. A pristine form hydrates a uniform complete map; dirty input
remains an explicit replacement draft. The browser-owned `safeLinkV1` renderer
activates only absolute, credential-free HTTP(S) URLs; other persisted values
remain visible as inert text-bearing anchors.
At the alpha.6 source checkpoint, the then-React-owned form could apply or
remove the complete Link instance across selected text in multiple paragraphs.
Rust preserves
Highlight peers, empty middle paragraphs, unselected edge text, directional
selection, and one exact undo/redo unit. Alpha.7 moves that typed input into the
runtime-owned form without giving the presentation layer operation-planning
authority. Alpha.8 adds exact pristine hydration. Alpha.9 composes three new
property-free styles through the existing generic toggle path; when all six
formats overlap, the deterministic wrapper chain is
`<a><strong><em><mark><s><code>`. There are no extension shortcuts, exclusion
rules, block code, headings/lists, rich paste, or runtime plugins yet.
Startup failures expose only stable, payload-redacted error codes and can be
retried in place. A paused autosave exposes the same safe diagnostics and the
public persistence retry operation.

Prop changes and unmounts immediately make both Breditor mounts inert, request a
checkpoint flush, and always dispose the old runtime afterward. Replacement
startup is serialized behind that retirement, so two runtimes cannot race for
the same host. Because React does not await effect cleanup, this retirement flush
is best-effort and bounded to five seconds; a hung storage operation cannot hold
the host forever.

From the repository root:

```sh
npm ci
export WASM_BINDGEN_BIN=/absolute/path/to/wasm-bindgen
npm run demo
```

The top-level command builds every package before Vite starts. For focused
development after a successful workspace build, use:

```sh
npm run dev --workspace @breditor/example-react
```

The lifecycle regression suite covers the exact reference-package wiring,
Strict Mode, prop-driven replacement, retryable startup failure, stale
asynchronous startup, dirty retirement ordering, paused persistence retry,
rejected and hung flushes, truthful persistence status, and exact disposal:

```sh
npm run test --workspace @breditor/example-react
```

The repository-level Chromium gate exercises the rendered page through actual
single- and cross-paragraph selection, all eight controls, exact wrapper
nesting, per-command history, input, IndexedDB reload, accessibility, and a
320-pixel responsive viewport:

```sh
npm run test:demo
```

The example intentionally does not wrap the runtime in an `@breditor/react`
package. `@breditor/browser` remains the framework-neutral owner; React only
adapts its lifecycle and external-store subscription.

## Controlled navigation

Browser or process termination can stop JavaScript without waiting for React
cleanup, so no component cleanup can guarantee a final write on tab close,
reload, a crash, or power loss. For a route change, document switch, or other
navigation your application controls, flush _before_ changing the React tree:

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
