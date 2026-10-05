/** Bounded local-only diagnostics for disposable synthetic input. No persistence. */
const entries: unknown[] = [];
let dropped = 0;
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
      if (output) output.value = JSON.stringify({dropped, entries}, null, 2);
    }
  } catch { /* Diagnostics cannot affect queue or recovery semantics. */ }
}

function shape(host: Element) {
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
  return {dom: walk(host), selection: selection && {
    anchor: point(selection.anchorNode, selection.anchorOffset),
    focus: point(selection.focusNode, selection.focusOffset),
  }};
}

// Registration precedes editor startup. DOM metadata records lengths and paths,
// never actual input/document strings; exception messages may contain payloads.
for (const type of ["compositionstart", "compositionupdate", "compositionend", "beforeinput", "input"]) {
  document.addEventListener(type, event => {
    const host = document.querySelector("#editor [contenteditable=true]") ?? document.querySelector("#editor");
    if (!host || !(event.target instanceof Node) || !host.contains(event.target)) return;
    recordImeDiagnostic(`event:${type}`, undefined, {trusted: event.isTrusted,
      inputType: event instanceof InputEvent ? event.inputType : undefined,
      composing: event instanceof InputEvent ? event.isComposing : undefined,
      dataLength: event instanceof InputEvent || event instanceof CompositionEvent ? event.data?.length : undefined,
      ...shape(host)});
  }, true);
}
window.addEventListener("DOMContentLoaded", () => {
  const warning = document.createElement("p");
  warning.textContent = "LOCAL IME DIAGNOSTIC BUILD — synthetic text only. Exception messages/stacks may contain input; inspect before sharing. Not release qualification.";
  document.querySelector("main")?.prepend(warning);
  const button = document.createElement("button"); button.textContent = "Capture IME diagnostics";
  const output = document.createElement("textarea"); output.readOnly = true;
  output.setAttribute("aria-label", "Local IME diagnostics");
  button.addEventListener("click", () => { output.value = JSON.stringify({dropped, entries}, null, 2); });
  document.querySelector("main")?.append(button, output);
  const replay = document.createElement("button"); replay.textContent = "Run scripted composition matrix";
  const results = document.createElement("textarea"); results.readOnly = true;
  results.setAttribute("aria-label", "Scripted composition results");
  replay.addEventListener("click", async () => {
    replay.disabled = true;
    const rows: unknown[] = [];
    try {
      for (const selector of ["h2", "ul li p", "ol li p"]) {
        for (const variant of ["append", "same-text", "split-node", "replace", "backward-replace", "unsynchronized", "retargeted", "element-selection", "cancel", "delete"]) {
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
    output.value = JSON.stringify({dropped, entries}, null, 2);
  });
  document.querySelector("main")?.append(replay, results);
});

const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));
async function replayComposition(selector: string, variant: string): Promise<void> {
  const host = document.querySelector<HTMLElement>("#editor [contenteditable=true]") ?? document.querySelector<HTMLElement>("#editor")!;
  const original = host.innerHTML;
  const block = host.querySelector(selector)!;
  const text = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode() as Text;
  const replacing = ["same-text", "replace", "backward-replace", "retargeted", "delete"].includes(variant);
  const start = replacing ? 0 : text.length;
  const end = replacing ? 5 : text.length;
  const final = variant === "same-text" ? text.data.slice(start, end)
    : ["cancel", "delete"].includes(variant) ? "" : "日本";
  host.focus();
  const selection = document.getSelection()!;
  if (variant === "backward-replace") selection.setBaseAndExtent(text, end, text, start);
  else if (variant === "retargeted") selection.setBaseAndExtent(text, end, text, end);
  else if (variant === "element-selection") selection.setBaseAndExtent(block, block.childNodes.length, block, block.childNodes.length);
  else selection.setBaseAndExtent(text, start, text, end);
  if (variant !== "unsynchronized") {
    document.dispatchEvent(new Event("selectionchange"));
    await nextTask();
  }
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
    document.getSelection()!.setBaseAndExtent(text, start + value.length, text, start + value.length);
    host.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertCompositionText", data: value, isComposing: true}));
    await nextTask();
  }
  if (variant === "split-node") text.splitText(start);
  host.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true, data: final}));
  // Production composition settlement deliberately waits 20 ms. A pair of
  // zero-delay tasks can still see provisional DOM and a leased command queue.
  // This bounded synthetic probe waits beyond that window; it is not a timing
  // guarantee for background tabs or a replacement for native IME observation.
  await new Promise<void>(resolve => setTimeout(resolve, 100));
  const action = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("#toolbar button")).find(button => button.textContent?.trim() === name);
  const undo = action("Undo");
  if (!host.isConnected || !undo || undo.disabled) throw new Error(`${selector}/${variant}: no committed action`);
  const committed = host.innerHTML;
  if (!host.querySelector(selector)?.textContent?.includes(final)) throw new Error("missing committed text");
  if (variant === "cancel") {
    if (committed !== original) throw new Error("Cancelled insertion changed the document");
    return;
  }
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
