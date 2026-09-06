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
  dispose(): void;
}

declare global {
  interface Window {
    __breditorHarness?: BreditorBrowserHarness;
    __breditorStartupError?: string;
  }
}

const editorHost = requiredElement("editor");
const toolbarHost = requiredElement("toolbar");
const status = requiredElement("status");

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
    dispose: () => {
      releaseStatus();
      editor.dispose();
      status.textContent = "Editor disposed.";
    },
  };
  window.__breditorHarness = Object.freeze(harness);
  document.documentElement.dataset["breditorReady"] = "true";
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
  Object.defineProperty(event, "getTargetRanges", {
    configurable: true,
    value: () => ranges,
  });
  return event;
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
  const values = new Map<string, string>();
  if (payload.plainText !== undefined) values.set("text/plain", payload.plainText);
  if (payload.html !== undefined) values.set("text/html", payload.html);
  const transfer = {
    get types(): string[] {
      return Array.from(values.keys());
    },
    clearData(type?: string): void {
      if (type === undefined) values.clear();
      else values.delete(type);
    },
    getData(type: string): string {
      return values.get(type) ?? "";
    },
    setData(type: string, value: string): void {
      values.set(type, value);
    },
  };
  const event = new Event(operation, {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  Object.defineProperty(event, "clipboardData", {
    configurable: true,
    value: transfer,
  });
  editorHost.dispatchEvent(event);

  if (event.defaultPrevented && operation !== "copy") {
    const inputType = operation === "cut" ? "deleteByCut" : "insertFromPaste";
    dispatchInput("beforeinput", inputType, null, false, []);
    dispatchInput("input", inputType, null, false, []);
  }
  return Object.freeze({
    defaultPrevented: event.defaultPrevented,
    plainText: values.get("text/plain") ?? "",
    html: values.get("text/html") ?? "",
  });
}
