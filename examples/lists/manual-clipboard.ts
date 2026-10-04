// Disposable list-mode qualification entry point; no autosave or input shim.
import type { BreditorBrowserEditor } from "@breditor/browser";
import initializeWasm, * as wasm from "@breditor/wasm";
import { createDemoProfile } from "./profile.js";
import { MANUAL_CHECKS, ManualClipboardRecorder, type ManualEventKind } from "../../tests/browser/harness/manual_clipboard_recorder.js";
import "../react/src/styles.css";
import "./styles.css";
import "./manual-clipboard.css";

declare const __BREDITOR_FLAT_LIST_WASM_SHA256__: string;
const host = document.querySelector<HTMLElement>("#editor")!;
const toolbar = document.querySelector<HTMLElement>("#toolbar")!;
const status = document.querySelector<HTMLElement>("#status")!;
const checks = document.querySelector<HTMLFieldSetElement>("#checks")!;
const output = document.querySelector<HTMLTextAreaElement>("#report")!;
const recorder = new ManualClipboardRecorder();
let editor: BreditorBrowserEditor | undefined;

function refresh(): void {
  const report = recorder.report();
  status.textContent = `${report.owner.phase} · ${report.outcome}`;
  document.querySelector("#counts")!.textContent = `${report.observedEvents} events; ${report.droppedEvents} dropped. Browser-dispatched copy/cut/paste: ${report.trustedClipboardEvents.copy}/${report.trustedClipboardEvents.cut}/${report.trustedClipboardEvents.paste}.`;
}

const eventKinds: readonly ManualEventKind[] = ["copy", "cut", "paste", "beforeinput", "input", "compositionstart", "compositionend"];
for (const kind of eventKinds) {
  host.addEventListener(kind, event => {
    if (editor) recorder.observe(editor.getSnapshot());
    // Do not inspect text, HTML, clipboardData, event.data, keys or form values.
    const sequence = recorder.begin(kind, event.isTrusted, event instanceof InputEvent ? event.inputType : null);
    setTimeout(() => {
      if (editor) recorder.observe(editor.getSnapshot());
      recorder.settle(sequence, event.defaultPrevented);
      refresh();
    }, 0);
  }, {capture: true});
}
for (const check of MANUAL_CHECKS) {
  const input = checks.querySelector<HTMLInputElement>(`[data-check="${check}"]`)!;
  input.addEventListener("change", () => { recorder.confirm(check, input.checked); refresh(); });
}
document.querySelector("#capture-report")!.addEventListener("click", () => {
  if (editor) recorder.observe(editor.getSnapshot());
  output.value = JSON.stringify({
    ...recorder.report(),
    fixture: {name: "flat-list-showcase", schema: "example/flat-list-showcase", sessionFormatVersion: 6,
      wasmSha256: __BREDITOR_FLAT_LIST_WASM_SHA256__},
    environment: {userAgent: navigator.userAgent, platform: navigator.platform},
  }, null, 2);
});

try {
  await initializeWasm();
  const profile = createDemoProfile(wasm);
  const opened = await profile.openEditor({
    host, label: "Manual list clipboard editor", wasm,
    initialDocument: {lineageId: "manual-flat-list-qualification", documentJson: profile.documentJson, historyCapacity: 100},
    rendering: profile.rendering, keyboardShortcuts: profile.keyboardShortcuts,
    toolbar: {host: toolbar, manifest: profile.toolbar},
    keyboard: {editing: "beforeinputPrimary", shortcuts: "enabled",
      primaryModifier: /Mac|iPhone|iPad|iPod/u.test(navigator.platform) ? "meta" : "control"},
  });
  if (opened.ok) {
    editor = opened.editor;
    recorder.observe(editor.getSnapshot());
    editor.subscribe(() => { recorder.observe(editor!.getSnapshot()); refresh(); });
    checks.disabled = false;
    window.addEventListener("pagehide", () => editor?.dispose(), {once: true});
  } else recorder.startupFailed();
} catch {
  // Keep error payloads out of the shareable report.
  recorder.startupFailed();
}
refresh();
