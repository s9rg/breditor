import {
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_FORMATTING_RENDER_MANIFEST,
  REFERENCE_FORMATTING_TOOLBAR_MANIFEST,
  REFERENCE_HIGHLIGHT_IDS,
  REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
  REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
  REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
  REFERENCE_SHOWCASE_TOOLBAR_MANIFEST,
  createReferenceFormattingDocumentJson,
  createReferenceHighlightDocumentJson,
} from "@breditor/reference-highlight";
import {
  openBreditorBrowserEditor,
  type BreditorBrowserContentExportResult,
  type BreditorBrowserEditor,
  type BreditorBrowserEditorSnapshot,
  type BreditorBrowserEditorPersistenceResult,
} from "@breditor/browser";
import initializeWasm, * as breditorWasm from "@breditor/wasm";

const EMPTY_DOCUMENT_JSON = JSON.stringify({
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
        children: [],
      },
    ],
  },
});

interface ClipboardPayload {
  readonly plainText?: string;
  readonly html?: string;
}

interface ClipboardDispatchResult {
  readonly defaultPrevented: boolean;
  readonly plainText: string;
  readonly html: string;
}

type MutationShadowMode = "noOp" | "throw";

interface MutationShadowHostProbeResult {
  readonly ok: boolean;
  readonly code: string | undefined;
  readonly phase: string | undefined;
  readonly editorAttributes:
    | Readonly<{
        contenteditable: string | null;
        role: string | null;
        ariaLabel: string | null;
        ariaMultiline: string | null;
        ariaDisabled: string | null;
        spellcheck: string | null;
        marker: string | null;
        inert: boolean;
      }>
    | undefined;
  readonly toolbarRoot:
    | Readonly<{
        tagName: string;
        marker: string | null;
        role: string | null;
        ariaLabel: string | null;
        ariaOrientation: string | null;
        buttonCount: number;
      }>
    | undefined;
}

interface ToolbarDisposalShadowProbeResult {
  readonly firstOpen: boolean;
  readonly firstCode: string | undefined;
  readonly firstPhase: string | undefined;
  readonly disposedToolbarChildCount: number;
  readonly detachedOwnedNodeCount: number;
  readonly ownedNodeCount: number;
  readonly reopened: boolean;
  readonly reopenCode: string | undefined;
  readonly reopenPhase: string | undefined;
  readonly reopenedToolbarRootCount: number;
  readonly finalToolbarChildCount: number;
}

interface DetachedToolbarButtonShadowProbeResult {
  readonly detachedBeforeShadow: boolean;
  readonly parentNodeShadowReads: number;
  readonly isConnectedShadowReads: number;
  readonly ownerDocumentShadowReads: number;
  readonly focusShadowCalls: number;
  readonly dispatchReturned: boolean;
  readonly clickDefaultPrevented: boolean;
  readonly beforeDocument: BreditorBrowserEditorSnapshot["document"];
  readonly afterDocument: BreditorBrowserEditorSnapshot["document"];
  readonly beforeDocumentJson: string | undefined;
  readonly afterDocumentJson: string | undefined;
  readonly beforeHtml: string;
  readonly afterHtml: string;
  readonly beforePhase: string;
  readonly afterPhase: string;
}

interface AdoptedEditorHostProbeResult {
  readonly foreignPrototype: boolean;
  readonly adoptedOwnerDocument: boolean;
  readonly firstPhase: string;
  readonly focusSucceeded: boolean;
  readonly routedDispatchReturned: boolean;
  readonly routedDefaultPrevented: boolean;
  readonly routedText: string;
  readonly revisionAdvanced: boolean;
  readonly disposedPhase: string;
  readonly hostEmptyAfterDispose: boolean;
  readonly postDisposeDispatchReturned: boolean;
  readonly postDisposeDefaultPrevented: boolean;
  readonly postDisposeRevisionStable: boolean;
  readonly reopenPhase: string;
}

interface ReferenceHighlightProbeResult {
  readonly initialHtml: string;
  readonly stateId: string | null;
  readonly initialPressed: string | null;
  readonly intentStatus: string;
  readonly intentId: string;
  readonly highlightedHtml: string;
  readonly highlightedPressed: string | null;
  readonly mixedHtml: string;
  readonly mixedDocumentJson: string;
  readonly copiedPlainText: string;
  readonly copiedHtml: string;
  readonly undoHtml: string;
  readonly redoHtml: string;
  readonly unformattedHtml: string;
  readonly unformattedPressed: string | null;
  readonly pasteDefaultPrevented: boolean;
  readonly pastedHtml: string;
  readonly pastedDocumentJson: string;
  readonly flushStatus: string;
  readonly persistedHtml: string;
  readonly persistedDocument: BreditorBrowserEditorSnapshot["document"];
  readonly firstPhaseBeforeDispose: string;
  readonly firstPhaseAfterDispose: string;
  readonly firstEditorEmptyAfterDispose: boolean;
  readonly firstToolbarEmptyAfterDispose: boolean;
  readonly restoredHtml: string;
  readonly restoredDocument: BreditorBrowserEditorSnapshot["document"];
  readonly restoredHighlightPressed: string | null;
  readonly restoredBoldPressed: string | null;
  readonly restoredUndoHtml: string;
  readonly restoredRedoHtml: string;
  readonly restoredPhase: string;
  readonly finalPhase: string;
  readonly finalEditorEmpty: boolean;
  readonly finalToolbarEmpty: boolean;
}

interface ReferenceFormattingMountResult {
  readonly probeId: string;
  readonly editorLabel: string;
  readonly text: string;
}

interface ReferenceFormattingProbe {
  readonly root: HTMLDivElement;
  readonly editor: BreditorBrowserEditor;
}

interface ReferenceShowcaseMountResult {
  readonly probeId: string;
  readonly editorLabel: string;
  readonly text: string;
}

interface ReferenceShowcaseProbe {
  readonly root: HTMLDivElement;
  readonly editor: BreditorBrowserEditor;
}

interface BreditorBrowserHarness {
  readonly phase: "ready";
  text(): string;
  html(): string;
  snapshot(): BreditorBrowserEditorSnapshot;
  exportContent(
    format: "documentJson" | "plainText",
  ): BreditorBrowserContentExportResult;
  selection(): Readonly<{
    anchorOffset: number;
    focusOffset: number;
    direction: "forward" | "backward" | "collapsed";
  }>;
  select(anchorOffset: number, focusOffset: number): Promise<void>;
  beforeInput(inputType: string, data: string | null): boolean;
  compose(text: string): void;
  clipboard(
    operation: "copy" | "cut" | "paste",
    payload?: ClipboardPayload,
  ): ClipboardDispatchResult;
  flush(): Promise<BreditorBrowserEditorPersistenceResult>;
  probeEditorHost(tagName: string, ownTagName?: string): Promise<Readonly<{
    ok: boolean;
    code: string | undefined;
  }>>;
  probeMutationShadowHosts(
    mode: MutationShadowMode,
  ): Promise<MutationShadowHostProbeResult>;
  probeToolbarDisposalShadow(
    mode: MutationShadowMode,
  ): Promise<ToolbarDisposalShadowProbeResult>;
  probeDetachedToolbarButtonShadow(
    mode: MutationShadowMode,
  ): DetachedToolbarButtonShadowProbeResult;
  probeAdoptedEditorHost(): Promise<AdoptedEditorHostProbeResult>;
  probeReferenceHighlight(): Promise<ReferenceHighlightProbeResult>;
  mountReferenceFormatting(
    toolbarInShadow?: boolean,
  ): Promise<ReferenceFormattingMountResult>;
  cleanupReferenceFormatting(probeId?: string): void;
  mountReferenceShowcase(): Promise<ReferenceShowcaseMountResult>;
  cleanupReferenceShowcase(probeId?: string): void;
  dispose(): void;
}

declare global {
  interface Window {
    __breditorHarness?: BreditorBrowserHarness;
    __breditorStartupError?: string;
  }
}

const INPUT_TARGET_RANGES = new WeakMap<
  InputEvent,
  readonly AbstractRange[]
>();

const editorHost = requiredElement("editor");
const toolbarHost = requiredElement("toolbar");
const status = requiredElement("status");
const referenceFormattingProbes = new Map<string, ReferenceFormattingProbe>();
let nextReferenceFormattingProbeId = 1;
const referenceShowcaseProbes = new Map<string, ReferenceShowcaseProbe>();
let nextReferenceShowcaseProbeId = 1;

void start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown startup failure";
  window.__breditorStartupError = message;
  status.textContent = `Startup failed: ${message}`;
  throw error;
});

async function start(): Promise<void> {
  requireBrowserCapability(typeof indexedDB === "object", "IndexedDB");
  requireBrowserCapability(typeof crypto?.subtle === "object", "Web Crypto subtle");
  requireBrowserCapability(typeof window.getSelection === "function", "Selection");
  requireBrowserCapability(typeof InputEvent === "function", "InputEvent");
  requireBrowserCapability(typeof CompositionEvent === "function", "CompositionEvent");
  requireBrowserCapability(typeof ClipboardEvent === "function", "ClipboardEvent");
  requireBrowserCapability(typeof DataTransfer === "function", "DataTransfer");
  installInputTargetRangeFixture();

  await initializeWasm();
  const result = await openBreditorBrowserEditor({
    host: editorHost,
    label: "Release gate rich-text editor",
    wasm: breditorWasm,
    initialDocument: {
      lineageId: "browser-release-gate",
      documentJson: EMPTY_DOCUMENT_JSON,
      historyCapacity: 100,
    },
    keyboard: {
      editing: "beforeinputPrimary",
      primaryModifier: /Mac|iPhone|iPad|iPod/u.test(navigator.platform)
        ? "meta"
        : "control",
      shortcuts: "enabled",
    },
    toolbar: { host: toolbarHost },
    persistence: {
      indexedDB,
      crypto: crypto.subtle,
      autosave: { delayMs: 60_000, maxLatencyMs: 60_000 },
    },
  });
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }

  const editor = result.editor;
  const releaseStatus = editor.subscribe(() => renderStatus(editor));
  renderStatus(editor);
  const harness: BreditorBrowserHarness = {
    phase: "ready",
    text: () => editorHost.textContent ?? "",
    html: () => editorHost.innerHTML,
    snapshot: () => editor.getSnapshot(),
    exportContent: (format: "documentJson" | "plainText") =>
      editor.exportContent(format),
    selection: () => selectionSnapshot(),
    select: async (anchorOffset: number, focusOffset: number) =>
      installSelection(anchorOffset, focusOffset),
    beforeInput: (inputType: string, data: string | null) =>
      dispatchInput("beforeinput", inputType, data, false, []),
    compose: (text: string) => dispatchComposition(text),
    clipboard: (
      operation: "copy" | "cut" | "paste",
      payload?: ClipboardPayload,
    ) =>
      dispatchClipboard(operation, payload ?? {}),
    flush: () => editor.flushPersistence(),
    probeEditorHost: (tagName: string, ownTagName?: string) =>
      probeEditorHost(tagName, ownTagName),
    probeMutationShadowHosts: (mode: MutationShadowMode) =>
      probeMutationShadowHosts(mode),
    probeToolbarDisposalShadow: (mode: MutationShadowMode) =>
      probeToolbarDisposalShadow(mode),
    probeDetachedToolbarButtonShadow: (mode: MutationShadowMode) =>
      probeDetachedToolbarButtonShadow(editor, mode),
    probeAdoptedEditorHost: () => probeAdoptedEditorHost(),
    probeReferenceHighlight: () => probeReferenceHighlight(),
    mountReferenceFormatting: (toolbarInShadow = false) =>
      mountReferenceFormatting(toolbarInShadow),
    cleanupReferenceFormatting: (probeId?: string) =>
      cleanupReferenceFormatting(probeId),
    mountReferenceShowcase: () => mountReferenceShowcase(),
    cleanupReferenceShowcase: (probeId?: string) =>
      cleanupReferenceShowcase(probeId),
    dispose: () => {
      cleanupReferenceFormatting();
      cleanupReferenceShowcase();
      releaseStatus();
      editor.dispose();
      status.textContent = "Editor disposed.";
    },
  };
  window.__breditorHarness = Object.freeze(harness);
  document.documentElement.dataset["breditorReady"] = "true";
}

async function mountReferenceShowcase(): Promise<ReferenceShowcaseMountResult> {
  const sequence = nextReferenceShowcaseProbeId;
  nextReferenceShowcaseProbeId += 1;
  const probeId = `reference-showcase-${sequence}`;
  const editorLabel = `Reference Showcase editor ${sequence}`;
  const text = "Breditor showcase";
  const root = document.createElement("div");
  const toolbar = document.createElement("div");
  const host = document.createElement("div");
  root.setAttribute("data-breditor-reference-showcase-probe", probeId);
  toolbar.setAttribute("data-breditor-reference-showcase-toolbar", "");
  host.setAttribute("data-breditor-reference-showcase-editor", "");
  root.append(toolbar, host);
  requiredElement("fixture").append(root);

  let editor: BreditorBrowserEditor | undefined;
  try {
    const opened = await openBreditorBrowserEditor({
      host,
      label: editorLabel,
      wasm: breditorWasm,
      initialDocument: {
        lineageId: `browser-${probeId}`,
        documentJson: REFERENCE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
        historyCapacity: 20,
      },
      semanticProfile: {
        bootstrapJson: REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
        formatVersion: 2,
      },
      rendering: REFERENCE_SHOWCASE_RENDER_MANIFEST,
      keyboard: {
        editing: "beforeinputPrimary",
        primaryModifier: "control",
        shortcuts: "enabled",
      },
      toolbar: {
        host: toolbar,
        manifest: REFERENCE_SHOWCASE_TOOLBAR_MANIFEST,
      },
    });
    if (!opened.ok) {
      throw new Error(`reference Showcase open failed: ${opened.error.code}`);
    }
    editor = opened.editor;
    await selectAllTextInHost(host);
    const italic = requiredToolbarButton(toolbar, "Italic");
    await waitForProbe(
      () => italic.getAttribute("aria-disabled") === "false",
      "reference Showcase selection did not enable its style controls",
    );
    referenceShowcaseProbes.set(probeId, { root, editor });
    return Object.freeze({ probeId, editorLabel, text });
  } catch (error) {
    try {
      editor?.dispose();
    } catch {
      // Opening failures must not retain their temporary editor owner.
    }
    try {
      root.remove();
    } catch {
      // Opening failures must not retain their temporary DOM owner.
    }
    throw error;
  }
}

function cleanupReferenceShowcase(probeId?: string): void {
  const probeIds =
    probeId === undefined ? [...referenceShowcaseProbes.keys()] : [probeId];
  for (const id of probeIds) {
    const probe = referenceShowcaseProbes.get(id);
    if (probe === undefined) continue;
    referenceShowcaseProbes.delete(id);
    try {
      probe.editor.dispose();
    } catch {
      // Test cleanup must still detach its DOM after an unexpected fault.
    }
    try {
      probe.root.remove();
    } catch {
      // A damaged probe root cannot retain the editor through this registry.
    }
  }
  if (referenceShowcaseProbes.size === 0) {
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      // Selection cleanup is best effort after all Showcase probes retire.
    }
  }
}

async function mountReferenceFormatting(
  toolbarInShadow = false,
): Promise<ReferenceFormattingMountResult> {
  const sequence = nextReferenceFormattingProbeId;
  nextReferenceFormattingProbeId += 1;
  const probeId = `reference-formatting-${sequence}`;
  const editorLabel = `Reference formatting Link editor ${sequence}`;
  const text = "Highlighted text ready for a Link";
  const root = document.createElement("div");
  const toolbar = document.createElement("div");
  const host = document.createElement("div");
  root.setAttribute("data-breditor-reference-formatting-probe", probeId);
  toolbar.setAttribute("data-breditor-reference-formatting-toolbar", "");
  host.setAttribute("data-breditor-reference-formatting-editor", "");
  if (toolbarInShadow) {
    const shadowHost = document.createElement("div");
    shadowHost.setAttribute("data-breditor-reference-toolbar-shadow-host", "");
    shadowHost.attachShadow({ mode: "open" }).append(toolbar);
    root.append(shadowHost, host);
  } else {
    root.append(toolbar, host);
  }
  requiredElement("fixture").append(root);

  let editor: BreditorBrowserEditor | undefined;
  try {
    const opened = await openBreditorBrowserEditor({
      host,
      label: editorLabel,
      wasm: breditorWasm,
      initialDocument: {
        lineageId: `browser-${probeId}`,
        documentJson: createReferenceFormattingDocumentJson(text, {
          highlighted: true,
        }),
        historyCapacity: 20,
      },
      semanticProfile: {
        bootstrapJson: REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
        formatVersion: 2,
      },
      rendering: REFERENCE_FORMATTING_RENDER_MANIFEST,
      keyboard: {
        editing: "beforeinputPrimary",
        primaryModifier: "control",
        shortcuts: "enabled",
      },
      toolbar: {
        host: toolbar,
        manifest: REFERENCE_FORMATTING_TOOLBAR_MANIFEST,
      },
    });
    if (!opened.ok) {
      throw new Error(`reference formatting open failed: ${opened.error.code}`);
    }
    editor = opened.editor;
    await selectAllTextInHost(host);
    const link = requiredToolbarButton(toolbar, "Link");
    await waitForProbe(
      () => link.getAttribute("aria-disabled") === "false",
      "reference formatting selection did not enable its Link control",
    );
    referenceFormattingProbes.set(probeId, { root, editor });
    return Object.freeze({ probeId, editorLabel, text });
  } catch (error) {
    try {
      editor?.dispose();
    } catch {
      // Opening failures must not retain their temporary editor owner.
    }
    try {
      root.remove();
    } catch {
      // Opening failures must not retain their temporary DOM owner.
    }
    throw error;
  }
}

function cleanupReferenceFormatting(probeId?: string): void {
  const probeIds =
    probeId === undefined ? [...referenceFormattingProbes.keys()] : [probeId];
  for (const id of probeIds) {
    const probe = referenceFormattingProbes.get(id);
    if (probe === undefined) continue;
    referenceFormattingProbes.delete(id);
    try {
      probe.editor.dispose();
    } catch {
      // Test cleanup must still detach its DOM after an unexpected fault.
    }
    try {
      probe.root.remove();
    } catch {
      // A damaged probe root cannot retain the editor through this registry.
    }
  }
  if (referenceFormattingProbes.size === 0) {
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      // Selection cleanup is best effort after all persistent probes retire.
    }
  }
}

async function probeReferenceHighlight(): Promise<ReferenceHighlightProbeResult> {
  const host = document.createElement("div");
  const toolbarHost = document.createElement("div");
  document.body.append(toolbarHost, host);
  let editor: BreditorBrowserEditor | undefined;
  try {
    const text = "Cross-browser Highlight";
    const openReferenceEditor = (documentJson: string) =>
      openBreditorBrowserEditor({
        host,
        label: "Reference Highlight probe",
        wasm: breditorWasm,
        initialDocument: {
          lineageId: "browser-reference-highlight",
          documentJson,
          historyCapacity: 10,
        },
        semanticProfile: {
          bootstrapJson: REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
        },
        rendering: REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
        keyboard: {
          editing: "beforeinputPrimary",
          primaryModifier: "control",
          shortcuts: "enabled",
        },
        toolbar: {
          host: toolbarHost,
          manifest: REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
        },
        persistence: {
          indexedDB,
          crypto: crypto.subtle,
          scope: { kind: "slot", name: "browser.reference-highlight" },
          autosave: { delayMs: 60_000, maxLatencyMs: 60_000 },
        },
      });
    const opened = await openReferenceEditor(
      createReferenceHighlightDocumentJson(text),
    );
    if (!opened.ok) {
      throw new Error(`reference Highlight open failed: ${opened.error.code}`);
    }
    editor = opened.editor;

    const highlight = requiredToolbarButton(toolbarHost, "Highlight");
    const bold = requiredToolbarButton(toolbarHost, "Bold");
    const undo = requiredToolbarButton(toolbarHost, "Undo");
    const redo = requiredToolbarButton(toolbarHost, "Redo");

    const initialHtml = host.innerHTML;
    const initialPressed = highlight.getAttribute("aria-pressed");
    await selectAllTextInHost(host);
    await waitForProbe(
      () =>
        highlight.getAttribute("aria-disabled") === "false" &&
        bold.getAttribute("aria-disabled") === "false",
      "reference Highlight selection did not enable its toolbar control",
    );

    const intent = editor.executeIntent(REFERENCE_HIGHLIGHT_IDS.intentId);
    await waitForProbe(
      () => host.querySelector("mark.breditor-reference-highlight") !== null,
      "reference Highlight intent did not render",
    );
    const highlightedHtml = host.innerHTML;
    const highlightedPressed = highlight.getAttribute("aria-pressed");

    bold.click();
    await waitForProbe(
      () => host.querySelector("strong > mark.breditor-reference-highlight") !== null,
      "reference Highlight did not produce canonical mixed-format nesting",
    );
    const mixedHtml = host.innerHTML;
    const mixedExport = editor.exportContent("documentJson");
    if (!mixedExport.ok) {
      throw new Error(`reference Highlight export failed: ${mixedExport.error.code}`);
    }
    await selectAllTextInHost(host);
    const copied = dispatchClipboardAtHost(host, "copy", {});

    undo.click();
    await waitForProbe(
      () => host.querySelector("mark") !== null && host.querySelector("strong") === null,
      "reference Highlight undo did not remove strong",
    );
    const undoHtml = host.innerHTML;
    redo.click();
    await waitForProbe(
      () => host.querySelector("strong > mark.breditor-reference-highlight") !== null,
      "reference Highlight redo did not restore mixed formatting",
    );
    const redoHtml = host.innerHTML;

    bold.click();
    await waitForProbe(
      () => host.querySelector("mark") !== null && host.querySelector("strong") === null,
      "reference Highlight Bold control did not toggle off",
    );
    highlight.click();
    await waitForProbe(
      () =>
        host.querySelector("mark") === null &&
        highlight.getAttribute("aria-pressed") === "false",
      "reference Highlight toolbar did not toggle the format off",
    );
    const unformattedHtml = host.innerHTML;
    const unformattedPressed = highlight.getAttribute("aria-pressed");

    await selectAllTextInHost(host);
    const pasted = dispatchClipboardAtHost(host, "paste", {
      html:
        '<p><strong><mark class="breditor-reference-highlight">Pasted plain</mark></strong></p>',
    });
    await waitForProbe(
      () =>
        host.textContent === "Pasted plain" &&
        host.querySelector("strong, mark") === null,
      "reference Highlight paste retained source formatting",
    );
    const pastedHtml = host.innerHTML;
    const pastedExport = editor.exportContent("documentJson");
    if (!pastedExport.ok) {
      throw new Error(`reference Highlight export failed: ${pastedExport.error.code}`);
    }

    await selectAllTextInHost(host);
    highlight.click();
    await waitForProbe(
      () => host.querySelector("mark.breditor-reference-highlight") !== null,
      "reference Highlight toolbar did not reapply highlight",
    );
    bold.click();
    await waitForProbe(
      () => host.querySelector("strong > mark.breditor-reference-highlight") !== null,
      "reference Highlight toolbar did not restore mixed formatting",
    );
    const flush = await editor.flushPersistence();
    const persistedHtml = host.innerHTML;
    const persistedDocument = editor.getSnapshot().document;
    const firstPhaseBeforeDispose = editor.getStatus().phase;
    editor.dispose();
    const firstPhaseAfterDispose = editor.getStatus().phase;
    const firstEditorEmptyAfterDispose = host.childNodes.length === 0;
    const firstToolbarEmptyAfterDispose = toolbarHost.childNodes.length === 0;
    editor = undefined;

    const reopened = await openReferenceEditor(
      createReferenceHighlightDocumentJson("fallback must not open"),
    );
    if (!reopened.ok) {
      throw new Error(`reference Highlight reopen failed: ${reopened.error.code}`);
    }
    editor = reopened.editor;
    const restoredHighlight = requiredToolbarButton(toolbarHost, "Highlight");
    const restoredBold = requiredToolbarButton(toolbarHost, "Bold");
    const restoredUndo = requiredToolbarButton(toolbarHost, "Undo");
    const restoredRedo = requiredToolbarButton(toolbarHost, "Redo");
    const restoredHtml = host.innerHTML;
    const restoredDocument = editor.getSnapshot().document;
    const restoredHighlightPressed = restoredHighlight.getAttribute("aria-pressed");
    const restoredBoldPressed = restoredBold.getAttribute("aria-pressed");

    restoredUndo.click();
    await waitForProbe(
      () => host.querySelector("mark") !== null && host.querySelector("strong") === null,
      "reference Highlight restored undo history was unavailable",
    );
    const restoredUndoHtml = host.innerHTML;
    restoredRedo.click();
    await waitForProbe(
      () => host.querySelector("strong > mark.breditor-reference-highlight") !== null,
      "reference Highlight restored redo history was unavailable",
    );
    const restoredRedoHtml = host.innerHTML;
    const restoredPhase = editor.getStatus().phase;
    editor.dispose();
    const finalPhase = editor.getStatus().phase;

    return Object.freeze({
      initialHtml,
      stateId: highlight.getAttribute("data-breditor-state-id"),
      initialPressed,
      intentStatus: intent.status,
      intentId: intent.intentId,
      highlightedHtml,
      highlightedPressed,
      mixedHtml,
      mixedDocumentJson: mixedExport.value,
      copiedPlainText: copied.plainText,
      copiedHtml: copied.html,
      undoHtml,
      redoHtml,
      unformattedHtml,
      unformattedPressed,
      pasteDefaultPrevented: pasted.defaultPrevented,
      pastedHtml,
      pastedDocumentJson: pastedExport.value,
      flushStatus: flush.status,
      persistedHtml,
      persistedDocument,
      firstPhaseBeforeDispose,
      firstPhaseAfterDispose,
      firstEditorEmptyAfterDispose,
      firstToolbarEmptyAfterDispose,
      restoredHtml,
      restoredDocument,
      restoredHighlightPressed,
      restoredBoldPressed,
      restoredUndoHtml,
      restoredRedoHtml,
      restoredPhase,
      finalPhase,
      finalEditorEmpty: host.childNodes.length === 0,
      finalToolbarEmpty: toolbarHost.childNodes.length === 0,
    });
  } finally {
    editor?.dispose();
    window.getSelection()?.removeAllRanges();
    host.remove();
    toolbarHost.remove();
  }
}

function requiredToolbarButton(
  toolbar: HTMLElement,
  label: string,
): HTMLButtonElement {
  const button = [...toolbar.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`reference Highlight ${label} button is unavailable`);
  }
  return button;
}

async function selectAllTextInHost(host: HTMLElement): Promise<void> {
  const paragraph = host.querySelector("p");
  const selection = window.getSelection();
  if (
    paragraph === null ||
    selection === null ||
    typeof selection.setBaseAndExtent !== "function"
  ) {
    throw new Error("reference Highlight selection is unavailable");
  }
  const iterator = document.createNodeIterator(paragraph, NodeFilter.SHOW_TEXT);
  const text = iterator.nextNode();
  if (!(text instanceof Text) || iterator.nextNode() !== null) {
    throw new Error("reference Highlight expected one text leaf");
  }
  host.focus();
  selection.setBaseAndExtent(text, 0, text, text.data.length);
  document.dispatchEvent(new Event("selectionchange"));
  await waitForProbe(
    () =>
      selection.rangeCount === 1 &&
      selection.anchorNode !== null &&
      selection.focusNode !== null &&
      host.contains(selection.anchorNode) &&
      host.contains(selection.focusNode) &&
      selection.toString() === (host.textContent ?? ""),
    "reference Highlight browser selection did not settle",
  );
}

async function waitForProbe(
  predicate: () => boolean,
  failure: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await nextTask();
  }
  throw new Error(failure);
}

async function probeEditorHost(
  tagName: string,
  ownTagName?: string,
): Promise<Readonly<{ ok: boolean; code: string | undefined }>> {
  const host = document.createElement(tagName);
  if (ownTagName !== undefined) {
    Object.defineProperty(host, "tagName", {
      configurable: true,
      value: ownTagName,
    });
  }
  document.body.append(host);
  try {
    const opened = await openBreditorBrowserEditor({
      host,
      label: "Host admission probe",
      wasm: breditorWasm,
      initialDocument: {
        lineageId: `browser-host-probe-${tagName}`,
        documentJson: EMPTY_DOCUMENT_JSON,
        historyCapacity: 0,
      },
      keyboard: {
        editing: "beforeinputPrimary",
        primaryModifier: "control",
        shortcuts: "disabled",
      },
    });
    if (!opened.ok) {
      return Object.freeze({ ok: false, code: opened.error.code });
    }
    opened.editor.dispose();
    return Object.freeze({ ok: true, code: undefined });
  } finally {
    host.remove();
  }
}

async function probeAdoptedEditorHost(): Promise<AdoptedEditorHostProbeResult> {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  let host: HTMLElement | undefined;
  let firstEditor: BreditorBrowserEditor | undefined;
  let reopenedEditor: BreditorBrowserEditor | undefined;
  try {
    const foreignDocument = iframe.contentDocument;
    const foreignWindow = iframe.contentWindow;
    if (foreignDocument === null || foreignWindow === null) {
      throw new Error("adopted-host iframe realm is unavailable");
    }
    host = foreignDocument.createElement("div");
    const originalPrototype = Object.getPrototypeOf(host);
    document.adoptNode(host);
    document.body.append(host);
    const foreignPrototype =
      originalPrototype !== HTMLDivElement.prototype &&
      Object.getPrototypeOf(host) === originalPrototype &&
      !(host instanceof HTMLElement);
    const adoptedOwnerDocument = host.ownerDocument === document;

    const openProbe = (lineageId: string) =>
      openBreditorBrowserEditor({
        host: host as HTMLElement,
        label: "Adopted iframe host probe",
        wasm: breditorWasm,
        initialDocument: {
          lineageId,
          documentJson: EMPTY_DOCUMENT_JSON,
          historyCapacity: 0,
        },
        keyboard: {
          editing: "beforeinputPrimary",
          primaryModifier: "control",
          shortcuts: "disabled",
        },
      });

    const first = await openProbe("browser-adopted-host-first");
    if (!first.ok) {
      throw new Error(`adopted-host first open failed: ${first.error.code}`);
    }
    firstEditor = first.editor;
    const firstPhase = firstEditor.getStatus().phase;
    const focusSucceeded = firstEditor.focus();
    const paragraph = host.querySelector("p");
    const selection = window.getSelection();
    if (paragraph === null || selection === null) {
      throw new Error("adopted-host selection is unavailable");
    }
    const range = document.createRange();
    range.setStart(paragraph, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));

    const beforeRevision = firstEditor.getSnapshot().document.revision;
    const routedEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: "x",
    });
    Object.defineProperty(routedEvent, "getTargetRanges", {
      configurable: true,
      value: () => [],
    });
    const routedDispatchReturned = host.dispatchEvent(routedEvent);
    const routedDefaultPrevented = routedEvent.defaultPrevented;
    const routedText = host.textContent ?? "";
    const routedRevision = firstEditor.getSnapshot().document.revision;

    firstEditor.dispose();
    const disposedPhase = firstEditor.getStatus().phase;
    const hostEmptyAfterDispose = host.childNodes.length === 0;
    const postDisposeEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: "y",
    });
    Object.defineProperty(postDisposeEvent, "getTargetRanges", {
      configurable: true,
      value: () => [],
    });
    const postDisposeDispatchReturned = host.dispatchEvent(postDisposeEvent);
    const postDisposeDefaultPrevented = postDisposeEvent.defaultPrevented;
    const postDisposeRevisionStable =
      firstEditor.getSnapshot().document.revision === routedRevision;

    const reopened = await openProbe("browser-adopted-host-reopen");
    if (!reopened.ok) {
      throw new Error(`adopted-host reopen failed: ${reopened.error.code}`);
    }
    reopenedEditor = reopened.editor;
    const reopenPhase = reopenedEditor.getStatus().phase;

    return Object.freeze({
      foreignPrototype,
      adoptedOwnerDocument,
      firstPhase,
      focusSucceeded,
      routedDispatchReturned,
      routedDefaultPrevented,
      routedText,
      revisionAdvanced: BigInt(routedRevision) > BigInt(beforeRevision),
      disposedPhase,
      hostEmptyAfterDispose,
      postDisposeDispatchReturned,
      postDisposeDefaultPrevented,
      postDisposeRevisionStable,
      reopenPhase,
    });
  } finally {
    firstEditor?.dispose();
    reopenedEditor?.dispose();
    host?.remove();
    iframe.remove();
  }
}

async function probeMutationShadowHosts(
  mode: MutationShadowMode,
): Promise<MutationShadowHostProbeResult> {
  const host = document.createElement("div");
  const toolbarHost = document.createElement("div");
  const mutationShadow =
    mode === "noOp"
      ? (): void => {}
      : (): never => {
          throw new DOMException("own mutation shadow ran", "InvalidStateError");
        };
  Object.defineProperty(host, "setAttribute", {
    configurable: true,
    value: mutationShadow,
  });
  Object.defineProperty(toolbarHost, "append", {
    configurable: true,
    value: mutationShadow,
  });
  document.body.append(host, toolbarHost);

  let editor: BreditorBrowserEditor | undefined;
  try {
    const opened = await openBreditorBrowserEditor({
      host,
      label: "Mutation shadow editor",
      wasm: breditorWasm,
      initialDocument: {
        lineageId: `browser-mutation-shadow-${mode}`,
        documentJson: EMPTY_DOCUMENT_JSON,
        historyCapacity: 0,
      },
      keyboard: {
        editing: "beforeinputPrimary",
        primaryModifier: "control",
        shortcuts: "disabled",
      },
      toolbar: { host: toolbarHost },
    });
    if (!opened.ok) {
      return Object.freeze({
        ok: false,
        code: opened.error.code,
        phase: undefined,
        editorAttributes: undefined,
        toolbarRoot: undefined,
      });
    }
    editor = opened.editor;

    const getAttribute = Element.prototype.getAttribute;
    const hasAttribute = Element.prototype.hasAttribute;
    const readAttribute = (element: Element, name: string): string | null =>
      Reflect.apply(getAttribute, element, [name]) as string | null;
    const toolbarRoot = toolbarHost.querySelector(
      "[data-breditor-toolbar-root]",
    );

    return Object.freeze({
      ok: true,
      code: undefined,
      phase: editor.getStatus().phase,
      editorAttributes: Object.freeze({
        contenteditable: readAttribute(host, "contenteditable"),
        role: readAttribute(host, "role"),
        ariaLabel: readAttribute(host, "aria-label"),
        ariaMultiline: readAttribute(host, "aria-multiline"),
        ariaDisabled: readAttribute(host, "aria-disabled"),
        spellcheck: readAttribute(host, "spellcheck"),
        marker: readAttribute(host, "data-breditor-editor-root"),
        inert: Reflect.apply(hasAttribute, host, ["inert"]) as boolean,
      }),
      toolbarRoot:
        toolbarRoot === null
          ? undefined
          : Object.freeze({
              tagName: toolbarRoot.tagName,
              marker: readAttribute(toolbarRoot, "data-breditor-toolbar-root"),
              role: readAttribute(toolbarRoot, "role"),
              ariaLabel: readAttribute(toolbarRoot, "aria-label"),
              ariaOrientation: readAttribute(toolbarRoot, "aria-orientation"),
              buttonCount: toolbarRoot.querySelectorAll("button").length,
            }),
    });
  } finally {
    editor?.dispose();
    host.remove();
    toolbarHost.remove();
  }
}

async function probeToolbarDisposalShadow(
  mode: MutationShadowMode,
): Promise<ToolbarDisposalShadowProbeResult> {
  const host = document.createElement("div");
  const toolbarHost = document.createElement("div");
  document.body.append(host, toolbarHost);

  let firstEditor: BreditorBrowserEditor | undefined;
  let reopenedEditor: BreditorBrowserEditor | undefined;
  try {
    const first = await openProbeEditor(
      host,
      toolbarHost,
      `browser-toolbar-disposal-${mode}-first`,
    );
    if (!first.ok) {
      return Object.freeze({
        firstOpen: false,
        firstCode: first.error.code,
        firstPhase: undefined,
        disposedToolbarChildCount: toolbarHost.childNodes.length,
        detachedOwnedNodeCount: 0,
        ownedNodeCount: 0,
        reopened: false,
        reopenCode: undefined,
        reopenPhase: undefined,
        reopenedToolbarRootCount: 0,
        finalToolbarChildCount: toolbarHost.childNodes.length,
      });
    }
    firstEditor = first.editor;
    const firstPhase = firstEditor.getStatus().phase;
    const toolbarRoot = toolbarHost.querySelector(
      "[data-breditor-toolbar-root]",
    );
    if (toolbarRoot === null) {
      throw new Error("toolbar disposal probe did not install a toolbar root");
    }
    const ownedNodes = [toolbarRoot, ...toolbarRoot.querySelectorAll("button")];
    const removeShadow =
      mode === "noOp"
        ? (): void => {}
        : (): never => {
            throw new DOMException("own remove shadow ran", "InvalidStateError");
          };
    for (const node of ownedNodes) {
      Object.defineProperty(node, "remove", {
        configurable: true,
        value: removeShadow,
      });
    }

    firstEditor.dispose();
    firstEditor = undefined;
    const disposedToolbarChildCount = toolbarHost.childNodes.length;
    const detachedOwnedNodeCount = ownedNodes.filter(
      (node) => node.parentNode === null && !node.isConnected,
    ).length;

    const reopened = await openProbeEditor(
      host,
      toolbarHost,
      `browser-toolbar-disposal-${mode}-reopen`,
    );
    if (!reopened.ok) {
      return Object.freeze({
        firstOpen: true,
        firstCode: undefined,
        firstPhase,
        disposedToolbarChildCount,
        detachedOwnedNodeCount,
        ownedNodeCount: ownedNodes.length,
        reopened: false,
        reopenCode: reopened.error.code,
        reopenPhase: undefined,
        reopenedToolbarRootCount: toolbarHost.querySelectorAll(
          "[data-breditor-toolbar-root]",
        ).length,
        finalToolbarChildCount: toolbarHost.childNodes.length,
      });
    }
    reopenedEditor = reopened.editor;
    const reopenPhase = reopenedEditor.getStatus().phase;
    const reopenedToolbarRootCount = toolbarHost.querySelectorAll(
      "[data-breditor-toolbar-root]",
    ).length;
    reopenedEditor.dispose();
    reopenedEditor = undefined;

    return Object.freeze({
      firstOpen: true,
      firstCode: undefined,
      firstPhase,
      disposedToolbarChildCount,
      detachedOwnedNodeCount,
      ownedNodeCount: ownedNodes.length,
      reopened: true,
      reopenCode: undefined,
      reopenPhase,
      reopenedToolbarRootCount,
      finalToolbarChildCount: toolbarHost.childNodes.length,
    });
  } finally {
    firstEditor?.dispose();
    reopenedEditor?.dispose();
    host.remove();
    toolbarHost.remove();
  }
}

function probeDetachedToolbarButtonShadow(
  editor: BreditorBrowserEditor,
  mode: MutationShadowMode,
): DetachedToolbarButtonShadowProbeResult {
  const toolbarRoot = toolbarHost.querySelector<HTMLElement>(
    "[data-breditor-toolbar-root]",
  );
  const button = toolbarRoot?.querySelector<HTMLButtonElement>(
    'button[data-breditor-state-id="breditor/control-bold"]',
  );
  if (toolbarRoot === null || button === null || button === undefined) {
    throw new Error("detached toolbar button probe is unavailable");
  }

  const beforeSnapshot = editor.getSnapshot();
  const beforeExport = editor.exportContent("documentJson");
  const beforeHtml = editorHost.innerHTML;
  button.remove();
  const detachedBeforeShadow = button.parentNode === null && !button.isConnected;

  let parentNodeShadowReads = 0;
  let isConnectedShadowReads = 0;
  let ownerDocumentShadowReads = 0;
  let focusShadowCalls = 0;
  const apparentOwnerDocument = Object.freeze({ activeElement: button });
  const focusShadow = (): void => {
    focusShadowCalls += 1;
    if (mode === "throw") {
      throw new DOMException("own focus shadow ran", "InvalidStateError");
    }
  };
  Object.defineProperties(button, {
    parentNode: {
      configurable: true,
      get: () => {
        parentNodeShadowReads += 1;
        return toolbarRoot;
      },
    },
    isConnected: {
      configurable: true,
      get: () => {
        isConnectedShadowReads += 1;
        return true;
      },
    },
    ownerDocument: {
      configurable: true,
      get: () => {
        ownerDocumentShadowReads += 1;
        return apparentOwnerDocument;
      },
    },
    focus: { configurable: true, value: focusShadow },
  });

  const click = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  const dispatchReturned = Reflect.apply(
    EventTarget.prototype.dispatchEvent,
    button,
    [click],
  ) as boolean;
  const afterSnapshot = editor.getSnapshot();
  const afterExport = editor.exportContent("documentJson");

  return Object.freeze({
    detachedBeforeShadow,
    parentNodeShadowReads,
    isConnectedShadowReads,
    ownerDocumentShadowReads,
    focusShadowCalls,
    dispatchReturned,
    clickDefaultPrevented: click.defaultPrevented,
    beforeDocument: beforeSnapshot.document,
    afterDocument: afterSnapshot.document,
    beforeDocumentJson: beforeExport.ok ? beforeExport.value : undefined,
    afterDocumentJson: afterExport.ok ? afterExport.value : undefined,
    beforeHtml,
    afterHtml: editorHost.innerHTML,
    beforePhase: beforeSnapshot.status.phase,
    afterPhase: afterSnapshot.status.phase,
  });
}

function openProbeEditor(
  host: HTMLElement,
  toolbarHost: HTMLElement,
  lineageId: string,
) {
  return openBreditorBrowserEditor({
    host,
    label: "Toolbar disposal probe",
    wasm: breditorWasm,
    initialDocument: {
      lineageId,
      documentJson: EMPTY_DOCUMENT_JSON,
      historyCapacity: 0,
    },
    keyboard: {
      editing: "beforeinputPrimary",
      primaryModifier: "control",
      shortcuts: "disabled",
    },
    toolbar: { host: toolbarHost },
  });
}

function renderStatus(editor: BreditorBrowserEditor): void {
  const snapshot = editor.getSnapshot();
  status.textContent = `${snapshot.status.phase}; revision ${snapshot.document.revision}; persistence ${snapshot.persistence.phase}`;
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`missing harness element: ${id}`);
  return element;
}

function requireBrowserCapability(supported: boolean, name: string): void {
  if (!supported) throw new Error(`unsupported browser capability: ${name}`);
}

function paragraph(): HTMLParagraphElement {
  const element = editorHost.querySelector("p");
  if (!(element instanceof HTMLParagraphElement)) {
    throw new Error("editor paragraph is unavailable");
  }
  return element;
}

function textNodes(): Text[] {
  const iterator = document.createNodeIterator(paragraph(), NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = iterator.nextNode(); node !== null; node = iterator.nextNode()) {
    if (node instanceof Text) nodes.push(node);
  }
  return nodes;
}

function domPoint(offset: number): Readonly<{ node: Node; offset: number }> {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError("selection offset is invalid");
  }
  const container = paragraph();
  const nodes = textNodes();
  if (nodes.length === 0) {
    if (offset !== 0) throw new RangeError("selection offset exceeds text");
    return Object.freeze({ node: container, offset: 0 });
  }
  let remaining = offset;
  for (const node of nodes) {
    if (remaining <= node.data.length) {
      return Object.freeze({ node, offset: remaining });
    }
    remaining -= node.data.length;
  }
  throw new RangeError("selection offset exceeds text");
}

async function installSelection(
  anchorOffset: number,
  focusOffset: number,
): Promise<void> {
  const selection = window.getSelection();
  if (selection === null || typeof selection.setBaseAndExtent !== "function") {
    throw new Error("unsupported browser capability: Selection.setBaseAndExtent");
  }
  const anchor = domPoint(anchorOffset);
  const focus = domPoint(focusOffset);
  editorHost.focus();
  selection.setBaseAndExtent(
    anchor.node,
    anchor.offset,
    focus.node,
    focus.offset,
  );
  // `selectionchange` is queued asynchronously by browsers. Wait until both
  // Selection endpoints and getRangeAt(0) describe the same range before
  // dispatching the fallback. WebKit can expose the requested anchor/focus for
  // a short interval while its Range still describes the prior editor render;
  // a synthetic beforeinput during that interval must be blocked by Breditor.
  await waitForCoherentSelection(anchorOffset, focusOffset);
  document.dispatchEvent(new Event("selectionchange"));
  // Synchronization writes the semantic selection back into a fresh render.
  // Require that editor-owned write to settle as well, so the next synthetic
  // event never races a transient native Range.
  await waitForCoherentSelection(anchorOffset, focusOffset);
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

async function waitForCoherentSelection(
  expectedAnchorOffset: number,
  expectedFocusOffset: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await nextTask();
    try {
      const snapshot = selectionSnapshot();
      if (
        snapshot.anchorOffset === expectedAnchorOffset &&
        snapshot.focusOffset === expectedFocusOffset
      ) {
        return;
      }
    } catch {
      // Native selection state is still settling; retry on the next task.
    }
  }
  throw new Error("browser selection did not become coherent");
}

function selectionSnapshot(): Readonly<{
  anchorOffset: number;
  focusOffset: number;
  direction: "forward" | "backward" | "collapsed";
}> {
  const selection = window.getSelection();
  if (selection === null || selection.anchorNode === null || selection.focusNode === null) {
    throw new Error("browser selection is unavailable");
  }
  if (selection.rangeCount !== 1) {
    throw new Error("browser selection does not contain one range");
  }
  const range = selection.getRangeAt(0);
  const anchorPrecedesFocus =
    range.startContainer === selection.anchorNode &&
    range.startOffset === selection.anchorOffset &&
    range.endContainer === selection.focusNode &&
    range.endOffset === selection.focusOffset;
  const focusPrecedesAnchor =
    range.startContainer === selection.focusNode &&
    range.startOffset === selection.focusOffset &&
    range.endContainer === selection.anchorNode &&
    range.endOffset === selection.anchorOffset;
  if (!anchorPrecedesFocus && !focusPrecedesAnchor) {
    throw new Error("browser selection endpoints and range disagree");
  }
  const anchorOffset = textOffset(selection.anchorNode, selection.anchorOffset);
  const focusOffset = textOffset(selection.focusNode, selection.focusOffset);
  return Object.freeze({
    anchorOffset,
    focusOffset,
    direction:
      anchorOffset === focusOffset
        ? "collapsed"
        : anchorOffset < focusOffset
          ? "forward"
          : "backward",
  });
}

function textOffset(node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(paragraph(), 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

function inputEvent(
  eventType: "beforeinput" | "input",
  inputType: string,
  data: string | null,
  isComposing: boolean,
  ranges: AbstractRange[],
): InputEvent {
  const event = new InputEvent(eventType, {
    bubbles: true,
    cancelable: eventType === "beforeinput",
    composed: true,
    data,
    inputType,
    isComposing,
  });
  INPUT_TARGET_RANGES.set(event, Object.freeze([...ranges]));
  return event;
}

/**
 * Supplies synthetic target ranges through the realm interface that owns the
 * native method. Product code intentionally ignores event-local method
 * shadows, so browser fixtures must model the platform at this boundary.
 */
function installInputTargetRangeFixture(): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    InputEvent.prototype,
    "getTargetRanges",
  );
  if (
    descriptor === undefined ||
    typeof descriptor.value !== "function" ||
    descriptor.configurable !== true
  ) {
    throw new Error("InputEvent target-range fixture cannot be installed");
  }
  const nativeGetTargetRanges = descriptor.value as (
    this: InputEvent,
  ) => readonly AbstractRange[];
  Object.defineProperty(InputEvent.prototype, "getTargetRanges", {
    ...descriptor,
    value(this: InputEvent): readonly AbstractRange[] {
      return (
        INPUT_TARGET_RANGES.get(this) ??
        Reflect.apply(nativeGetTargetRanges, this, [])
      );
    },
  });
}

function dispatchInput(
  eventType: "beforeinput" | "input",
  inputType: string,
  data: string | null,
  isComposing: boolean,
  ranges: AbstractRange[],
): boolean {
  const event = inputEvent(eventType, inputType, data, isComposing, ranges);
  editorHost.dispatchEvent(event);
  return event.defaultPrevented;
}

function dispatchComposition(text: string): void {
  if (text.length === 0) throw new RangeError("composition text is empty");
  const selected = window.getSelection();
  if (
    selected === null ||
    selected.rangeCount !== 1 ||
    !selected.isCollapsed
  ) {
    throw new Error("composition requires one collapsed browser selection");
  }
  const target = selected.getRangeAt(0).cloneRange();
  const insertionOffset = selectionSnapshot().focusOffset;
  const start = new CompositionEvent("compositionstart", {
    bubbles: true,
    composed: true,
    data: "",
  });
  paragraph().dispatchEvent(start);
  paragraph().dispatchEvent(
    new CompositionEvent("compositionupdate", {
      bubbles: true,
      composed: true,
      data: text,
    }),
  );
  const beforeInput = inputEvent(
    "beforeinput",
    "insertCompositionText",
    text,
    true,
    [target],
  );
  paragraph().dispatchEvent(beforeInput);
  if (beforeInput.defaultPrevented) {
    throw new Error("composition beforeinput was unexpectedly cancelled");
  }
  const prior = editorHost.textContent ?? "";
  paragraph().textContent =
    prior.slice(0, insertionOffset) + text + prior.slice(insertionOffset);
  paragraph().dispatchEvent(
    new CompositionEvent("compositionend", {
      bubbles: true,
      composed: true,
      data: text,
    }),
  );
}

function dispatchClipboard(
  operation: "copy" | "cut" | "paste",
  payload: ClipboardPayload,
): ClipboardDispatchResult {
  return dispatchClipboardAtHost(editorHost, operation, payload);
}

function dispatchClipboardAtHost(
  target: HTMLElement,
  operation: "copy" | "cut" | "paste",
  payload: ClipboardPayload,
): ClipboardDispatchResult {
  const transfer = new DataTransfer();
  if (payload.plainText !== undefined) {
    transfer.setData("text/plain", payload.plainText);
  }
  if (payload.html !== undefined) transfer.setData("text/html", payload.html);
  const event = new ClipboardEvent(operation, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clipboardData: transfer,
  });
  const eventTransfer = event.clipboardData ?? transfer;
  if (eventTransfer !== transfer) {
    if (payload.plainText !== undefined) {
      eventTransfer.setData("text/plain", payload.plainText);
    }
    if (payload.html !== undefined) {
      eventTransfer.setData("text/html", payload.html);
    }
  }
  target.dispatchEvent(event);

  if (event.defaultPrevented && operation !== "copy") {
    const inputType = operation === "cut" ? "deleteByCut" : "insertFromPaste";
    target.dispatchEvent(inputEvent("beforeinput", inputType, null, false, []));
    target.dispatchEvent(inputEvent("input", inputType, null, false, []));
  }
  const observedTransfer = event.clipboardData ?? eventTransfer;
  return Object.freeze({
    defaultPrevented: event.defaultPrevented,
    plainText: observedTransfer.getData("text/plain"),
    html: observedTransfer.getData("text/html"),
  });
}
