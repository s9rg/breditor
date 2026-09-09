import {
  openBreditorBrowserEditor,
  type BreditorBrowserContentExport,
  type BreditorBrowserEditorSnapshot,
  type BreditorBrowserIntentResult,
} from "@breditor/browser";
import {
  REFERENCE_FORMATTING_EMPTY_DOCUMENT,
  REFERENCE_FORMATTING_IDS,
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP,
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_FORMATTING_RENDER_MANIFEST,
  REFERENCE_FORMATTING_SAMPLE_DOCUMENT,
  REFERENCE_FORMATTING_SCHEMA_FINGERPRINT,
  REFERENCE_FORMATTING_TOOLBAR_MANIFEST,
  REFERENCE_HIGHLIGHT_IDS,
  REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
  REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT,
  REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
  createReferenceFormattingDocument,
  createReferenceFormattingDocumentJson,
  createReferenceHighlightDocumentJson,
  createReferenceLinkRemoveInput,
  createReferenceLinkRemoveInputJson,
  createReferenceLinkSetInput,
  createReferenceLinkSetInputJson,
} from "@breditor/reference-highlight";
import initializeWasm, * as breditorWasm from "@breditor/wasm";

const LEGACY_TEXT = "Reference Highlight";
const LEGACY_DOCUMENT_JSON = createReferenceHighlightDocumentJson(
  LEGACY_TEXT,
  "highlighted",
);
const FORMATTING_TEXT = "Combined Highlight and Link";
const FORMATTING_DOCUMENT_JSON = createReferenceFormattingDocumentJson(
  FORMATTING_TEXT,
  { highlighted: true },
);
const LINK_SOURCE_HREF =
  "HTTPS://Example.TEST:443/reference/path?source=tarball#proof";
const LINK_CANONICAL_HREF =
  "https://example.test/reference/path?source=tarball#proof";

interface LinkDomObservation {
  readonly attributes: readonly string[];
  readonly className: string | null;
  readonly href: string | null;
  readonly rel: string | null;
  readonly target: string | null;
  readonly text: string | null;
}

interface ReferencePackageSmoke {
  /** Legacy fields remain stable for consumers of the original smoke fixture. */
  readonly documentJson: BreditorBrowserContentExport<"documentJson">;
  readonly plainText: BreditorBrowserContentExport<"plainText">;
  readonly snapshot: BreditorBrowserEditorSnapshot;
  readonly profile: Readonly<{
    formatKind: string;
    schemaFingerprint: string;
  }>;
  readonly formatting: Readonly<{
    documentJson: BreditorBrowserContentExport<"documentJson">;
    plainText: BreditorBrowserContentExport<"plainText">;
    snapshot: BreditorBrowserEditorSnapshot;
    profile: Readonly<{
      bootstrapFormatVersion: number;
      linkFormatKind: string;
      linkIntentId: string;
      schemaFingerprint: string;
    }>;
    firstSet: BreditorBrowserIntentResult;
    remove: BreditorBrowserIntentResult;
    finalSet: BreditorBrowserIntentResult;
    firstSetDom: LinkDomObservation;
    removedAnchor: boolean;
    finalDom: LinkDomObservation;
    sourceHref: string;
    canonicalHref: string;
  }>;
  readonly fixturesFrozen: boolean;
  dispose(): Readonly<{
    status: string;
    formattingStatus: string;
    editorChildren: number;
    toolbarChildren: number;
    formattingEditorChildren: number;
    formattingToolbarChildren: number;
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
  const formattingHost = document.getElementById("formatting-editor");
  const formattingToolbarHost = document.getElementById("formatting-toolbar");
  if (
    !(host instanceof HTMLElement) ||
    !(toolbarHost instanceof HTMLElement) ||
    !(formattingHost instanceof HTMLElement) ||
    !(formattingToolbarHost instanceof HTMLElement)
  ) {
    throw new Error("reference package hosts are missing");
  }

  await initializeWasm();
  const legacyOpened = await openBreditorBrowserEditor({
    host,
    label: "Tarball reference Highlight editor",
    wasm: breditorWasm,
    initialDocument: {
      lineageId: "tarball-reference-highlight",
      documentJson: LEGACY_DOCUMENT_JSON,
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
  if (!legacyOpened.ok) {
    throw new Error(`${legacyOpened.error.code}: ${legacyOpened.error.message}`);
  }

  const formattingOpened = await openBreditorBrowserEditor({
    host: formattingHost,
    label: "Tarball reference Highlight and Link editor",
    wasm: breditorWasm,
    initialDocument: {
      lineageId: "tarball-reference-formatting",
      documentJson: FORMATTING_DOCUMENT_JSON,
      historyCapacity: 10,
    },
    semanticProfile: {
      formatVersion: 2,
      bootstrapJson: REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
    },
    rendering: REFERENCE_FORMATTING_RENDER_MANIFEST,
    toolbar: {
      host: formattingToolbarHost,
      manifest: REFERENCE_FORMATTING_TOOLBAR_MANIFEST,
    },
    keyboard: {
      editing: "beforeinputPrimary",
      primaryModifier: "control",
      shortcuts: "enabled",
    },
  });
  if (!formattingOpened.ok) {
    legacyOpened.editor.dispose();
    throw new Error(
      `${formattingOpened.error.code}: ${formattingOpened.error.message}`,
    );
  }

  try {
    await selectHighlightedText(
      formattingOpened.editor,
      formattingHost,
      formattingToolbarHost,
      false,
    );
    const firstSet = formattingOpened.editor.executeIntentJson(
      REFERENCE_FORMATTING_IDS.linkIntentId,
      createReferenceLinkSetInputJson(LINK_SOURCE_HREF, true),
    );
    requireCommitted(firstSet, "first typed Link set");
    const firstSetDom = readLinkDom(formattingHost);

    const remove = formattingOpened.editor.executeIntentJson(
      REFERENCE_FORMATTING_IDS.linkIntentId,
      createReferenceLinkRemoveInputJson(),
    );
    requireCommitted(remove, "typed Link remove");
    const removedAnchor = formattingHost.querySelector("a") === null;
    if (!removedAnchor) throw new Error("typed Link remove left an anchor");

    const finalSet = formattingOpened.editor.executeIntentJson(
      REFERENCE_FORMATTING_IDS.linkIntentId,
      createReferenceLinkSetInputJson(LINK_SOURCE_HREF, true),
    );
    requireCommitted(finalSet, "final typed Link set");
    const finalDom = readLinkDom(formattingHost);
    const formattingDocumentJson =
      formattingOpened.editor.exportContent("documentJson");
    const formattingPlainText = formattingOpened.editor.exportContent("plainText");
    if (!formattingDocumentJson.ok || !formattingPlainText.ok) {
      throw new Error("combined reference package content export failed");
    }

    // Leave the original Highlight editor selected so the pre-existing live
    // toolbar proof remains observable after adding the combined profile.
    await selectHighlightedText(legacyOpened.editor, host, toolbarHost);
    const documentJson = legacyOpened.editor.exportContent("documentJson");
    const plainText = legacyOpened.editor.exportContent("plainText");
    if (!documentJson.ok || !plainText.ok) {
      throw new Error("legacy reference package content export failed");
    }

    const smoke: ReferencePackageSmoke = Object.freeze({
      documentJson,
      plainText,
      snapshot: legacyOpened.editor.getSnapshot(),
      profile: Object.freeze({
        formatKind: REFERENCE_HIGHLIGHT_IDS.formatKind,
        schemaFingerprint: REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT,
      }),
      formatting: Object.freeze({
        documentJson: formattingDocumentJson,
        plainText: formattingPlainText,
        snapshot: formattingOpened.editor.getSnapshot(),
        profile: Object.freeze({
          bootstrapFormatVersion:
            REFERENCE_FORMATTING_PROFILE_BOOTSTRAP.formatVersion,
          linkFormatKind: REFERENCE_FORMATTING_IDS.linkFormatKind,
          linkIntentId: REFERENCE_FORMATTING_IDS.linkIntentId,
          schemaFingerprint: REFERENCE_FORMATTING_SCHEMA_FINGERPRINT,
        }),
        firstSet,
        remove,
        finalSet,
        firstSetDom,
        removedAnchor,
        finalDom,
        sourceHref: LINK_SOURCE_HREF,
        canonicalHref: LINK_CANONICAL_HREF,
      }),
      fixturesFrozen: exportedFixturesAndHelpersAreFrozen(),
      dispose: () => {
        legacyOpened.editor.dispose();
        formattingOpened.editor.dispose();
        return Object.freeze({
          status: legacyOpened.editor.getStatus().phase,
          formattingStatus: formattingOpened.editor.getStatus().phase,
          editorChildren: host.childNodes.length,
          toolbarChildren: toolbarHost.childNodes.length,
          formattingEditorChildren: formattingHost.childNodes.length,
          formattingToolbarChildren: formattingToolbarHost.childNodes.length,
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
  } catch (error) {
    formattingOpened.editor.dispose();
    legacyOpened.editor.dispose();
    throw error;
  }
}

async function selectHighlightedText(
  editor: { focus(): void },
  host: HTMLElement,
  toolbarHost: HTMLElement,
  requireHighlightState = true,
): Promise<void> {
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
    throw new Error("reference package selection fixture is unavailable");
  }
  editor.focus();
  selection.setBaseAndExtent(textNode, 0, textNode, textNode.data.length);
  document.dispatchEvent(new Event("selectionchange"));
  if (!requireHighlightState) return;
  await waitFor(
    () =>
      highlightButton.getAttribute("aria-disabled") === "false" &&
      highlightButton.getAttribute("aria-pressed") === "true",
    "reference package toolbar state did not follow the highlighted selection",
  );
}

function requireCommitted(
  result: BreditorBrowserIntentResult,
  operation: string,
): void {
  if (result.status !== "committed") {
    throw new Error(`${operation} returned ${result.status}`);
  }
}

function readLinkDom(host: HTMLElement): LinkDomObservation {
  const anchor = host.querySelector("a.breditor-link");
  if (!(anchor instanceof HTMLAnchorElement)) {
    throw new Error("typed Link set did not render its safe anchor");
  }
  return Object.freeze({
    attributes: Object.freeze([...anchor.getAttributeNames()].sort()),
    className: anchor.getAttribute("class"),
    href: anchor.getAttribute("href"),
    rel: anchor.getAttribute("rel"),
    target: anchor.getAttribute("target"),
    text: anchor.textContent,
  });
}

function exportedFixturesAndHelpersAreFrozen(): boolean {
  return [
    REFERENCE_FORMATTING_IDS,
    REFERENCE_FORMATTING_PROFILE_BOOTSTRAP,
    REFERENCE_FORMATTING_RENDER_MANIFEST,
    REFERENCE_FORMATTING_TOOLBAR_MANIFEST,
    REFERENCE_FORMATTING_EMPTY_DOCUMENT,
    REFERENCE_FORMATTING_SAMPLE_DOCUMENT,
    createReferenceFormattingDocument("fixture", {
      highlighted: true,
      link: { href: "https://example.test/fixture", openInNewWindow: true },
    }),
    createReferenceLinkSetInput("https://example.test/fixture", true),
    createReferenceLinkRemoveInput(),
  ].every((value) => isDeeplyFrozen(value, new Set<object>()));
}

function isDeeplyFrozen(value: unknown, visited: Set<object>): boolean {
  if (typeof value !== "object" || value === null || visited.has(value)) {
    return true;
  }
  if (!Object.isFrozen(value)) return false;
  visited.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !isDeeplyFrozen(descriptor.value, visited)
    ) {
      return false;
    }
  }
  return true;
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
