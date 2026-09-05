import type {
  BreditorProjection,
  BreditorProjectionUpdate,
} from "../../../crates/breditor-wasm/api/breditor_wasm.js";

import type {
  SemanticProjectionUpdateView,
  SemanticProjectionView,
} from "../src/wasm_projection_adapter.js";

declare const generatedProjection: BreditorProjection;
declare const generatedUpdate: BreditorProjectionUpdate;

const semanticProjection: SemanticProjectionView = generatedProjection;
const semanticUpdate: SemanticProjectionUpdateView = generatedUpdate;

void semanticProjection;
void semanticUpdate;
