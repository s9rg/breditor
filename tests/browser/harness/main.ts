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
    dispose: () => {
      releaseStatus();
      editor.dispose();
      status.textContent = "Editor disposed.";
    },
  };
  window.__breditorHarness = Object.freeze(harness);
  document.documentElement.dataset["breditorReady"] = "true";
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
  // `selectionchange` is queued asynchronously by browsers. Give the native
  // signal a task first (notably in Firefox), then send an idempotent fallback
  // so the harness remains deterministic if an engine coalesces that signal.
  await nextTask();
  document.dispatchEvent(new Event("selectionchange"));
  await nextTask();
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
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
