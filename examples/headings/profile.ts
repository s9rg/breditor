import { createToolbarManifest, openBreditorBrowserEditor } from "@breditor/browser";
import { preflightWasmSemanticProfile, type WasmEngineBootstrapModuleView } from "@breditor/browser/advanced";
import {
  REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP,
  REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_SIZE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST,
} from "@breditor/reference-highlight";
import type { DemoProfile } from "../react/src/demoProfile.js";

const schema = Object.freeze({ name: "example/heading-showcase", version: 1 });
const semanticProfile = Object.freeze({ formatVersion: 3 as const, bootstrapJson: JSON.stringify({
  format: "breditor/profile-bootstrap", formatVersion: 3, schema,
  extensions: REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP.extensions,
}) });
const toolbar = createToolbarManifest({
  label: "Heading and formatting controls",
  controls: [
    ...["paragraph", "heading-1", "heading-2", "heading-3", "heading-4", "heading-5", "heading-6"].map((kind, index) => ({
      kind: "button", stateId: `breditor/control-${kind}`, label: index === 0 ? "Paragraph" : `Heading ${index}`,
      activation: "tracked", group: "block", command: { kind: "intent", intentId: `breditor/format-${kind}` },
    })),
    ...REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST.controls,
  ],
});

/** Explicit experimental profile; no relabeling or migration of saved sessions. */
export function createDemoProfile(wasm: WasmEngineBootstrapModuleView): DemoProfile {
  const compiled = preflightWasmSemanticProfile(wasm, semanticProfile);
  if (!compiled.ok) throw new Error(`Heading profile rejected: ${compiled.error.code}`);
  const block = (text: string, level?: number) => ({
    kind: "element", type: level === undefined ? "breditor/paragraph" : "breditor/heading", entityId: null,
    properties: level === undefined ? {} : { "breditor/level": level },
    children: [{ kind: "text", text, formats: [] }],
  });
  return {
    openEditor: options => openBreditorBrowserEditor({...options, semanticProfile}), toolbar,
    rendering: REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST,
    keyboardShortcuts: REFERENCE_SIZE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
    lineageId: "breditor-heading-showcase",
    persistenceSlot: "breditor.experimental-heading-showcase.v1",
    documentJson: JSON.stringify({
      format: "breditor/document", formatVersion: 2, schema, schemaFingerprint: compiled.profileDescriptor.schema.fingerprint,
      root: { kind: "element", type: "breditor/document", entityId: null, properties: {}, children: [
        block("Give your words structure", 2),
        block("Choose a heading, keep typing, and try bold, links, colors and sizes together. Undo restores every change. 🙂"),
        block("Enter at the end of a heading starts a paragraph. Enter in the middle splits it into two headings."),
      ] },
    }),
  };
}
