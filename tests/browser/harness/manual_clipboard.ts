import { openBreditorBrowserEditor, type BreditorBrowserEditor } from "@breditor/browser";
import {
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_FORMATTING_RENDER_MANIFEST,
  REFERENCE_FORMATTING_TOOLBAR_MANIFEST,
  createReferenceFormattingDocumentJson,
} from "@breditor/reference-highlight";
import initializeWasm, * as breditorWasm from "@breditor/wasm";
import { MANUAL_CHECKS, ManualClipboardRecorder, type ManualEventKind } from "./manual_clipboard_recorder";

// Independent entry point: do not import main.ts or its synthetic target-range shim.
const host = document.querySelector<HTMLElement>("#editor")!;
const toolbar = document.querySelector<HTMLElement>("#toolbar")!;
const status = document.querySelector<HTMLElement>("#status")!;
const counts = document.querySelector<HTMLElement>("#counts")!;
const checks = document.querySelector<HTMLFieldSetElement>("#checks")!;
const output = document.querySelector<HTMLTextAreaElement>("#report")!;
const recorder = new ManualClipboardRecorder();
let editor: BreditorBrowserEditor | undefined;

function refresh(): void {
  const report = recorder.report();
  const message = `${report.owner.phase} · ${report.outcome}`;
  if (status.textContent !== message) status.textContent = message;
  counts.textContent = `${report.observedEvents} events; ${report.droppedEvents} dropped. Browser-dispatched copy/cut/paste: ${report.trustedClipboardEvents.copy}/${report.trustedClipboardEvents.cut}/${report.trustedClipboardEvents.paste}.`;
}

const eventKinds: readonly ManualEventKind[] = [
  "copy", "cut", "paste", "beforeinput", "input", "compositionstart", "compositionend",
];
for (const kind of eventKinds) {
  host.addEventListener(kind, event => {
    if (editor) recorder.observe(editor.getSnapshot());
    // Never read data, clipboardData, target text/HTML, form values, or key values.
    const sequence = recorder.begin(kind, event.isTrusted, event instanceof InputEvent ? event.inputType : null);
    // A microtask from a native capture listener may precede later listeners.
    // Observe cancellation after the dispatch task, not mid-propagation.
    setTimeout(() => {
      if (editor) recorder.observe(editor.getSnapshot());
      recorder.settle(sequence, event.defaultPrevented);
      refresh();
    }, 0);
  }, { capture: true });
}

for (const check of MANUAL_CHECKS) {
  const input = checks.querySelector<HTMLInputElement>(`[data-check="${check}"]`)!;
  input.addEventListener("change", () => { recorder.confirm(check, input.checked); refresh(); });
}

document.querySelector("#capture-report")!.addEventListener("click", () => {
  if (editor) recorder.observe(editor.getSnapshot());
  output.value = JSON.stringify({
    ...recorder.report(),
    environment: { userAgent: navigator.userAgent, platform: navigator.platform },
  }, null, 2);
});

try {
  await initializeWasm();
  const opened = await openBreditorBrowserEditor({
    host, label: "Manual clipboard editor", wasm: breditorWasm,
    initialDocument: {
      lineageId: "manual-clipboard-qualification",
      documentJson: createReferenceFormattingDocumentJson("Breditor 🙂 clipboard", {
        highlighted: true, link: { href: "https://example.test/original", openInNewWindow: false },
      }),
      historyCapacity: 100,
    },
    semanticProfile: { bootstrapJson: REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON, formatVersion: 2 },
    rendering: REFERENCE_FORMATTING_RENDER_MANIFEST,
    keyboard: {
      editing: "beforeinputPrimary",
      primaryModifier: /Mac|iPhone|iPad|iPod/u.test(navigator.platform) ? "meta" : "control",
      shortcuts: "enabled",
    },
    toolbar: { host: toolbar, manifest: REFERENCE_FORMATTING_TOOLBAR_MANIFEST },
  });
  if (opened.ok) {
    editor = opened.editor;
    recorder.observe(editor.getSnapshot());
    editor.subscribe(() => { recorder.observe(editor!.getSnapshot()); refresh(); });
    checks.disabled = false;
  } else recorder.startupFailed();
} catch {
  // Startup errors may contain host data. Retain only a fixed failure classification.
  recorder.startupFailed();
}
refresh();
