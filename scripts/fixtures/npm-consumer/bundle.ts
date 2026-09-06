import {
  openBreditorBrowserEditor,
} from "@breditor/browser";
import initializeWasm, * as breditorWasm from "@breditor/wasm";

const CONSUMER_TEXT = "Hello 🙂漢\n";
const CONSUMER_DOCUMENT_JSON = JSON.stringify({
  format: "breditor/document",
  formatVersion: 1,
  schema: { name: "breditor/base", version: 1 },
  root: {
    kind: "element",
    type: "breditor/document",
    entityId: null,
    properties: {},
    children: [
      {
        kind: "element",
        type: "breditor/paragraph",
        entityId: null,
        properties: {},
        children: [
          { kind: "text", text: "Hello ", formats: [] },
          {
            kind: "text",
            text: "🙂漢",
            formats: [{ type: "breditor/strong", properties: {} }],
          },
        ],
      },
      {
        kind: "element",
        type: "breditor/paragraph",
        entityId: null,
        properties: {},
        children: [],
      },
    ],
  },
});

void start().catch((error: unknown) => {
  document.documentElement.dataset["breditorPackageError"] =
    error instanceof Error ? error.message : "unknown package startup failure";
});

async function start(): Promise<void> {
  const host = document.getElementById("editor");
  if (!(host instanceof HTMLElement)) throw new Error("editor host is missing");

  await initializeWasm();
  const opened = await openBreditorBrowserEditor({
    host,
    label: "Tarball consumer editor",
    wasm: breditorWasm,
    initialDocument: {
      lineageId: "tarball-consumer",
      documentJson: CONSUMER_DOCUMENT_JSON,
      historyCapacity: 10,
    },
    keyboard: {
      editing: "beforeinputPrimary",
      primaryModifier: "control",
      shortcuts: "enabled",
    },
  });
  if (!opened.ok) {
    throw new Error(`${opened.error.code}: ${opened.error.message}`);
  }

  const documentJson = opened.editor.exportContent("documentJson");
  const plainText = opened.editor.exportContent("plainText");
  if (!documentJson.ok || !plainText.ok) {
    throw new Error("public content export failed after tarball startup");
  }
  const expectedSnapshot = Object.freeze({
    lineage: "tarball-consumer",
    revision: "0",
  });
  if (
    documentJson.format !== "documentJson" ||
    documentJson.value !== CONSUMER_DOCUMENT_JSON ||
    documentJson.utf8Bytes !== utf8Bytes(CONSUMER_DOCUMENT_JSON) ||
    documentJson.snapshot.lineage !== expectedSnapshot.lineage ||
    documentJson.snapshot.revision !== expectedSnapshot.revision ||
    plainText.format !== "plainText" ||
    plainText.value !== CONSUMER_TEXT ||
    plainText.utf8Bytes !== utf8Bytes(CONSUMER_TEXT) ||
    plainText.snapshot.lineage !== expectedSnapshot.lineage ||
    plainText.snapshot.revision !== expectedSnapshot.revision
  ) {
    throw new Error("public content export did not match the rich fixture");
  }

  Object.defineProperty(globalThis, "__breditorPackageSmoke", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      documentJson,
      plainText,
      snapshot: opened.editor.getSnapshot(),
      exportsFrozen:
        Object.isFrozen(documentJson) &&
        Object.isFrozen(plainText) &&
        Object.isFrozen(documentJson.snapshot) &&
        Object.isFrozen(plainText.snapshot),
      dispose: () => {
        opened.editor.dispose();
        return Object.freeze({
          status: opened.editor.getStatus(),
          snapshotStatus: opened.editor.getSnapshot().status,
          host: Object.freeze({
            childNodes: host.childNodes.length,
            contenteditable: host.getAttribute("contenteditable"),
            role: host.getAttribute("role"),
            label: host.getAttribute("aria-label"),
            multiline: host.getAttribute("aria-multiline"),
            editorRoot: host.getAttribute("data-breditor-editor-root"),
          }),
        });
      },
    }),
  });
  document.documentElement.dataset["breditorPackageReady"] = "true";
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
