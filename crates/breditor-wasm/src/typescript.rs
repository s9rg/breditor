use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen(typescript_custom_section)]
const TYPESCRIPT_TYPES: &str = r#"
/** Outcome of one guarded editor command. */
export type BreditorCommandStatus = "committed" | "disabled" | "unchanged" | "error";

/** Kind of sealed event published by the editor engine. */
export type BreditorEngineEventKind = "action" | "selection" | "undo" | "redo" | "closeHistoryGroup" | "clearHistory";

/** Availability/selection state reported by an action indicator. */
export type BreditorActionActivation = "stateless" | "inactive" | "active" | "mixed";

/** Value state reported by an action indicator. */
export type BreditorActionStateValueStatus = "unsupported" | "unset" | "uniform" | "mixed";

/** Lifecycle state of an engine-construction result. */
export type BreditorEngineResultStatus = "engine" | "taken" | "error";

/** Lifecycle state of a fallible string-producing result. */
export type BreditorStringResultStatus = "value" | "taken" | "absent" | "error";

/** Lifecycle state of a non-JSON projection result. */
export type BreditorProjectionResultStatus = "projection" | "taken" | "error";

/** Structural kind of one flattened semantic projection node. */
export type BreditorProjectionNodeKind = "element" | "text";

/** Conservative DOM invalidation derived from one proved commit. */
export type BreditorProjectionImpact = "none" | "textContainers" | "rootSplice" | "root";
"#;
