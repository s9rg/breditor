import type {
  BreditorEngine,
  BreditorObservation,
  BreditorProjection,
  BreditorProjectionUpdate,
  BreditorSelection,
} from "../../../crates/breditor-wasm/api/breditor_wasm.js";

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
declare const semanticScalars: SemanticRangeSelectionScalars;

const semanticProjection: SemanticProjectionView = generatedProjection;
const semanticUpdate: SemanticProjectionUpdateView = generatedUpdate;
const semanticSelection: SemanticSelectionView = generatedSelection;

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
