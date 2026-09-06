import initialize, {
  BreditorEngine,
  type BreditorCommandStatus,
} from "@breditor/wasm";
import * as breditorWasm from "@breditor/wasm";
import {
  openBreditorBrowserEditor,
  type BreditorBrowserDocumentSnapshot,
  type BreditorBrowserEditorOptions,
  type BreditorBrowserEditorOpenResult,
  type BreditorBrowserEditorPersistenceOptions,
  type BreditorBrowserEditorSnapshot,
  type BreditorBrowserWasmFactory,
  type BreditorBrowserWasmModule,
} from "@breditor/browser";
import {
  BaseDocumentProjection,
  type BrowserProjectionResult,
} from "@breditor/browser/advanced";

const initializer: typeof initialize = initialize;
const engineConstructor: typeof BreditorEngine = BreditorEngine;
const status: BreditorCommandStatus = "committed";
const browserOpener: typeof openBreditorBrowserEditor = openBreditorBrowserEditor;
type BrowserOpenResult = BreditorBrowserEditorOpenResult;
type BrowserOptions = BreditorBrowserEditorOptions;
type BrowserPersistence = BreditorBrowserEditorPersistenceOptions;
type BrowserSnapshot = BreditorBrowserEditorSnapshot;
const documentSnapshot: BreditorBrowserDocumentSnapshot = {
  lineage: "package-smoke",
  revision: "0",
};
const browserWasmFactory: BreditorBrowserWasmFactory = BreditorEngine;
const browserWasmModule: BreditorBrowserWasmModule = breditorWasm;
const projectionResult: BrowserProjectionResult<BaseDocumentProjection> =
  BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "package-smoke", revision: "0" },
    paragraphs: [{ runs: [] }],
  });

void initializer;
void engineConstructor;
void status;
void browserOpener;
void (null as BrowserOpenResult | null);
void (null as BrowserOptions | null);
void (null as BrowserPersistence | null);
void (null as BrowserSnapshot | null);
void documentSnapshot;
void browserWasmFactory;
void browserWasmModule;
void projectionResult;
