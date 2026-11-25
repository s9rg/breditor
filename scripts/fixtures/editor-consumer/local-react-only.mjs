/** React's local entry can render with its declared peer and no collaboration. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BreditorEditor } from "@breditor/editor/react";

const require = createRequire(import.meta.url);
assert.throws(() => require.resolve("@breditor/collaboration/wasm-binary"), { code: "MODULE_NOT_FOUND" });
const output = renderToStaticMarkup(createElement(BreditorEditor, { initialOptions: { initial: { kind: "empty" } } }));
assert.match(output, /data-breditor-phase="starting"/);
await assert.rejects(import("@breditor/editor/collaboration"), {
  code: "ERR_MODULE_NOT_FOUND", message: /Cannot find package '@breditor\/collaboration'/,
});
console.log(JSON.stringify({ localReactWithoutCollaboration: true, sharedWithoutCollaborationRefused: true }));
