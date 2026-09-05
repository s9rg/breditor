import {
  type CompositionEvidenceGrade,
  type CompositionEvidenceSource,
  compositionTextIsAdmissible,
} from "./composition_event.js";
import type {
  CompositionAbortReason,
  CompositionResult,
} from "./composition_result.js";
import { compositionFailure, compositionSuccess } from "./composition_result.js";

/** Closed phases of one browser composition lease. */
export type CompositionPhase =
  | "idle"
  | "armed"
  | "leased"
  | "mutating"
  | "ending"
  | "settling"
  | "quarantined"
  | "disposed";

/** Side effect requested from the controller by an otherwise pure transition. */
export type CompositionTransitionEffect =
  | "none"
  | "captureBase"
  | "reserveLease"
  | "openDomLease"
  | "scheduleSettlement"
  | "requestSettlement"
  | "restoreBaseDom"
  | "closeDomLease";

/** The latest constant-space evidence retained for one grade. */
export interface StoredCompositionEvidence {
  readonly source: CompositionEvidenceSource;
  readonly grade: CompositionEvidenceGrade;
  readonly text: string;
}

interface CompositionSessionState {
  readonly sessionId: bigint;
  readonly nextSessionId: bigint;
  readonly startMode: "explicit" | "implicit";
  /** Whether a native compositionstart has been observed for this session. */
  readonly explicitStartObserved: boolean;
  readonly latestProvisional: StoredCompositionEvidence | null;
  readonly latestFinal: StoredCompositionEvidence | null;
  readonly finalConflict: boolean;
}

export interface IdleCompositionState {
  readonly phase: "idle";
  readonly nextSessionId: bigint;
}

export interface ArmedCompositionState extends CompositionSessionState {
  readonly phase: "armed";
}

export interface LeasedCompositionState extends CompositionSessionState {
  readonly phase: "leased";
}

export interface MutatingCompositionState extends CompositionSessionState {
  readonly phase: "mutating";
}

export interface EndingCompositionState extends CompositionSessionState {
  readonly phase: "ending";
  readonly termination: "compositionend" | "definitiveInput" | "blur";
  /** One keydown immediately following compositionend may force settlement. */
  readonly exitReceiptAvailable: boolean;
}

export interface SettlingCompositionState extends CompositionSessionState {
  readonly phase: "settling";
  readonly termination: "compositionend" | "definitiveInput" | "blur";
}

export interface QuarantinedCompositionState {
  readonly phase: "quarantined";
  readonly nextSessionId: bigint;
  readonly sessionId: bigint;
  readonly reason: CompositionAbortReason;
}

export interface DisposedCompositionState {
  readonly phase: "disposed";
}

/** Immutable, module-owned state; it never retains Events, DOM nodes, or arrays. */
export type CompositionState =
  | IdleCompositionState
  | ArmedCompositionState
  | LeasedCompositionState
  | MutatingCompositionState
  | EndingCompositionState
  | SettlingCompositionState
  | QuarantinedCompositionState
  | DisposedCompositionState;

/** Signals accepted by {@link reduceCompositionState}. */
export type CompositionSignal =
  | Readonly<{ kind: "start" }>
  | Readonly<{ kind: "implicitStart" }>
  | Readonly<{ kind: "confirmStart" }>
  | Readonly<{ kind: "reserve" }>
  | Readonly<{ kind: "openDom" }>
  | Readonly<{
      kind: "evidence";
      source: CompositionEvidenceSource;
      grade: CompositionEvidenceGrade;
      text: string | null;
    }>
  | Readonly<{ kind: "end" }>
  | Readonly<{ kind: "definitiveEnd" }>
  | Readonly<{ kind: "blur" }>
  | Readonly<{ kind: "exitKey" }>
  | Readonly<{ kind: "taskBoundary" }>
  | Readonly<{ kind: "settled" }>
  | Readonly<{ kind: "poison"; reason: CompositionAbortReason }>
  | Readonly<{ kind: "recover" }>
  | Readonly<{ kind: "dispose" }>;

/** Pure transition plus the single controller effect it authorizes. */
export interface CompositionTransition {
  readonly state: CompositionState;
  readonly effect: CompositionTransitionEffect;
  /** True only for the one exit key receipt consumed by this transition. */
  readonly exitReceiptConsumed: boolean;
}

/** Final replacement decision; provisional event text alone never commits. */
export type CompositionCandidate =
  | Readonly<{ kind: "insert"; text: string; source: "event" | "domFallback" }>
  | Readonly<{ kind: "delete"; source: "event" | "domFallback" }>
  | Readonly<{ kind: "cancel"; source: "event" | "domFallback" }>;

/** Strict DOM evidence used to distinguish cancellation, deletion, and insertion. */
export interface CompositionDomEvidence {
  readonly originalText: string;
  readonly replacementText: string;
}

type SignalSnapshot = CompositionSignal;

const MAX_SESSION_ID = 18_446_744_073_709_551_615n;
const OWNED_STATES = new WeakSet<object>();
const ABORT_REASONS: ReadonlySet<CompositionAbortReason> = new Set([
  "invalidEvent",
  "invalidText",
  "invalidTransition",
  "orphanInput",
  "targetUnavailable",
  "targetInvalid",
  "unexpectedMutation",
  "staleBase",
  "domReconcileFailed",
  "queueRejected",
  "uncertain",
  "disposed",
]);

/** Creates the initial state for an independent controller instance. */
export function initialCompositionState(): CompositionState {
  return ownState({ phase: "idle", nextSessionId: 1n });
}

/** Returns whether a state came from this module's closed transition graph. */
export function isOwnedCompositionState(value: unknown): value is CompositionState {
  return (
    typeof value === "object" &&
    value !== null &&
    OWNED_STATES.has(value as object)
  );
}

/**
 * Applies one exact, accessor-free signal. Invalid input never mutates state and
 * never throws; the caller continues to own the prior immutable state.
 */
export function reduceCompositionState(
  state: unknown,
  input: unknown,
): CompositionResult<CompositionTransition> {
  if (!isOwnedCompositionState(state)) {
    return compositionFailure("composition.invalid_state");
  }
  const signal = snapshotSignal(input);
  if (signal === null) {
    return compositionFailure("composition.invalid_signal");
  }

  switch (signal.kind) {
    case "start":
    case "implicitStart": {
      if (state.phase !== "idle") {
        return compositionFailure("composition.invalid_transition");
      }
      if (state.nextSessionId > MAX_SESSION_ID) {
        return compositionFailure("composition.session_exhausted");
      }
      const next = ownSessionState({
        phase: "armed",
        sessionId: state.nextSessionId,
        nextSessionId: state.nextSessionId + 1n,
        startMode: signal.kind === "start" ? "explicit" : "implicit",
        explicitStartObserved: signal.kind === "start",
        latestProvisional: null,
        latestFinal: null,
        finalConflict: false,
      });
      return transition(next, "captureBase");
    }

    case "confirmStart": {
      if (
        (state.phase !== "armed" &&
          state.phase !== "leased" &&
          state.phase !== "mutating") ||
        state.startMode !== "implicit" ||
        state.explicitStartObserved
      ) {
        return compositionFailure("composition.invalid_transition");
      }
      return transition(confirmExplicitStart(state), "none");
    }

    case "reserve": {
      if (state.phase !== "armed") {
        return compositionFailure("composition.invalid_transition");
      }
      return transition(copySessionState(state, "leased"), "reserveLease");
    }

    case "openDom": {
      if (state.phase !== "leased") {
        return compositionFailure("composition.invalid_transition");
      }
      return transition(copySessionState(state, "mutating"), "openDomLease");
    }

    case "evidence": {
      if (
        state.phase !== "armed" &&
        state.phase !== "leased" &&
        state.phase !== "mutating" &&
        state.phase !== "ending"
      ) {
        return compositionFailure("composition.invalid_transition");
      }
      if (signal.text === null) {
        return transition(state, "none");
      }
      const evidence: StoredCompositionEvidence = Object.freeze({
        source: signal.source,
        grade: signal.grade,
        text: signal.text,
      });
      if (signal.grade === "provisional") {
        return transition(
          updateEvidence(state, evidence, state.latestFinal, state.finalConflict),
          "none",
        );
      }
      const conflict =
        state.finalConflict ||
        (state.latestFinal !== null && state.latestFinal.text !== evidence.text);
      return transition(
        updateEvidence(state, state.latestProvisional, evidence, conflict),
        "none",
      );
    }

    case "end":
    case "definitiveEnd": {
      const termination =
        signal.kind === "end" ? "compositionend" : "definitiveInput";
      if (state.phase === "ending") {
        return transition(
          toEndingState(state, true, termination),
          "none",
        );
      }
      if (
        state.phase !== "armed" &&
        state.phase !== "leased" &&
        state.phase !== "mutating"
      ) {
        return compositionFailure("composition.invalid_transition");
      }
      return transition(
        toEndingState(state, true, termination),
        "scheduleSettlement",
      );
    }

    case "blur": {
      if (state.phase === "ending" || state.phase === "settling") {
        return transition(state, "none");
      }
      if (
        state.phase !== "armed" &&
        state.phase !== "leased" &&
        state.phase !== "mutating"
      ) {
        return compositionFailure("composition.invalid_transition");
      }
      return transition(toEndingState(state, false, "blur"), "scheduleSettlement");
    }

    case "exitKey": {
      if (state.phase === "settling") {
        return transition(state, "none");
      }
      if (state.phase !== "ending") {
        return compositionFailure("composition.invalid_transition");
      }
      if (!state.exitReceiptAvailable) {
        return transition(state, "none");
      }
      return transition(copySessionState(state, "settling"), "requestSettlement", true);
    }

    case "taskBoundary": {
      if (state.phase === "settling") {
        return transition(state, "none");
      }
      if (state.phase !== "ending") {
        return compositionFailure("composition.invalid_transition");
      }
      return transition(copySessionState(state, "settling"), "requestSettlement");
    }

    case "settled": {
      if (state.phase !== "settling") {
        return compositionFailure("composition.invalid_transition");
      }
      return transition(
        ownState({ phase: "idle", nextSessionId: state.nextSessionId }),
        "closeDomLease",
      );
    }

    case "poison": {
      if (state.phase === "disposed" || state.phase === "idle") {
        return compositionFailure("composition.invalid_transition");
      }
      if (state.phase === "quarantined") {
        return transition(state, "none");
      }
      return transition(
        ownState({
          phase: "quarantined",
          nextSessionId: state.nextSessionId,
          sessionId: state.sessionId,
          reason: signal.reason,
        }),
        "restoreBaseDom",
      );
    }

    case "recover": {
      if (state.phase !== "quarantined") {
        return compositionFailure("composition.invalid_transition");
      }
      return transition(
        ownState({ phase: "idle", nextSessionId: state.nextSessionId }),
        "closeDomLease",
      );
    }

    case "dispose": {
      if (state.phase === "disposed") {
        return transition(state, "none");
      }
      const requiresRestore = state.phase !== "idle";
      return transition(ownState({ phase: "disposed" }), requiresRestore ? "restoreBaseDom" : "none");
    }
  }
}

/**
 * Selects final event evidence, or a corroborated same-paragraph DOM fallback.
 * An evolving compositionupdate value is never sufficient by itself.
 */
export function selectCompositionCandidate(
  state: unknown,
  domEvidence: unknown = null,
): CompositionResult<CompositionCandidate> {
  if (!isOwnedCompositionState(state)) {
    return compositionFailure("composition.invalid_state");
  }
  if (state.phase !== "ending" && state.phase !== "settling") {
    return compositionFailure("composition.invalid_transition");
  }
  if (domEvidence === null) {
    return compositionFailure("composition.candidate_unavailable");
  }
  const dom = snapshotDomEvidence(domEvidence);
  if (dom === null) {
    return compositionFailure("composition.invalid_text");
  }
  if (state.finalConflict) {
    return compositionFailure("composition.candidate_conflict");
  }
  const unchanged = dom.replacementText === dom.originalText;
  if (state.termination === "blur" && state.latestFinal === null) {
    return unchanged
      ? compositionSuccess(candidateFromDom(dom, "domFallback"))
      : compositionFailure("composition.candidate_unavailable");
  }
  if (state.latestFinal !== null) {
    const abortedSelectionRestore =
      state.latestFinal.text.length === 0 && unchanged;
    if (
      state.latestFinal.text !== dom.replacementText &&
      !abortedSelectionRestore
    ) {
      return compositionFailure("composition.candidate_conflict");
    }
    // A nonempty final event is an explicit commit even when its replacement
    // text equals the selected source. Treating it as cancellation would keep
    // the old range selection and skip the command's caret/format semantics.
    if (unchanged && state.latestFinal.text.length > 0) {
      return compositionSuccess(
        Object.freeze({
          kind: "insert",
          text: state.latestFinal.text,
          source: "event",
        }),
      );
    }
    return compositionSuccess(
      candidateFromDom(dom, "event"),
    );
  }
  if (
    state.latestProvisional !== null &&
    state.latestProvisional.text !== dom.replacementText
  ) {
    return compositionFailure("composition.candidate_conflict");
  }
  return compositionSuccess(candidateFromDom(dom, "domFallback"));
}

function ownState<T extends CompositionState>(state: T): T {
  OWNED_STATES.add(state);
  return Object.freeze(state);
}

function ownSessionState<T extends ArmedCompositionState | LeasedCompositionState | MutatingCompositionState | SettlingCompositionState>(
  state: T,
): T {
  return ownState(state);
}

function copySessionState(
  state:
    | ArmedCompositionState
    | LeasedCompositionState
    | MutatingCompositionState
    | EndingCompositionState,
  phase: "leased" | "mutating" | "settling",
): LeasedCompositionState | MutatingCompositionState | SettlingCompositionState {
  const fields = {
    sessionId: state.sessionId,
    nextSessionId: state.nextSessionId,
    startMode: state.startMode,
    explicitStartObserved: state.explicitStartObserved,
    latestProvisional: state.latestProvisional,
    latestFinal: state.latestFinal,
    finalConflict: state.finalConflict,
  };
  if (phase === "leased") {
    return ownState({ phase, ...fields });
  }
  if (phase === "mutating") {
    return ownState({ phase, ...fields });
  }
  if (state.phase !== "ending") {
    throw new TypeError("settling requires a terminal composition state");
  }
  return ownState({ phase, ...fields, termination: state.termination });
}

function toEndingState(
  state:
    | ArmedCompositionState
    | LeasedCompositionState
    | MutatingCompositionState
    | EndingCompositionState,
  exitReceiptAvailable: boolean,
  termination: EndingCompositionState["termination"],
): EndingCompositionState {
  return ownState({
    phase: "ending",
    sessionId: state.sessionId,
    nextSessionId: state.nextSessionId,
    startMode: state.startMode,
    explicitStartObserved: state.explicitStartObserved,
    latestProvisional: state.latestProvisional,
    latestFinal: state.latestFinal,
    finalConflict: state.finalConflict,
    termination,
    exitReceiptAvailable:
      state.phase === "ending"
        ? state.exitReceiptAvailable || exitReceiptAvailable
        : exitReceiptAvailable,
  });
}

function updateEvidence(
  state:
    | ArmedCompositionState
    | LeasedCompositionState
    | MutatingCompositionState
    | EndingCompositionState,
  latestProvisional: StoredCompositionEvidence | null,
  latestFinal: StoredCompositionEvidence | null,
  finalConflict: boolean,
):
  | ArmedCompositionState
  | LeasedCompositionState
  | MutatingCompositionState
  | EndingCompositionState {
  const fields = {
    sessionId: state.sessionId,
    nextSessionId: state.nextSessionId,
    startMode: state.startMode,
    explicitStartObserved: state.explicitStartObserved,
    latestProvisional,
    latestFinal,
    finalConflict,
  };
  if (state.phase === "ending") {
      return ownState({
        phase: "ending",
        ...fields,
        termination: state.termination,
        exitReceiptAvailable: state.exitReceiptAvailable,
      });
  }
  if (state.phase === "armed") {
    return ownState({ phase: "armed", ...fields });
  }
  return state.phase === "leased"
    ? ownState({ phase: "leased", ...fields })
    : ownState({ phase: "mutating", ...fields });
}

function confirmExplicitStart(
  state: ArmedCompositionState | LeasedCompositionState | MutatingCompositionState,
): ArmedCompositionState | LeasedCompositionState | MutatingCompositionState {
  const fields = {
    sessionId: state.sessionId,
    nextSessionId: state.nextSessionId,
    startMode: state.startMode,
    explicitStartObserved: true,
    latestProvisional: state.latestProvisional,
    latestFinal: state.latestFinal,
    finalConflict: state.finalConflict,
  };
  if (state.phase === "armed") {
    return ownState({ phase: "armed", ...fields });
  }
  return state.phase === "leased"
    ? ownState({ phase: "leased", ...fields })
    : ownState({ phase: "mutating", ...fields });
}

function transition(
  state: CompositionState,
  effect: CompositionTransitionEffect,
  exitReceiptConsumed = false,
): CompositionResult<CompositionTransition> {
  return compositionSuccess(
    Object.freeze({ state, effect, exitReceiptConsumed }),
  );
}

function candidateFromDom(
  evidence: CompositionDomEvidence,
  source: "event" | "domFallback",
): CompositionCandidate {
  if (evidence.replacementText === evidence.originalText) {
    return Object.freeze({ kind: "cancel", source });
  }
  return evidence.replacementText.length === 0
    ? Object.freeze({ kind: "delete", source })
    : Object.freeze({ kind: "insert", text: evidence.replacementText, source });
}

function snapshotDomEvidence(value: unknown): CompositionDomEvidence | null {
  const record = exactDataRecord(value, ["originalText", "replacementText"]);
  if (record === null) {
    return null;
  }
  const originalText = record["originalText"];
  const replacementText = record["replacementText"];
  return compositionTextIsAdmissible(originalText) &&
    compositionTextIsAdmissible(replacementText)
    ? Object.freeze({ originalText, replacementText })
    : null;
}

function snapshotSignal(input: unknown): SignalSnapshot | null {
  try {
    const kindRecord = exactDataRecord(input, ["kind"]);
    if (kindRecord !== null) {
      const kind = kindRecord["kind"];
      switch (kind) {
        case "start":
        case "implicitStart":
        case "confirmStart":
        case "reserve":
        case "openDom":
        case "end":
        case "definitiveEnd":
        case "blur":
        case "exitKey":
        case "taskBoundary":
        case "settled":
        case "recover":
        case "dispose":
          return Object.freeze({ kind });
        default:
          return null;
      }
    }

    const evidence = exactDataRecord(input, ["kind", "source", "grade", "text"]);
    if (evidence !== null && evidence["kind"] === "evidence") {
      const source = evidence["source"];
      const grade = evidence["grade"];
      const text = evidence["text"];
      if (
        !isEvidenceSource(source) ||
        !isEvidenceGrade(grade) ||
        !evidencePairIsCoherent(source, grade) ||
        (text !== null && !compositionTextIsAdmissible(text))
      ) {
        return null;
      }
      return Object.freeze({ kind: "evidence", source, grade, text });
    }

    const poison = exactDataRecord(input, ["kind", "reason"]);
    if (
      poison !== null &&
      poison["kind"] === "poison" &&
      isAbortReason(poison["reason"])
    ) {
      return Object.freeze({ kind: "poison", reason: poison["reason"] });
    }
    return null;
  } catch {
    return null;
  }
}

function exactDataRecord(
  input: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    return null;
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return null;
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function isEvidenceSource(value: unknown): value is CompositionEvidenceSource {
  return (
    value === "compositionupdate" ||
    value === "compositionend" ||
    value === "beforeinput" ||
    value === "input"
  );
}

function isEvidenceGrade(value: unknown): value is CompositionEvidenceGrade {
  return value === "provisional" || value === "final";
}

function evidencePairIsCoherent(
  source: CompositionEvidenceSource,
  grade: CompositionEvidenceGrade,
): boolean {
  if (source === "compositionupdate") {
    return grade === "provisional";
  }
  if (source === "compositionend") {
    return grade === "final";
  }
  return true;
}

function isAbortReason(value: unknown): value is CompositionAbortReason {
  return typeof value === "string" && ABORT_REASONS.has(value as CompositionAbortReason);
}
