import { createToolbarManifest } from "@breditor/browser";
import { BreditorBrowserEditor } from "../../packages/breditor-browser/src/browser_editor.js";
import { FLAT_LIST_TOOLBAR_MANIFEST } from "../../packages/breditor-browser/src/flat_list_toolbar_manifest.js";
import { preflightFlatListWasmSemanticProfile, type WasmEngineBootstrapModuleView } from "../../packages/breditor-browser/src/wasm_engine_bootstrap.js";
import {
  REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP,
  REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_SIZE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST,
} from "@breditor/reference-highlight";
import type { DemoProfile } from "../react/src/demoProfile.js";

const schema = Object.freeze({name: "example/flat-list-showcase", version: 1});
const semanticProfile = Object.freeze({formatVersion: 4 as const, bootstrapJson: JSON.stringify({
  format: "breditor/profile-bootstrap", formatVersion: 4, schema,
  extensions: REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP.extensions,
})});
const toolbar = createToolbarManifest({label: "List, heading and formatting controls", controls: [
  ...FLAT_LIST_TOOLBAR_MANIFEST.controls.filter(control => control.group === "blocks" || control.group === "lists"),
  ...REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST.controls,
]});

/** Fixed experimental mode and separate storage identity; never inferred from a file. */
export function createDemoProfile(wasm: WasmEngineBootstrapModuleView): DemoProfile {
  const checked = preflightFlatListWasmSemanticProfile(wasm, semanticProfile);
  if (!checked.ok) throw new Error(`List profile rejected: ${checked.error.code}`);
  const element = (type: string, children: unknown[], properties = {}) => ({
    kind: "element", type: `breditor/${type}`, entityId: null, properties, children,
  });
  const block = (text: string, level?: number) => element(level ? "heading" : "paragraph",
    [{kind: "text", text, formats: []}], level ? {"breditor/level": level} : {});
  const item = (text: string) => element("list-item", [block(text)]);
  return {
    openEditor: options => BreditorBrowserEditor.openFlatLists({...options, semanticProfile}),
    toolbar, rendering: REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST,
    keyboardShortcuts: REFERENCE_SIZE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
    lineageId: "breditor-flat-list-showcase", persistenceSlot: "breditor.experimental-flat-list-showcase.v1",
    documentJson: JSON.stringify({format: "breditor/document", formatVersion: 2, schema,
      schemaFingerprint: checked.profileDescriptor.schema.fingerprint,
      root: element("document", [block("Make room for your ideas", 2),
        block("Headings, flat lists, and inline formatting share one Rust history. Try an edit, undo it, and reload. 🙂"),
        element("bullet-list", [item("Collect your ideas"), item("Keep the details together")]),
        element("ordered-list", [item("Write a first draft"), item("Review and refine")], {"breditor/start": 3}),
        block("Select blocks and choose Bullet list, Numbered list, or Remove list.")]),
    }),
  };
}
