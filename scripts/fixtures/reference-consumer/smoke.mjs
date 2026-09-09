import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BREDITOR_BROWSER_PACKAGE_VERSION,
  openBreditorBrowserEditor,
} from "@breditor/browser";
import {
  REFERENCE_HIGHLIGHT_IDS,
  REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
  REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT,
  REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
  createReferenceHighlightDocumentJson,
} from "@breditor/reference-highlight";
import initializeWasm, {
  breditorVersion,
  breditorWasmAbiVersion,
} from "@breditor/wasm";

assert.equal(typeof openBreditorBrowserEditor, "function");
assert.equal(typeof initializeWasm, "function");
assert.equal(typeof breditorWasmAbiVersion, "function");
assert.equal(typeof breditorVersion, "function");
assert.equal(BREDITOR_BROWSER_PACKAGE_VERSION, "0.3.0-alpha.1");
assert.equal(REFERENCE_HIGHLIGHT_IDS.formatKind, "example/highlight");
assert.equal(REFERENCE_HIGHLIGHT_IDS.formatRevision, 7);
assert.equal(
  REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT,
  "sha256:374d5f058129ab8916d052866e37f3b3540dbb754ba560e55086415a3c58f741",
);
assert.equal(
  JSON.parse(createReferenceHighlightDocumentJson("smoke", "highlighted"))
    .schemaFingerprint,
  REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT,
);
assert.equal(
  JSON.parse(REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON).extensions[0]
    .inlineFormatToggles[0].intentId,
  REFERENCE_HIGHLIGHT_IDS.intentId,
);
assert.ok(Object.isFrozen(REFERENCE_HIGHLIGHT_RENDER_MANIFEST));
assert.ok(Object.isFrozen(REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST));

const consumerDirectory = dirname(fileURLToPath(import.meta.url));
const modulesPrefix = `${realpathSync(join(consumerDirectory, "node_modules"))}${sep}`;
const browserEntry = resolveInsideConsumer("@breditor/browser");
resolveInsideConsumer("@breditor/wasm");
const referenceEntry = resolveInsideConsumer("@breditor/reference-highlight");

const referenceRequire = createRequire(referenceEntry);
const referenceBrowserEntry = realpathSync(
  referenceRequire.resolve("@breditor/browser"),
);
assert.equal(
  referenceBrowserEntry,
  browserEntry,
  "the reference package did not use the consumer's single browser peer",
);

function resolveInsideConsumer(specifier) {
  const resolved = realpathSync(fileURLToPath(import.meta.resolve(specifier)));
  assert.ok(
    resolved.startsWith(modulesPrefix),
    `${specifier} resolved outside the clean consumer: ${resolved}`,
  );
  return resolved;
}
