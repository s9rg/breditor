import { openBreditorBrowserEditor, type BreditorBrowserEditorOptions, type BreditorBrowserEditorOpenResult, type ToolbarManifest } from "@breditor/browser";
import type { WasmEngineBootstrapModuleView } from "@breditor/browser/advanced";
import {
  REFERENCE_SIZE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  REFERENCE_SIZE_SHOWCASE_LINEAGE_ID,
  REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
  REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST,
} from "@breditor/reference-highlight";

/** Build-time demo configuration; never infer a profile from imported backup bytes. */
type WithoutSemanticProfile<T> = T extends unknown ? Omit<T, "semanticProfile"> : never;
export type DemoEditorOptions = WithoutSemanticProfile<BreditorBrowserEditorOptions>;
export type DemoProfile = Required<Pick<BreditorBrowserEditorOptions, "rendering" | "keyboardShortcuts">> & {
  /** Profile and owner mode are bound together before any backup is inspected. */
  readonly openEditor: (options: DemoEditorOptions) => Promise<BreditorBrowserEditorOpenResult>;
  readonly lineageId: string;
  readonly documentJson: string;
  readonly persistenceSlot: string;
  readonly toolbar: ToolbarManifest;
};

/** The default demo keeps its existing schema, wire generation and storage slot. */
export function createDemoProfile(_wasm: WasmEngineBootstrapModuleView): DemoProfile {
  return {
    lineageId: REFERENCE_SIZE_SHOWCASE_LINEAGE_ID,
    documentJson: REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
    persistenceSlot: "breditor.react-reference-size-showcase.v1",
    openEditor: options => openBreditorBrowserEditor({...options,
      semanticProfile: { bootstrapJson: REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON, formatVersion: 2 }}),
    rendering: REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST,
    keyboardShortcuts: REFERENCE_SIZE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
    toolbar: REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST,
  };
}
