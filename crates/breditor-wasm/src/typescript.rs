use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen(typescript_custom_section)]
const TYPESCRIPT_TYPES: &str = r#"
/** Outcome of one guarded editor command. */
export type BreditorCommandStatus = "committed" | "disabled" | "unchanged" | "error";

/** Outcome of one guarded semantic-intent execution. */
export type BreditorIntentResultStatus = "committed" | "blocked" | "unhandled" | "error";

/** Kind of sealed event published by the editor engine. */
export type BreditorEngineEventKind = "action" | "selection" | "undo" | "redo" | "closeHistoryGroup" | "clearHistory";

/** Availability/selection state reported by an action indicator. */
export type BreditorActionActivation = "stateless" | "inactive" | "active" | "mixed";

/** Value state reported by an action indicator. */
export type BreditorActionStateValueStatus = "unsupported" | "unset" | "uniform" | "mixed";

/** Lifecycle and cache relationship of one guarded action-state read. */
export type BreditorActionStatesResultStatus = "full" | "unchanged" | "delta" | "taken" | "error";

/** Authoritative outcome of one observable action-state entry. */
export type BreditorActionStateEntryStatus = "enabled" | "disabled" | "blocked" | "unhandled" | "fault";

/** Lifecycle state of an engine-construction result. */
export type BreditorEngineResultStatus = "engine" | "taken" | "error";

/** Lifecycle state of a compiled-profile bootstrap result. */
export type BreditorCompiledProfileResultStatus = "profile" | "taken" | "error";

/** Cross-language input envelope admitted by one semantic intent. */
export type BreditorProfileIntentInputKind = "none" | "typed";

/** Semantic source evaluated by one action-state entry. */
export type BreditorProfileActionStateSourceKind = "direct" | "routed" | "history";

/** Selection-sensitive activation shape promised by a profile contract. */
export type BreditorProfileActivationContract = "stateless" | "tracked";

/** Linear-history relationship of one profile state entry. */
export type BreditorProfileHistoryDirection = "undo" | "redo";

/** Lifecycle state of a fallible string-producing result. */
export type BreditorStringResultStatus = "value" | "taken" | "absent" | "error";

/** Lifecycle state of a non-JSON projection result. */
export type BreditorProjectionResultStatus = "projection" | "taken" | "error";

/** Structural kind of one flattened semantic projection node. */
export type BreditorProjectionNodeKind = "element" | "text";

/** Conservative DOM invalidation derived from one proved commit. */
export type BreditorProjectionImpact = "none" | "textContainers" | "rootSplice" | "root";

/** Lifecycle state of a guarded semantic-selection read. */
export type BreditorSelectionResultStatus = "selection" | "taken" | "error";

/** Selection kind supported by the first browser boundary. */
export type BreditorSelectionKind = "none" | "range";

/** Structural point kind used by a range-selection endpoint. */
export type BreditorSelectionPointKind = "text" | "children";

/** Ownership side of content inserted at an exact point boundary. */
export type BreditorSelectionAffinity = "before" | "after";

/** Spatial order of a directional range selection. */
export type BreditorSelectionRangeOrder = "collapsed" | "forward" | "backward";
"#;
