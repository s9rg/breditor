import initialize, * as wasm from "@breditor/wasm";
import { openBreditorBrowserEditor } from "@breditor/browser";
import {
  createReferenceHighlightDocumentJson,
  REFERENCE_HIGHLIGHT_IDS,
  REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
} from "@breditor/reference-highlight";

/** Known preflight rejection, not a reproduction of the intermittent defect. */
export async function probeDetachedDelivery() {
  await initialize();
  const host = document.createElement("div");
  document.body.append(host);
  const opened = await openBreditorBrowserEditor({
    host, label: "Delivery diagnostic control", wasm,
    initialDocument: { lineageId: "delivery-diagnostic-control",
      documentJson: createReferenceHighlightDocumentJson("control"), historyCapacity: 10 },
    semanticProfile: { bootstrapJson: REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON },
    rendering: REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
    keyboard: { editing: "beforeinputPrimary", primaryModifier: "control", shortcuts: "disabled" },
  });
  if (!opened.ok) {
    host.remove();
    throw new Error(`control owner failed to open: ${opened.error.code}/${opened.error.causeCode ?? "none"}`);
  }
  try {
    host.remove(); // Deliberately violate the connected-host preflight invariant.
    const outcome = opened.editor.executeIntent(REFERENCE_HIGHLIGHT_IDS.intentId);
    return { outcome: outcome.status, owner: opened.editor.getStatus() };
  } finally {
    opened.editor.dispose();
    host.remove();
  }
}
