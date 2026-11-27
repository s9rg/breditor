# Breditor Custom Element example

`src/breditor_editor_element.ts` defines a framework-neutral `<breditor-editor>`
element around `openLocalEditor`. Any framework that can render a custom element and
listen to DOM events can use it. That includes Vue, Svelte, Angular, Solid, Lit and
server templates. This is example code to copy and adapt. It is not a stable SDK
export.

```js
import {openLocalEditor} from '@breditor/editor';
import {defineBreditorEditorElement} from './breditor_editor_element.js';

defineBreditorEditorElement({open: openLocalEditor});
```

```html
<breditor-editor label="Notes" initial-document='{"format":"breditor/document",...}' read-only></breditor-editor>
```

| Attribute | Property | Meaning |
| --- | --- | --- |
| `initial-document` | `initialDocument` | Seed document JSON, read when an editor opens. It works like `defaultValue` and never replaces a live owner. |
| `read-only` | `readOnly` | Live policy, applied with `setReadOnly`. A change during startup is applied once the owner is ready. |
| `label` | `label` | Accessible label, read when an editor opens. |
| | `editor` | The live `LocalEditor`, or `null`. |
| | `phase` | `idle`, `starting`, `ready` or `failed`. It is mirrored to `data-breditor-phase`, and `aria-busy` is set while starting. |
| | `checkpointJson()` | Exact checkpoint of the live owner, or of the last disposed one. |
| | `retry()` | Restarts a failed opening and never resets a live owner. |

Events are non-bubbling `CustomEvent`s. `breditor-ready` carries `detail.editor`
and fires once per owner. `breditor-change` carries `detail.view` and
`detail.outcome` after Rust has published a change. `breditor-error` carries
`detail.error` for a startup failure or an owner fault. The names are prefixed
because the toolbar's own form fields emit native `change` events that bubble.

## Lifecycle

- **Connect** opens an owner on an inner host `<div>`. The element replaces its light-DOM
  children, so frameworks must render it empty.
- **Disconnect during startup** aborts the opening. The rejection is silent, and an
  owner that resolves late is disposed and never announced.
- **Move** (`append` or `insertBefore` into another parent of the same document) keeps
  the same owner, selection and history. Teardown waits one microtask and is cancelled
  when the element is reconnected in the meantime.
- **Removal** disposes the owner after that microtask and keeps its exact checkpoint.
  **Reconnect** reopens from that checkpoint, so content and Undo/Redo survive. To reseed
  instead, set `initialDocument` while the element is detached.
- **Reconnect while a cancelled opening still holds the host** waits for that opening
  to settle, so it never fails with "This host already has an editor or pending opening".
- **Adoption** into another document always restarts with a fresh owner.

`tests/breditor_editor_element.test.ts` covers these cases in jsdom with a fake opener.
The fake uses the SDK's real host-claim guard. That test runs in the root `npm test`
and needs no Wasm build.

## Run

```sh
npm run build:examples:frameworks
npm run dev:example --workspace @breditor/example-web-component
npm test --workspace @breditor/example-web-component
```
