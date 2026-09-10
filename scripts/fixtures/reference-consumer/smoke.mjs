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
  MAX_REFERENCE_FORMATTING_DOCUMENT_TEXT_UTF8,
  MAX_REFERENCE_LINK_HREF_UTF8,
  REFERENCE_FORMATTING_EMPTY_DOCUMENT,
  REFERENCE_FORMATTING_EMPTY_DOCUMENT_JSON,
  REFERENCE_FORMATTING_IDS,
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP,
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_FORMATTING_RENDER_MANIFEST,
  REFERENCE_FORMATTING_SAMPLE_DOCUMENT,
  REFERENCE_FORMATTING_SAMPLE_DOCUMENT_JSON,
  REFERENCE_FORMATTING_SCHEMA_FINGERPRINT,
  REFERENCE_FORMATTING_TOOLBAR_MANIFEST,
  REFERENCE_HIGHLIGHT_IDS,
  REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
  REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT,
  REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
  REFERENCE_LINK_REMOVE_INPUT_JSON,
  createReferenceFormattingDocument,
  createReferenceFormattingDocumentJson,
  createReferenceHighlightDocumentJson,
  createReferenceLinkRemoveInput,
  createReferenceLinkRemoveInputJson,
  createReferenceLinkSetInput,
  createReferenceLinkSetInputJson,
} from "@breditor/reference-highlight";
import initializeWasm, {
  breditorVersion,
  breditorWasmAbiVersion,
} from "@breditor/wasm";

assert.equal(typeof openBreditorBrowserEditor, "function");
assert.equal(typeof initializeWasm, "function");
assert.equal(typeof breditorWasmAbiVersion, "function");
assert.equal(typeof breditorVersion, "function");
assert.equal(BREDITOR_BROWSER_PACKAGE_VERSION, "0.3.0-alpha.7");
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

assert.equal(MAX_REFERENCE_FORMATTING_DOCUMENT_TEXT_UTF8, 1_048_576);
assert.equal(MAX_REFERENCE_LINK_HREF_UTF8, 2_048);
assert.equal(REFERENCE_FORMATTING_IDS.highlightFormatKind, "example/highlight");
assert.equal(REFERENCE_FORMATTING_IDS.linkFormatKind, "example/link");
assert.equal(REFERENCE_FORMATTING_IDS.linkIntentId, "example/set-link-intent");
assert.equal(REFERENCE_FORMATTING_PROFILE_BOOTSTRAP.formatVersion, 2);
assert.deepEqual(
  JSON.parse(REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON),
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP,
);
assert.equal(
  REFERENCE_FORMATTING_SCHEMA_FINGERPRINT,
  "sha256:33d6e87ffa2d10a504a3319d64a71a2c980ec90c3e1c9e4f6cf97809982113cc",
);
assert.equal(
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP.extensions[1].inlineFormatSets[0]
    .intentId,
  REFERENCE_FORMATTING_IDS.linkIntentId,
);
assert.equal(
  REFERENCE_FORMATTING_RENDER_MANIFEST.recipes[2].attributes.kind,
  "safeLinkV1",
);
assert.deepEqual(
  REFERENCE_FORMATTING_TOOLBAR_MANIFEST.controls.map((control) => control.label),
  ["Bold", "Highlight", "Link", "Undo", "Redo"],
);
assert.equal(
  REFERENCE_FORMATTING_TOOLBAR_MANIFEST.controls[2].kind,
  "inlineFormatForm",
);

const linkSetInput = createReferenceLinkSetInput(
  "HTTPS://Example.TEST:443/package-proof",
  true,
);
assert.deepEqual(linkSetInput, {
  operation: "set",
  properties: [
    { name: "example/href", value: "HTTPS://Example.TEST:443/package-proof" },
    { name: "example/open-in-new-window", value: true },
  ],
});
assert.equal(
  createReferenceLinkSetInputJson("https://example.test/package-proof", false),
  '{"operation":"set","properties":[{"name":"example/href","value":"https://example.test/package-proof"},{"name":"example/open-in-new-window","value":false}]}',
);
assert.deepEqual(createReferenceLinkRemoveInput(), { operation: "remove" });
assert.equal(
  createReferenceLinkRemoveInputJson(),
  REFERENCE_LINK_REMOVE_INPUT_JSON,
);

const generatedFormattingDocument = createReferenceFormattingDocument(
  "package proof",
  {
    highlighted: true,
    link: {
      href: "https://example.test/package-proof",
      openInNewWindow: true,
    },
  },
);
assert.equal(
  generatedFormattingDocument.schemaFingerprint,
  REFERENCE_FORMATTING_SCHEMA_FINGERPRINT,
);
assert.equal(
  JSON.parse(
    createReferenceFormattingDocumentJson("package proof", {
      highlighted: true,
    }),
  ).schemaFingerprint,
  REFERENCE_FORMATTING_SCHEMA_FINGERPRINT,
);
assert.equal(
  REFERENCE_FORMATTING_EMPTY_DOCUMENT_JSON,
  JSON.stringify(REFERENCE_FORMATTING_EMPTY_DOCUMENT),
);
assert.equal(
  REFERENCE_FORMATTING_SAMPLE_DOCUMENT_JSON,
  JSON.stringify(REFERENCE_FORMATTING_SAMPLE_DOCUMENT),
);
for (const fixture of [
  REFERENCE_FORMATTING_IDS,
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP,
  REFERENCE_FORMATTING_RENDER_MANIFEST,
  REFERENCE_FORMATTING_TOOLBAR_MANIFEST,
  REFERENCE_FORMATTING_EMPTY_DOCUMENT,
  REFERENCE_FORMATTING_SAMPLE_DOCUMENT,
  generatedFormattingDocument,
  linkSetInput,
  createReferenceLinkRemoveInput(),
]) {
  assertDeeplyFrozen(fixture);
}

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

function assertDeeplyFrozen(value, visited = new Set()) {
  if (typeof value !== "object" || value === null || visited.has(value)) return;
  assert.ok(Object.isFrozen(value), "reference export was not frozen");
  visited.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(
      descriptor && "value" in descriptor,
      "reference export was not data-only",
    );
    assertDeeplyFrozen(descriptor.value, visited);
  }
}
