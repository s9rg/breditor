/** Bounded local-only diagnostics for disposable synthetic input. No persistence. */
const entries: {site: string; timeMs: number; message?: string; stack?: string; details?: unknown}[] = [];
let dropped = 0;
// Put exceptions first so native accessibility readers do not truncate the
// actual failure behind hundreds of earlier event/DOM snapshots.
function diagnosticSnapshot(): string {
  return JSON.stringify({failures: entries.filter(entry => !entry.site.startsWith("event:")), dropped, entries}, null, 2);
}
export function recordImeDiagnostic(site: string, error?: unknown, details?: unknown): void {
  try {
    if (entries.length >= 1024) { dropped++; return; }
    let message: string | undefined, stack: string | undefined;
    if (error !== undefined) {
      try { message = String(error).slice(0, 1024); } catch { message = "<unprintable>"; }
      try { const value = (error as {stack?: unknown})?.stack; if (typeof value === "string") stack = value.slice(0, 4096); } catch {}
    }
    entries.push({site, timeMs: performance.now(), message, stack, details});
    if (!site.startsWith("event:")) {
      const output = document.querySelector<HTMLTextAreaElement>('[aria-label="Local IME diagnostics"]');
      if (output) output.value = diagnosticSnapshot();
    }
  } catch { /* Diagnostics cannot affect queue or recovery semantics. */ }
}

function shape(host: Element, event: Event) {
  let count = 0;
  const walk = (node: Node): unknown => {
    if (++count > 200) return "<truncated>";
    if (node.nodeType === Node.TEXT_NODE) return {textLength: node.nodeValue?.length ?? 0};
    return {tag: node instanceof Element ? node.localName : node.nodeType,
      children: Array.from(node.childNodes).slice(0, 200).map(walk)};
  };
  const point = (node: Node | null, offset: number) => {
    const path: number[] = [];
    while (node !== host && path.length < 30) {
      if (!node?.parentNode) return {outside: true};
      path.unshift(Array.from(node.parentNode.childNodes).indexOf(node as ChildNode));
      node = node.parentNode;
    }
    return {path, offset};
  };
  const selection = document.getSelection();
  let targetRanges: unknown;
  if (event instanceof InputEvent) {
    try {
      targetRanges = Array.from(event.getTargetRanges()).slice(0, 4).map(range => ({
        start: point(range.startContainer, range.startOffset),
        end: point(range.endContainer, range.endOffset),
      }));
    } catch { targetRanges = "<unavailable>"; }
  }
  return {targetRanges, focusedTag: document.activeElement?.localName,
    dom: walk(host), selection: selection && {
    anchor: point(selection.anchorNode, selection.anchorOffset),
    focus: point(selection.focusNode, selection.focusOffset),
  }};
}

/** Metadata only: fixed key identities, modifiers and a bounded control-byte sample. */
function diagnosticInputMetadata(event: Event) {
  const keyboard = event instanceof KeyboardEvent;
  const data = event instanceof InputEvent || event instanceof CompositionEvent ? event.data : null;
  const scannedUtf16 = Math.min(data?.length ?? 0, 256);
  const controlCodeUnits: number[] = [];
  for (let index = 0; index < scannedUtf16; index++) {
    const value = data!.charCodeAt(index);
    if ((value < 32 || value === 127) && !controlCodeUnits.includes(value)) controlCodeUnits.push(value);
  }
  return {
    trusted: event.isTrusted,
    inputType: event instanceof InputEvent ? event.inputType : undefined,
    composing: event instanceof InputEvent || keyboard ? event.isComposing : undefined,
    // Only reviewed control/shortcut identities; never arbitrary text or codes.
    key: keyboard ? (["Enter", "Escape", "Tab", " ", "Process", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) ? event.key : "other") : undefined,
    code: keyboard ? (["KeyA", "KeyB", "KeyZ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape", "Tab", "Space"].includes(event.code) ? event.code : "other") : undefined,
    modifiers: keyboard ? {control: event.ctrlKey, option: event.altKey, command: event.metaKey, shift: event.shiftKey} : undefined,
    dataLength: data?.length,
    dataControlSample: data === null ? undefined : {scannedUtf16, truncated: data.length > scannedUtf16, controlCodeUnits},
  };
}

// Registration precedes editor startup. DOM metadata records lengths and paths,
// never actual input/document strings; exception messages may contain payloads.
for (const type of ["compositionstart", "compositionupdate", "compositionend", "beforeinput", "input", "keydown", "blur"]) {
  document.addEventListener(type, event => {
    const host = document.querySelector("#editor [contenteditable=true]") ?? document.querySelector("#editor");
    if (!host || !(event.target instanceof Node) || !host.contains(event.target)) return;
    try {
      recordImeDiagnostic(`event:${type}`, undefined, {...diagnosticInputMetadata(event), ...shape(host, event)});
    } catch { /* Observation must not interfere with event delivery. */ }
  }, true);
}
window.addEventListener("DOMContentLoaded", () => {
  const warning = document.createElement("p");
  warning.textContent = "LOCAL IME DIAGNOSTIC BUILD — synthetic text only. Exception messages/stacks may contain input; inspect before sharing. Not release qualification.";
  document.querySelector("main")?.prepend(warning);
  const button = document.createElement("button"); button.textContent = "Capture IME diagnostics";
  const output = document.createElement("textarea"); output.readOnly = true;
  output.setAttribute("aria-label", "Local IME diagnostics");
  button.addEventListener("click", () => { output.value = diagnosticSnapshot(); });
  document.querySelector("main")?.append(button, output);
  const replay = document.createElement("button"); replay.textContent = "Run scripted composition matrix";
  const results = document.createElement("textarea"); results.readOnly = true;
  results.setAttribute("aria-label", "Scripted composition results");
  replay.addEventListener("click", async () => {
    replay.disabled = true;
    const rows: unknown[] = [];
    try {
      for (const selector of ["h2", "ul li p", "ol li p"]) {
        // Cancellation goes first to exercise an empty history as well as the
        // redo branch retained by subsequent replacement cases.
        for (const variant of ["cancel", "cancel-replace", "backward-cancel-replace", "blur-cancel-replace", "blur-backward-cancel-replace", "append", "same-text", "split-node", "replace", "backward-replace", "unsynchronized", "retargeted", "element-selection", "delete", "blur-append", "blur-replace", "blur-backward-replace", "blur-cancel", "blur-delete", "blur-backward-delete"]) {
          await replayComposition(selector, variant);
          rows.push({selector, variant, result: "pass"});
          results.value = JSON.stringify({status: "running", rows}, null, 2);
        }
      }
      results.value = JSON.stringify({status: "passed", nativeImeQualified: false, rows}, null, 2);
    } catch (error) {
      recordImeDiagnostic("scripted-replay:failure", error);
      results.value = JSON.stringify({status: "failed", nativeImeQualified: false, rows, error: String(error)}, null, 2);
    }
    // One run per disposable page preserves failure evidence and bounded logs.
    output.value = diagnosticSnapshot();
  });
  document.querySelector("main")?.append(replay, results);
});

const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));
async function replayComposition(selector: string, variant: string): Promise<void> {
  const host = document.querySelector<HTMLElement>("#editor [contenteditable=true]") ?? document.querySelector<HTMLElement>("#editor")!;
  const original = host.innerHTML;
  const block = host.querySelector(selector)!;
  const text = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode() as Text;
  const originalText = block.textContent;
  const action = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("#toolbar button")).find(button => button.textContent?.trim() === name);
  const blurring = variant.startsWith("blur-");
  const cancelling = variant.includes("cancel");
  const replacing = variant.includes("replace") || variant.includes("delete") || ["same-text", "retargeted"].includes(variant);
  const start = replacing ? 0 : text.length;
  const end = replacing ? 5 : text.length;
  const originalRange = text.data.slice(start, end);
  const final = variant === "same-text" || cancelling ? originalRange
    : variant.includes("delete") ? "" : "日本";
  const expectedText = text.data.slice(0, start) + final + text.data.slice(end);
  host.focus();
  const selection = document.getSelection()!;
  if (variant.includes("backward")) selection.setBaseAndExtent(text, end, text, start);
  else if (variant === "retargeted") selection.setBaseAndExtent(text, end, text, end);
  else if (variant === "element-selection") selection.setBaseAndExtent(block, block.childNodes.length, block, block.childNodes.length);
  else selection.setBaseAndExtent(text, start, text, end);
  if (variant !== "unsynchronized") {
    document.dispatchEvent(new Event("selectionchange"));
    await nextTask();
  }
  const historyBefore = {undo: action("Undo")?.disabled, redo: action("Redo")?.disabled};
  host.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true, data: ""}));
  let previousLength = end - start;
  for (const value of ["n", "に", "にh", "にほ", "にほん", final]) {
    const range = new StaticRange({startContainer: text, startOffset: start, endContainer: text, endOffset: start + previousLength});
    const input = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertCompositionText", data: value, isComposing: true, targetRanges: [range]});
    const descriptor = Object.getOwnPropertyDescriptor(InputEvent.prototype, "getTargetRanges")!;
    Object.defineProperty(InputEvent.prototype, "getTargetRanges", {...descriptor, value(this: InputEvent) { return this === input ? [range] : Reflect.apply(descriptor.value, this, []); }});
    try { host.dispatchEvent(input); } finally { Object.defineProperty(InputEvent.prototype, "getTargetRanges", descriptor); }
    if (input.defaultPrevented) throw new Error(`${selector}/${variant}: composition denied`);
    text.replaceData(start, previousLength, value); previousLength = value.length;
    document.getSelection()!.setBaseAndExtent(text, blurring ? start : start + value.length, text, start + value.length);
    host.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertCompositionText", data: value, isComposing: true}));
    await nextTask();
  }
  if (variant === "split-node") text.splitText(start);
  if (blurring) host.blur();
  else host.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true, data: cancelling ? "" : final}));
  // Production composition settlement deliberately waits 20 ms. A pair of
  // zero-delay tasks can still see provisional DOM and a leased command queue.
  // This bounded synthetic probe waits beyond that window; it is not a timing
  // guarantee for background tabs or a replacement for native IME observation.
  await new Promise<void>(resolve => setTimeout(resolve, 100));
  const undo = action("Undo");
  if (!host.isConnected || host.getAttribute("contenteditable") !== "true" || !undo) throw new Error(`${selector}/${variant}: editor unavailable`);
  const committed = host.innerHTML;
  if (host.querySelector(selector)?.textContent !== expectedText) throw new Error(`${selector}/${variant}: replacement text mismatch`);
  if (cancelling) {
    if (committed !== original || host.querySelector(selector)?.textContent !== originalText) throw new Error("Cancellation changed the document");
    if (undo.disabled !== historyBefore.undo || action("Redo")?.disabled !== historyBefore.redo) throw new Error("Cancellation changed history availability");
    const restored = document.getSelection();
    if (!restored || restored.anchorOffset !== (variant.includes("backward") ? end : start) ||
        restored.focusOffset !== (variant.includes("backward") ? start : end) ||
        !host.querySelector(selector)?.contains(restored.anchorNode) ||
        !host.querySelector(selector)?.contains(restored.focusNode)) throw new Error("Cancellation did not restore directional selection");
    return;
  }
  if (undo.disabled) throw new Error(`${selector}/${variant}: no committed action`);
  if (variant === "same-text") {
    // An identical replacement collapses the selection but has no forward
    // document operations. Rust retains the existing redo branch; replaying
    // it here would test the previous case, not this composition.
    if (committed !== original) throw new Error("Same-text replacement changed the document");
    const selection = document.getSelection();
    if (!selection?.isCollapsed || selection.anchorOffset !== end ||
        !host.querySelector(selector)?.contains(selection.anchorNode)) {
      throw new Error("Same-text replacement did not collapse the caret at its end");
    }
    return;
  }
  undo.click(); await nextTask();
  if (host.innerHTML !== original) throw new Error("Undo mismatch");
  const redo = action("Redo");
  if (!redo || redo.disabled) throw new Error("Redo unavailable");
  redo.click(); await nextTask();
  if (host.innerHTML !== committed) throw new Error("Redo mismatch");
  action("Undo")!.click(); await nextTask();
  if (host.innerHTML !== original) throw new Error("Reset mismatch");
}
