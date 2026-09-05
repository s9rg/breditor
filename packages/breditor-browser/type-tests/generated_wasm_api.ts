import type {
  BreditorActionStateSnapshot,
  BreditorActionStatesResult,
  BreditorCommandResult,
  BreditorEngine,
  BreditorObservation,
  BreditorProjection,
  BreditorProjectionUpdate,
  BreditorSelection,
  BreditorSelectionResult,
  BreditorStringResult,
} from "../../../crates/breditor-wasm/api/breditor_wasm.js";

import type {
  WasmCommandEngineView,
  WasmCommandObservationView,
  WasmCommandResultView,
  WasmSelectionResultView,
} from "../src/wasm_command_adapter.js";
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
declare const generatedUpdate: BreditorProjectionUpdate;
declare const generatedSelection: BreditorSelection;
declare const generatedEngine: BreditorEngine;
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
const commandObservation: WasmCommandObservationView = generatedObservation;
const commandResult: WasmCommandResultView = generatedCommandResult;
const selectionResult: WasmSelectionResultView = generatedSelectionResult;
const actionStateSnapshot: WasmActionStateSnapshotView = generatedActionStateSnapshot;
const actionStatesResult: WasmActionStatesResultView = generatedActionStatesResult;
const actionStateStringResult: WasmActionStateStringResultView = generatedStringResult;

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
void commandObservation;
void commandResult;
void selectionResult;
void actionStateSnapshot;
void actionStatesResult;
void actionStateStringResult;
