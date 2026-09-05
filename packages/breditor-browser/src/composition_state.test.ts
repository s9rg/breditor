import { describe, expect, it } from "vitest";

import type { CompositionResult } from "./composition_result.js";
import {
  initialCompositionState,
  isOwnedCompositionState,
  reduceCompositionState,
  selectCompositionCandidate,
  type CompositionSignal,
  type CompositionState,
  type CompositionTransition,
} from "./composition_state.js";

function valueOf<T>(result: CompositionResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

function step(
  state: CompositionState,
  signal: CompositionSignal,
): CompositionTransition {
  return valueOf(reduceCompositionState(state, signal));
}

function leased(mode: "start" | "implicitStart" = "start"): CompositionState {
  const armed = step(initialCompositionState(), { kind: mode });
  return step(armed.state, { kind: "reserve" }).state;
}

describe("composition state machine", () => {
  it("runs an explicit lease through one delayed settlement and advances ids", () => {
    const idle = initialCompositionState();
    expect(idle).toEqual({ phase: "idle", nextSessionId: 1n });
    expect(Object.isFrozen(idle)).toBe(true);
    expect(isOwnedCompositionState(idle)).toBe(true);

    const armed = step(idle, { kind: "start" });
    expect(armed).toMatchObject({ effect: "captureBase", exitReceiptConsumed: false });
    expect(armed.state).toMatchObject({
      phase: "armed",
      sessionId: 1n,
      nextSessionId: 2n,
      startMode: "explicit",
      explicitStartObserved: true,
    });

    const reserved = step(armed.state, { kind: "reserve" });
    expect(reserved.effect).toBe("reserveLease");
    expect(reserved.state.phase).toBe("leased");

    const open = step(reserved.state, { kind: "openDom" });
    expect(open.effect).toBe("openDomLease");
    expect(open.state.phase).toBe("mutating");

    const ending = step(open.state, { kind: "end" });
    expect(ending.effect).toBe("scheduleSettlement");
    expect(ending.state).toMatchObject({ phase: "ending", exitReceiptAvailable: true });

    const requested = step(ending.state, { kind: "taskBoundary" });
    expect(requested).toMatchObject({ effect: "requestSettlement" });
    expect(requested.state.phase).toBe("settling");
    expect(step(requested.state, { kind: "taskBoundary" }).effect).toBe("none");

    const settled = step(requested.state, { kind: "settled" });
    expect(settled).toMatchObject({ effect: "closeDomLease" });
    expect(settled.state).toEqual({ phase: "idle", nextSessionId: 2n });
    expect(step(settled.state, { kind: "start" }).state).toMatchObject({
      sessionId: 2n,
      nextSessionId: 3n,
    });
  });

  it("supports a mobile-style implicit start without weakening later transitions", () => {
    const active = leased("implicitStart");
    expect(active).toMatchObject({
      phase: "leased",
      startMode: "implicit",
      explicitStartObserved: false,
    });
    const confirmed = step(active, { kind: "confirmStart" });
    expect(confirmed).toMatchObject({
      effect: "none",
      state: { phase: "leased", explicitStartObserved: true },
    });
    expect(reduceCompositionState(confirmed.state, { kind: "confirmStart" })).toMatchObject({
      ok: false,
      error: { code: "composition.invalid_transition" },
    });
    expect(reduceCompositionState(active, { kind: "implicitStart" })).toMatchObject({
      ok: false,
      error: { code: "composition.invalid_transition" },
    });
  });

  it("keeps only latest constant-space evidence and requires a final value", () => {
    let state = leased();
    state = step(state, {
      kind: "evidence",
      source: "compositionupdate",
      grade: "provisional",
      text: "k",
    }).state;
    state = step(state, {
      kind: "evidence",
      source: "compositionupdate",
      grade: "provisional",
      text: "か",
    }).state;
    expect(state).toMatchObject({
      latestProvisional: { text: "か" },
      latestFinal: null,
    });
    expect("events" in state).toBe(false);

    state = step(state, { kind: "end" }).state;
    expect(selectCompositionCandidate(state)).toMatchObject({
      ok: false,
      error: { code: "composition.candidate_unavailable" },
    });
    expect(selectCompositionCandidate(state, {
      originalText: "",
      replacementText: "か",
    })).toEqual({
      ok: true,
      value: { kind: "insert", text: "か", source: "domFallback" },
    });
  });

  it("lets final evidence win but rejects conflicts instead of guessing", () => {
    let state = leased();
    state = step(state, {
      kind: "evidence",
      source: "compositionupdate",
      grade: "provisional",
      text: "候",
    }).state;
    state = step(state, {
      kind: "evidence",
      source: "compositionend",
      grade: "final",
      text: "候補",
    }).state;
    state = step(state, { kind: "end" }).state;

    expect(selectCompositionCandidate(state, {
      originalText: "",
      replacementText: "候補",
    })).toEqual({
      ok: true,
      value: { kind: "insert", text: "候補", source: "event" },
    });
    expect(selectCompositionCandidate(state, {
      originalText: "",
      replacementText: "different",
    })).toMatchObject({
      ok: false,
      error: { code: "composition.candidate_conflict" },
    });

    let conflicting = leased();
    conflicting = step(conflicting, {
      kind: "evidence",
      source: "compositionend",
      grade: "final",
      text: "a",
    }).state;
    conflicting = step(conflicting, {
      kind: "evidence",
      source: "input",
      grade: "final",
      text: "b",
    }).state;
    conflicting = step(conflicting, { kind: "end" }).state;
    expect(selectCompositionCandidate(conflicting, {
      originalText: "",
      replacementText: "a",
    })).toMatchObject({
      ok: false,
      error: { code: "composition.candidate_conflict" },
    });
  });

  it("uses strict DOM evidence to distinguish empty cancellation and deletion", () => {
    let state = leased();
    state = step(state, {
      kind: "evidence",
      source: "compositionend",
      grade: "final",
      text: "",
    }).state;
    state = step(state, { kind: "end" }).state;
    const candidate = valueOf(selectCompositionCandidate(state, {
      originalText: "",
      replacementText: "",
    }));
    expect(candidate).toEqual({ kind: "cancel", source: "event" });
    expect(Object.isFrozen(candidate)).toBe(true);

    expect(valueOf(selectCompositionCandidate(state, {
      originalText: "selected",
      replacementText: "",
    }))).toEqual({ kind: "delete", source: "event" });
    expect(valueOf(selectCompositionCandidate(state, {
      originalText: "selected",
      replacementText: "selected",
    }))).toEqual({ kind: "cancel", source: "event" });
  });

  it("commits nonempty final evidence even when it equals the selected source text", () => {
    let committed = leased();
    committed = step(committed, {
      kind: "evidence",
      source: "compositionend",
      grade: "final",
      text: "selected",
    }).state;
    committed = step(committed, { kind: "end" }).state;

    expect(valueOf(selectCompositionCandidate(committed, {
      originalText: "selected",
      replacementText: "selected",
    }))).toEqual({ kind: "insert", text: "selected", source: "event" });

    let cancelled = leased();
    cancelled = step(cancelled, {
      kind: "evidence",
      source: "compositionend",
      grade: "final",
      text: "",
    }).state;
    cancelled = step(cancelled, { kind: "end" }).state;
    expect(valueOf(selectCompositionCandidate(cancelled, {
      originalText: "selected",
      replacementText: "selected",
    }))).toEqual({ kind: "cancel", source: "event" });
  });

  it("consumes at most one post-composition exit receipt", () => {
    let state = step(leased(), { kind: "end" }).state;
    const first = step(state, { kind: "exitKey" });
    expect(first).toMatchObject({
      effect: "requestSettlement",
      exitReceiptConsumed: true,
    });
    expect(first.state.phase).toBe("settling");
    const duplicate = step(first.state, { kind: "exitKey" });
    expect(duplicate).toMatchObject({ effect: "none", exitReceiptConsumed: false });

    state = step(leased(), { kind: "blur" }).state;
    expect(state).toMatchObject({ phase: "ending", exitReceiptAvailable: false });
    expect(step(state, { kind: "exitKey" })).toMatchObject({
      effect: "none",
      exitReceiptConsumed: false,
    });
    expect(step(state, { kind: "taskBoundary" }).effect).toBe("requestSettlement");
  });

  it("never commits provisional DOM merely because focus blurred", () => {
    let state = leased();
    state = step(state, {
      kind: "evidence",
      source: "compositionupdate",
      grade: "provisional",
      text: "intermediate",
    }).state;
    state = step(state, { kind: "blur" }).state;

    expect(state).toMatchObject({ phase: "ending", termination: "blur" });
    expect(
      selectCompositionCandidate(state, {
        originalText: "",
        replacementText: "intermediate",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "composition.candidate_unavailable" },
    });
    expect(
      valueOf(
        selectCompositionCandidate(state, {
          originalText: "same",
          replacementText: "same",
        }),
      ),
    ).toEqual({ kind: "cancel", source: "domFallback" });
  });

  it("allows a definitive input end and keeps duplicate terminal signals idempotent", () => {
    let state = leased("implicitStart");
    state = step(state, {
      kind: "evidence",
      source: "input",
      grade: "final",
      text: "한",
    }).state;
    const ending = step(state, { kind: "definitiveEnd" });
    expect(ending).toMatchObject({
      effect: "scheduleSettlement",
      state: { phase: "ending", termination: "definitiveInput" },
    });
    const duplicate = step(ending.state, { kind: "definitiveEnd" });
    expect(duplicate).toMatchObject({
      effect: "none",
      state: { phase: "ending", termination: "definitiveInput" },
    });
  });

  it("quarantines an active lease and recovers only through a full restore", () => {
    const active = leased();
    const poisoned = step(active, {
      kind: "poison",
      reason: "unexpectedMutation",
    });
    expect(poisoned).toMatchObject({ effect: "restoreBaseDom" });
    expect(poisoned.state).toMatchObject({
      phase: "quarantined",
      sessionId: 1n,
      reason: "unexpectedMutation",
    });
    expect(step(poisoned.state, { kind: "poison", reason: "uncertain" }).state).toBe(
      poisoned.state,
    );
    const recovered = step(poisoned.state, { kind: "recover" });
    expect(recovered).toMatchObject({ effect: "closeDomLease" });
    expect(recovered.state).toEqual({ phase: "idle", nextSessionId: 2n });
  });

  it("disposes idempotently and requests restore only for live leases", () => {
    const idle = initialCompositionState();
    const idleDisposed = step(idle, { kind: "dispose" });
    expect(idleDisposed).toMatchObject({ effect: "none", state: { phase: "disposed" } });
    expect(step(idleDisposed.state, { kind: "dispose" }).effect).toBe("none");

    const activeDisposed = step(leased(), { kind: "dispose" });
    expect(activeDisposed).toMatchObject({
      effect: "restoreBaseDom",
      state: { phase: "disposed" },
    });
  });

  it("rejects invalid transitions and hostile signals without touching prior state", () => {
    const idle = initialCompositionState();
    expect(reduceCompositionState(idle, { kind: "reserve" })).toMatchObject({
      ok: false,
      error: { code: "composition.invalid_transition" },
    });
    expect(reduceCompositionState(idle, { kind: "start", extra: true })).toMatchObject({
      ok: false,
      error: { code: "composition.invalid_signal" },
    });

    const accessor = Object.defineProperty({}, "kind", {
      get() {
        throw new Error("must not invoke");
      },
    });
    expect(() => reduceCompositionState(idle, accessor)).not.toThrow();
    expect(reduceCompositionState(idle, accessor)).toMatchObject({
      ok: false,
      error: { code: "composition.invalid_signal" },
    });

    const proxy = new Proxy({}, {
      ownKeys() {
        throw new Error("hostile proxy");
      },
    });
    expect(() => reduceCompositionState(idle, proxy)).not.toThrow();
    expect(reduceCompositionState(idle, proxy)).toMatchObject({
      ok: false,
      error: { code: "composition.invalid_signal" },
    });
    expect(reduceCompositionState({}, { kind: "start" })).toMatchObject({
      ok: false,
      error: { code: "composition.invalid_state" },
    });
    expect(idle).toEqual({ phase: "idle", nextSessionId: 1n });
  });

  it("rejects incoherent sources and oversized or malformed evidence", () => {
    const active = leased();
    expect(
      reduceCompositionState(active, {
        kind: "evidence",
        source: "compositionend",
        grade: "provisional",
        text: "x",
      }),
    ).toMatchObject({ ok: false, error: { code: "composition.invalid_signal" } });
    expect(
      reduceCompositionState(active, {
        kind: "evidence",
        source: "compositionupdate",
        grade: "provisional",
        text: "\ud800",
      }),
    ).toMatchObject({ ok: false, error: { code: "composition.invalid_signal" } });
    expect(selectCompositionCandidate(step(active, { kind: "end" }).state, 42)).toMatchObject({
      ok: false,
      error: { code: "composition.invalid_text" },
    });
  });
});
