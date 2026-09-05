import { beforeEach, describe, expect, it, vi } from "vitest";

import { BreditorDomRenderer, type RenderedProjection } from "./dom_renderer.js";
import { BreditorDomSelectionBridge } from "./dom_selection.js";
import {
  editorDeliveryAuthorityAccepts,
  noSelectionSync,
  rangeSelectionSync,
  stringActionRequest,
  type EngineCommandRequest,
} from "./editor_command.js";
import { BaseDocumentProjection } from "./projection.js";
import { BaseRangeSelection, type BaseEditorSelection } from "./selection.js";
import type { BrowserSelectionResult } from "./selection_result.js";
import type {
  SemanticProjectionUpdateView,
  SemanticProjectionView,
} from "./wasm_projection_adapter.js";
import type { SemanticSelectionView } from "./wasm_selection_adapter.js";
import {
  BreditorWasmCommandAdapter,
  type WasmCommandEngineView,
  type WasmCommandErrorView,
  type WasmCommandObservationView,
  type WasmCommandResultView,
  type WasmSelectionResultView,
} from "./wasm_command_adapter.js";

interface ProjectionFixture {
  readonly projection: BaseDocumentProjection;
  readonly renderer: BreditorDomRenderer;
  readonly rendered: RenderedProjection;
  readonly host: HTMLElement;
}

interface TrackedObservation extends WasmCommandObservationView {
  readonly free: () => void;
}

interface TrackedResult {
  readonly view: WasmCommandResultView;
  readonly free: () => void;
}

beforeEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe("BreditorWasmCommandAdapter", () => {
  it("runs selection then command, renders the update, and returns no Wasm handles", () => {
    const base = projectionFixture(0, "a");
    const resultProjection = projection(1, "ax");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    expect(bridge.write(base.rendered, selected).ok).toBe(true);

    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const update = projectionUpdate(base.projection, resultProjection);
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: update.view,
    });
    const semanticSelection = selectionResult(selectionView(1, 2));
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
      selection: [semanticSelection.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const token = adapter.deliveryToken();
    expect(editorDeliveryAuthorityAccepts(adapter.deliveryAuthority, token)).toBe(true);
    const request = stringActionRequest(
      token,
      rangeSelectionSync(selected),
      { kind: "beforeinput", detail: "insertText" },
      "breditor/insert-text",
      "x",
    );

    const outcome = adapter.execute(request);

    expect(outcome.status).toBe("delivered");
    expect(outcome.selection.status).toBe("unchanged");
    expect(outcome.command).toMatchObject({
      status: "committed",
      eventKind: "action",
      snapshot: { lineage: "adapter-tests", revision: "1" },
      render: { mode: "incremental" },
    });
    expect("projectionUpdate" in outcome.command).toBe(false);
    expect(outcome.rendered).toBe(adapter.rendered);
    expect(adapter.snapshot.revision).toBe("1");
    expect(base.host.textContent).toBe("ax");
    expect(adapter.acceptsDeliveryToken(token)).toBe(false);
    expect(editorDeliveryAuthorityAccepts(adapter.deliveryAuthority, token)).toBe(false);
    expect(initial.free).toHaveBeenCalledOnce();
    expect(synchronized.free).toHaveBeenCalledOnce();
    expect(syncResult.free).toHaveBeenCalledOnce();
    expect(actionResult.free).toHaveBeenCalledOnce();
    expect(update.free).toHaveBeenCalledOnce();
    expect(semanticSelection.free).toHaveBeenCalledOnce();
    expect(semanticSelection.selectionFree).toHaveBeenCalledOnce();

    const observed = bridge.read(adapter.rendered);
    expect(observed.ok && observed.value.kind === "range"
      ? observed.value.origin
      : "missing").toBe("programmaticEcho");
    adapter.dispose();
    expect(committed.free).toHaveBeenCalledOnce();
  });

  it("spends a token before a structured rejection and never silently retries it", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const rejected = commandError("editor_engine.selection_update");
    const setRangeSelection = vi.fn(() => rejected.view);
    const engine = engineQueues({ setRangeSelection });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const request = actionRequest(adapter, selected);

    expect(() => adapter.execute(request)).toThrow(/selection_update/u);
    expect(adapter.state).toBe("live");
    expect(setRangeSelection).toHaveBeenCalledOnce();
    expect(rejected.free).toHaveBeenCalledOnce();
    expect(rejected.errorFree).toHaveBeenCalledOnce();

    expect(() => adapter.execute(request)).toThrow(/stale or foreign/u);
    expect(setRangeSelection).toHaveBeenCalledOnce();
    expect(adapter.deliveryToken()).not.toBe(request.delivery);
    adapter.dispose();
  });

  it.each([
    "editor_engine.stale_engine",
    "editor_engine.stale_snapshot",
    "editor_engine.stale_history",
  ])("faults permanently on structured stale rejection %s", (code) => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const rejected = commandError(code);
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [rejected.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(code);
    expect(adapter.state).toBe("faulted");
    expect(() => adapter.deliveryToken()).toThrow(/faulted/u);
    expect(adapter.restoreCanonicalRender()).toEqual({
      ok: false,
      reason: "adapterUnavailable",
    });
    expect(rejected.free).toHaveBeenCalledOnce();
    expect(rejected.errorFree).toHaveBeenCalledOnce();
    expect(synchronized.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(synchronized.free).toHaveBeenCalledOnce();
  });

  it("accepts only an exact disabled action outcome on the unchanged snapshot", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const disabledObservation = observation(0);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const disabled = commandResult({
      status: "disabled",
      successor: disabledObservation,
      disabledActionId: "breditor/insert-text",
      disabledReasonCode: "breditor/not-enabled",
      activation: "inactive",
    });
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [disabled.view],
    });
    const executeStringAction = vi.spyOn(engine, "executeStringAction");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    const outcome = adapter.execute(actionRequest(adapter, selected));

    expect(executeStringAction).toHaveBeenCalledWith(
      synchronized,
      "breditor/insert-text",
      "x",
    );
    expect(outcome.command).toEqual({
      status: "disabled",
      actionId: "breditor/insert-text",
      reasonCode: "breditor/not-enabled",
      activation: "inactive",
      snapshot: { lineage: "adapter-tests", revision: "0" },
    });
    expect(outcome.rendered).toBe(base.rendered);
    expect(adapter.snapshot.revision).toBe("0");
    expect(base.host.textContent).toBe("a");
    expect(disabled.free).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(disabledObservation.free).toHaveBeenCalledOnce();
  });

  it.each(["wrong action ID", "changed snapshot", "projection update"])(
    "rejects a disabled result with %s",
    (violation) => {
      const base = projectionFixture(0, "a");
      const bridge = new BreditorDomSelectionBridge();
      const selected = selection(base.projection, 1);
      bridge.write(base.rendered, selected);
      const initial = observation(0);
      const synchronized = observation(0);
      const successor = observation(violation === "changed snapshot" ? 1 : 0);
      const syncResult = commandResult({ status: "unchanged", successor: synchronized });
      const exposedUpdate = violation === "projection update"
        ? projectionUpdate(base.projection, projection(1, "ax"))
        : undefined;
      const disabled = commandResult({
        status: "disabled",
        successor,
        disabledActionId: violation === "wrong action ID"
          ? "breditor/delete-forward"
          : "breditor/insert-text",
        disabledReasonCode: "breditor/not-enabled",
        activation: "inactive",
        ...(exposedUpdate === undefined ? {} : { update: exposedUpdate.view }),
      });
      const engine = engineQueues({
        setSelection: [syncResult.view],
        stringAction: [disabled.view],
      });
      const adapter = new BreditorWasmCommandAdapter(engine, initial, {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: bridge,
      });

      expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(
        /disabled result violated/u,
      );
      expect(adapter.state).toBe("faulted");
      expect(disabled.free).toHaveBeenCalledOnce();
      expect(successor.free).toHaveBeenCalledOnce();
      if (exposedUpdate !== undefined) {
        expect(exposedUpdate.free).toHaveBeenCalledOnce();
      }
      adapter.dispose();
    },
  );

  it("accepts a close-history commit only on the same snapshot without an update", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const bounded = observation(0);
    const finished = observation(0);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const boundaryResult = commandResult({
      status: "committed",
      eventKind: "closeHistoryGroup",
      successor: bounded,
    });
    const actionResult = disabledActionResult(finished);
    const engine = engineQueues({
      setSelection: [syncResult.view],
      closeHistory: [boundaryResult.view],
      stringAction: [actionResult.view],
    });
    const closeHistoryGroup = vi.spyOn(engine, "closeHistoryGroup");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const request = stringActionRequest(
      adapter.deliveryToken(),
      rangeSelectionSync(selected),
      { kind: "api", detail: "history-boundary-test" },
      "breditor/insert-text",
      "x",
      "closeBefore",
    );

    const outcome = adapter.execute(request);

    expect(closeHistoryGroup).toHaveBeenCalledWith(synchronized);
    expect(outcome.boundary).toEqual({
      status: "committed",
      eventKind: "closeHistoryGroup",
      snapshot: { lineage: "adapter-tests", revision: "0" },
      render: undefined,
    });
    expect(outcome.command.status).toBe("disabled");
    expect(adapter.snapshot.revision).toBe("0");
    expect(base.host.textContent).toBe("a");
    adapter.dispose();
  });

  it.each(["changed snapshot", "projection update"])(
    "rejects a close-history commit with %s",
    (violation) => {
      const base = projectionFixture(0, "a");
      const bridge = new BreditorDomSelectionBridge();
      const selected = selection(base.projection, 1);
      bridge.write(base.rendered, selected);
      const initial = observation(0);
      const synchronized = observation(0);
      const boundaryObservation = observation(violation === "changed snapshot" ? 1 : 0);
      const syncResult = commandResult({ status: "unchanged", successor: synchronized });
      const exposedUpdate = violation === "projection update"
        ? projectionUpdate(base.projection, projection(1, "ax"))
        : undefined;
      const boundaryResult = commandResult({
        status: "committed",
        eventKind: "closeHistoryGroup",
        successor: boundaryObservation,
        ...(exposedUpdate === undefined ? {} : { update: exposedUpdate.view }),
      });
      const engine = engineQueues({
        setSelection: [syncResult.view],
        closeHistory: [boundaryResult.view],
      });
      const adapter = new BreditorWasmCommandAdapter(engine, initial, {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: bridge,
      });
      const request = stringActionRequest(
        adapter.deliveryToken(),
        rangeSelectionSync(selected),
        { kind: "api", detail: "history-boundary-test" },
        "breditor/insert-text",
        "x",
        "closeBefore",
      );

      expect(() => adapter.execute(request)).toThrow(/correlation contract|history-only/u);
      expect(adapter.state).toBe("faulted");
      expect(boundaryResult.free).toHaveBeenCalledOnce();
      expect(boundaryObservation.free).toHaveBeenCalledOnce();
      if (exposedUpdate !== undefined) {
        expect(exposedUpdate.free).toHaveBeenCalledOnce();
      }
      adapter.dispose();
    },
  );

  it("rejects an unchanged action result which the Rust action ABI cannot produce", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const unchangedObservation = observation(0);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const malformed = commandResult({
      status: "unchanged",
      successor: unchangedObservation,
    });
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [malformed.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(
      /unchanged result violated/u,
    );
    expect(adapter.state).toBe("faulted");
    expect(malformed.free).toHaveBeenCalledOnce();
    expect(unchangedObservation.free).toHaveBeenCalledOnce();
    expect(synchronized.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(synchronized.free).toHaveBeenCalledOnce();
  });

  it("faults a commit-bearing action which omits its projection update", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const malformed = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
    });
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [malformed.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(
      /omitted its projection update/u,
    );
    expect(adapter.state).toBe("faulted");
    expect(malformed.free).toHaveBeenCalledOnce();
    expect(committed.free).toHaveBeenCalledOnce();
    expect(adapter.snapshot.revision).toBe("0");
    adapter.dispose();
  });

  it("rejects aliased generated handles and frees the alias only once", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const free = vi.fn();
    let aliasedResult: WasmCommandResultView;
    aliasedResult = {
      status: "unchanged",
      eventKind: undefined,
      disabledActionId: undefined,
      disabledReasonCode: undefined,
      activation: undefined,
      error: undefined,
      observation: () => aliasedResult as unknown as WasmCommandObservationView,
      projectionUpdate: () => undefined,
      free,
    };
    const engine = engineQueues({ setSelection: [aliasedResult] });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(/alias/u);
    expect(adapter.state).toBe("faulted");
    expect(free).toHaveBeenCalledOnce();
    expect(initial.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it("never frees a current observation smuggled out as a nested projection", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const update = projectionUpdate(base.projection, projection(1, "ax"));
    const hostileUpdate: SemanticProjectionUpdateView = {
      ...update.view,
      takeProjection: () => synchronized as unknown as SemanticProjectionView,
    };
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: hostileUpdate,
    });
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(
      /projection update is invalid/u,
    );
    expect(adapter.state).toBe("faulted");
    expect(synchronized.free).not.toHaveBeenCalled();
    expect(committed.free).toHaveBeenCalledOnce();
    expect(actionResult.free).toHaveBeenCalledOnce();
    expect(update.free).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(synchronized.free).toHaveBeenCalledOnce();
  });

  it("routes an explicit none selection through clearSelection", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    expect(bridge.write(base.rendered, selected).ok).toBe(true);
    const initial = observation(0);
    const cleared = observation(0);
    const finished = observation(0);
    const clearResult = commandResult({ status: "unchanged", successor: cleared });
    const actionResult = disabledActionResult(finished);
    const engine = engineQueues({
      setSelection: [clearResult.view],
      stringAction: [actionResult.view],
    });
    const clearSelection = vi.spyOn(engine, "clearSelection");
    const setRangeSelection = vi.spyOn(engine, "setRangeSelection");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const request = stringActionRequest(
      adapter.deliveryToken(),
      noSelectionSync(),
      { kind: "api", detail: "clear-selection-test" },
      "breditor/insert-text",
      "x",
    );

    expect(adapter.execute(request).status).toBe("delivered");
    expect(clearSelection).toHaveBeenCalledWith(initial);
    expect(setRangeSelection).not.toHaveBeenCalled();
    expect(window.getSelection()?.rangeCount).toBe(0);
    adapter.dispose();
  });

  it("faults on an inexact successor and frees untrusted handles without freeing authority", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const jumped = observation(1);
    const malformed = commandResult({ status: "unchanged", successor: jumped });
    const engine = engineQueues({ setSelection: [malformed.view] });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(
      /correlation contract/u,
    );
    expect(adapter.state).toBe("faulted");
    expect(jumped.free).toHaveBeenCalledOnce();
    expect(malformed.free).toHaveBeenCalledOnce();
    expect(initial.free).not.toHaveBeenCalled();
    expect(adapter.restoreCanonicalRender()).toEqual({
      ok: false,
      reason: "adapterUnavailable",
    });
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it("blocks direct adapter reentrancy while the outer delivery owns its base", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const actionObservation = observation(0);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const actionResult = disabledActionResult(actionObservation);
    let adapter: BreditorWasmCommandAdapter;
    let request: EngineCommandRequest;
    const reentrantFailure = vi.fn();
    const engine = engineQueues({
      setRangeSelection: () => {
        try {
          adapter.execute(request);
        } catch (error) {
          reentrantFailure(error);
        }
        return syncResult.view;
      },
      stringAction: [actionResult.view],
    });
    adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    request = actionRequest(adapter, selected);

    expect(adapter.execute(request).status).toBe("delivered");
    expect(reentrantFailure).toHaveBeenCalledOnce();
    expect(String(reentrantFailure.mock.calls[0]?.[0])).toContain("executing");
    expect(adapter.state).toBe("live");
    adapter.dispose();
  });

  it("retains a valid successor after DOM failure and restores a canonical render", () => {
    const base = projectionFixture(0, "a");
    const resultProjection = projection(1, "ax");
    const bridge = new FailOnWriteBridge(3);
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: projectionUpdate(base.projection, resultProjection).view,
    });
    const afterAction = selectionResult(selectionView(1, 2));
    const afterRestore = selectionResult(selectionView(1, 2));
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
      selection: [afterAction.view, afterRestore.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() =>
      adapter.execute(
        stringActionRequest(
          adapter.deliveryToken(),
          rangeSelectionSync(selected),
          { kind: "beforeinput", detail: "insertText" },
          "breditor/insert-text",
          "x",
        ),
      ),
    ).toThrow(/canonical DOM restoration/u);
    expect(adapter.state).toBe("reconcile");
    expect(adapter.snapshot.revision).toBe("1");
    expect(base.host.textContent).toBe("ax");
    expect(adapter.restoreCanonicalRender().ok).toBe(true);
    expect(adapter.state).toBe("live");
    expect(adapter.deliveryToken().snapshotRevision).toBe("1");
    adapter.dispose();
  });

  it("enters reconciliation after renderer.update fails and restores from the retained projection", () => {
    const base = projectionFixture(0, "a");
    const resultProjection = projection(1, "ax");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const update = projectionUpdate(base.projection, resultProjection);
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: update.view,
    });
    const afterRestore = selectionResult(selectionView(1, 2));
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
      selection: [afterRestore.view],
    });
    const updateRender = vi.spyOn(base.renderer, "update").mockReturnValueOnce({
      ok: false,
      error: {
        code: "renderer.dom_write_failed",
        message: "The DOM projection could not be installed.",
      },
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(
      /canonical DOM restoration/u,
    );
    expect(updateRender).toHaveBeenCalledOnce();
    expect(adapter.state).toBe("reconcile");
    expect(adapter.snapshot.revision).toBe("1");
    expect(adapter.rendered).toBe(base.rendered);
    expect(base.host.textContent).toBe("a");
    expect(update.free).toHaveBeenCalledOnce();

    const restored = adapter.restoreCanonicalRender();
    expect(restored.ok).toBe(true);
    expect(adapter.state).toBe("live");
    expect(adapter.rendered).not.toBe(base.rendered);
    expect(base.host.textContent).toBe("ax");
    expect(adapter.deliveryToken().snapshotRevision).toBe("1");
    expect(afterRestore.free).toHaveBeenCalledOnce();
    expect(afterRestore.selectionFree).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it("faults when projection-update metadata disagrees with its taken result snapshot", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const mismatchedUpdate = projectionUpdate(base.projection, projection(1, "ax"));
    const mismatchedView: SemanticProjectionUpdateView = {
      ...mismatchedUpdate.view,
      resultRevision: "2",
    };
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: mismatchedView,
    });
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
    });
    const renderUpdate = vi.spyOn(base.renderer, "update");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(
      /projection update is invalid/u,
    );
    expect(adapter.state).toBe("faulted");
    expect(adapter.snapshot.revision).toBe("0");
    expect(renderUpdate).not.toHaveBeenCalled();
    expect(mismatchedUpdate.free).toHaveBeenCalledOnce();
    expect(actionResult.free).toHaveBeenCalledOnce();
    expect(committed.free).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it("attempts every cleanup and faults if a generated free throws", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: projectionUpdate(base.projection, projection(1, "ax")).view,
      freeThrows: true,
    });
    const selectionRead = selectionResult(selectionView(1, 2));
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
      selection: [selectionRead.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() =>
      adapter.execute(
        stringActionRequest(
          adapter.deliveryToken(),
          rangeSelectionSync(selected),
          { kind: "beforeinput", detail: "insertText" },
          "breditor/insert-text",
          "x",
        ),
      ),
    ).toThrow(/free failed/u);
    expect(actionResult.free).toHaveBeenCalledOnce();
    expect(synchronized.free).toHaveBeenCalledOnce();
    expect(adapter.state).toBe("faulted");
    adapter.dispose();
    expect(committed.free).toHaveBeenCalledOnce();
  });

  it("releases a newly installed render when a hostile selection result throws", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: projectionUpdate(base.projection, projection(1, "ax")).view,
    });
    const selectionFree = vi.fn();
    const hostileSelection = Object.defineProperties(
      {
        error: undefined,
        takeSelection: () => undefined,
        free: selectionFree,
      },
      {
        status: {
          get() {
            throw new Error("hostile selection status");
          },
        },
      },
    ) as unknown as WasmSelectionResultView;
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
      selection: [hostileSelection],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const release = vi.spyOn(base.renderer, "release");

    expect(() =>
      adapter.execute(
        stringActionRequest(
          adapter.deliveryToken(),
          rangeSelectionSync(selected),
          { kind: "beforeinput", detail: "insertText" },
          "breditor/insert-text",
          "x",
        ),
      ),
    ).toThrow(/hostile selection status/u);
    expect(adapter.state).toBe("faulted");
    expect(release).toHaveBeenCalledOnce();
    expect(release.mock.calls[0]?.[0]).not.toBe(base.rendered);
    expect(selectionFree).toHaveBeenCalledOnce();
    expect(committed.free).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it("never frees an outer command result smuggled out as a nested selection", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const update = projectionUpdate(base.projection, projection(1, "ax"));
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: update.view,
    });
    const hostileSelection = selectionResult(
      actionResult.view as unknown as SemanticSelectionView,
    );
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
      selection: [hostileSelection.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const release = vi.spyOn(base.renderer, "release");

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(/alias/u);
    expect(adapter.state).toBe("faulted");
    expect(actionResult.free).toHaveBeenCalledOnce();
    expect(hostileSelection.free).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(synchronized.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(synchronized.free).toHaveBeenCalledOnce();
    expect(committed.free).toHaveBeenCalledOnce();
  });
});

function projectionFixture(revision: number, text: string): ProjectionFixture {
  const documentProjection = projection(revision, text);
  const renderer = new BreditorDomRenderer();
  const host = document.createElement("div");
  document.body.append(host);
  const result = renderer.render(host, documentProjection);
  if (!result.ok) throw new Error(result.error.code);
  return { projection: documentProjection, renderer, rendered: result.value.rendered, host };
}

function projection(revision: number, text: string): BaseDocumentProjection {
  const result = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "adapter-tests", revision: String(revision) },
    paragraphs: [{ runs: [{ text, strong: false }] }],
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function selection(documentProjection: BaseDocumentProjection, offset: number): BaseRangeSelection {
  const result = BaseRangeSelection.create(documentProjection, {
    kind: "range",
    anchor: {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: offset,
      affinity: "before",
    },
    focus: {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: offset,
      affinity: "before",
    },
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function observation(revision: number): TrackedObservation {
  return {
    snapshotLineage: "adapter-tests",
    snapshotRevision: String(revision),
    free: vi.fn(),
  };
}

function actionRequest(
  adapter: BreditorWasmCommandAdapter,
  selected: BaseRangeSelection,
): EngineCommandRequest {
  return stringActionRequest(
    adapter.deliveryToken(),
    rangeSelectionSync(selected),
    { kind: "api", detail: "adapter-test" },
    "breditor/insert-text",
    "x",
  );
}

function commandResult(input: Readonly<{
  status: "committed" | "disabled" | "unchanged";
  eventKind?: WasmCommandResultView["eventKind"];
  disabledActionId?: string;
  disabledReasonCode?: string;
  activation?: WasmCommandResultView["activation"];
  successor: WasmCommandObservationView;
  update?: SemanticProjectionUpdateView;
  freeThrows?: boolean;
}>): TrackedResult {
  const free = input.freeThrows
    ? vi.fn(() => {
        throw new Error("free failed");
      })
    : vi.fn();
  return {
    free,
    view: {
      status: input.status,
      eventKind: input.eventKind,
      disabledActionId: input.disabledActionId,
      disabledReasonCode: input.disabledReasonCode,
      activation: input.activation,
      error: undefined,
      observation: () => input.successor,
      projectionUpdate: () => input.update,
      free,
    },
  };
}

function disabledActionResult(successor: WasmCommandObservationView): TrackedResult {
  return commandResult({
    status: "disabled",
    successor,
    disabledActionId: "breditor/insert-text",
    disabledReasonCode: "breditor/not-enabled",
    activation: "inactive",
  });
}

function commandError(code: string) {
  const errorFree = vi.fn();
  const error: WasmCommandErrorView = {
    code,
    message: "the command was rejected",
    free: errorFree,
  };
  const free = vi.fn();
  const view: WasmCommandResultView = {
    status: "error",
    eventKind: undefined,
    disabledActionId: undefined,
    disabledReasonCode: undefined,
    activation: undefined,
    error,
    observation: () => undefined,
    projectionUpdate: () => undefined,
    free,
  };
  return { view, free, errorFree };
}

function projectionUpdate(
  base: BaseDocumentProjection,
  result: BaseDocumentProjection,
) {
  let projectionTaken = false;
  const free = vi.fn();
  const view: SemanticProjectionUpdateView = {
    baseLineage: base.snapshot.lineage,
    baseRevision: base.snapshot.revision,
    resultLineage: result.snapshot.lineage,
    resultRevision: result.snapshot.revision,
    impact: "textContainers",
    affectedParagraphCount: 1,
    oldChildStart: undefined,
    oldChildEnd: undefined,
    newChildStart: undefined,
    newChildEnd: undefined,
    affectedParagraphIndex: (index) => index === 0 ? 0 : undefined,
    takeProjection: () => {
      if (projectionTaken) return undefined;
      projectionTaken = true;
      return projectionView(result);
    },
    free,
  };
  return { view, free };
}

function projectionView(documentProjection: BaseDocumentProjection): SemanticProjectionView {
  const text = documentProjection.paragraphs[0]?.runs[0]?.text ?? "";
  return {
    schemaName: "breditor/base",
    schemaVersion: 1,
    snapshotLineage: documentProjection.snapshot.lineage,
    snapshotRevision: documentProjection.snapshot.revision,
    nodeCount: 3,
    rootIndex: 0,
    nodeKind: (index) => index === 0 || index === 1 ? "element" : index === 2 ? "text" : undefined,
    elementType: (index) => index === 0
      ? "breditor/document"
      : index === 1
        ? "breditor/paragraph"
        : undefined,
    childCount: (index) => index === 0 || index === 1 ? 1 : undefined,
    childAt: (index, ordinal) => ordinal !== 0
      ? undefined
      : index === 0
        ? 1
        : index === 1
          ? 2
          : undefined,
    text: (index) => index === 2 ? text : undefined,
    formatCount: (index) => index === 2 ? 0 : undefined,
    formatType: () => undefined,
    free: vi.fn(),
  };
}

function selectionView(revision: number, offset: number): SemanticSelectionView {
  return {
    snapshotLineage: "adapter-tests",
    snapshotRevision: String(revision),
    kind: "range",
    anchorPointKind: "text",
    anchorNodeIndex: 2,
    anchorOffset: offset,
    anchorAffinity: "before",
    focusPointKind: "text",
    focusNodeIndex: 2,
    focusOffset: offset,
    focusAffinity: "before",
    rangeOrder: "collapsed",
    free: vi.fn(),
  };
}

function selectionResult(view: SemanticSelectionView) {
  let taken = false;
  const free = vi.fn();
  const result: WasmSelectionResultView = {
    status: "selection",
    error: undefined,
    takeSelection: () => {
      if (taken) return undefined;
      taken = true;
      return view;
    },
    free,
  };
  return {
    view: result,
    free,
    selectionFree: view.free,
  };
}

function engineQueues(input: Readonly<{
  setSelection?: WasmCommandResultView[];
  setRangeSelection?: () => WasmCommandResultView;
  stringAction?: WasmCommandResultView[];
  noInputAction?: WasmCommandResultView[];
  closeHistory?: WasmCommandResultView[];
  selection?: WasmSelectionResultView[];
}>): WasmCommandEngineView {
  const take = <T>(values: T[] | undefined, name: string): T => {
    const value = values?.shift();
    if (value === undefined) throw new Error(`unexpected ${name}`);
    return value;
  };
  return {
    clearSelection: () => take(input.setSelection, "clearSelection"),
    setRangeSelection: () => input.setRangeSelection?.() ?? take(input.setSelection, "setRangeSelection"),
    selection: () => take(input.selection, "selection"),
    executeNoInputAction: () => take(input.noInputAction, "executeNoInputAction"),
    executeStringAction: () => take(input.stringAction, "executeStringAction"),
    undo: () => { throw new Error("unexpected undo"); },
    redo: () => { throw new Error("unexpected redo"); },
    closeHistoryGroup: () => take(input.closeHistory, "closeHistoryGroup"),
  };
}

class FailOnWriteBridge extends BreditorDomSelectionBridge {
  #writes = 0;

  constructor(private readonly failAt: number) {
    super();
  }

  override write(
    rendered: RenderedProjection,
    selected: BaseEditorSelection,
  ): BrowserSelectionResult<{
    readonly kind: "range" | "none";
    readonly rendererGeneration: bigint;
  }> {
    this.#writes += 1;
    if (this.#writes === this.failAt) {
      return {
        ok: false,
        error: {
          code: "selection.dom_write_failed",
          message: "The DOM selection could not be installed exactly.",
        },
      };
    }
    return super.write(rendered, selected);
  }
}
