import type {
  BreditorActionStateSnapshot,
  BreditorActionStatesResult,
  BreditorCommandResult,
  BreditorEngine,
  BreditorEngineResult,
  BreditorObservation,
  BreditorProjection,
  BreditorProjectionResult,
  BreditorProjectionUpdate,
  BreditorSelection,
  BreditorSelectionResult,
  BreditorStringResult,
} from "../../../crates/breditor-wasm/api/breditor_wasm.js";

import type {
  WasmBootstrappedEngineView,
  WasmEngineBootstrapFactoryView,
  WasmEngineBootstrapResultView,
  WasmProjectionReadResultView,
} from "../src/wasm_engine_bootstrap.js";

import type {
  WasmEngineRestoreFactoryView,
  WasmEngineRestoreResultView,
  WasmRestoredEngineView,
} from "../src/wasm_engine_restore.js";
import type {
  WasmCommandEngineView,
  WasmCommandObservationView,
  WasmCommandResultView,
  WasmSelectionResultView,
} from "../src/wasm_command_adapter.js";
import type { WasmDocumentJsonStringResultView } from "../src/wasm_document_json.js";
import type {
  WasmActionStateSnapshotView,
  WasmActionStateStringResultView,
  WasmActionStatesResultView,
} from "../src/wasm_action_state_adapter.js";
import type {
  SemanticProjectionUpdateView,
  SemanticProjectionView,
} from "../src/wasm_projection_adapter.js";
import type {
  SemanticRangeSelectionScalars,
  SemanticSelectionView,
} from "../src/wasm_selection_adapter.js";

declare const generatedProjection: BreditorProjection;
declare const generatedProjectionResult: BreditorProjectionResult;
declare const generatedUpdate: BreditorProjectionUpdate;
declare const generatedSelection: BreditorSelection;
declare const generatedEngine: BreditorEngine;
declare const generatedEngineFactory: typeof BreditorEngine;
declare const generatedEngineResult: BreditorEngineResult;
declare const generatedObservation: BreditorObservation;
declare const generatedCommandResult: BreditorCommandResult;
declare const generatedSelectionResult: BreditorSelectionResult;
declare const generatedActionStateSnapshot: BreditorActionStateSnapshot;
declare const generatedActionStatesResult: BreditorActionStatesResult;
declare const generatedStringResult: BreditorStringResult;
declare const semanticScalars: SemanticRangeSelectionScalars;

const semanticProjection: SemanticProjectionView = generatedProjection;
const semanticUpdate: SemanticProjectionUpdateView = generatedUpdate;
const semanticSelection: SemanticSelectionView = generatedSelection;
const commandEngine: WasmCommandEngineView = generatedEngine;
const restoredEngine: WasmRestoredEngineView = generatedEngine;
const bootstrappedEngine: WasmBootstrappedEngineView = generatedEngine;
const bootstrapFactory: WasmEngineBootstrapFactoryView = generatedEngineFactory;
const bootstrapResult: WasmEngineBootstrapResultView = generatedEngineResult;
const projectionReadResult: WasmProjectionReadResultView = generatedProjectionResult;
const restoreFactory: WasmEngineRestoreFactoryView = generatedEngineFactory;
const restoreResult: WasmEngineRestoreResultView = generatedEngineResult;
const commandObservation: WasmCommandObservationView = generatedObservation;
const commandResult: WasmCommandResultView = generatedCommandResult;
const selectionResult: WasmSelectionResultView = generatedSelectionResult;
const actionStateSnapshot: WasmActionStateSnapshotView = generatedActionStateSnapshot;
const actionStatesResult: WasmActionStatesResultView = generatedActionStatesResult;
const actionStateStringResult: WasmActionStateStringResultView = generatedStringResult;
const documentJsonResult: WasmDocumentJsonStringResultView =
  generatedEngine.documentJson(generatedObservation);

generatedEngine.setRangeSelection(
  generatedObservation,
  semanticScalars.anchorPointKind,
  semanticScalars.anchorNodeIndex,
  semanticScalars.anchorOffset,
  semanticScalars.anchorAffinity,
  semanticScalars.focusPointKind,
  semanticScalars.focusNodeIndex,
  semanticScalars.focusOffset,
  semanticScalars.focusAffinity,
);

void semanticProjection;
void semanticUpdate;
void semanticSelection;
void commandEngine;
void restoredEngine;
void bootstrappedEngine;
void bootstrapFactory;
void bootstrapResult;
void projectionReadResult;
void restoreFactory;
void restoreResult;
void commandObservation;
void commandResult;
void selectionResult;
void actionStateSnapshot;
void actionStatesResult;
void actionStateStringResult;
void documentJsonResult;
