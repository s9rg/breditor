import initialize, * as wasm from "@breditor/wasm";
import { openBreditorBrowserEditor } from "@breditor/browser";
import {
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_FORMATTING_SAMPLE_DOCUMENT_JSON,
  REFERENCE_FORMATTING_RENDER_MANIFEST,
  REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT_JSON,
  REFERENCE_COLOR_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
  REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST,
} from "@breditor/reference-highlight";

/**
 * Exercises the complete public startup/disposal boundary with fresh compiled
 * profiles and engine owners. Alternating typed profiles prevents this from
 * testing only repeated reads of a single descriptor. This does not simulate
 * React, reloads, persistence, or trusted system clipboard events.
 */
export async function probeProfileOwnerLifetimes(iterations: number): Promise<{ iterations: number }> {
  await initialize();
  const profiles = [
    [REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON, REFERENCE_FORMATTING_SAMPLE_DOCUMENT_JSON, REFERENCE_FORMATTING_RENDER_MANIFEST],
    [REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP_JSON, REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT_JSON, REFERENCE_COLOR_SHOWCASE_RENDER_MANIFEST],
    [REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON, REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT_JSON, REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST],
  ] as const;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const variant = iteration % profiles.length;
    const [bootstrapJson, documentJson, rendering] = profiles[variant]!;
    const host = document.createElement("div");
    document.body.append(host);
    try {
      const result = await openBreditorBrowserEditor({
        host,
        label: "Profile lifecycle probe",
        wasm,
        initialDocument: { lineageId: `profile-lifecycle-${iteration}`, documentJson, historyCapacity: 10 },
        semanticProfile: { bootstrapJson, formatVersion: 2 },
        rendering,
        keyboard: { editing: "beforeinputPrimary", primaryModifier: "control", shortcuts: "disabled" },
      });
      if (!result.ok) {
        throw new Error(`profile owner rejected iteration=${iteration} variant=${variant}: ${result.error.code}/${result.error.causeCode ?? "none"}`);
      }
      try {
        if (result.editor.getSnapshot().status.phase !== "live") throw new Error(`owner is not live at ${iteration}`);
        const exported = result.editor.exportContent("documentJson");
        if (!exported.ok || exported.value !== documentJson) throw new Error(`initial document differs at ${iteration}`);
      } finally {
        result.editor.dispose();
      }
    } finally {
      host.remove();
    }
    if (iteration % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { iterations };
}
