import {
  openBreditorBrowserEditor,
  type BreditorBrowserContentExport,
  type BreditorBrowserEditorSnapshot,
} from "@breditor/browser";
import {
  REFERENCE_HIGHLIGHT_IDS,
  REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
  REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT,
  REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
  createReferenceHighlightDocumentJson,
} from "@breditor/reference-highlight";
import initializeWasm, * as breditorWasm from "@breditor/wasm";

const CONSUMER_TEXT = "Reference Highlight";
const CONSUMER_DOCUMENT_JSON = createReferenceHighlightDocumentJson(
  CONSUMER_TEXT,
  "highlighted",
);

interface ReferencePackageSmoke {
  readonly documentJson: BreditorBrowserContentExport<"documentJson">;
  readonly plainText: BreditorBrowserContentExport<"plainText">;
  readonly snapshot: BreditorBrowserEditorSnapshot;
  readonly profile: Readonly<{
    formatKind: string;
    schemaFingerprint: string;
  }>;
  dispose(): Readonly<{
    status: string;
    editorChildren: number;
    toolbarChildren: number;
  }>;
}

declare global {
  // A single immutable observation handle lets the external Playwright process
  // prove the production bundle without importing repository-only helpers.
  var __breditorReferencePackageSmoke: ReferencePackageSmoke | undefined;
}

void start().catch((error: unknown) => {
  document.documentElement.dataset["breditorReferencePackageError"] =
    error instanceof Error ? error.message : "unknown reference startup failure";
});

async function start(): Promise<void> {
  const host = document.getElementById("editor");
  const toolbarHost = document.getElementById("toolbar");
  if (!(host instanceof HTMLElement) || !(toolbarHost instanceof HTMLElement)) {
    throw new Error("reference package hosts are missing");
  }

  await initializeWasm();
  const opened = await openBreditorBrowserEditor({
    host,
    label: "Tarball reference Highlight editor",
    wasm: breditorWasm,
    initialDocument: {
      lineageId: "tarball-reference-highlight",
      documentJson: CONSUMER_DOCUMENT_JSON,
      historyCapacity: 10,
    },
    semanticProfile: {
      bootstrapJson: REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
    },
    rendering: REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
    toolbar: {
      host: toolbarHost,
      manifest: REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
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

  const highlightButton = [...toolbarHost.querySelectorAll("button")].find(
    (button) => button.textContent === "Highlight",
  );
  const textNode = host.querySelector("mark")?.firstChild;
  const selection = window.getSelection();
  if (
    !(highlightButton instanceof HTMLButtonElement) ||
    !(textNode instanceof Text) ||
    selection === null ||
    typeof selection.setBaseAndExtent !== "function"
  ) {
    opened.editor.dispose();
    throw new Error("reference package selection fixture is unavailable");
  }
  opened.editor.focus();
  selection.setBaseAndExtent(textNode, 0, textNode, textNode.data.length);
  document.dispatchEvent(new Event("selectionchange"));
  await waitFor(
    () =>
      highlightButton.getAttribute("aria-disabled") === "false" &&
      highlightButton.getAttribute("aria-pressed") === "true",
    "reference package toolbar state did not follow the highlighted selection",
  );

  const documentJson = opened.editor.exportContent("documentJson");
  const plainText = opened.editor.exportContent("plainText");
  if (!documentJson.ok || !plainText.ok) {
    opened.editor.dispose();
    throw new Error("reference package content export failed");
  }

  const smoke: ReferencePackageSmoke = Object.freeze({
    documentJson,
    plainText,
    snapshot: opened.editor.getSnapshot(),
    profile: Object.freeze({
      formatKind: REFERENCE_HIGHLIGHT_IDS.formatKind,
      schemaFingerprint: REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT,
    }),
    dispose: () => {
      opened.editor.dispose();
      return Object.freeze({
        status: opened.editor.getStatus().phase,
        editorChildren: host.childNodes.length,
        toolbarChildren: toolbarHost.childNodes.length,
      });
    },
  });
  Object.defineProperty(globalThis, "__breditorReferencePackageSmoke", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: smoke,
  });
  document.documentElement.dataset["breditorReferencePackageReady"] = "true";
}

async function waitFor(
  predicate: () => boolean,
  failure: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  }
  throw new Error(failure);
}
