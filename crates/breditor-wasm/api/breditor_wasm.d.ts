/* tslint:disable */
/* eslint-disable */

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



/**
 * Structured result of one guarded editor command.
 *
 * `status` is exactly `committed`, `disabled`, `unchanged`, or `error`.
 * Every non-error result owns the exact observation to present with the next
 * queued command. A committed result retains its sealed core event until this
 * JavaScript object is freed.
 */
export class BreditorCommandResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Separately encodes the retained commit, if this outcome has one.
     *
     * Encoding is intentionally not part of command publication. `absent`
     * means the outcome is disabled/unchanged or its effective event is a
     * history-only control. `error` means publication succeeded but Commit V1
     * could not be represented within the active codec budget.
     */
    commitJson(): BreditorStringResult;
    /**
     * Separately encodes optional disabled-reason detail as JSON.
     */
    disabledReasonDetailJson(): BreditorStringResult;
    /**
     * Separately encodes a uniform disabled indicator value as JSON.
     */
    indicatorValueJson(): BreditorStringResult;
    /**
     * Returns the exact successor observation for every non-error outcome.
     */
    observation(): BreditorObservation | undefined;
    /**
     * Returns a commit-derived renderer update for a commit-bearing outcome.
     *
     * Disabled, unchanged, error, and effective history-only outcomes return
     * `undefined`. The update owns an independently disposable final non-JSON
     * projection and carries exact source/result snapshot correlation.
     */
    projectionUpdate(): BreditorProjectionUpdate | undefined;
    /**
     * Returns the disabled outcome's activation: `stateless`, `inactive`,
     * `active`, or `mixed`.
     */
    readonly activation: BreditorActionActivation | undefined;
    /**
     * Returns the action identity for a disabled action outcome.
     */
    readonly disabledActionId: string | undefined;
    /**
     * Returns the stable reason code for a disabled action outcome.
     */
    readonly disabledReasonCode: string | undefined;
    /**
     * Returns the structured command error, when present.
     */
    readonly error: BreditorError | undefined;
    /**
     * Returns the sealed engine-event kind for a committed command.
     */
    readonly eventKind: BreditorEngineEventKind | undefined;
    /**
     * Returns the disabled indicator value-contract name, when supported.
     */
    readonly indicatorValueContractName: string | undefined;
    /**
     * Returns the disabled indicator value-contract version, when supported.
     */
    readonly indicatorValueContractVersion: number | undefined;
    /**
     * Returns the disabled indicator value state: `unsupported`, `unset`,
     * `uniform`, or `mixed`.
     */
    readonly indicatorValueStatus: BreditorActionStateValueStatus | undefined;
    /**
     * Returns `committed`, `disabled`, `unchanged`, or `error`.
     */
    readonly status: BreditorCommandStatus;
}

/**
 * Exclusive JavaScript-visible owner of one guarded Breditor editor engine.
 *
 * The generated TypeScript declaration has a private constructor; only
 * [`Self::from_document_json`] and [`Self::from_session_checkpoint_json`]
 * produce a usable handle. Its methods are synchronous and it cannot be
 * transferred between workers. Well-typed calls on live handles return domain
 * failures as result data; raw JavaScript type or lifecycle misuse can throw
 * in generated glue before Rust runs.
 */
export class BreditorEngine {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Clears retained undo and redo history after exact observation checks.
     *
     * Clearing already-empty history is an `unchanged` outcome. Domain
     * rejection is returned in the structured result for live typed handles.
     */
    clearHistory(expected: BreditorObservation): BreditorCommandResult;
    /**
     * Closes an open history merge group after exact observation checks.
     *
     * A repeated close is an `unchanged` outcome. Domain rejection is returned
     * in the structured result for live typed handles.
     */
    closeHistoryGroup(expected: BreditorObservation): BreditorCommandResult;
    /**
     * Executes one registered action whose descriptor accepts no input.
     *
     * The observation is checked before action parsing and checked again by
     * the authoritative core mutation. Domain rejection is returned in the
     * structured result for live typed handles.
     */
    executeNoInputAction(expected: BreditorObservation, action_id: string): BreditorCommandResult;
    /**
     * Executes one registered string-input action.
     *
     * The adapter derives the exact registered input contract instead of
     * allowing JavaScript to choose a contract or version. The observation is
     * checked before input admission and checked again by the core mutation.
     * Domain rejection is returned in the structured result for live typed
     * handles.
     */
    executeStringAction(expected: BreditorObservation, action_id: string, value: string): BreditorCommandResult;
    /**
     * Creates a history-free base-schema engine from strict Document V1 JSON.
     *
     * The host must provide a unique portable lineage for this independent
     * editor history. Initial selection and pending formats are absent.
     * `history_capacity` may be `0..=100`, matching the checkpoint admission
     * policy used by export and restoration. Domain rejection is returned in
     * the structured result after generated glue has admitted the arguments.
     */
    static fromDocumentJson(lineage: string, document_json: string, history_capacity: number): BreditorEngineResult;
    /**
     * Restores a base-schema engine from strict Session Checkpoint V1 JSON.
     *
     * Restoration preserves durable state and linear-history behavior but
     * intentionally creates fresh process-local history and engine identities.
     * Domain rejection is returned in the structured result after generated
     * glue has admitted the argument.
     */
    static fromSessionCheckpointJson(checkpoint_json: string): BreditorEngineResult;
    /**
     * Captures the exact engine, state, and history observation required by a
     * later command.
     */
    observation(): BreditorObservation;
    /**
     * Reads a deterministic non-JSON view of the exact current document.
     *
     * The complete engine, snapshot, and history observation is checked before
     * projection. A stale observation returns a structured, payload-redacting
     * error and the engine remains unchanged.
     */
    projection(expected: BreditorObservation): BreditorProjectionResult;
    /**
     * Replays the nearest redo entry after exact observation checks.
     *
     * Unavailable redo is an `unchanged` outcome. Domain rejection is returned
     * in the structured result for live typed handles.
     */
    redo(expected: BreditorObservation): BreditorCommandResult;
    /**
     * Encodes current state and retained linear history as Session Checkpoint
     * V1 JSON.
     *
     * The checkpoint was encoded before its session became authoritative, so
     * a live engine always returns a successful clone of the cached canonical
     * bytes. Allocation failure remains a WebAssembly trap rather than a
     * structured domain error.
     */
    sessionCheckpointJson(): BreditorStringResult;
    /**
     * Encodes the current immutable editor state as Editor State V1 JSON.
     *
     * This does not include undo/redo history. Encoding is a separate fallible
     * read, returns a structured result for a live handle, and never changes
     * the engine.
     */
    stateJson(): BreditorStringResult;
    /**
     * Replays the nearest undo entry after exact observation checks.
     *
     * Unavailable undo is an `unchanged` outcome. Domain rejection is returned
     * in the structured result for live typed handles.
     */
    undo(expected: BreditorObservation): BreditorCommandResult;
}

/**
 * Structured result of constructing a Wasm editor engine.
 *
 * A successful engine can be taken exactly once with [`Self::take_engine`].
 */
export class BreditorEngineResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Removes and returns the successful engine exactly once.
     */
    takeEngine(): BreditorEngine | undefined;
    /**
     * Returns the structured construction error, when present.
     */
    readonly error: BreditorError | undefined;
    /**
     * Returns `engine`, `taken`, or `error`.
     */
    readonly status: BreditorEngineResultStatus;
}

/**
 * Structured, stable, payload-redacting error returned by the Wasm boundary.
 *
 * Only the machine-readable code and a fixed message cross the boundary. Rust
 * source errors, document text, action input, and codec diagnostics are never
 * forwarded through this type.
 */
export class BreditorError {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns the stable machine-readable failure code.
     */
    readonly code: string;
    /**
     * Returns a fixed payload-free human-readable summary.
     */
    readonly message: string;
}

/**
 * Opaque, process-local observation required by every editor command.
 *
 * Only the engine and command results produce usable instances; a raw
 * JavaScript `new BreditorObservation()` creates an inert zero handle. Visible
 * fields are diagnostics only; the hidden Rust value also contains exact
 * engine and history identities. Retaining an old live value is safe because
 * the core rejects it after state, history, or engine ownership changes.
 */
export class BreditorObservation {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns whether a redo entry was available in this observation.
     */
    readonly canRedo: boolean;
    /**
     * Returns whether an undo entry was available in this observation.
     */
    readonly canUndo: boolean;
    /**
     * Returns the configured retained-history entry capacity.
     */
    readonly historyCapacity: number;
    /**
     * Returns the number of currently redoable entries.
     */
    readonly redoDepth: number;
    /**
     * Returns the snapshot lineage as a portable string.
     */
    readonly snapshotLineage: string;
    /**
     * Returns the full-width snapshot revision as a decimal string.
     *
     * A string is used because Rust `u64` revisions can exceed JavaScript's
     * exactly representable integer range.
     */
    readonly snapshotRevision: string;
    /**
     * Returns the number of currently undoable entries.
     */
    readonly undoDepth: number;
}

/**
 * Snapshot-bound, flattened semantic view of one canonical editor document.
 *
 * Nodes are numbered in deterministic preorder. Indexes and child edges are
 * meaningful only within this object; they are renderer coordinates, not
 * persisted node identities. Text and semantic names cross as individual
 * strings without encoding the complete state as JSON.
 *
 * Public indexes are read-only `u32` transport values. Raw JavaScript can ask
 * `wasm-bindgen` to coerce a fractional or wider number before Rust receives
 * it; an in-range coerced value can therefore read a different node. The
 * reviewed browser adapter must validate exact nonnegative integers before it
 * calls this raw glue. No index getter can mutate the projection or editor
 * engine.
 */
export class BreditorProjection {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns one child's flattened node index.
     */
    childAt(index: number, ordinal: number): number | undefined;
    /**
     * Returns the number of direct semantic children for an element node.
     */
    childCount(index: number): number | undefined;
    /**
     * Returns the qualified semantic element type for an element node.
     */
    elementType(index: number): string | undefined;
    /**
     * Returns the canonical format count for a text leaf.
     */
    formatCount(index: number): number | undefined;
    /**
     * Returns one text leaf's qualified semantic format type.
     */
    formatType(index: number, ordinal: number): string | undefined;
    /**
     * Returns `element` or `text` for an in-range node index.
     */
    nodeKind(index: number): BreditorProjectionNodeKind | undefined;
    /**
     * Returns the exact Unicode scalar string for a text leaf.
     */
    text(index: number): string | undefined;
    /**
     * Returns the number of flattened semantic nodes.
     */
    readonly nodeCount: number;
    /**
     * Returns the root node index, which is always zero for a valid projection.
     */
    readonly rootIndex: number;
    /**
     * Returns the qualified schema name that defines the projected semantics.
     */
    readonly schemaName: string;
    /**
     * Returns the nonzero schema version that defines the projected semantics.
     */
    readonly schemaVersion: number;
    /**
     * Returns the lineage of the exact editor snapshot projected here.
     */
    readonly snapshotLineage: string;
    /**
     * Returns the full-width snapshot revision as canonical decimal text.
     */
    readonly snapshotRevision: string;
}

/**
 * Structured result of reading one non-JSON document projection.
 *
 * A successful projection can be taken exactly once.
 */
export class BreditorProjectionResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Removes and returns the successful projection exactly once.
     */
    takeProjection(): BreditorProjection | undefined;
    /**
     * Returns the structured projection-read error, when present.
     */
    readonly error: BreditorError | undefined;
    /**
     * Returns `projection`, `taken`, or `error`.
     */
    readonly status: BreditorProjectionResultStatus;
}

/**
 * Commit-derived renderer update with an owned final semantic projection.
 *
 * Base and result snapshot fields guard incremental application. `impact` is
 * conservative: callers must fall back to the complete final projection when
 * their rendered base or DOM shape does not match this update.
 */
export class BreditorProjectionUpdate {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns one affected direct-root paragraph index.
     */
    affectedParagraphIndex(index: number): number | undefined;
    /**
     * Removes and returns the complete final projection exactly once.
     */
    takeProjection(): BreditorProjection | undefined;
    /**
     * Returns the number of affected direct-root paragraphs.
     */
    readonly affectedParagraphCount: number;
    /**
     * Returns the source snapshot lineage.
     */
    readonly baseLineage: string;
    /**
     * Returns the source snapshot revision as canonical decimal text.
     */
    readonly baseRevision: string;
    /**
     * Returns `none`, `textContainers`, `rootSplice`, or `root`.
     */
    readonly impact: BreditorProjectionImpact;
    /**
     * Returns the root-splice result range end, when applicable.
     */
    readonly newChildEnd: number | undefined;
    /**
     * Returns the root-splice result range start, when applicable.
     */
    readonly newChildStart: number | undefined;
    /**
     * Returns the root-splice source range end, when applicable.
     */
    readonly oldChildEnd: number | undefined;
    /**
     * Returns the root-splice source range start, when applicable.
     */
    readonly oldChildStart: number | undefined;
    /**
     * Returns the result snapshot lineage.
     */
    readonly resultLineage: string;
    /**
     * Returns the result snapshot revision as canonical decimal text.
     */
    readonly resultRevision: string;
}

/**
 * Structured result of a fallible string-producing boundary operation.
 *
 * `status` is exactly `value`, `taken`, `absent`, or `error`. `absent` is used by
 * [`crate::BreditorCommandResult::commit_json`] for effective history-only
 * events and non-committed outcomes.
 */
export class BreditorStringResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Removes and returns a successful string without cloning it.
     *
     * A successful take changes `status` from `value` to `taken`. All later
     * calls return `None`.
     */
    takeValue(): string | undefined;
    /**
     * Returns the structured error, when encoding failed.
     */
    readonly error: BreditorError | undefined;
    /**
     * Returns `value`, `taken`, `absent`, or `error`.
     */
    readonly status: BreditorStringResultStatus;
    /**
     * Returns a copy of the successful value, when present.
     */
    readonly value: string | undefined;
}

/**
 * Returns the Breditor crate release version embedded in this module.
 */
export function breditorVersion(): string;

/**
 * Returns the JavaScript-visible Wasm ABI generation.
 */
export function breditorWasmAbiVersion(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_breditorprojectionupdate_free: (a: number, b: number) => void;
    readonly breditorengine_closeHistoryGroup: (a: number, b: number) => number;
    readonly breditorengine_executeStringAction: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly breditorengine_redo: (a: number, b: number) => number;
    readonly breditorengine_stateJson: (a: number) => number;
    readonly breditorprojectionupdate_affectedParagraphCount: (a: number) => number;
    readonly breditorprojectionupdate_affectedParagraphIndex: (a: number, b: number) => number;
    readonly breditorprojectionupdate_baseLineage: (a: number) => [number, number];
    readonly breditorprojectionupdate_baseRevision: (a: number) => [number, number];
    readonly breditorprojectionupdate_impact: (a: number) => [number, number];
    readonly breditorprojectionupdate_newChildEnd: (a: number) => number;
    readonly breditorprojectionupdate_newChildStart: (a: number) => number;
    readonly breditorprojectionupdate_oldChildEnd: (a: number) => number;
    readonly breditorprojectionupdate_oldChildStart: (a: number) => number;
    readonly breditorprojectionupdate_resultLineage: (a: number) => [number, number];
    readonly breditorprojectionupdate_resultRevision: (a: number) => [number, number];
    readonly breditorprojectionupdate_takeProjection: (a: number) => number;
    readonly __wbg_breditorcommandresult_free: (a: number, b: number) => void;
    readonly breditorcommandresult_activation: (a: number) => [number, number];
    readonly breditorcommandresult_commitJson: (a: number) => number;
    readonly breditorcommandresult_disabledActionId: (a: number) => [number, number];
    readonly breditorcommandresult_disabledReasonCode: (a: number) => [number, number];
    readonly breditorcommandresult_disabledReasonDetailJson: (a: number) => number;
    readonly breditorcommandresult_error: (a: number) => number;
    readonly breditorcommandresult_eventKind: (a: number) => [number, number];
    readonly breditorcommandresult_indicatorValueContractName: (a: number) => [number, number];
    readonly breditorcommandresult_indicatorValueContractVersion: (a: number) => number;
    readonly breditorcommandresult_indicatorValueJson: (a: number) => number;
    readonly breditorcommandresult_indicatorValueStatus: (a: number) => [number, number];
    readonly breditorcommandresult_observation: (a: number) => number;
    readonly breditorcommandresult_projectionUpdate: (a: number) => number;
    readonly breditorcommandresult_status: (a: number) => [number, number];
    readonly __wbg_breditorengine_free: (a: number, b: number) => void;
    readonly __wbg_breditorobservation_free: (a: number, b: number) => void;
    readonly __wbg_breditorstringresult_free: (a: number, b: number) => void;
    readonly breditorengine_clearHistory: (a: number, b: number) => number;
    readonly breditorengine_projection: (a: number, b: number) => number;
    readonly breditorobservation_canRedo: (a: number) => number;
    readonly breditorobservation_canUndo: (a: number) => number;
    readonly breditorobservation_historyCapacity: (a: number) => number;
    readonly breditorobservation_redoDepth: (a: number) => number;
    readonly breditorobservation_snapshotLineage: (a: number) => [number, number];
    readonly breditorobservation_snapshotRevision: (a: number) => [number, number];
    readonly breditorobservation_undoDepth: (a: number) => number;
    readonly breditorstringresult_error: (a: number) => number;
    readonly breditorstringresult_status: (a: number) => [number, number];
    readonly breditorstringresult_takeValue: (a: number) => [number, number];
    readonly breditorstringresult_value: (a: number) => [number, number];
    readonly __wbg_breditorprojection_free: (a: number, b: number) => void;
    readonly breditorprojection_childAt: (a: number, b: number, c: number) => number;
    readonly breditorprojection_childCount: (a: number, b: number) => number;
    readonly breditorprojection_elementType: (a: number, b: number) => [number, number];
    readonly breditorprojection_formatCount: (a: number, b: number) => number;
    readonly breditorprojection_formatType: (a: number, b: number, c: number) => [number, number];
    readonly breditorprojection_nodeCount: (a: number) => number;
    readonly breditorprojection_nodeKind: (a: number, b: number) => [number, number];
    readonly breditorprojection_rootIndex: (a: number) => number;
    readonly breditorprojection_schemaName: (a: number) => [number, number];
    readonly breditorprojection_schemaVersion: (a: number) => number;
    readonly breditorprojection_snapshotLineage: (a: number) => [number, number];
    readonly breditorprojection_snapshotRevision: (a: number) => [number, number];
    readonly breditorprojection_text: (a: number, b: number) => [number, number];
    readonly breditorVersion: () => [number, number];
    readonly breditorWasmAbiVersion: () => [number, number];
    readonly breditorengine_executeNoInputAction: (a: number, b: number, c: number, d: number) => number;
    readonly breditorengine_fromDocumentJson: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly breditorengine_fromSessionCheckpointJson: (a: number, b: number) => number;
    readonly __wbg_breditorengineresult_free: (a: number, b: number) => void;
    readonly __wbg_breditorerror_free: (a: number, b: number) => void;
    readonly __wbg_breditorprojectionresult_free: (a: number, b: number) => void;
    readonly breditorengine_observation: (a: number) => number;
    readonly breditorengine_sessionCheckpointJson: (a: number) => number;
    readonly breditorengine_undo: (a: number, b: number) => number;
    readonly breditorengineresult_error: (a: number) => number;
    readonly breditorengineresult_status: (a: number) => [number, number];
    readonly breditorengineresult_takeEngine: (a: number) => number;
    readonly breditorerror_code: (a: number) => [number, number];
    readonly breditorerror_message: (a: number) => [number, number];
    readonly breditorprojectionresult_error: (a: number) => number;
    readonly breditorprojectionresult_status: (a: number) => [number, number];
    readonly breditorprojectionresult_takeProjection: (a: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
