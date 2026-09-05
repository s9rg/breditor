import {
  canonicalEditorCommandRequest,
  editorDeliveryTokenMatches,
  issueEditorDeliveryAuthority,
  issueEditorDeliveryToken,
  isEngineCommand,
  type EditorDeliveryAuthority,
  type EditorCommandRequest,
  type EditorDeliveryToken,
  type EditorSelectionSync,
  type EngineCommand,
  type EngineCommandRequest,
} from "./editor_command.js";
import {
  BreditorDomRenderer,
  type ProjectionFallbackReason,
  type ProjectionRenderOutcome,
  type RenderedProjection,
} from "./dom_renderer.js";
import { BreditorDomSelectionBridge } from "./dom_selection.js";
import type { BaseDocumentProjection } from "./projection.js";
import type { BaseEditorSelection } from "./selection.js";
import {
  consumeSemanticProjectionUpdate,
  type SemanticProjectionUpdateView,
} from "./wasm_projection_adapter.js";
import {
  consumeSemanticSelection,
  semanticRangeSelectionScalars,
  type SemanticRangeSelectionScalars,
  type SemanticSelectionView,
} from "./wasm_selection_adapter.js";

/** Structural subset of the generated opaque observation owned by this adapter. */
export interface WasmCommandObservationView {
  readonly snapshotLineage: string;
  readonly snapshotRevision: string;
  free(): void;
}

/** Structural subset of one cloned generated Wasm error. */
export interface WasmCommandErrorView {
  readonly code: string;
  readonly message: string;
  free(): void;
}

/** Structural subset of the generated one-command result. */
export interface WasmCommandResultView {
  readonly status: "committed" | "disabled" | "unchanged" | "error";
  readonly eventKind:
    | "action"
    | "selection"
    | "undo"
    | "redo"
    | "closeHistoryGroup"
    | "clearHistory"
    | undefined;
  readonly disabledActionId: string | undefined;
  readonly disabledReasonCode: string | undefined;
  readonly activation: "stateless" | "inactive" | "active" | "mixed" | undefined;
  readonly error: WasmCommandErrorView | undefined;
  observation(): WasmCommandObservationView | undefined;
  projectionUpdate(): SemanticProjectionUpdateView | undefined;
  free(): void;
}

/** Structural subset of the generated selection-read result. */
export interface WasmSelectionResultView {
  readonly status: "selection" | "taken" | "error";
  readonly error: WasmCommandErrorView | undefined;
  takeSelection(): SemanticSelectionView | undefined;
  free(): void;
}

/** Structural generated-engine surface used by the atomic browser sequence. */
export interface WasmCommandEngineView {
  clearSelection(expected: WasmCommandObservationView): WasmCommandResultView;
  setRangeSelection(
    expected: WasmCommandObservationView,
    anchorKind: SemanticRangeSelectionScalars["anchorPointKind"],
    anchorNodeIndex: number,
    anchorOffset: number,
    anchorAffinity: SemanticRangeSelectionScalars["anchorAffinity"],
    focusKind: SemanticRangeSelectionScalars["focusPointKind"],
    focusNodeIndex: number,
    focusOffset: number,
    focusAffinity: SemanticRangeSelectionScalars["focusAffinity"],
  ): WasmCommandResultView;
  selection(expected: WasmCommandObservationView): WasmSelectionResultView;
  executeNoInputAction(
    expected: WasmCommandObservationView,
    actionId: string,
  ): WasmCommandResultView;
  executeStringAction(
    expected: WasmCommandObservationView,
    actionId: string,
    value: string,
  ): WasmCommandResultView;
  undo(expected: WasmCommandObservationView): WasmCommandResultView;
  redo(expected: WasmCommandObservationView): WasmCommandResultView;
  closeHistoryGroup(expected: WasmCommandObservationView): WasmCommandResultView;
}

/** Stable redacted error copied before generated handles are freed. */
export interface WasmCommandError {
  readonly code: string;
  readonly message: string;
  /** Stale outcomes are never retried or rebound to a fresh observation. */
  readonly stale: boolean;
}

/** Exact successor snapshot copied from a validated non-error observation. */
export interface WasmCommandSnapshot {
  readonly lineage: string;
  readonly revision: string;
}

/** Handle-free renderer metadata for one commit-bearing step. */
export interface WasmCommandRenderMetadata {
  readonly mode: ProjectionRenderOutcome["mode"];
  readonly rendererGeneration: bigint;
  readonly fallbackReason?: ProjectionFallbackReason;
}

/** Normalized step outcome. No generated Wasm handle can escape here. */
export type WasmCommandOutcome =
  | Readonly<{
      status: "committed";
      eventKind: "selection" | "action" | "undo" | "redo" | "closeHistoryGroup";
      snapshot: WasmCommandSnapshot;
      render: WasmCommandRenderMetadata | undefined;
    }>
  | Readonly<{
      status: "disabled";
      actionId: string;
      reasonCode: string;
      activation: "stateless" | "inactive" | "active" | "mixed";
      snapshot: WasmCommandSnapshot;
    }>
  | Readonly<{ status: "unchanged"; snapshot: WasmCommandSnapshot }>;

/** One request is delivered as selection sync, optional boundary, then command. */
export interface WasmCommandSequenceOutcome {
  readonly status: "delivered";
  readonly selection: WasmCommandOutcome;
  readonly boundary: WasmCommandOutcome | undefined;
  readonly command: WasmCommandOutcome;
  readonly rendered: RenderedProjection;
}

/** Result of an explicit full-render reconciliation attempt. */
export type WasmRenderReconciliationOutcome =
  | Readonly<{ ok: true; rendered: RenderedProjection }>
  | Readonly<{
      ok: false;
      reason: "adapterUnavailable" | "renderFailed" | "selectionWriteFailed";
    }>;

/** Constructor dependencies which must be shared with browser event admission. */
export interface BreditorWasmCommandAdapterOptions {
  readonly renderer: BreditorDomRenderer;
  readonly rendered: RenderedProjection;
  readonly selectionBridge: BreditorDomSelectionBridge;
}

type AdapterState = "live" | "executing" | "reconcile" | "faulted" | "disposed";
type ExpectedEventKind = "selection" | "action" | "undo" | "redo" | "closeHistoryGroup";

interface PreparedSelection {
  readonly kind: "none" | "range";
  readonly scalars?: SemanticRangeSelectionScalars;
}

interface AppliedTransition {
  readonly projection: BaseDocumentProjection;
  readonly rendered: RenderedProjection;
  readonly metadata: WasmCommandRenderMetadata | undefined;
  readonly domFailure: boolean;
}

/**
 * Observation-, render-, and selection-owning adapter for browser commands.
 *
 * A delivery token authorizes exactly one non-reentrant sequence. The adapter
 * synchronizes the request's already-captured semantic selection, applies any
 * history boundary, executes the command, consumes every Wasm projection
 * update, renders it, and restores the core's resulting selection before a
 * handle-free outcome is returned. Raw projection updates never enter the
 * queue observer or caller.
 */
export class BreditorWasmCommandAdapter {
  readonly #engine: WasmCommandEngineView;
  readonly #renderer: BreditorDomRenderer;
  readonly #selectionBridge: BreditorDomSelectionBridge;
  readonly #host: HTMLElement;
  readonly #authority = Symbol("breditor-command-adapter");
  readonly #deliveryAuthority: EditorDeliveryAuthority;
  #observation: WasmCommandObservationView | undefined;
  #snapshot: WasmCommandSnapshot;
  #projection: BaseDocumentProjection;
  #rendered: RenderedProjection;
  #deliveryEpoch = 0n;
  #state: AdapterState = "live";

  constructor(
    engine: WasmCommandEngineView,
    observation: WasmCommandObservationView,
    options: BreditorWasmCommandAdapterOptions,
  ) {
    const safeEngine = snapshotEngineView(engine);
    if (safeEngine === null) {
      throw new TypeError("Wasm command engine is invalid");
    }
    const snapshot = readObservationSnapshot(observation);
    const dependencies = snapshotAdapterOptions(options);
    if (snapshot === null || dependencies === null) {
      throw new TypeError("Wasm command adapter dependencies are invalid");
    }
    if (
      !dependencies.renderer.owns(dependencies.rendered) ||
      dependencies.rendered.projection.snapshot.lineage !== snapshot.lineage ||
      dependencies.rendered.projection.snapshot.revision !== snapshot.revision
    ) {
      throw new TypeError("initial render does not match the command observation");
    }
    this.#engine = safeEngine;
    this.#observation = observation;
    this.#snapshot = snapshot;
    this.#renderer = dependencies.renderer;
    this.#rendered = dependencies.rendered;
    this.#projection = dependencies.rendered.projection;
    this.#host = dependencies.rendered.host;
    this.#selectionBridge = dependencies.selectionBridge;
    this.#deliveryAuthority = issueEditorDeliveryAuthority((token) =>
      this.acceptsDeliveryToken(token),
    );
  }

  /** Exact bridge which event admission must share with this adapter. */
  get selectionBridge(): BreditorDomSelectionBridge {
    return this.#selectionBridge;
  }

  /** Opaque live-token authority to inject into browser event admission. */
  get deliveryAuthority(): EditorDeliveryAuthority {
    return this.#deliveryAuthority;
  }

  /** Current semantic snapshot, including while DOM reconciliation is required. */
  get snapshot(): WasmCommandSnapshot {
    return this.#snapshot;
  }

  /** Current adapter lifecycle. Only `live` can issue normal delivery tokens. */
  get state(): AdapterState {
    return this.#state;
  }

  /** Current render handle; it may be noncanonical while state is `reconcile`. */
  get rendered(): RenderedProjection {
    return this.#rendered;
  }

  /** Issues one opaque, one-use token for the exact current canonical render. */
  deliveryToken(): EditorDeliveryToken {
    this.requireState("live");
    this.requireObservation();
    if (
      !this.#renderer.owns(this.#rendered) ||
      this.#rendered.projection !== this.#projection ||
      this.#projection.snapshot.lineage !== this.#snapshot.lineage ||
      this.#projection.snapshot.revision !== this.#snapshot.revision
    ) {
      throw new TypeError("current render must be restored before token issuance");
    }
    return issueEditorDeliveryToken(
      this.#projection,
      this.#rendered,
      this.#deliveryEpoch,
      this.#authority,
    );
  }

  /** Checks a queued token without refreshing, invoking Wasm, or rebasing it. */
  acceptsDeliveryToken(token: unknown): token is EditorDeliveryToken {
    if (this.#state !== "live" || this.#observation === undefined) {
      return false;
    }
    return (
      editorDeliveryTokenMatches(
        token,
        this.#rendered,
        this.#deliveryEpoch,
        this.#authority,
      ) &&
      token.snapshotLineage === this.#snapshot.lineage &&
      token.snapshotRevision === this.#snapshot.revision &&
      this.#renderer.owns(this.#rendered)
    );
  }

  /**
   * Atomically serializes selection sync, history boundary, command, and render.
   *
   * "Atomic" here means non-interleaved delivery, not rollback: a selection or
   * history prestage can remain effective if a later structured command fails.
   */
  execute(request: EngineCommandRequest): WasmCommandSequenceOutcome {
    this.requireState("live");
    const canonical = canonicalEditorCommandRequest(request);
    if (canonical === null || !isEngineCommand(canonical.command)) {
      throw new TypeError("request is not an exact executable engine command");
    }
    const engineRequest = canonical as EngineCommandRequest;
    if (!this.acceptsDeliveryToken(engineRequest.delivery)) {
      throw new TypeError("command delivery token is stale or foreign");
    }
    const selection = prepareSelection(engineRequest.selection);
    if (selection === null) {
      throw new TypeError("command selection could not be converted exactly");
    }

    // Spend the capability before any generated call. Structured rejection
    // cannot make the same queued intent replayable.
    this.#deliveryEpoch += 1n;
    this.#state = "executing";
    try {
      const selectionOutcome = this.executeSelection(selection);
      if (selectionOutcome.status === "unchanged") {
        this.installRequestedSelection(engineRequest.selection);
      }

      let boundary: WasmCommandOutcome | undefined;
      if (engineRequest.requirements.history === "closeBefore") {
        boundary = this.executeOne(
          (expected) => this.#engine.closeHistoryGroup(expected),
          "closeHistoryGroup",
        );
      }

      const expectedKind =
        engineRequest.command.kind === "action"
          ? "action"
          : engineRequest.command.operation;
      const command = this.executeOne(
        (expected) => invokeEngineCommand(this.#engine, expected, engineRequest.command),
        expectedKind,
        engineRequest.command.kind === "action"
          ? engineRequest.command.actionId
          : undefined,
      );
      this.#state = "live";
      return Object.freeze({
        status: "delivered",
        selection: selectionOutcome,
        boundary,
        command,
        rendered: this.#rendered,
      });
    } catch (error) {
      if (this.#state === "executing") {
        this.#state = error instanceof KnownCommandRejection && !error.stale
          ? "live"
          : "faulted";
      }
      throw error;
    }
  }

  /**
   * Full-renders the retained authoritative projection and restores core selection.
   *
   * This is the explicit recovery path for valid post-publication DOM failures
   * and for intentionally invalidated composition DOM. Malformed/uncertain
   * command results remain permanently faulted and cannot use this path.
   */
  restoreCanonicalRender(): WasmRenderReconciliationOutcome {
    if (this.#state !== "live" && this.#state !== "reconcile") {
      return Object.freeze({ ok: false, reason: "adapterUnavailable" });
    }
    const observation = this.requireObservation();
    this.#state = "executing";
    try {
      const rendered = this.#renderer.render(this.#host, this.#projection);
      if (!rendered.ok) {
        this.#state = "reconcile";
        return Object.freeze({ ok: false, reason: "renderFailed" });
      }
      this.#rendered = rendered.value.rendered;
      if (!this.readAndWriteCurrentSelection(observation, this.#rendered)) {
        this.#state = "reconcile";
        return Object.freeze({ ok: false, reason: "selectionWriteFailed" });
      }
      this.#state = "live";
      return Object.freeze({ ok: true, rendered: this.#rendered });
    } catch (error) {
      this.#state = "faulted";
      throw error;
    }
  }

  /** Releases the current observation and render authority exactly once. */
  dispose(): void {
    if (this.#state === "executing") {
      throw new TypeError("cannot dispose a command adapter during delivery");
    }
    if (this.#state === "disposed") {
      return;
    }
    const observation = this.#observation;
    this.#observation = undefined;
    this.#state = "disposed";
    let firstFailure: unknown;
    try {
      if (this.#renderer.owns(this.#rendered)) {
        this.#renderer.release(this.#rendered);
      }
    } catch (error) {
      firstFailure = error;
    }
    try {
      observation?.free();
    } catch (error) {
      firstFailure ??= error;
    }
    if (firstFailure !== undefined) {
      throw firstFailure;
    }
  }

  private executeSelection(selection: PreparedSelection): WasmCommandOutcome {
    return this.executeOne(
      (expected) =>
        selection.kind === "none"
          ? this.#engine.clearSelection(expected)
          : invokeSetRangeSelection(
              this.#engine,
              expected,
              selection.scalars as SemanticRangeSelectionScalars,
            ),
      "selection",
    );
  }

  private executeOne(
    invoke: (expected: WasmCommandObservationView) => WasmCommandResultView,
    expectedKind: ExpectedEventKind,
    expectedActionId?: string,
  ): WasmCommandOutcome {
    const observation = this.requireObservation();
    const result = invoke(observation);
    return this.consumeResult(result, expectedKind, expectedActionId);
  }

  private consumeResult(
    result: WasmCommandResultView,
    expectedKind: ExpectedEventKind,
    expectedActionId: string | undefined,
  ): WasmCommandOutcome {
    const previous = this.requireObservation();
    if ((result as unknown) === previous) {
      throw new TypeError("Wasm command result handle is invalid or aliased");
    }
    if (!isCommandResultView(result)) {
      const cleanup = objectLike(result)
        ? freeUnique([result], previous)
        : undefined;
      if (cleanup !== undefined) {
        throw cleanup;
      }
      throw new TypeError("Wasm command result handle is invalid or aliased");
    }

    let errorView: WasmCommandErrorView | undefined;
    let successor: WasmCommandObservationView | undefined;
    let updateView: SemanticProjectionUpdateView | undefined;
    let resultOwned = true;
    try {
      const status = result.status;
      const eventKind = result.eventKind;
      const disabledActionId = result.disabledActionId;
      const disabledReasonCode = result.disabledReasonCode;
      const activation = result.activation;
      errorView = result.error;
      successor = result.observation();
      updateView = result.projectionUpdate();
      assertDistinctGeneratedHandles(
        previous,
        [result, errorView, successor, updateView],
      );

      if (status === "error") {
        if (
          eventKind !== undefined ||
          disabledActionId !== undefined ||
          disabledReasonCode !== undefined ||
          activation !== undefined ||
          successor !== undefined ||
          updateView !== undefined ||
          errorView === undefined
        ) {
          throw new TypeError("Wasm error result violated its exact shape");
        }
        const error = readError(errorView);
        if (error === null) {
          throw new TypeError("Wasm command error is invalid");
        }
        const cleanup = freeUnique([errorView, result], previous);
        errorView = undefined;
        resultOwned = false;
        if (cleanup !== undefined) {
          throw cleanup;
        }
        if (error.stale) {
          this.#state = "faulted";
        }
        throw new KnownCommandRejection(error);
      }

      if (errorView !== undefined || successor === undefined) {
        throw new TypeError("Wasm non-error result violated its exact shape");
      }
      const nextSnapshot = readObservationSnapshot(successor);
      if (nextSnapshot === null) {
        throw new TypeError("Wasm successor observation is invalid");
      }
      let transition: AppliedTransition = Object.freeze({
        projection: this.#projection,
        rendered: this.#rendered,
        metadata: undefined,
        domFailure: false,
      });
      let outcome: WasmCommandOutcome;

      if (status === "committed") {
        if (
          eventKind !== expectedKind ||
          disabledActionId !== undefined ||
          disabledReasonCode !== undefined ||
          activation !== undefined ||
          !committedSuccessorIsExact(this.#snapshot, nextSnapshot, expectedKind)
        ) {
          throw new TypeError("Wasm committed result violated its correlation contract");
        }
        if (expectedKind === "closeHistoryGroup") {
          if (updateView !== undefined) {
            throw new TypeError("history-only commit exposed a projection update");
          }
        } else {
          if (updateView === undefined) {
            throw new TypeError("commit-bearing result omitted its projection update");
          }
          const ownedUpdate = updateView;
          updateView = undefined;
          transition = this.consumeAndRenderUpdate(
            ownedUpdate,
            successor,
            nextSnapshot,
            [previous, result, successor],
          );
        }
        outcome = Object.freeze({
          status,
          eventKind: expectedKind,
          snapshot: nextSnapshot,
          render: transition.metadata,
        });
      } else if (status === "disabled") {
        if (
          expectedKind !== "action" ||
          eventKind !== undefined ||
          typeof disabledActionId !== "string" ||
          disabledActionId !== expectedActionId ||
          !isQualifiedName(disabledActionId) ||
          typeof disabledReasonCode !== "string" ||
          !isQualifiedName(disabledReasonCode) ||
          !isActivation(activation) ||
          updateView !== undefined ||
          !snapshotsEqual(this.#snapshot, nextSnapshot)
        ) {
          throw new TypeError("Wasm disabled result violated its correlation contract");
        }
        outcome = Object.freeze({
          status,
          actionId: disabledActionId,
          reasonCode: disabledReasonCode,
          activation,
          snapshot: nextSnapshot,
        });
      } else if (status === "unchanged") {
        if (
          expectedKind === "action" ||
          eventKind !== undefined ||
          disabledActionId !== undefined ||
          disabledReasonCode !== undefined ||
          activation !== undefined ||
          updateView !== undefined ||
          !snapshotsEqual(this.#snapshot, nextSnapshot)
        ) {
          throw new TypeError("Wasm unchanged result violated its correlation contract");
        }
        outcome = Object.freeze({ status, snapshot: nextSnapshot });
      } else {
        throw new TypeError("Wasm command status is invalid");
      }

      const cleanup = freeUnique([result, previous], successor);
      resultOwned = false;
      this.#observation = successor;
      this.#snapshot = nextSnapshot;
      this.#projection = transition.projection;
      this.#rendered = transition.rendered;
      successor = undefined;
      if (cleanup !== undefined) {
        this.#state = "faulted";
        throw cleanup;
      }
      if (transition.domFailure) {
        this.#state = "reconcile";
        throw new DomReconciliationRequired();
      }
      return outcome;
    } finally {
      const cleanup = freeUnique(
        [errorView, successor, updateView, resultOwned ? result : undefined],
        previous,
      );
      if (cleanup !== undefined && this.#state === "executing") {
        this.#state = "faulted";
        throw cleanup;
      }
    }
  }

  private consumeAndRenderUpdate(
    updateView: SemanticProjectionUpdateView,
    successor: WasmCommandObservationView,
    nextSnapshot: WasmCommandSnapshot,
    protectedHandles: readonly unknown[],
  ): AppliedTransition {
    const converted = consumeSemanticProjectionUpdate(
      this.#projection,
      updateView,
      protectedHandles,
    );
    if (!converted.ok) {
      throw new TypeError("Wasm projection update is invalid");
    }
    const update = converted.value;
    if (
      update.result.snapshot.lineage !== nextSnapshot.lineage ||
      update.result.snapshot.revision !== nextSnapshot.revision
    ) {
      throw new TypeError("projection update and successor observation disagree");
    }
    const rendered = this.#renderer.update(this.#rendered, update);
    if (!rendered.ok) {
      return Object.freeze({
        projection: update.result,
        rendered: this.#rendered,
        metadata: undefined,
        domFailure: true,
      });
    }
    let selectionWritten: boolean;
    try {
      selectionWritten = this.readAndWriteCurrentSelection(
        successor,
        rendered.value.rendered,
        [...protectedHandles, updateView],
      );
    } catch (error) {
      // The update already installed this handle, but a malformed semantic
      // selection result makes the adapter permanently faulted. Release the
      // otherwise unreachable renderer authority before propagating.
      this.#renderer.release(rendered.value.rendered);
      throw error;
    }
    const snapshot: AppliedTransition = {
      projection: update.result,
      rendered: rendered.value.rendered,
      metadata: renderMetadata(rendered.value),
      domFailure: !selectionWritten,
    };
    return Object.freeze(snapshot);
  }

  private readAndWriteCurrentSelection(
    observation: WasmCommandObservationView,
    rendered: RenderedProjection,
    protectedHandles: readonly unknown[] = [],
  ): boolean {
    const selection = this.readCurrentSelection(
      observation,
      rendered.projection,
      protectedHandles,
    );
    try {
      return this.#selectionBridge.write(rendered, selection).ok;
    } catch {
      return false;
    }
  }

  private readCurrentSelection(
    observation: WasmCommandObservationView,
    projection: BaseDocumentProjection,
    protectedHandles: readonly unknown[] = [],
  ): BaseEditorSelection {
    let result: WasmSelectionResultView | undefined;
    let errorView: WasmCommandErrorView | undefined;
    let selectionView: SemanticSelectionView | undefined;
    let resultOwned = true;
    try {
      result = this.#engine.selection(observation);
      if (!isSelectionResultView(result) || (result as unknown) === observation) {
        throw new TypeError("Wasm selection result handle is invalid or aliased");
      }
      const status = result.status;
      errorView = result.error;
      selectionView = result.takeSelection();
      assertDistinctGeneratedHandles(
        observation,
        [result, errorView, selectionView],
        protectedHandles,
      );
      if (status !== "selection" || errorView !== undefined || selectionView === undefined) {
        throw new TypeError("Wasm selection read violated its exact shape");
      }
      const ownedSelection = selectionView;
      selectionView = undefined;
      const consumed = consumeSemanticSelection(projection, ownedSelection);
      if (!consumed.ok) {
        throw new TypeError("Wasm semantic selection is invalid");
      }
      const cleanup = freeUnique([result], observation, protectedHandles);
      resultOwned = false;
      if (cleanup !== undefined) {
        throw cleanup;
      }
      return consumed.value;
    } finally {
      const cleanup = freeUnique(
        [errorView, selectionView, resultOwned ? result : undefined],
        observation,
        protectedHandles,
      );
      if (cleanup !== undefined) {
        throw cleanup;
      }
    }
  }

  private installRequestedSelection(selection: EditorSelectionSync): void {
    const value = selection.kind === "range" ? selection.selection : null;
    if (!this.#selectionBridge.write(this.#rendered, value).ok) {
      this.#state = "reconcile";
      throw new DomReconciliationRequired();
    }
  }

  private requireObservation(): WasmCommandObservationView {
    if (this.#observation === undefined) {
      throw new TypeError("Wasm command adapter has no live observation");
    }
    return this.#observation;
  }

  private requireState(expected: AdapterState): void {
    if (this.#state !== expected) {
      throw new TypeError(`Wasm command adapter is ${this.#state}`);
    }
  }
}

// This class owns generated handles and private adapter authority. Do not let
// application code replace methods after construction.
Object.freeze(BreditorWasmCommandAdapter.prototype);

/** Runtime helper for dispatchers accepting the wider staged-command union. */
export function isEngineCommandRequest(
  request: EditorCommandRequest,
): request is EngineCommandRequest {
  const canonical = canonicalEditorCommandRequest(request);
  return canonical !== null && isEngineCommand(canonical.command);
}

function prepareSelection(selection: EditorSelectionSync): PreparedSelection | null {
  if (selection.kind === "none") {
    return Object.freeze({ kind: "none" });
  }
  const scalars = semanticRangeSelectionScalars(selection.selection);
  return scalars.ok
    ? Object.freeze({ kind: "range", scalars: scalars.value })
    : null;
}

function invokeSetRangeSelection(
  engine: WasmCommandEngineView,
  expected: WasmCommandObservationView,
  scalars: SemanticRangeSelectionScalars,
): WasmCommandResultView {
  return engine.setRangeSelection(
    expected,
    scalars.anchorPointKind,
    scalars.anchorNodeIndex,
    scalars.anchorOffset,
    scalars.anchorAffinity,
    scalars.focusPointKind,
    scalars.focusNodeIndex,
    scalars.focusOffset,
    scalars.focusAffinity,
  );
}

function invokeEngineCommand(
  engine: WasmCommandEngineView,
  expected: WasmCommandObservationView,
  command: EngineCommand,
): WasmCommandResultView {
  if (command.kind === "history") {
    return command.operation === "undo"
      ? engine.undo(expected)
      : engine.redo(expected);
  }
  return command.input.kind === "none"
    ? engine.executeNoInputAction(expected, command.actionId)
    : engine.executeStringAction(expected, command.actionId, command.input.value);
}

function snapshotAdapterOptions(
  value: unknown,
): BreditorWasmCommandAdapterOptions | null {
  const record = readExactDataRecord(value, ["renderer", "rendered", "selectionBridge"]);
  if (
    record === null ||
    !(record["renderer"] instanceof BreditorDomRenderer) ||
    !(record["selectionBridge"] instanceof BreditorDomSelectionBridge)
  ) {
    return null;
  }
  return Object.freeze({
    renderer: record["renderer"],
    rendered: record["rendered"] as RenderedProjection,
    selectionBridge: record["selectionBridge"],
  });
}

function readObservationSnapshot(value: unknown): WasmCommandSnapshot | null {
  try {
    const observation = value as Partial<WasmCommandObservationView>;
    const lineage = observation.snapshotLineage;
    const revision = observation.snapshotRevision;
    if (
      typeof lineage !== "string" ||
      lineage.length === 0 ||
      lineage.length > 128 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(lineage) ||
      typeof revision !== "string" ||
      !canonicalU64(revision) ||
      typeof observation.free !== "function"
    ) {
      return null;
    }
    return Object.freeze({ lineage, revision });
  } catch {
    return null;
  }
}

function readError(value: WasmCommandErrorView): WasmCommandError | null {
  try {
    const code = value.code;
    const message = value.message;
    if (
      typeof code !== "string" ||
      !isStableCode(code) ||
      typeof message !== "string" ||
      message.length === 0 ||
      message.length > 256 ||
      typeof value.free !== "function"
    ) {
      return null;
    }
    const snapshot: WasmCommandError = {
      code,
      message,
      stale:
        code === "editor_engine.stale_engine" ||
        code === "editor_engine.stale_snapshot" ||
        code === "editor_engine.stale_history",
    };
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function snapshotEngineView(value: unknown): WasmCommandEngineView | null {
  try {
    const receiver = value as WasmCommandEngineView;
    const clearSelection = receiver.clearSelection;
    const setRangeSelection = receiver.setRangeSelection;
    const selection = receiver.selection;
    const executeNoInputAction = receiver.executeNoInputAction;
    const executeStringAction = receiver.executeStringAction;
    const undo = receiver.undo;
    const redo = receiver.redo;
    const closeHistoryGroup = receiver.closeHistoryGroup;
    if (
      typeof clearSelection !== "function" ||
      typeof setRangeSelection !== "function" ||
      typeof selection !== "function" ||
      typeof executeNoInputAction !== "function" ||
      typeof executeStringAction !== "function" ||
      typeof undo !== "function" ||
      typeof redo !== "function" ||
      typeof closeHistoryGroup !== "function"
    ) {
      return null;
    }
    const snapshot: WasmCommandEngineView = {
      clearSelection: (expected) => Reflect.apply(clearSelection, value, [expected]),
      setRangeSelection: (
        expected,
        anchorKind,
        anchorNodeIndex,
        anchorOffset,
        anchorAffinity,
        focusKind,
        focusNodeIndex,
        focusOffset,
        focusAffinity,
      ) =>
        Reflect.apply(setRangeSelection, value, [
          expected,
          anchorKind,
          anchorNodeIndex,
          anchorOffset,
          anchorAffinity,
          focusKind,
          focusNodeIndex,
          focusOffset,
          focusAffinity,
        ]),
      selection: (expected) => Reflect.apply(selection, value, [expected]),
      executeNoInputAction: (expected, actionId) =>
        Reflect.apply(executeNoInputAction, value, [expected, actionId]),
      executeStringAction: (expected, actionId, input) =>
        Reflect.apply(executeStringAction, value, [expected, actionId, input]),
      undo: (expected) => Reflect.apply(undo, value, [expected]),
      redo: (expected) => Reflect.apply(redo, value, [expected]),
      closeHistoryGroup: (expected) =>
        Reflect.apply(closeHistoryGroup, value, [expected]),
    };
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function isCommandResultView(value: unknown): value is WasmCommandResultView {
  try {
    const result = value as Partial<WasmCommandResultView>;
    return (
      typeof value === "object" &&
      value !== null &&
      typeof result.observation === "function" &&
      typeof result.projectionUpdate === "function" &&
      typeof result.free === "function"
    );
  } catch {
    return false;
  }
}

function objectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function isSelectionResultView(value: unknown): value is WasmSelectionResultView {
  try {
    const result = value as Partial<WasmSelectionResultView>;
    return (
      typeof value === "object" &&
      value !== null &&
      typeof result.takeSelection === "function" &&
      typeof result.free === "function"
    );
  } catch {
    return false;
  }
}

function assertDistinctGeneratedHandles(
  protectedObservation: WasmCommandObservationView,
  values: readonly unknown[],
  additionalProtectedHandles: readonly unknown[] = [],
): void {
  const seen = new Set<object>();
  for (const value of values) {
    if (value === undefined) {
      continue;
    }
    if ((typeof value !== "object" && typeof value !== "function") || value === null) {
      throw new TypeError("generated handle is not an object");
    }
    if (
      value === protectedObservation ||
      additionalProtectedHandles.some((handle) => value === handle) ||
      seen.has(value)
    ) {
      throw new TypeError("generated handles alias protected ownership");
    }
    seen.add(value);
  }
}

function freeUnique(
  values: readonly unknown[],
  protectedHandle?: unknown,
  additionalProtectedHandles: readonly unknown[] = [],
): unknown | undefined {
  const seen = new Set<unknown>();
  let firstFailure: unknown;
  for (const value of values) {
    if (
      value === undefined ||
      value === protectedHandle ||
      additionalProtectedHandles.some((handle) => value === handle) ||
      seen.has(value)
    ) {
      continue;
    }
    seen.add(value);
    try {
      const free = (value as { free?: unknown }).free;
      if (typeof free !== "function") {
        throw new TypeError("generated handle has no free method");
      }
      Reflect.apply(free, value, []);
    } catch (error) {
      firstFailure ??= error;
    }
  }
  return firstFailure;
}

function committedSuccessorIsExact(
  current: WasmCommandSnapshot,
  next: WasmCommandSnapshot,
  expectedKind: ExpectedEventKind,
): boolean {
  if (expectedKind === "closeHistoryGroup") {
    return snapshotsEqual(current, next);
  }
  if (current.lineage !== next.lineage) {
    return false;
  }
  try {
    return BigInt(next.revision) === BigInt(current.revision) + 1n;
  } catch {
    return false;
  }
}

function snapshotsEqual(left: WasmCommandSnapshot, right: WasmCommandSnapshot): boolean {
  return left.lineage === right.lineage && left.revision === right.revision;
}

function renderMetadata(outcome: ProjectionRenderOutcome): WasmCommandRenderMetadata {
  return outcome.fallbackReason === undefined
    ? Object.freeze({
        mode: outcome.mode,
        rendererGeneration: outcome.rendered.rendererGeneration,
      })
    : Object.freeze({
        mode: outcome.mode,
        rendererGeneration: outcome.rendered.rendererGeneration,
        fallbackReason: outcome.fallbackReason,
      });
}

function isActivation(
  value: unknown,
): value is "stateless" | "inactive" | "active" | "mixed" {
  return (
    value === "stateless" ||
    value === "inactive" ||
    value === "active" ||
    value === "mixed"
  );
}

function isQualifiedName(value: string): boolean {
  return value.length <= 128 && /^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u.test(value);
}

function isStableCode(value: string): boolean {
  return (
    value.length <= 128 &&
    /^[a-z][a-z0-9._-]*(?:\/[a-z][a-z0-9._-]*)?$/u.test(value)
  );
}

function canonicalU64(value: string): boolean {
  if (!/^(?:0|[1-9][0-9]{0,19})$/u.test(value)) {
    return false;
  }
  try {
    return BigInt(value) <= 18_446_744_073_709_551_615n;
  } catch {
    return false;
  }
}

function readExactDataRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
    ) {
      return null;
    }
    const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        return null;
      }
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

class KnownCommandRejection extends Error {
  readonly stale: boolean;

  constructor(error: WasmCommandError) {
    super(`${error.code}: ${error.message}`);
    this.name = "KnownCommandRejection";
    this.stale = error.stale;
  }
}

class DomReconciliationRequired extends Error {
  constructor() {
    super("the semantic command published, but canonical DOM restoration is required");
    this.name = "DomReconciliationRequired";
  }
}
