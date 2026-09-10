import {
  openBreditorBrowserEditor,
  type BreditorBrowserContentExport,
  type BreditorBrowserEditorSnapshot,
  type BreditorBrowserIntentResult,
} from "@breditor/browser";
import {
  MAX_REFERENCE_SIZE_SHOWCASE_DOCUMENT_TEXT_UTF8,
  MAX_REFERENCE_SHOWCASE_DOCUMENT_TEXT_UTF8,
  REFERENCE_COLOR_SHOWCASE_IDS,
  REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_COLOR_SHOWCASE_SCHEMA_FINGERPRINT,
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
  REFERENCE_SHOWCASE_EMPTY_DOCUMENT,
  REFERENCE_SHOWCASE_EMPTY_DOCUMENT_JSON,
  REFERENCE_SHOWCASE_IDS,
  REFERENCE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP,
  REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_SHOWCASE_SAMPLE_DOCUMENT,
  REFERENCE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
  REFERENCE_SHOWCASE_SCHEMA_FINGERPRINT,
  REFERENCE_SHOWCASE_TOOLBAR_MANIFEST,
  REFERENCE_SIZE_SHOWCASE_DEFAULT_TEXT_SIZE_STEP,
  REFERENCE_SIZE_SHOWCASE_EMPTY_DOCUMENT_JSON,
  REFERENCE_SIZE_SHOWCASE_IDS,
  REFERENCE_SIZE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP,
  REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
  REFERENCE_SIZE_SHOWCASE_SCHEMA_FINGERPRINT,
  REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST,
  createReferenceFormattingDocument,
  createReferenceFormattingDocumentJson,
  createReferenceHighlightDocumentJson,
  createReferenceLinkRemoveInput,
  createReferenceLinkRemoveInputJson,
  createReferenceLinkSetInput,
  createReferenceLinkSetInputJson,
  createReferenceShowcaseDocument,
  createReferenceShowcaseDocumentJson,
  createReferenceSizeShowcaseDocument,
  createReferenceSizeShowcaseDocumentJson,
  createReferenceTextSizeRemoveInput,
  createReferenceTextSizeSetInput,
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
const SHOWCASE_TEXT = "Breditor showcase";
const SIZE_SHOWCASE_TEXT = "Breditor showcase";

interface ToolbarButtonObservation {
  readonly label: string;
  readonly stateId: string | null;
  readonly disabled: string | null;
  readonly pressed: string | null;
}

interface ShowcaseDomObservation {
  readonly chain: readonly string[];
  readonly text: string | null;
  readonly anchor: LinkDomObservation;
}

interface LinkDomObservation {
  readonly attributes: readonly string[];
  readonly className: string | null;
  readonly href: string | null;
  readonly rel: string | null;
  readonly target: string | null;
  readonly text: string | null;
}

interface SizeSelectObservation {
  readonly name: string | null;
  readonly value: string;
  readonly options: readonly Readonly<{
    value: string;
    label: string | null;
  }>[];
}

interface SizeDomObservation {
  readonly chain: readonly string[];
  readonly text: string | null;
  readonly attributes: readonly string[];
  readonly className: string | null;
  readonly token: string | null;
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
  readonly colorProfile: Readonly<{
    schemaName: string;
    schemaVersion: number;
    schemaFingerprint: string;
    formatCount: number;
    intentCount: number;
    actionStateCount: number;
    inlineFormatSetCount: number;
    textColorFormatKind: string;
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
  readonly showcase: Readonly<{
    initialDocumentJson: string;
    emptyDocumentJson: string;
    generatedDocumentJson: string;
    maximumDocumentTextUtf8: number;
    text: string;
    documentJson: BreditorBrowserContentExport<"documentJson">;
    plainText: BreditorBrowserContentExport<"plainText">;
    snapshot: BreditorBrowserEditorSnapshot;
    profile: Readonly<{
      bootstrapFormatVersion: number;
      schemaName: string;
      schemaVersion: number;
      schemaFingerprint: string;
      emphasisIntentId: string;
      strikethroughIntentId: string;
      codeIntentId: string;
    }>;
    renderManifestKinds: readonly string[];
    manifestToolbarOrder: readonly string[];
    observedToolbarOrder: readonly string[];
    initialButtons: readonly ToolbarButtonObservation[];
    toggledButtons: readonly ToolbarButtonObservation[];
    initialDom: ShowcaseDomObservation;
    toggledDom: ShowcaseDomObservation;
    undoDom: ShowcaseDomObservation;
    redoDom: ShowcaseDomObservation;
    clearedDocumentJson: BreditorBrowserContentExport<"documentJson">;
    clearedPlainText: BreditorBrowserContentExport<"plainText">;
    clearUndoDom: ShowcaseDomObservation;
  }>;
  readonly sizeShowcase: Readonly<{
    initialDocumentJson: string;
    emptyDocumentJson: string;
    generatedDocumentJson: string;
    typedSetInput: ReturnType<typeof createReferenceTextSizeSetInput>;
    typedRemoveInput: ReturnType<typeof createReferenceTextSizeRemoveInput>;
    maximumDocumentTextUtf8: number;
    text: string;
    documentJson: BreditorBrowserContentExport<"documentJson">;
    plainText: BreditorBrowserContentExport<"plainText">;
    snapshot: BreditorBrowserEditorSnapshot;
    profile: Readonly<{
      bootstrapFormatVersion: number;
      schemaName: string;
      schemaVersion: number;
      schemaFingerprint: string;
      formatCount: number;
      intentCount: number;
      actionStateCount: number;
      inlineFormatSetCount: number;
      textSizeFormatKind: string;
      textSizeIntentId: string;
    }>;
    renderManifestKinds: readonly string[];
    manifestToolbarOrder: readonly string[];
    observedToolbarOrder: readonly string[];
    defaultSizeStep: number;
    initialSelect: SizeSelectObservation;
    appliedSelect: SizeSelectObservation;
    launcherActivation: string | null;
    feedback: string | null;
    dom: SizeDomObservation;
  }>;
  readonly fixturesFrozen: boolean;
  dispose(): Readonly<{
    status: string;
    formattingStatus: string;
    showcaseStatus: string;
    sizeShowcaseStatus: string;
    editorChildren: number;
    toolbarChildren: number;
    formattingEditorChildren: number;
    formattingToolbarChildren: number;
    showcaseEditorChildren: number;
    showcaseToolbarChildren: number;
    sizeShowcaseEditorChildren: number;
    sizeShowcaseToolbarChildren: number;
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
  const showcaseHost = document.getElementById("showcase-editor");
  const showcaseToolbarHost = document.getElementById("showcase-toolbar");
  const sizeShowcaseHost = document.getElementById("size-showcase-editor");
  const sizeShowcaseToolbarHost = document.getElementById(
    "size-showcase-toolbar",
  );
  if (
    !(host instanceof HTMLElement) ||
    !(toolbarHost instanceof HTMLElement) ||
    !(formattingHost instanceof HTMLElement) ||
    !(formattingToolbarHost instanceof HTMLElement) ||
    !(showcaseHost instanceof HTMLElement) ||
    !(showcaseToolbarHost instanceof HTMLElement) ||
    !(sizeShowcaseHost instanceof HTMLElement) ||
    !(sizeShowcaseToolbarHost instanceof HTMLElement)
  ) {
    throw new Error("reference package hosts are missing");
  }

  await initializeWasm();
  const colorProfileResult =
    breditorWasm.BreditorCompiledProfile.fromBootstrapJsonV2(
      REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
    );
  if (colorProfileResult.status !== "profile") {
    const error = colorProfileResult.error;
    const code = error?.code ?? "profile.invalid";
    const message =
      error?.message ?? "Color Showcase profile compilation failed";
    error?.free();
    colorProfileResult.free();
    throw new Error(
      `${code}: ${message}`,
    );
  }
  const colorCompiledProfile = colorProfileResult.takeProfile();
  if (colorCompiledProfile === undefined) {
    colorProfileResult.free();
    throw new Error("Color Showcase compiled profile was unavailable");
  }
  const colorDescriptor = colorCompiledProfile.descriptor();
  const colorProfile = Object.freeze({
    schemaName: colorDescriptor.schemaName,
    schemaVersion: colorDescriptor.schemaVersion,
    schemaFingerprint: colorDescriptor.schemaFingerprint,
    formatCount: colorDescriptor.formatCount,
    intentCount: colorDescriptor.intentCount,
    actionStateCount: colorDescriptor.actionStateCount,
    inlineFormatSetCount: colorDescriptor.inlineFormatSetCount,
    textColorFormatKind: REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatKind,
  });
  colorDescriptor.free();
  colorCompiledProfile.free();
  colorProfileResult.free();
  if (
    colorProfile.schemaFingerprint !==
    REFERENCE_COLOR_SHOWCASE_SCHEMA_FINGERPRINT
  ) {
    throw new Error(
      "Color Showcase compiler fingerprint did not match its package contract",
    );
  }
  const sizeProfileResult =
    breditorWasm.BreditorCompiledProfile.fromBootstrapJsonV2(
      REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
    );
  if (sizeProfileResult.status !== "profile") {
    const error = sizeProfileResult.error;
    const code = error?.code ?? "profile.invalid";
    const message =
      error?.message ?? "Text Size Showcase profile compilation failed";
    error?.free();
    sizeProfileResult.free();
    throw new Error(`${code}: ${message}`);
  }
  const sizeCompiledProfile = sizeProfileResult.takeProfile();
  if (sizeCompiledProfile === undefined) {
    sizeProfileResult.free();
    throw new Error("Text Size Showcase compiled profile was unavailable");
  }
  const sizeDescriptor = sizeCompiledProfile.descriptor();
  const sizeProfile = Object.freeze({
    bootstrapFormatVersion: REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP.formatVersion,
    schemaName: sizeDescriptor.schemaName,
    schemaVersion: sizeDescriptor.schemaVersion,
    schemaFingerprint: sizeDescriptor.schemaFingerprint,
    formatCount: sizeDescriptor.formatCount,
    intentCount: sizeDescriptor.intentCount,
    actionStateCount: sizeDescriptor.actionStateCount,
    inlineFormatSetCount: sizeDescriptor.inlineFormatSetCount,
    textSizeFormatKind: REFERENCE_SIZE_SHOWCASE_IDS.textSizeFormatKind,
    textSizeIntentId: REFERENCE_SIZE_SHOWCASE_IDS.textSizeIntentId,
  });
  sizeDescriptor.free();
  sizeCompiledProfile.free();
  sizeProfileResult.free();
  if (
    sizeProfile.schemaFingerprint !== REFERENCE_SIZE_SHOWCASE_SCHEMA_FINGERPRINT ||
    sizeProfile.formatCount !== 8 ||
    sizeProfile.intentCount !== 9 ||
    sizeProfile.actionStateCount !== 11 ||
    sizeProfile.inlineFormatSetCount !== 3
  ) {
    throw new Error(
      "Text Size Showcase compiler descriptor did not match its package contract",
    );
  }
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

  const showcaseOpened = await openBreditorBrowserEditor({
    host: showcaseHost,
    label: "Tarball reference Showcase editor",
    wasm: breditorWasm,
    initialDocument: {
      lineageId: "tarball-reference-showcase",
      documentJson: REFERENCE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
      historyCapacity: 10,
    },
    semanticProfile: {
      formatVersion: 2,
      bootstrapJson: REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
    },
    rendering: REFERENCE_SHOWCASE_RENDER_MANIFEST,
    keyboardShortcuts: REFERENCE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
    toolbar: {
      host: showcaseToolbarHost,
      manifest: REFERENCE_SHOWCASE_TOOLBAR_MANIFEST,
    },
    keyboard: {
      editing: "beforeinputPrimary",
      primaryModifier: "control",
      shortcuts: "enabled",
    },
  });
  if (!showcaseOpened.ok) {
    formattingOpened.editor.dispose();
    legacyOpened.editor.dispose();
    throw new Error(
      `${showcaseOpened.error.code}: ${showcaseOpened.error.message}`,
    );
  }

  const sizeShowcaseOpened = await openBreditorBrowserEditor({
    host: sizeShowcaseHost,
    label: "Tarball reference Text Size Showcase editor",
    wasm: breditorWasm,
    initialDocument: {
      lineageId: "tarball-reference-size-showcase",
      documentJson: REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
      historyCapacity: 10,
    },
    semanticProfile: {
      formatVersion: 2,
      bootstrapJson: REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
    },
    rendering: REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST,
    keyboardShortcuts: REFERENCE_SIZE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
    toolbar: {
      host: sizeShowcaseToolbarHost,
      manifest: REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST,
    },
    keyboard: {
      editing: "beforeinputPrimary",
      primaryModifier: "control",
      shortcuts: "enabled",
    },
  });
  if (!sizeShowcaseOpened.ok) {
    showcaseOpened.editor.dispose();
    formattingOpened.editor.dispose();
    legacyOpened.editor.dispose();
    throw new Error(
      `${sizeShowcaseOpened.error.code}: ${sizeShowcaseOpened.error.message}`,
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

    await selectHighlightedText(
      showcaseOpened.editor,
      showcaseHost,
      showcaseToolbarHost,
    );
    const observedToolbarOrder = directToolbarButtons(showcaseToolbarHost).map(
      (button) => button.textContent ?? "",
    );
    const initialButtons = readToolbarButtons(showcaseToolbarHost, [
      "Bold",
      "Italic",
      "Strikethrough",
      "Code",
      "Highlight",
    ]);
    const initialDom = readShowcaseDom(showcaseHost);
    if (initialDom.text !== SHOWCASE_TEXT) {
      throw new Error("showcase sample text did not render exactly");
    }

    for (const label of ["Bold", "Italic", "Strikethrough", "Code"] as const) {
      const button = requireToolbarButton(showcaseToolbarHost, label);
      if (
        button.getAttribute("aria-disabled") !== "false" ||
        button.getAttribute("aria-pressed") !== "false"
      ) {
        throw new Error(
          `showcase ${label} did not start as an available inactive toggle`,
        );
      }
      button.click();
      await waitFor(
        () => button.getAttribute("aria-pressed") === "true",
        `showcase ${label} did not become active`,
      );
    }
    const toggledButtons = readToolbarButtons(showcaseToolbarHost, [
      "Bold",
      "Italic",
      "Strikethrough",
      "Code",
      "Highlight",
    ]);
    const toggledDom = readShowcaseDom(showcaseHost);

    requireToolbarButton(showcaseToolbarHost, "Undo").click();
    await waitFor(
      () => showcaseHost.querySelector("code") === null,
      "showcase Undo did not remove the last style toggle",
    );
    const undoDom = readShowcaseDom(showcaseHost);
    requireToolbarButton(showcaseToolbarHost, "Redo").click();
    await waitFor(
      () => showcaseHost.querySelector("code") !== null,
      "showcase Redo did not restore the last style toggle",
    );
    const redoDom = readShowcaseDom(showcaseHost);
    requireToolbarButton(showcaseToolbarHost, "Clear formatting").click();
    await waitFor(() => {
      const paragraph = showcaseHost.querySelector(":scope > p");
      return paragraph?.children.length === 0 &&
        paragraph.textContent === SHOWCASE_TEXT;
    }, "showcase Clear formatting did not produce plain text");
    const clearedDocumentJson =
      showcaseOpened.editor.exportContent("documentJson");
    const clearedPlainText = showcaseOpened.editor.exportContent("plainText");
    if (!clearedDocumentJson.ok || !clearedPlainText.ok) {
      throw new Error("showcase cleared content export failed");
    }
    requireToolbarButton(showcaseToolbarHost, "Undo").click();
    await waitFor(
      () => showcaseHost.querySelector("code") !== null,
      "showcase Undo did not restore formatting cleared in one unit",
    );
    const clearUndoDom = readShowcaseDom(showcaseHost);
    const showcaseDocumentJson =
      showcaseOpened.editor.exportContent("documentJson");
    const showcasePlainText = showcaseOpened.editor.exportContent("plainText");
    if (!showcaseDocumentJson.ok || !showcasePlainText.ok) {
      throw new Error("showcase reference package content export failed");
    }

    await selectHighlightedText(
      sizeShowcaseOpened.editor,
      sizeShowcaseHost,
      sizeShowcaseToolbarHost,
    );
    const observedSizeToolbarOrder = directToolbarButtons(
      sizeShowcaseToolbarHost,
    ).map((button) => button.textContent ?? "");
    const sizeLauncher = requireToolbarButton(
      sizeShowcaseToolbarHost,
      "Text size",
    );
    if (sizeLauncher.getAttribute("data-breditor-activation") !== "inactive") {
      throw new Error("Text Size launcher did not start inactive");
    }
    sizeLauncher.click();
    const sizeSelect = requireSizeSelect(sizeShowcaseToolbarHost);
    const initialSizeSelect = readSizeSelect(sizeSelect);
    if (initialSizeSelect.value !== "1") {
      throw new Error("Text Size select did not expose Large as its default");
    }
    sizeSelect.value = "2";
    sizeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    requireToolbarFormAction(sizeShowcaseToolbarHost, "apply").click();
    await waitFor(
      () =>
        sizeShowcaseHost
          .querySelector("span.breditor-text-size")
          ?.getAttribute("data-breditor-integer-token") === "huge",
      "Text Size form did not render its Huge semantic token",
    );
    const appliedSizeSelect = readSizeSelect(sizeSelect);
    const sizeDom = readSizeDom(sizeShowcaseHost);
    const sizeDocumentJson =
      sizeShowcaseOpened.editor.exportContent("documentJson");
    const sizePlainText = sizeShowcaseOpened.editor.exportContent("plainText");
    if (!sizeDocumentJson.ok || !sizePlainText.ok) {
      throw new Error("Text Size Showcase content export failed");
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
      colorProfile,
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
      showcase: Object.freeze({
        initialDocumentJson: REFERENCE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
        emptyDocumentJson: REFERENCE_SHOWCASE_EMPTY_DOCUMENT_JSON,
        generatedDocumentJson: createReferenceShowcaseDocumentJson(
          "Package-root Showcase helper",
          { italic: true },
        ),
        maximumDocumentTextUtf8: MAX_REFERENCE_SHOWCASE_DOCUMENT_TEXT_UTF8,
        text: SHOWCASE_TEXT,
        documentJson: showcaseDocumentJson,
        plainText: showcasePlainText,
        snapshot: showcaseOpened.editor.getSnapshot(),
        profile: Object.freeze({
          bootstrapFormatVersion:
            REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP.formatVersion,
          schemaName: REFERENCE_SHOWCASE_IDS.schemaName,
          schemaVersion: REFERENCE_SHOWCASE_IDS.schemaVersion,
          schemaFingerprint: REFERENCE_SHOWCASE_SCHEMA_FINGERPRINT,
          emphasisIntentId: REFERENCE_SHOWCASE_IDS.emphasisIntentId,
          strikethroughIntentId:
            REFERENCE_SHOWCASE_IDS.strikethroughIntentId,
          codeIntentId: REFERENCE_SHOWCASE_IDS.codeIntentId,
        }),
        renderManifestKinds: Object.freeze(
          REFERENCE_SHOWCASE_RENDER_MANIFEST.recipes.map(
            (recipe) => recipe.formatKind,
          ),
        ),
        manifestToolbarOrder: Object.freeze(
          REFERENCE_SHOWCASE_TOOLBAR_MANIFEST.controls.map(
            (control) => control.label,
          ),
        ),
        observedToolbarOrder: Object.freeze(observedToolbarOrder),
        initialButtons,
        toggledButtons,
        initialDom,
        toggledDom,
        undoDom,
        redoDom,
        clearedDocumentJson,
        clearedPlainText,
        clearUndoDom,
      }),
      sizeShowcase: Object.freeze({
        initialDocumentJson: REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
        emptyDocumentJson: REFERENCE_SIZE_SHOWCASE_EMPTY_DOCUMENT_JSON,
        generatedDocumentJson: createReferenceSizeShowcaseDocumentJson(
          "Package-root Text Size helper",
          { textSize: 0, textColor: 0x12_34_56 },
        ),
        typedSetInput: createReferenceTextSizeSetInput(2),
        typedRemoveInput: createReferenceTextSizeRemoveInput(),
        maximumDocumentTextUtf8:
          MAX_REFERENCE_SIZE_SHOWCASE_DOCUMENT_TEXT_UTF8,
        text: SIZE_SHOWCASE_TEXT,
        documentJson: sizeDocumentJson,
        plainText: sizePlainText,
        snapshot: sizeShowcaseOpened.editor.getSnapshot(),
        profile: sizeProfile,
        renderManifestKinds: Object.freeze(
          REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST.recipes.map(
            (recipe) => recipe.formatKind,
          ),
        ),
        manifestToolbarOrder: Object.freeze(
          REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST.controls.map(
            (control) => control.label,
          ),
        ),
        observedToolbarOrder: Object.freeze(observedSizeToolbarOrder),
        defaultSizeStep: REFERENCE_SIZE_SHOWCASE_DEFAULT_TEXT_SIZE_STEP,
        initialSelect: initialSizeSelect,
        appliedSelect: appliedSizeSelect,
        launcherActivation: sizeLauncher.getAttribute(
          "data-breditor-activation",
        ),
        feedback: sizeShowcaseToolbarHost.querySelector(
          "[data-breditor-toolbar-form-feedback]",
        )?.textContent ?? null,
        dom: sizeDom,
      }),
      fixturesFrozen: exportedFixturesAndHelpersAreFrozen(),
      dispose: () => {
        legacyOpened.editor.dispose();
        formattingOpened.editor.dispose();
        showcaseOpened.editor.dispose();
        sizeShowcaseOpened.editor.dispose();
        return Object.freeze({
          status: legacyOpened.editor.getStatus().phase,
          formattingStatus: formattingOpened.editor.getStatus().phase,
          showcaseStatus: showcaseOpened.editor.getStatus().phase,
          sizeShowcaseStatus: sizeShowcaseOpened.editor.getStatus().phase,
          editorChildren: host.childNodes.length,
          toolbarChildren: toolbarHost.childNodes.length,
          formattingEditorChildren: formattingHost.childNodes.length,
          formattingToolbarChildren: formattingToolbarHost.childNodes.length,
          showcaseEditorChildren: showcaseHost.childNodes.length,
          showcaseToolbarChildren: showcaseToolbarHost.childNodes.length,
          sizeShowcaseEditorChildren: sizeShowcaseHost.childNodes.length,
          sizeShowcaseToolbarChildren:
            sizeShowcaseToolbarHost.childNodes.length,
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
    sizeShowcaseOpened.editor.dispose();
    showcaseOpened.editor.dispose();
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

function directToolbarButtons(host: HTMLElement): readonly HTMLButtonElement[] {
  const root = host.querySelector(":scope > [data-breditor-toolbar-root]");
  if (!(root instanceof HTMLElement)) {
    throw new Error("reference package toolbar root is unavailable");
  }
  const buttons = [...root.children].filter(
    (child): child is HTMLButtonElement => child instanceof HTMLButtonElement,
  );
  return Object.freeze(buttons);
}

function requireToolbarButton(
  host: HTMLElement,
  label: string,
): HTMLButtonElement {
  const button = directToolbarButtons(host).find(
    (candidate) => candidate.textContent === label,
  );
  if (button === undefined) {
    throw new Error(`reference package ${label} toolbar button is unavailable`);
  }
  return button;
}

function requireSizeSelect(host: HTMLElement): HTMLSelectElement {
  const select = host.querySelector(
    'select[name="example/text-size-step"]',
  );
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error("reference package Text Size select is unavailable");
  }
  return select;
}

function requireToolbarFormAction(
  host: HTMLElement,
  action: "apply" | "remove" | "close",
): HTMLButtonElement {
  const button = host.querySelector(
    `button[data-breditor-toolbar-form-action="${action}"]`,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(
      `reference package ${action} toolbar form action is unavailable`,
    );
  }
  return button;
}

function readSizeSelect(select: HTMLSelectElement): SizeSelectObservation {
  return Object.freeze({
    name: select.getAttribute("name"),
    value: select.value,
    options: Object.freeze(
      [...select.options].map((option) =>
        Object.freeze({
          value: option.value,
          label: option.textContent,
        }),
      ),
    ),
  });
}

function readToolbarButtons(
  host: HTMLElement,
  labels: readonly string[],
): readonly ToolbarButtonObservation[] {
  return Object.freeze(
    labels.map((label) => {
      const button = requireToolbarButton(host, label);
      return Object.freeze({
        label,
        stateId: button.getAttribute("data-breditor-state-id"),
        disabled: button.getAttribute("aria-disabled"),
        pressed: button.getAttribute("aria-pressed"),
      });
    }),
  );
}

function readShowcaseDom(host: HTMLElement): ShowcaseDomObservation {
  const paragraph = host.querySelector(":scope > p");
  if (!(paragraph instanceof HTMLParagraphElement)) {
    throw new Error("showcase paragraph is unavailable");
  }
  if (paragraph.children.length !== 1 || paragraph.childNodes.length !== 1) {
    throw new Error("showcase paragraph is not one exact wrapper branch");
  }
  const chain: string[] = [];
  let current: Element | null = paragraph.firstElementChild;
  while (current !== null) {
    chain.push(current.localName);
    const child = current.firstElementChild;
    if (child === null) {
      if (
        current.childNodes.length !== 1 ||
        current.firstChild?.nodeType !== Node.TEXT_NODE
      ) {
        throw new Error("showcase wrapper leaf is not one exact text node");
      }
    } else if (
      current.children.length !== 1 ||
      current.childNodes.length !== 1
    ) {
      throw new Error("showcase wrapper chain branched unexpectedly");
    }
    current = child;
  }
  return Object.freeze({
    chain: Object.freeze(chain),
    text: paragraph.textContent,
    anchor: readLinkDom(host),
  });
}

function readSizeDom(host: HTMLElement): SizeDomObservation {
  const paragraph = host.querySelector(":scope > p");
  const size = host.querySelector("span.breditor-text-size");
  if (!(paragraph instanceof HTMLParagraphElement)) {
    throw new Error("Text Size Showcase paragraph is unavailable");
  }
  if (!(size instanceof HTMLSpanElement)) {
    throw new Error("Text Size Showcase wrapper is unavailable");
  }
  const chain: string[] = [];
  let current: Element | null = paragraph.firstElementChild;
  while (current !== null) {
    chain.push(current.localName);
    const child = current.firstElementChild;
    if (
      child === null &&
      (current.childNodes.length !== 1 ||
        current.firstChild?.nodeType !== Node.TEXT_NODE)
    ) {
      throw new Error("Text Size Showcase leaf is not one exact text node");
    }
    if (
      child !== null &&
      (current.children.length !== 1 || current.childNodes.length !== 1)
    ) {
      throw new Error("Text Size Showcase wrapper chain branched unexpectedly");
    }
    current = child;
  }
  return Object.freeze({
    chain: Object.freeze(chain),
    text: paragraph.textContent,
    attributes: Object.freeze([...size.getAttributeNames()].sort()),
    className: size.getAttribute("class"),
    token: size.getAttribute("data-breditor-integer-token"),
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
    REFERENCE_SHOWCASE_IDS,
    REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP,
    REFERENCE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
    REFERENCE_SHOWCASE_RENDER_MANIFEST,
    REFERENCE_SHOWCASE_TOOLBAR_MANIFEST,
    REFERENCE_SHOWCASE_EMPTY_DOCUMENT,
    REFERENCE_SHOWCASE_SAMPLE_DOCUMENT,
    createReferenceShowcaseDocument("fixture", {
      bold: true,
      italic: true,
      strikethrough: true,
      code: true,
      highlighted: true,
      link: { href: "https://example.test/fixture", openInNewWindow: true },
    }),
    REFERENCE_SIZE_SHOWCASE_IDS,
    REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP,
    REFERENCE_SIZE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
    REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST,
    REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST,
    createReferenceSizeShowcaseDocument("fixture", {
      highlighted: true,
      textColor: 0x12_34_56,
      textSize: 2,
    }),
    createReferenceTextSizeSetInput(0),
    createReferenceTextSizeRemoveInput(),
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
