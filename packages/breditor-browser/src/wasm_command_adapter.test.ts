import { beforeEach, describe, expect, it, vi } from "vitest";

import { BreditorDomRenderer, type RenderedProjection } from "./dom_renderer.js";
import { BreditorDomSelectionBridge } from "./dom_selection.js";
import { issueCompositionDeliveryToken } from "./composition_delivery_token.js";
import {
  closeHistoryGroupRequest,
  editorDeliveryAuthorityAccepts,
  noInputActionRequest,
  noInputIntentRequest,
  noSelectionSync,
  preserveSelectionSync,
  rangeSelectionSync,
  selectionSynchronizationRequest,
  stringActionRequest,
  type EditorCommandRequest,
  type EditorDeliveryToken,
  type EngineCommandRequest,
} from "./editor_command.js";
import { BaseDocumentProjection } from "./projection.js";
import { BaseRangeSelection, type BaseEditorSelection } from "./selection.js";
import { BreditorCommandQueue } from "./command_queue.js";
import type { BrowserSelectionResult } from "./selection_result.js";
import type {
  SemanticProjectionUpdateView,
  SemanticProjectionView,
} from "./wasm_projection_adapter.js";
import { associateProjectionWithProfileGeneration } from "./wasm_projection_adapter.js";
import type { SemanticSelectionView } from "./wasm_selection_adapter.js";
import {
  isOwnedBrowserSessionCheckpointReadResult,
  type WasmSessionCheckpointStringResultView,
} from "./wasm_session_checkpoint.js";
import {
  isOwnedBrowserDocumentJsonReadResult,
  type WasmDocumentJsonStringResultView,
} from "./wasm_document_json.js";
import {
  isOwnedBrowserActionStateReadResult,
  type WasmActionStateSnapshotView,
  type WasmActionStateStringResultView,
  type WasmActionStatesResultView,
} from "./wasm_action_state_adapter.js";
import {
  BreditorWasmCommandAdapter as RawBreditorWasmCommandAdapter,
  MAX_WASM_CORE_COMMIT_OBSERVERS,
  type BreditorWasmCommandAdapterOptions,
  type WasmCommandEngineView,
  type WasmCommandErrorView,
  type WasmCommandObservationView,
  type WasmCommandResultView,
  type WasmCommandSequenceOutcome,
  type WasmIntentResultView,
  type WasmSelectionResultView,
} from "./wasm_command_adapter.js";
import type {
  BrowserCompiledProfileDescriptor,
  WasmCompiledProfileDescriptorView,
  WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";
import { consumeWasmCompiledProfileDescriptor } from "./wasm_profile_descriptor.js";

const TEST_SCHEMA_FINGERPRINT =
  "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
const TEST_INTENT_ID = "breditor/format-strong";
const TEST_PROFILE_GENERATION: WasmProfileGenerationView = {
  matches(other) {
    return other === TEST_PROFILE_GENERATION;
  },
  free: vi.fn(),
};
const matchesTestProfile = (generation: WasmProfileGenerationView): boolean =>
  generation === TEST_PROFILE_GENERATION;
const TEST_PROFILE_DESCRIPTOR: BrowserCompiledProfileDescriptor = (() => {
  const noEntry = (): undefined => undefined;
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "breditor/base",
    schemaVersion: 1,
    schemaFingerprint: TEST_SCHEMA_FINGERPRINT,
    formatCount: 1,
    intentCount: 1,
    actionStateCount: 0,
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    formatKind: (index) => index === 0 ? "breditor/strong" : undefined,
    formatRevision: (index) => index === 0 ? 1 : undefined,
    intentId: (index) => index === 0 ? TEST_INTENT_ID : undefined,
    intentInputKind: (index) => index === 0 ? "none" : undefined,
    intentInputContractName: noEntry,
    intentInputContractVersion: noEntry,
    intentActivationContract: (index) => index === 0 ? "tracked" : undefined,
    intentValueContractName: noEntry,
    intentValueContractVersion: noEntry,
    actionStateId: noEntry,
    actionStateSourceKind: noEntry,
    actionStateSourceActionId: noEntry,
    actionStateSourceIntentId: noEntry,
    actionStateHistoryDirection: noEntry,
    actionStateActivationContract: noEntry,
    actionStateValueContractName: noEntry,
    actionStateValueContractVersion: noEntry,
    free: () => undefined,
  };
  const result = consumeWasmCompiledProfileDescriptor(
    TEST_PROFILE_GENERATION,
    view,
  );
  if (!result.ok) throw new Error("test profile descriptor was rejected");
  return result.descriptor;
})();

class BreditorWasmCommandAdapter extends RawBreditorWasmCommandAdapter {
  constructor(
    engine: WasmCommandEngineView,
    observation: WasmCommandObservationView,
    options: Omit<
      BreditorWasmCommandAdapterOptions,
      "profileGeneration" | "profileDescriptor"
    >,
  ) {
    super(engine, observation, {
      ...options,
      profileGeneration: TEST_PROFILE_GENERATION,
      profileDescriptor: TEST_PROFILE_DESCRIPTOR,
    });
  }
}

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

interface TrackedIntentResult {
  readonly view: WasmIntentResultView;
  readonly free: ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe("BreditorWasmCommandAdapter", () => {
  it("does not expose invariant-critical implementation helpers at runtime", () => {
    const surface = Object.getOwnPropertyNames(
      BreditorWasmCommandAdapter.prototype,
    );
    expect(surface).not.toContain("finishCompositionLease");
    expect(surface).not.toContain("consumeResult");
    expect(surface).not.toContain("requireCompositionLease");
    expect(surface).not.toContain("requireObservation");
  });

  it.each(["own properties", "subclass overrides"] as const)(
    "keeps captured execution and token authority behind private dispatch despite %s",
    (overrideKind) => {
      const base = projectionFixture(0, "a");
      const initial = observation(0);
      const successor = observation(0);
      const disabled = commandResult({
        status: "disabled",
        successor,
        disabledActionId: "breditor/toggle-strong",
        disabledReasonCode: "breditor/not-enabled",
        activation: "inactive",
      });
      const executeOverride = vi.fn((_request: EditorCommandRequest): never => {
        throw new Error("shadowed execute must not run");
      });
      const acceptsOverride = vi.fn((_token: unknown): boolean => true);
      class HostileAdapter extends BreditorWasmCommandAdapter {
        override execute(request: EditorCommandRequest): WasmCommandSequenceOutcome {
          return executeOverride(request);
        }

        override acceptsDeliveryToken(token: unknown): token is EditorDeliveryToken {
          return acceptsOverride(token);
        }
      }
      const Adapter =
        overrideKind === "subclass overrides"
          ? HostileAdapter
          : BreditorWasmCommandAdapter;
      const adapter = new Adapter(
        engineQueues({ noInputAction: [disabled.view] }),
        initial,
        {
          renderer: base.renderer,
          rendered: base.rendered,
          selectionBridge: new BreditorDomSelectionBridge(),
        },
      );
      const token = adapter.deliveryToken();
      const executor = adapter.commandExecutor;
      const authority = adapter.deliveryAuthority;
      if (overrideKind === "own properties") {
        Object.defineProperty(adapter, "execute", { value: executeOverride });
        Object.defineProperty(adapter, "acceptsDeliveryToken", {
          value: acceptsOverride,
        });
      }

      expect(editorDeliveryAuthorityAccepts(authority, {})).toBe(false);
      expect(editorDeliveryAuthorityAccepts(authority, token)).toBe(true);
      const outcome = executor(
        noInputActionRequest(
          token,
          preserveSelectionSync(),
          { kind: "toolbar", detail: "bold" },
          "breditor/toggle-strong",
        ),
      );

      expect(outcome.command.status).toBe("disabled");
      expect(executeOverride).not.toHaveBeenCalled();
      expect(acceptsOverride).not.toHaveBeenCalled();
      expect(disabled.free).toHaveBeenCalledOnce();
      expect(initial.free).toHaveBeenCalledOnce();
      adapter.dispose();
      expect(successor.free).toHaveBeenCalledOnce();
    },
  );

  it("captures the no-input intent ABI once before application code can replace it", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(0);
    const blocked = intentResult({
      status: "blocked",
      successor,
      bindingId: "breditor/format-strong-binding",
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      blockedReasonCode: "breditor/no-selection",
      blockedActivation: "inactive",
      blockedValueStatus: "unsupported",
    });
    const engine = engineQueues({ intents: [blocked.view] });
    const captured = engine.executeNoInputIntent;
    const reads = vi.fn();
    Object.defineProperty(engine, "executeNoInputIntent", {
      configurable: true,
      get() {
        reads();
        return captured;
      },
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    const replacement = vi.fn((): never => {
      throw new Error("replacement must not run");
    });
    Object.defineProperty(engine, "executeNoInputIntent", {
      value: replacement,
    });

    const outcome = adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "captured-engine-method" },
        TEST_INTENT_ID,
      ),
    );

    expect(outcome.command.status).toBe("blocked");
    expect(reads).toHaveBeenCalledOnce();
    expect(replacement).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it("contains core-observer failures and gives each adopted commit to active listeners", async () => {
    const base = projectionFixture(0, "a");
    const nextProjection = projection(1, "a");
    const selected = selection(base.projection, 1);
    const initial = observation(0);
    const committed = observation(1);
    const update = projectionUpdate(base.projection, nextProjection);
    const result = commandResult({
      status: "committed",
      eventKind: "selection",
      successor: committed,
      update: update.view,
    });
    const currentSelection = selectionResult(selectionView(1, 1));
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({
        setSelection: [result.view],
        selection: [currentSelection.view],
      }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );
    const removed = vi.fn();
    const releaseRemoved = adapter.observeCoreCommits(removed);
    releaseRemoved();
    releaseRemoved();
    let nestedCheckpoint: unknown;
    adapter.observeCoreCommits(() => {
      nestedCheckpoint = adapter.sessionCheckpointReadPort.read();
      throw new Error("observer failure is isolated");
    });
    adapter.observeCoreCommits(() => Promise.reject(new Error("contained")));
    const sibling = vi.fn();
    adapter.observeCoreCommits(sibling);

    const outcome = adapter.execute(
      selectionSynchronizationRequest(
        adapter.deliveryToken(),
        selected,
        { kind: "selectionchange", detail: "observer-test" },
      ),
    );

    expect(outcome.command.status).toBe("committed");
    expect(removed).not.toHaveBeenCalled();
    expect(nestedCheckpoint).toBeUndefined();
    expect(sibling).toHaveBeenCalledExactlyOnceWith({
      eventKind: "selection",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    expect(adapter.state).toBe("live");
    await Promise.resolve();
    adapter.dispose();
  });

  it("bounds core-commit listeners and clears them on disposal", () => {
    const base = projectionFixture(0, "a");
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({}),
      observation(0),
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );
    const releases = Array.from(
      { length: MAX_WASM_CORE_COMMIT_OBSERVERS },
      () => adapter.observeCoreCommits(() => undefined),
    );

    expect(() => adapter.observeCoreCommits(() => undefined)).toThrow(RangeError);
    releases[0]?.();
    expect(() => adapter.observeCoreCommits(() => undefined)).not.toThrow();
    for (const release of releases) release();
    adapter.dispose();
    expect(() => adapter.observeCoreCommits(() => undefined)).toThrow(/disposed/u);
  });

  it("exposes a stable handle-free action-state port without recursive reads", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const actionState = emptyActionStateResult(0);
    let nested: unknown;
    let port: BreditorWasmCommandAdapter["actionStateReadPort"];
    const engine = engineQueues({});
    engine.actionStates = () => {
      nested = port.read();
      return actionState.view;
    };
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    port = adapter.actionStateReadPort;

    const result = port.read();

    expect(adapter.actionStateReadPort).toBe(port);
    expect(nested).toBeUndefined();
    expect(result?.ok).toBe(true);
    expect(isOwnedBrowserActionStateReadResult(result)).toBe(true);
    expect(actionState.free).toHaveBeenCalledOnce();
    expect(actionState.snapshotFree).toHaveBeenCalledOnce();
    expect(actionState.valueFree).toHaveBeenCalledOnce();
    expect(initial.free).not.toHaveBeenCalled();
    expect(adapter.state).toBe("live");
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
    expect(port.read()).toBeUndefined();
  });

  it("reports a thrown checkpoint invocation as a terminal capture failure", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const engine = engineQueues({});
    engine.sessionCheckpointJson = () => {
      throw new Error("hostile engine invocation");
    };
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });

    expect(adapter.sessionCheckpointReadPort.read()).toEqual({
      ok: false,
      error: {
        kind: "boundary",
        code: "session_checkpoint.invalid_wasm_view",
        message: "The Wasm session-checkpoint view is invalid.",
      },
    });
    expect(adapter.state).toBe("live");
    adapter.dispose();
  });

  it("rejects an otherwise valid action-state snapshot whose catalog omits a profile entry", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const actionState = emptyActionStateResult(0);
    const descriptor = profileDescriptorWithActionState();
    const adapter = new RawBreditorWasmCommandAdapter(
      engineQueues({ actionStates: [actionState.view] }),
      initial,
      {
        profileGeneration: TEST_PROFILE_GENERATION,
        profileDescriptor: descriptor,
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    const result = adapter.actionStateReadPort.read();

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "boundary",
        code: "action_state.invalid_wasm_view",
        message: "The Wasm action-state view is invalid.",
      },
    });
    expect(isOwnedBrowserActionStateReadResult(result)).toBe(true);
    expect(actionState.free).toHaveBeenCalledOnce();
    expect(actionState.snapshotFree).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it("does not free its private observation when a hostile action-state result aliases it", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const resultFree = vi.fn();
    const aliased: WasmActionStatesResultView = {
      status: "full",
      error: undefined,
      matchesProfileGeneration: matchesTestProfile,
      takeSnapshot: () => initial as unknown as WasmActionStateSnapshotView,
      free: resultFree,
    };
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ actionStates: [aliased] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(adapter.actionStateReadPort.read()?.ok).toBe(false);
    expect(resultFree).toHaveBeenCalledOnce();
    expect(initial.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it("does not free its engine receiver when a hostile action-state result aliases it", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const free = vi.fn();
    const engine = engineQueues({});
    Object.assign(engine, { free });
    engine.actionStates = () => engine as unknown as WasmActionStatesResultView;
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });

    expect(adapter.actionStateReadPort.read()?.ok).toBe(false);
    expect(free).not.toHaveBeenCalled();
    expect(initial.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
    expect(free).not.toHaveBeenCalled();
  });

  it("exposes a stable private checkpoint port and rejects recursive reads", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const checkpoint = checkpointResult(0);
    let nested: unknown;
    let port: BreditorWasmCommandAdapter["sessionCheckpointReadPort"];
    const engine = engineQueues({});
    engine.sessionCheckpointJson = () => {
      nested = port.read();
      return checkpoint.view;
    };
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    port = adapter.sessionCheckpointReadPort;

    const result = port.read();

    expect(adapter.sessionCheckpointReadPort).toBe(port);
    expect(nested).toBeUndefined();
    expect(result?.ok).toBe(true);
    expect(isOwnedBrowserSessionCheckpointReadResult(result)).toBe(true);
    expect(checkpoint.free).toHaveBeenCalledOnce();
    expect(initial.free).not.toHaveBeenCalled();
    expect(adapter.state).toBe("live");
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
    const unavailable = port.read();
    expect(unavailable).toEqual({
      ok: false,
      error: {
        kind: "lifecycle",
        code: "session_checkpoint.adapter_unavailable",
        message: "The Wasm session-checkpoint reader is permanently unavailable.",
      },
    });
    expect(isOwnedBrowserSessionCheckpointReadResult(unavailable)).toBe(true);
  });

  it("serializes document/plain-text reads under one content lease and preserves observation", () => {
    const base = projectionFixture(0, "A💡");
    const initial = observation(0);
    const document = documentResult("A💡");
    let nestedDocument: unknown;
    let nestedPlainText: unknown;
    let documentPort: BreditorWasmCommandAdapter["documentJsonReadPort"];
    let plainTextPort: BreditorWasmCommandAdapter["plainTextReadPort"];
    const engine = engineQueues({});
    engine.documentJson = (expected) => {
      expect(expected).toBe(initial);
      nestedDocument = documentPort.read();
      nestedPlainText = plainTextPort.read();
      return document.view;
    };
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    documentPort = adapter.documentJsonReadPort;
    plainTextPort = adapter.plainTextReadPort;

    const result = documentPort.read();

    expect(nestedDocument).toBeUndefined();
    expect(nestedPlainText).toBeUndefined();
    expect(result).toMatchObject({
      ok: true,
      document: {
        snapshot: { lineage: "adapter-tests", revision: "0" },
      },
    });
    expect(isOwnedBrowserDocumentJsonReadResult(result)).toBe(true);
    expect(document.free).toHaveBeenCalledOnce();
    expect(initial.free).not.toHaveBeenCalled();
    expect(adapter.state).toBe("live");

    expect(plainTextPort.read()).toEqual({
      ok: true,
      content: {
        text: "A💡",
        utf8Bytes: 5,
        snapshot: { lineage: "adapter-tests", revision: "0" },
      },
    });

    adapter.dispose();
    expect(documentPort.read()).toMatchObject({
      ok: false,
      error: { code: "document_json.adapter_unavailable" },
    });
    expect(plainTextPort.read()).toMatchObject({
      ok: false,
      error: { code: "plain_text.adapter_unavailable" },
    });
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it("protects the raw engine and observation from aliased checkpoint results", () => {
    for (const alias of ["engine", "observation"] as const) {
      const base = projectionFixture(0, "a");
      const initial = observation(0);
      const engineFree = vi.fn();
      const engine = engineQueues({});
      Object.assign(engine, { free: engineFree });
      engine.sessionCheckpointJson = () =>
        (alias === "engine" ? engine : initial) as unknown as
          WasmSessionCheckpointStringResultView;
      const adapter = new BreditorWasmCommandAdapter(engine, initial, {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      });

      expect(adapter.sessionCheckpointReadPort.read()?.ok).toBe(false);
      expect(engineFree).not.toHaveBeenCalled();
      expect(initial.free).not.toHaveBeenCalled();
      adapter.dispose();
      expect(initial.free).toHaveBeenCalledOnce();
      expect(engineFree).not.toHaveBeenCalled();
    }
  });

  it("contains a rejected async checkpoint impostor and remains live", async () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const engine = engineQueues({});
    engine.sessionCheckpointJson = () =>
      Promise.reject(new Error("must be contained")) as unknown as
        WasmSessionCheckpointStringResultView;
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });

    expect(adapter.sessionCheckpointReadPort.read()?.ok).toBe(false);
    expect(adapter.state).toBe("live");
    await Promise.resolve();
    adapter.dispose();
  });

  it("contains and rejects a thenable command-result handle before inspecting it", async () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const result = rejectedGeneratedHandle<WasmCommandResultView>({
      status: "unchanged",
      eventKind: undefined,
      disabledActionId: undefined,
      disabledReasonCode: undefined,
      activation: undefined,
      error: undefined,
      observation: vi.fn(),
      projectionUpdate: vi.fn(),
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ noInputAction: [result.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() =>
      adapter.execute(
        noInputActionRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "toolbar", detail: "async-result" },
          "breditor/toggle-strong",
        ),
      ),
    ).toThrow(/asynchronous/u);
    expect(result.free).toHaveBeenCalledOnce();
    expect(result.view.observation).not.toHaveBeenCalled();
    expect(adapter.state).toBe("faulted");
    await Promise.resolve();
    adapter.dispose();
  });

  it("releases a command result through the free method captured before then inspection", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(0);
    const originalFree = vi.fn();
    const replacementFree = vi.fn();
    const result: WasmCommandResultView = {
      status: "disabled",
      eventKind: undefined,
      disabledActionId: "breditor/toggle-strong",
      disabledReasonCode: "breditor/not-enabled",
      activation: "inactive",
      error: undefined,
      matchesProfileGeneration: matchesTestProfile,
      observation: () => successor,
      projectionUpdate: () => undefined,
      free: originalFree,
    };
    Object.defineProperty(result, "then", {
      get() {
        Object.assign(result, { free: replacementFree });
        return undefined;
      },
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ noInputAction: [result] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(
      adapter.execute(
        noInputActionRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "toolbar", detail: "mutating-then" },
          "breditor/toggle-strong",
        ),
      ).command.status,
    ).toBe("disabled");
    expect(originalFree).toHaveBeenCalledOnce();
    expect(replacementFree).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it("faults and releases a command result from another profile generation", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const result = commandResult({
      status: "disabled",
      successor: observation(0),
      disabledActionId: "breditor/toggle-strong",
      disabledReasonCode: "breditor/not-enabled",
      activation: "inactive",
    });
    Object.assign(result.view, { matchesProfileGeneration: () => false });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ noInputAction: [result.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() =>
      adapter.execute(
        noInputActionRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "toolbar", detail: "foreign-profile" },
          "breditor/toggle-strong",
        ),
      ),
    ).toThrow(/invalid or aliased/u);
    expect(result.free).toHaveBeenCalledOnce();
    expect(adapter.state).toBe("faulted");
    adapter.dispose();
  });

  it("retains the initial observation cleanup captured before engine inspection", () => {
    const base = projectionFixture(0, "a");
    const originalFree = vi.fn();
    const replacementFree = vi.fn();
    const initial: WasmCommandObservationView = {
      snapshotLineage: "adapter-tests",
      snapshotRevision: "0",
      matchesProfileGeneration: matchesTestProfile,
      free: originalFree,
    };
    const engine = engineQueues({});
    const actionStates = engine.actionStates;
    Object.defineProperty(engine, "actionStates", {
      get() {
        Object.assign(initial, { free: replacementFree });
        return actionStates;
      },
    });

    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    adapter.dispose();

    expect(originalFree).toHaveBeenCalledOnce();
    expect(replacementFree).not.toHaveBeenCalled();
  });

  it("reports even an undefined value thrown by observation cleanup", () => {
    const base = projectionFixture(0, "a");
    const initial: WasmCommandObservationView = {
      snapshotLineage: "adapter-tests",
      snapshotRevision: "0",
      matchesProfileGeneration: matchesTestProfile,
      free: vi.fn(() => {
        throw undefined;
      }),
    };
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    let threw = false;
    let thrown: unknown = "not thrown";
    try {
      adapter.dispose();
    } catch (error) {
      threw = true;
      thrown = error;
    }

    expect(threw).toBe(true);
    expect(thrown).toBeUndefined();
    expect(adapter.state).toBe("disposed");
  });

  it("releases a nested error through the cleanup captured before later result calls", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const originalFree = vi.fn();
    const replacementFree = vi.fn();
    const error: WasmCommandErrorView = {
      code: "editor_engine.action_failed",
      message: "the command was rejected",
      free: originalFree,
    };
    const resultFree = vi.fn();
    const result: WasmCommandResultView = {
      status: "error",
      eventKind: undefined,
      disabledActionId: undefined,
      disabledReasonCode: undefined,
      activation: undefined,
      error,
      matchesProfileGeneration: matchesTestProfile,
      observation: () => {
        Object.assign(error, { free: replacementFree });
        return undefined;
      },
      projectionUpdate: () => undefined,
      free: resultFree,
    };
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ noInputAction: [result] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() =>
      adapter.execute(
        noInputActionRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "toolbar", detail: "mutating-error-owner" },
          "breditor/toggle-strong",
        ),
      ),
    ).toThrow(/command was rejected/u);
    expect(originalFree).toHaveBeenCalledOnce();
    expect(replacementFree).not.toHaveBeenCalled();
    expect(resultFree).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it("keeps an adopted successor cleanup captured before a later result call", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const originalFree = vi.fn();
    const replacementFree = vi.fn();
    const successor: WasmCommandObservationView = {
      snapshotLineage: "adapter-tests",
      snapshotRevision: "0",
      matchesProfileGeneration: matchesTestProfile,
      free: originalFree,
    };
    const result = commandResult({ status: "unchanged", successor });
    Object.assign(result.view, {
      projectionUpdate: () => {
        Object.assign(successor, { free: replacementFree });
        return undefined;
      },
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ setSelection: [result.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    const delivered = adapter.execute(
      selectionSynchronizationRequest(
        adapter.deliveryToken(),
        selection(base.projection, 0),
        { kind: "api", detail: "mutating-successor-owner" },
      ),
    );
    expect(delivered.command.status).toBe("unchanged");
    adapter.dispose();

    expect(originalFree).toHaveBeenCalledOnce();
    expect(replacementFree).not.toHaveBeenCalled();
  });

  it.each(["error", "observation", "projection"] as const)(
    "contains and rejects a thenable nested %s handle",
    async (kind) => {
      const base = projectionFixture(0, "a");
      const initial = observation(0);
      const successor = kind === "observation"
        ? rejectedGeneratedHandle<WasmCommandObservationView>()
        : undefined;
      const update = kind === "projection"
        ? rejectedGeneratedHandle<SemanticProjectionUpdateView>()
        : undefined;
      const error = kind === "error"
        ? rejectedGeneratedHandle<WasmCommandErrorView>()
        : undefined;
      const resultFree = vi.fn();
      const result: WasmCommandResultView = kind === "error"
        ? {
            status: "error",
            eventKind: undefined,
            disabledActionId: undefined,
            disabledReasonCode: undefined,
            activation: undefined,
            error: error?.view,
            matchesProfileGeneration: matchesTestProfile,
            observation: () => undefined,
            projectionUpdate: () => undefined,
            free: resultFree,
          }
        : kind === "observation"
          ? {
              status: "disabled",
              eventKind: undefined,
              disabledActionId: "breditor/toggle-strong",
              disabledReasonCode: "breditor/not-enabled",
              activation: "inactive",
              error: undefined,
              matchesProfileGeneration: matchesTestProfile,
              observation: () => successor?.view,
              projectionUpdate: () => undefined,
              free: resultFree,
            }
          : {
              status: "committed",
              eventKind: "action",
              disabledActionId: undefined,
              disabledReasonCode: undefined,
              activation: undefined,
              error: undefined,
              matchesProfileGeneration: matchesTestProfile,
              observation: () => observation(1),
              projectionUpdate: () => update?.view,
              free: resultFree,
            };
      const adapter = new BreditorWasmCommandAdapter(
        engineQueues({ noInputAction: [result] }),
        initial,
        {
          renderer: base.renderer,
          rendered: base.rendered,
          selectionBridge: new BreditorDomSelectionBridge(),
        },
      );

      expect(() =>
        adapter.execute(
          noInputActionRequest(
            adapter.deliveryToken(),
            preserveSelectionSync(),
            { kind: "toolbar", detail: `async-${kind}` },
            "breditor/toggle-strong",
          ),
        ),
      ).toThrow(/asynchronous/u);
      expect(resultFree).toHaveBeenCalledOnce();
      if (successor !== undefined) expect(successor.free).toHaveBeenCalledOnce();
      if (update !== undefined) expect(update.free).toHaveBeenCalledOnce();
      if (error !== undefined) expect(error.free).toHaveBeenCalledOnce();
      expect(adapter.state).toBe("faulted");
      await Promise.resolve();
      adapter.dispose();
    },
  );

  it("contains and rejects a thenable nested semantic-selection handle", async () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const committed = observation(1);
    const update = projectionUpdate(base.projection, projection(1, "a"));
    const result = commandResult({
      status: "committed",
      eventKind: "selection",
      successor: committed,
      update: update.view,
    });
    const selected = rejectedGeneratedHandle<SemanticSelectionView>();
    const selectionResultFree = vi.fn();
    const engineSelection: WasmSelectionResultView = {
      status: "selection",
      error: undefined,
      matchesProfileGeneration: matchesTestProfile,
      takeSelection: () => selected.view,
      free: selectionResultFree,
    };
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({
        setSelection: [result.view],
        selection: [engineSelection],
      }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() =>
      adapter.execute(
        selectionSynchronizationRequest(
          adapter.deliveryToken(),
          selection(base.projection, 1),
          { kind: "selectionchange", detail: "async-selection" },
        ),
      ),
    ).toThrow(/asynchronous/u);
    expect(selected.free).toHaveBeenCalledOnce();
    expect(selectionResultFree).toHaveBeenCalledOnce();
    expect(result.free).toHaveBeenCalledOnce();
    expect(committed.free).toHaveBeenCalledOnce();
    expect(adapter.state).toBe("faulted");
    await Promise.resolve();
    adapter.dispose();
  });

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

    const executor = adapter.commandExecutor;
    expect(adapter.commandExecutor).toBe(executor);
    const outcome = executor(request);

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

  it("executes a toolbar action against the preserved semantic selection", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const initial = observation(0);
    const successor = observation(0);
    const disabled = commandResult({
      status: "disabled",
      successor,
      disabledActionId: "breditor/toggle-strong",
      disabledReasonCode: "breditor/not-enabled",
      activation: "inactive",
    });
    const engine = engineQueues({ noInputAction: [disabled.view] });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const write = vi.spyOn(bridge, "write");

    const outcome = adapter.execute(
      noInputActionRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "toolbar", detail: "bold" },
        "breditor/toggle-strong",
      ),
    );

    expect(outcome.selection).toEqual({
      status: "preserved",
      snapshot: { lineage: "adapter-tests", revision: "0" },
    });
    expect(outcome.command.status).toBe("disabled");
    expect(write).not.toHaveBeenCalled();
    expect(disabled.free).toHaveBeenCalledOnce();
    expect(initial.free).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(successor.free).toHaveBeenCalledOnce();
  });

  it("routes a no-input semantic intent and exposes only frozen handle-free provenance", () => {
    const base = projectionFixture(0, "a");
    const next = projection(1, "a");
    const initial = observation(0);
    const successor = observation(1);
    const update = projectionUpdate(base.projection, next);
    const routed = intentResult({
      status: "committed",
      successor,
      bindingId: "breditor/format-strong-binding",
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      fallthroughs: [
        {
          bindingId: "example/first-binding",
          actionId: "example/first-action",
          priority: 20,
          reasonCode: "example/first-disabled",
        },
        {
          bindingId: "example/second-binding",
          actionId: "example/second-action",
          priority: 10,
          reasonCode: "example/second-disabled",
        },
      ],
      update: update.view,
    });
    const semanticSelection = selectionResult(selectionView(1, 1));
    const engine = engineQueues({
      intents: [routed.view],
      selection: [semanticSelection.view],
    });
    const execute = vi.spyOn(engine, "executeNoInputIntent");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);

    const outcome = adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "format-strong" },
        TEST_INTENT_ID,
      ),
    );

    expect(execute).toHaveBeenCalledExactlyOnceWith(initial, TEST_INTENT_ID);
    expect(outcome.command).toEqual({
      status: "committed",
      eventKind: "intent",
      intentId: TEST_INTENT_ID,
      bindingId: "breditor/format-strong-binding",
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      fallthroughs: [
        {
          bindingId: "example/first-binding",
          actionId: "example/first-action",
          priority: 20,
          reasonCode: "example/first-disabled",
        },
        {
          bindingId: "example/second-binding",
          actionId: "example/second-action",
          priority: 10,
          reasonCode: "example/second-disabled",
        },
      ],
      snapshot: { lineage: "adapter-tests", revision: "1" },
      render: expect.objectContaining({ mode: "incremental" }),
    });
    expect(Object.isFrozen(outcome.command)).toBe(true);
    if (outcome.command.status === "committed" && outcome.command.eventKind === "intent") {
      expect(Object.isFrozen(outcome.command.fallthroughs)).toBe(true);
      expect(Object.isFrozen(outcome.command.fallthroughs[0])).toBe(true);
    }
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "intent",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    expect(routed.free).toHaveBeenCalledOnce();
    expect(update.free).toHaveBeenCalledOnce();
    expect(initial.free).toHaveBeenCalledOnce();
    expect(semanticSelection.free).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(successor.free).toHaveBeenCalledOnce();
  });

  it("adopts exact blocked and unhandled intent successor observations", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const blockedObservation = observation(0);
    const unhandledObservation = observation(0);
    const blocked = intentResult({
      status: "blocked",
      successor: blockedObservation,
      bindingId: "breditor/format-strong-binding",
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      blockedReasonCode: "breditor/no-selection",
      blockedActivation: "inactive",
      blockedValueStatus: "unsupported",
      fallthroughs: [{
        bindingId: "example/fallback-binding",
        actionId: "example/fallback-action",
        priority: 10,
        reasonCode: "example/disabled",
      }],
    });
    const unhandled = intentResult({
      status: "unhandled",
      successor: unhandledObservation,
      fallthroughs: [{
        bindingId: "example/last-binding",
        actionId: "example/last-action",
        priority: -5,
        reasonCode: "example/disabled",
      }],
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ intents: [blocked.view, unhandled.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);

    const first = adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "toolbar", detail: "bold" },
        TEST_INTENT_ID,
      ),
    );
    expect(first.command).toEqual({
      status: "blocked",
      intentId: TEST_INTENT_ID,
      bindingId: "breditor/format-strong-binding",
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      reasonCode: "breditor/no-selection",
      activation: "inactive",
      blockedValueStatus: "unsupported",
      blockedValueContract: undefined,
      fallthroughs: [{
        bindingId: "example/fallback-binding",
        actionId: "example/fallback-action",
        priority: 10,
        reasonCode: "example/disabled",
      }],
      snapshot: { lineage: "adapter-tests", revision: "0" },
    });
    expect(initial.free).toHaveBeenCalledOnce();

    const second = adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "unhandled" },
        TEST_INTENT_ID,
      ),
    );
    expect(second.command).toEqual({
      status: "unhandled",
      intentId: TEST_INTENT_ID,
      fallthroughs: [{
        bindingId: "example/last-binding",
        actionId: "example/last-action",
        priority: -5,
        reasonCode: "example/disabled",
      }],
      snapshot: { lineage: "adapter-tests", revision: "0" },
    });
    expect(blockedObservation.free).toHaveBeenCalledOnce();
    expect(commits).not.toHaveBeenCalled();
    adapter.dispose();
    expect(unhandledObservation.free).toHaveBeenCalledOnce();
  });

  it("correlates a blocked indicator with its declared typed value contract", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(0);
    const blocked = intentResult({
      status: "blocked",
      successor,
      bindingId: "breditor/format-strong-binding",
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      blockedReasonCode: "breditor/no-selection",
      blockedActivation: "mixed",
      blockedValueStatus: "uniform",
      blockedValueContractName: "example/value",
      blockedValueContractVersion: 2,
    });
    const adapter = new RawBreditorWasmCommandAdapter(
      engineQueues({ intents: [blocked.view] }),
      initial,
      {
        profileGeneration: TEST_PROFILE_GENERATION,
        profileDescriptor: profileDescriptorWithIntentContract({
          input: "none",
          value: true,
        }),
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    const outcome = adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "typed-state" },
        TEST_INTENT_ID,
      ),
    );

    expect(outcome.command).toMatchObject({
      status: "blocked",
      blockedValueStatus: "uniform",
      blockedValueContract: { name: "example/value", version: 2 },
    });
    if (outcome.command.status === "blocked") {
      expect(Object.isFrozen(outcome.command.blockedValueContract)).toBe(true);
    }
    adapter.dispose();
  });

  it("admits the exact 256-entry fallthrough ceiling for an unhandled intent", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(0);
    const fallthroughs = Array.from({ length: 256 }, (_, index) => ({
      bindingId: `example/binding-${String(index).padStart(3, "0")}`,
      actionId: `example/action-${String(index).padStart(3, "0")}`,
      priority: 255 - index,
      reasonCode: "example/disabled",
    }));
    const routed = intentResult({
      status: "unhandled",
      successor,
      fallthroughs,
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ intents: [routed.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    const outcome = adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "maximum-fallthroughs" },
        TEST_INTENT_ID,
      ),
    );

    expect(outcome.command.status).toBe("unhandled");
    if (outcome.command.status === "unhandled") {
      expect(outcome.command.fallthroughs).toHaveLength(256);
    }
    adapter.dispose();
  });

  it("refuses to invoke the no-input ABI for a typed-input intent declaration", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const engine = engineQueues({});
    const execute = vi.spyOn(engine, "executeNoInputIntent");
    const adapter = new RawBreditorWasmCommandAdapter(engine, initial, {
      profileGeneration: TEST_PROFILE_GENERATION,
      profileDescriptor: profileDescriptorWithIntentContract({
        input: "typed",
        value: false,
      }),
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "wrong-input-shape" },
        TEST_INTENT_ID,
      ),
    )).toThrow(/no-input contract/u);
    expect(execute).not.toHaveBeenCalled();
    expect(adapter.state).toBe("faulted");
    adapter.dispose();
  });

  it("refuses to invoke an intent absent from the owned profile descriptor", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const engine = engineQueues({});
    const execute = vi.spyOn(engine, "executeNoInputIntent");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "undeclared" },
        "example/undeclared",
      ),
    )).toThrow(/no-input contract/u);
    expect(execute).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it("contains a structured semantic-intent error and keeps a non-stale adapter live", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const rejected = intentError("editor_engine.intent_routing");
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ intents: [rejected.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "rejected" },
        TEST_INTENT_ID,
      ),
    )).toThrow(/intent_routing/u);
    expect(adapter.state).toBe("live");
    expect(rejected.free).toHaveBeenCalledOnce();
    expect(rejected.errorFree).toHaveBeenCalledOnce();
    expect(initial.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it("faults permanently on a structured stale semantic-intent error", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const rejected = intentError("editor_engine.stale_snapshot");
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ intents: [rejected.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "stale" },
        TEST_INTENT_ID,
      ),
    )).toThrow(/stale_snapshot/u);
    expect(adapter.state).toBe("faulted");
    expect(() => adapter.deliveryToken()).toThrow(/faulted/u);
    expect(rejected.free).toHaveBeenCalledOnce();
    expect(rejected.errorFree).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it("requires the complete generated semantic-intent method surface", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(0);
    const routed = intentResult({ status: "unhandled", successor });
    Object.defineProperty(routed.view, "commitJson", { value: undefined });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ intents: [routed.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "missing-method" },
        TEST_INTENT_ID,
      ),
    )).toThrow(/intent result/u);
    expect(routed.free).toHaveBeenCalledOnce();
    expect(successor.free).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it("adopts a published intent commit before requiring DOM reconciliation", () => {
    const base = projectionFixture(0, "a");
    const next = projection(1, "a");
    const initial = observation(0);
    const successor = observation(1);
    const routed = intentResult({
      status: "committed",
      successor,
      bindingId: "breditor/format-strong-binding",
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      update: projectionUpdate(base.projection, next).view,
    });
    const afterCommit = selectionResult(selectionView(1, 1));
    const afterRestore = selectionResult(selectionView(1, 1));
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({
        intents: [routed.view],
        selection: [afterCommit.view, afterRestore.view],
      }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new FailOnWriteBridge(1),
      },
    );
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "reconcile" },
        TEST_INTENT_ID,
      ),
    )).toThrow(/canonical DOM restoration/u);
    expect(adapter.state).toBe("reconcile");
    expect(adapter.snapshot).toEqual({
      lineage: "adapter-tests",
      revision: "1",
    });
    expect(initial.free).toHaveBeenCalledOnce();
    expect(routed.free).toHaveBeenCalledOnce();
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "intent",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    expect(adapter.restoreCanonicalRender().ok).toBe(true);
    expect(adapter.state).toBe("live");
    expect(adapter.deliveryToken().snapshotRevision).toBe("1");
    adapter.dispose();
    expect(successor.free).toHaveBeenCalledOnce();
  });

  it.each([
    "wrong intent ID",
    "changed blocked snapshot",
    "blocked projection update",
    "missing selected binding",
    "invalid blocked activation",
    "invalid blocked value contract",
    "out-of-order fallthroughs",
    "256 fallthroughs plus selected binding",
  ] as const)("faults on an inexact semantic-intent receipt with %s", (violation) => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(violation === "changed blocked snapshot" ? 1 : 0);
    const exposedUpdate = violation === "blocked projection update"
      ? projectionUpdate(base.projection, projection(1, "a"))
      : undefined;
    const longTrace = Array.from({ length: 256 }, (_, index) => ({
      bindingId: `example/binding-${String(index).padStart(3, "0")}`,
      actionId: `example/action-${String(index).padStart(3, "0")}`,
      priority: 1_000 - index,
      reasonCode: "example/disabled",
    }));
    const routed = intentResult({
      status: "blocked",
      successor,
      intentId: violation === "wrong intent ID" ? "example/other" : TEST_INTENT_ID,
      ...(violation === "missing selected binding"
        ? {}
        : { bindingId: "breditor/format-strong-binding" }),
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      blockedReasonCode: "breditor/no-selection",
      blockedActivation: violation === "invalid blocked activation"
        ? "stateless"
        : "inactive",
      blockedValueStatus: violation === "invalid blocked value contract"
        ? "uniform"
        : "unsupported",
      fallthroughs: violation === "out-of-order fallthroughs"
        ? [
            {
              bindingId: "example/first-binding",
              actionId: "example/first-action",
              priority: 10,
              reasonCode: "example/disabled",
            },
            {
              bindingId: "example/second-binding",
              actionId: "example/second-action",
              priority: 20,
              reasonCode: "example/disabled",
            },
          ]
        : violation === "256 fallthroughs plus selected binding"
          ? longTrace
          : [],
      ...(exposedUpdate === undefined ? {} : { update: exposedUpdate.view }),
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ intents: [routed.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: violation },
        TEST_INTENT_ID,
      ),
    )).toThrow(/intent/u);
    expect(adapter.state).toBe("faulted");
    expect(routed.free).toHaveBeenCalledOnce();
    expect(successor.free).toHaveBeenCalledOnce();
    if (exposedUpdate !== undefined) {
      expect(exposedUpdate.free).toHaveBeenCalledOnce();
    }
    expect(initial.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it.each(["unchanged revision", "missing update", "blocked-only scalar"] as const)(
    "faults on a committed semantic-intent receipt with %s",
    (violation) => {
      const base = projectionFixture(0, "a");
      const nextRevision = violation === "unchanged revision" ? 0 : 1;
      const initial = observation(0);
      const successor = observation(nextRevision);
      const update = violation === "missing update"
        ? undefined
        : projectionUpdate(base.projection, projection(nextRevision, "a"));
      const routed = intentResult({
        status: "committed",
        successor,
        bindingId: "breditor/format-strong-binding",
        actionId: "breditor/toggle-strong",
        bindingPriority: 0,
        ...(violation === "blocked-only scalar"
          ? { blockedReasonCode: "breditor/no-selection" }
          : {}),
        ...(update === undefined ? {} : { update: update.view }),
      });
      const adapter = new BreditorWasmCommandAdapter(
        engineQueues({ intents: [routed.view] }),
        initial,
        {
          renderer: base.renderer,
          rendered: base.rendered,
          selectionBridge: new BreditorDomSelectionBridge(),
        },
      );

      expect(() => adapter.execute(
        noInputIntentRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "api", detail: violation },
          TEST_INTENT_ID,
        ),
      )).toThrow(/committed intent/u);
      expect(adapter.state).toBe("faulted");
      expect(routed.free).toHaveBeenCalledOnce();
      expect(successor.free).toHaveBeenCalledOnce();
      if (update !== undefined) expect(update.free).toHaveBeenCalledOnce();
      adapter.dispose();
    },
  );

  it("rejects intent result aliases without releasing adapter-owned handles", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const engine = engineQueues({
      intents: [initial as unknown as WasmIntentResultView],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "alias" },
        TEST_INTENT_ID,
      ),
    )).toThrow(/aliased/u);
    expect(initial.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it.each([
    "wrong generation",
    "aliased successor",
    "thenable result",
    "thenable scalar",
  ] as const)(
    "frees and faults a hostile semantic-intent handle with %s",
    async (violation) => {
      const base = projectionFixture(0, "a");
      const initial = observation(0);
      const successor = observation(0);
      const routed = intentResult({
        status: "unhandled",
        successor,
        matchesGeneration: violation !== "wrong generation",
      });
      if (violation === "aliased successor") {
        Object.defineProperty(routed.view, "observation", {
          value: () => routed.view,
        });
      }
      if (violation === "thenable result") {
        Object.defineProperty(routed.view, "then", {
          value: (resolve: (value: undefined) => void) => resolve(undefined),
        });
      }
      if (violation === "thenable scalar") {
        Object.defineProperty(routed.view, "intentId", {
          value: Promise.reject(
            new Error("intent scalar rejection must be contained"),
          ),
        });
      }
      const adapter = new BreditorWasmCommandAdapter(
        engineQueues({ intents: [routed.view] }),
        initial,
        {
          renderer: base.renderer,
          rendered: base.rendered,
          selectionBridge: new BreditorDomSelectionBridge(),
        },
      );

      expect(() => adapter.execute(
        noInputIntentRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "api", detail: violation },
          TEST_INTENT_ID,
        ),
      )).toThrow(/intent result|generation|handles alias/u);
      await Promise.resolve();
      expect(adapter.state).toBe("faulted");
      expect(routed.free).toHaveBeenCalledOnce();
      expect(successor.free).not.toHaveBeenCalled();
      adapter.dispose();
      expect(initial.free).toHaveBeenCalledOnce();
    },
  );

  it("adopts the exact intent successor before reporting a result cleanup failure", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(0);
    const routed = intentResult({
      status: "unhandled",
      successor,
      freeResult: "unexpected",
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ intents: [routed.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "cleanup" },
        TEST_INTENT_ID,
      ),
    )).toThrow(/free returned/u);
    expect(adapter.state).toBe("faulted");
    expect(initial.free).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(successor.free).toHaveBeenCalledOnce();
  });

  it("delivers selection-only synchronization without a second engine command", () => {
    const base = projectionFixture(0, "a");
    const resultProjection = projection(1, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    const initial = observation(0);
    const committed = observation(1);
    const update = projectionUpdate(base.projection, resultProjection);
    const synchronized = commandResult({
      status: "committed",
      eventKind: "selection",
      successor: committed,
      update: update.view,
    });
    const semanticSelection = selectionResult(selectionView(1, 1));
    const engine = engineQueues({
      setSelection: [synchronized.view],
      selection: [semanticSelection.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    const outcome = adapter.execute(
      selectionSynchronizationRequest(
        adapter.deliveryToken(),
        selected,
        { kind: "selectionchange", detail: "document-selection" },
      ),
    );

    expect(outcome.selection).toMatchObject({
      status: "committed",
      eventKind: "selection",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    expect(outcome.command).toBe(outcome.selection);
    expect(outcome.boundary).toBeUndefined();
    expect(adapter.snapshot.revision).toBe("1");
    expect(synchronized.free).toHaveBeenCalledOnce();
    expect(update.free).toHaveBeenCalledOnce();
    expect(semanticSelection.free).toHaveBeenCalledOnce();
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

  it("publishes a committed prestage even when the later command is rejected", () => {
    const base = projectionFixture(0, "a");
    const prestagedProjection = projection(1, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const prestaged = observation(1);
    const prestageUpdate = projectionUpdate(base.projection, prestagedProjection);
    const prestageResult = commandResult({
      status: "committed",
      eventKind: "selection",
      successor: prestaged,
      update: prestageUpdate.view,
    });
    const semanticSelection = selectionResult(selectionView(1, 1));
    const rejected = commandError("editor_engine.action_rejected");
    const engine = engineQueues({
      setSelection: [prestageResult.view],
      stringAction: [rejected.view],
      selection: [semanticSelection.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);
    const queueObserver = vi.fn();
    const queue = new BreditorCommandQueue(adapter.commandExecutor, {
      observer: queueObserver,
    });

    expect(queue.submit(actionRequest(adapter, selected))).toEqual({
      status: "failed",
      failure: { code: "command_queue.executor_threw", sequence: 1n },
    });

    expect(adapter.state).toBe("live");
    expect(adapter.snapshot.revision).toBe("1");
    expect(queueObserver).not.toHaveBeenCalled();
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "selection",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    expect(rejected.free).toHaveBeenCalledOnce();
    expect(rejected.errorFree).toHaveBeenCalledOnce();
    queue.dispose();
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
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);

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
    expect(commits).not.toHaveBeenCalled();
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
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);
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
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "closeHistoryGroup",
      snapshot: { lineage: "adapter-tests", revision: "0" },
    });
    adapter.dispose();
  });

  it("executes an explicit history-group control without a document action", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const bounded = observation(0);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const boundaryResult = commandResult({
      status: "committed",
      eventKind: "closeHistoryGroup",
      successor: bounded,
    });
    const engine = engineQueues({
      setSelection: [syncResult.view],
      closeHistory: [boundaryResult.view],
    });
    const closeHistoryGroup = vi.spyOn(engine, "closeHistoryGroup");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    const outcome = adapter.execute(
      closeHistoryGroupRequest(
        adapter.deliveryToken(),
        rangeSelectionSync(selected),
        { kind: "api", detail: "composition-cancelled" },
      ),
    );

    expect(closeHistoryGroup).toHaveBeenCalledOnce();
    expect(closeHistoryGroup).toHaveBeenCalledWith(synchronized);
    expect(outcome.boundary).toBeUndefined();
    expect(outcome.command).toEqual({
      status: "committed",
      eventKind: "closeHistoryGroup",
      snapshot: { lineage: "adapter-tests", revision: "0" },
      render: undefined,
    });
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
      matchesProfileGeneration: matchesTestProfile,
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
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);

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
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "action",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    expect(adapter.restoreCanonicalRender().ok).toBe(true);
    expect(adapter.state).toBe("live");
    expect(adapter.deliveryToken().snapshotRevision).toBe("1");
    adapter.dispose();
  });

  it.each(["returns a failure", "throws"] as const)(
    "enters reconciliation when renderer.update %s and restores the retained projection",
    (failureMode) => {
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
    const checkpoint = checkpointResult(1);
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
      selection: [afterRestore.view],
      sessionCheckpoints: [checkpoint.view],
    });
    const updateRender = vi.spyOn(base.renderer, "update");
    if (failureMode === "throws") {
      updateRender.mockImplementationOnce(() => {
        throw new Error("host DOM write threw");
      });
    } else {
      updateRender.mockReturnValueOnce({
        ok: false,
        error: {
          code: "renderer.dom_write_failed",
          message: "The DOM projection could not be installed.",
        },
      });
    }
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);
    const queueObserver = vi.fn();
    const queue = new BreditorCommandQueue(adapter.commandExecutor, {
      observer: queueObserver,
    });

    expect(queue.submit(actionRequest(adapter, selected))).toEqual({
      status: "failed",
      failure: { code: "command_queue.executor_threw", sequence: 1n },
    });
    expect(updateRender).toHaveBeenCalledOnce();
    expect(queueObserver).not.toHaveBeenCalled();
    expect(adapter.state).toBe("reconcile");
    expect(adapter.snapshot.revision).toBe("1");
    expect(adapter.rendered).toBe(base.rendered);
    expect(base.host.textContent).toBe("a");
    expect(update.free).toHaveBeenCalledOnce();
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "action",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    expect(adapter.sessionCheckpointReadPort.read()).toMatchObject({
      ok: true,
      checkpoint: {
        snapshot: { lineage: "adapter-tests", revision: "1" },
      },
    });
    expect(checkpoint.free).toHaveBeenCalledOnce();

    const restored = adapter.restoreCanonicalRender();
    expect(restored.ok).toBe(true);
    expect(adapter.state).toBe("live");
    expect(adapter.rendered).not.toBe(base.rendered);
    expect(base.host.textContent).toBe("ax");
    expect(adapter.deliveryToken().snapshotRevision).toBe("1");
    expect(afterRestore.free).toHaveBeenCalledOnce();
    expect(afterRestore.selectionFree).toHaveBeenCalledOnce();
      queue.dispose();
      adapter.dispose();
    },
  );

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

  it.each(["throws", "returns a rejected thenable"] as const)(
    "attempts every cleanup and faults if a generated free %s",
    async (failureMode) => {
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
      ...(failureMode === "throws"
        ? { freeThrows: true }
        : { freeResult: Promise.reject(new Error("free rejected")) }),
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
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);

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
    ).toThrow(failureMode === "throws" ? /free failed/u : /returned a value/u);
    expect(actionResult.free).toHaveBeenCalledOnce();
    expect(synchronized.free).toHaveBeenCalledOnce();
    expect(adapter.state).toBe("faulted");
    expect(adapter.snapshot.revision).toBe("1");
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "action",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    adapter.dispose();
    expect(committed.free).toHaveBeenCalledOnce();
    await Promise.resolve();
  },
  );

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
        matchesProfileGeneration: matchesTestProfile,
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

  it("reserves adapter authority and restores the exact leased selection without core work", () => {
    const base = projectionFixture(0, "abc");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    const initial = observation(0);
    const engine = engineQueues({});
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const normal = adapter.deliveryToken();
    const request = stringActionRequest(
      normal,
      rangeSelectionSync(selected),
      { kind: "api", detail: "stale-during-composition" },
      "breditor/insert-text",
      "x",
    );

    expect(() => adapter.beginCompositionLease(normal, selected, 0n)).toThrow(
      /invalid or stale/u,
    );
    expect(() =>
      adapter.beginCompositionLease(
        normal,
        selected,
        18_446_744_073_709_551_616n,
      )
    ).toThrow(/invalid or stale/u);
    expect(adapter.acceptsDeliveryToken(normal)).toBe(true);

    const lease = adapter.beginCompositionLease(normal, selected, 7n);

    expect(adapter.state).toBe("composition");
    expect(lease.selection).toBe(selected);
    expect(lease.sessionId).toBe(7n);
    expect(lease.observationEpoch).toBe(1n);
    expect(adapter.acceptsDeliveryToken(normal)).toBe(false);
    expect(() => adapter.deliveryToken()).toThrow(/composition/u);
    expect(() => adapter.execute(request)).toThrow(/composition/u);

    const restored = adapter.restoreCompositionLease(lease);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error(restored.reason);
    expect(restored.selection).toBe(selected);
    expect(restored.rendered).toBe(adapter.rendered);
    expect(restored.rendered).not.toBe(base.rendered);
    expect(restored.delivery.observationEpoch).toBe(2n);
    expect(adapter.acceptsDeliveryToken(restored.delivery)).toBe(true);
    expect(initial.free).not.toHaveBeenCalled();
    expect(() => adapter.restoreCompositionLease(lease)).toThrow(/live/u);
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it("begins composition from native host facts despite hostile own shadows", () => {
    const base = projectionFixture(0, "abc");
    const selected = selection(base.projection, 1);
    const initial = observation(0);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    const delivery = adapter.deliveryToken();
    const ownerDocument = base.host.ownerDocument;
    const isConnectedShadow = vi.fn(() => true);
    const ownerDocumentShadow = vi.fn(() => {
      throw new Error("own ownerDocument must not be read");
    });
    const defaultViewShadow = vi.fn(() => {
      throw new Error("own defaultView must not be read");
    });
    Object.defineProperties(base.host, {
      isConnected: { configurable: true, get: isConnectedShadow },
      ownerDocument: { configurable: true, get: ownerDocumentShadow },
    });
    Object.defineProperty(ownerDocument, "defaultView", {
      configurable: true,
      get: defaultViewShadow,
    });

    const lease = adapter.beginCompositionLease(delivery, selected, 8n);

    expect(lease.host).toBe(base.host);
    expect(isConnectedShadow).not.toHaveBeenCalled();
    expect(ownerDocumentShadow).not.toHaveBeenCalled();
    expect(defaultViewShadow).not.toHaveBeenCalled();
    expect(Reflect.deleteProperty(base.host, "isConnected")).toBe(true);
    expect(Reflect.deleteProperty(base.host, "ownerDocument")).toBe(true);
    expect(Reflect.deleteProperty(ownerDocument, "defaultView")).toBe(true);
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it("rotates one refined lease while foreign, old, and duplicate tokens stay inert", () => {
    const base = projectionFixture(0, "abc");
    const bridge = new BreditorDomSelectionBridge();
    const initialSelection = selection(base.projection, 1);
    const refinedSelection = selection(base.projection, 2);
    const initial = observation(0);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const normal = adapter.deliveryToken();
    const foreign = issueCompositionDeliveryToken(
      base.projection,
      base.rendered,
      initialSelection,
      1n,
      11n,
      Symbol("foreign-composition-adapter"),
    );
    const lease = adapter.beginCompositionLease(normal, initialSelection, 11n);

    expect(() => adapter.refineCompositionLease(foreign, refinedSelection)).toThrow(
      /stale or foreign/u,
    );
    expect(() => adapter.openCompositionDomLease(foreign)).toThrow(
      /stale or foreign/u,
    );
    expect(adapter.state).toBe("composition");
    const refined = adapter.refineCompositionLease(lease, refinedSelection);
    expect(refined).not.toBe(lease);
    expect(refined.selection).toBe(refinedSelection);
    expect(refined.observationEpoch).toBe(lease.observationEpoch);
    expect(refined.sessionId).toBe(lease.sessionId);
    expect(() => adapter.openCompositionDomLease(lease)).toThrow(/stale or foreign/u);
    expect(() => adapter.restoreCompositionLease(lease)).toThrow(/stale or foreign/u);
    expect(adapter.openCompositionDomLease(refined)).toBe(true);
    expect(() => adapter.openCompositionDomLease(refined)).toThrow(/cannot be opened/u);
    expect(() => adapter.refineCompositionLease(refined, initialSelection)).toThrow(
      /cannot be refined/u,
    );

    const restored = adapter.restoreCompositionLease(refined);
    expect(restored.ok && restored.selection).toBe(refinedSelection);
    expect(() => adapter.restoreCompositionLease(refined)).toThrow(/live/u);
    adapter.dispose();
  });

  it("discards native DOM drift and returns a fresh canonical generation", async () => {
    const base = projectionFixture(0, "abc");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 2);
    const initial = observation(0);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const lease = adapter.beginCompositionLease(
      adapter.deliveryToken(),
      selected,
      1n,
    );
    expect(adapter.openCompositionDomLease(lease)).toBe(true);
    expect(base.rendered.current).toBe(false);
    const paragraph = base.host.firstChild;
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("composition fixture paragraph is missing");
    }
    paragraph.replaceChildren(document.createTextNode("native IME text"));
    await Promise.resolve();
    expect(base.rendered.current).toBe(false);

    const restored = adapter.restoreCompositionLease(lease);

    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error(restored.reason);
    expect(base.host.textContent).toBe("abc");
    expect(restored.rendered.current).toBe(true);
    expect(restored.rendered.rendererGeneration).toBeGreaterThan(
      base.rendered.rendererGeneration,
    );
    const observed = bridge.read(restored.rendered);
    expect(observed.ok && observed.value.kind === "range"
      ? observed.value.selection
      : undefined).toBe(selected);
    adapter.dispose();
  });

  it("rejects native DOM drift unless the exact renderer lease was opened", () => {
    const base = projectionFixture(0, "abc");
    const selected = selection(base.projection, 1);
    const initial = observation(0);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    const lease = adapter.beginCompositionLease(
      adapter.deliveryToken(),
      selected,
      5n,
    );
    const render = vi.spyOn(base.renderer, "render");
    base.host.firstChild?.appendChild(document.createTextNode("unleased drift"));

    expect(() => adapter.restoreCompositionLease(lease)).toThrow(/stale or foreign/u);
    expect(adapter.state).toBe("composition");
    expect(render).not.toHaveBeenCalled();
    expect(() => adapter.dispose()).not.toThrow();
    expect(adapter.state).toBe("disposed");
    expect(base.host.textContent).toBe("abc");
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it.each(["superseded", "released"] as const)(
    "recovers an exact lease after renderer ownership is %s without core work",
    (loss) => {
      const base = projectionFixture(0, "abc");
      const bridge = new BreditorDomSelectionBridge();
      const selected = selection(base.projection, 2);
      const initial = observation(0);
      // Every engine method rejects when its queue is empty. A successful
      // recovery therefore also proves that recovery made no core call.
      const adapter = new BreditorWasmCommandAdapter(
        engineQueues({}),
        initial,
        {
          renderer: base.renderer,
          rendered: base.rendered,
          selectionBridge: bridge,
        },
      );
      const foreign = issueCompositionDeliveryToken(
        base.projection,
        base.rendered,
        selected,
        1n,
        6n,
        Symbol("foreign-recovery-authority"),
      );
      const lease = adapter.beginCompositionLease(
        adapter.deliveryToken(),
        selected,
        6n,
      );
      expect(adapter.openCompositionDomLease(lease)).toBe(true);
      if (loss === "superseded") {
        const external = base.renderer.render(
          base.host,
          projection(99, "external"),
        );
        expect(external.ok).toBe(true);
      } else {
        expect(base.renderer.release(base.rendered)).toBe(true);
      }

      expect(() => adapter.restoreCompositionLease(lease)).toThrow(
        /stale or foreign/u,
      );
      expect(() => adapter.recoverCompositionLease(foreign)).toThrow(
        /stale or foreign/u,
      );
      expect(adapter.state).toBe("composition");

      const recovered = adapter.recoverCompositionLease(lease);

      expect(recovered.ok).toBe(true);
      if (!recovered.ok) throw new Error(recovered.reason);
      expect(recovered.selection).toBe(selected);
      expect(recovered.rendered).toBe(adapter.rendered);
      expect(base.host.textContent).toBe("abc");
      expect(adapter.acceptsDeliveryToken(recovered.delivery)).toBe(true);
      const observed = bridge.read(recovered.rendered);
      expect(observed.ok && observed.value.kind === "range"
        ? observed.value.selection
        : undefined).toBe(selected);
      expect(() => adapter.recoverCompositionLease(lease)).toThrow(/live/u);
      adapter.dispose();
      expect(initial.free).toHaveBeenCalledOnce();
    },
  );

  it("spends disconnected recovery before a redacted selection-write failure", () => {
    const base = projectionFixture(0, "abc");
    const bridge = new FailOnWriteBridge(1);
    const selected = selection(base.projection, 1);
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({}),
      observation(0),
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: bridge,
      },
    );
    const lease = adapter.beginCompositionLease(
      adapter.deliveryToken(),
      selected,
      8n,
    );
    expect(adapter.openCompositionDomLease(lease)).toBe(true);
    base.host.remove();
    expect(() => adapter.restoreCompositionLease(lease)).toThrow(
      /stale or foreign/u,
    );
    const render = vi.spyOn(base.renderer, "render");

    expect(adapter.recoverCompositionLease(lease)).toEqual({
      ok: false,
      reason: "selectionWriteFailed",
    });
    expect(render).toHaveBeenCalledOnce();
    expect(adapter.state).toBe("reconcile");
    expect(() => adapter.recoverCompositionLease(lease)).toThrow(/reconcile/u);
    adapter.dispose();
  });

  it("spends recovery before a redacted full-render failure", () => {
    const base = projectionFixture(0, "abc");
    const selected = selection(base.projection, 1);
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({}),
      observation(0),
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );
    const lease = adapter.beginCompositionLease(
      adapter.deliveryToken(),
      selected,
      9n,
    );
    expect(adapter.openCompositionDomLease(lease)).toBe(true);
    expect(base.renderer.release(base.rendered)).toBe(true);
    expect(() => adapter.restoreCompositionLease(lease)).toThrow(
      /stale or foreign/u,
    );
    vi.spyOn(base.renderer, "render").mockReturnValueOnce({
      ok: false,
      error: {
        code: "renderer.dom_write_failed",
        message: "private recovery detail",
      },
    });

    expect(adapter.recoverCompositionLease(lease)).toEqual({
      ok: false,
      reason: "renderFailed",
    });
    expect(adapter.state).toBe("reconcile");
    expect(() => adapter.recoverCompositionLease(lease)).toThrow(/reconcile/u);
    adapter.dispose();
  });

  it("spends a lease before a redacted renderer restoration failure", () => {
    const base = projectionFixture(0, "abc");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), observation(0), {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const lease = adapter.beginCompositionLease(
      adapter.deliveryToken(),
      selected,
      2n,
    );
    expect(adapter.openCompositionDomLease(lease)).toBe(true);
    const discard = vi.spyOn(base.renderer, "discardCompositionDomLease");
    vi.spyOn(base.renderer, "restoreCompositionDomLease").mockReturnValueOnce({
      ok: false,
      error: {
        code: "renderer.dom_write_failed",
        message: "private renderer detail",
      },
    });

    expect(adapter.restoreCompositionLease(lease)).toEqual({
      ok: false,
      reason: "renderFailed",
    });
    expect(adapter.state).toBe("reconcile");
    expect(discard).toHaveBeenCalledOnce();
    expect(() => adapter.restoreCompositionLease(lease)).toThrow(/reconcile/u);
    adapter.dispose();
  });

  it("retains the restored render but requires reconciliation when selection write fails", () => {
    const base = projectionFixture(0, "abc");
    const bridge = new FailOnWriteBridge(1);
    const selected = selection(base.projection, 1);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), observation(0), {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const lease = adapter.beginCompositionLease(
      adapter.deliveryToken(),
      selected,
      3n,
    );
    expect(adapter.openCompositionDomLease(lease)).toBe(true);

    expect(adapter.restoreCompositionLease(lease)).toEqual({
      ok: false,
      reason: "selectionWriteFailed",
    });
    expect(adapter.state).toBe("reconcile");
    expect(adapter.rendered).not.toBe(base.rendered);
    expect(adapter.rendered.current).toBe(true);
    expect(() => adapter.restoreCompositionLease(lease)).toThrow(/reconcile/u);
    adapter.dispose();
  });

  it("disposes an active lease by restoring and discarding its native DOM", async () => {
    const base = projectionFixture(0, "abc");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    const initial = observation(0);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const lease = adapter.beginCompositionLease(
      adapter.deliveryToken(),
      selected,
      4n,
    );
    expect(adapter.openCompositionDomLease(lease)).toBe(true);
    const paragraph = base.host.firstChild;
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("composition fixture paragraph is missing");
    }
    paragraph.textContent = "uncommitted private composition";
    await Promise.resolve();

    adapter.dispose();

    expect(adapter.state).toBe("disposed");
    expect(base.host.textContent).toBe("abc");
    expect(adapter.rendered.current).toBe(false);
    expect(initial.free).toHaveBeenCalledOnce();
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
  associateProjectionWithProfileGeneration(
    result.value,
    TEST_PROFILE_GENERATION,
  );
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
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    free: vi.fn(),
  };
}

function rejectedGeneratedHandle<T extends object>(
  properties: Readonly<Record<string, unknown>> = {},
): Readonly<{ view: T; free: ReturnType<typeof vi.fn> }> {
  const free = vi.fn();
  const rejected = Promise.reject(new Error("generated handle rejection must be contained"));
  Object.assign(rejected, properties, { free });
  return { view: rejected as unknown as T, free };
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
  freeResult?: unknown;
}>): TrackedResult {
  const free = input.freeThrows
    ? vi.fn(() => {
        throw new Error("free failed");
      })
    : input.freeResult === undefined
      ? vi.fn()
      : vi.fn(() => input.freeResult);
  return {
    free,
    view: {
      status: input.status,
      eventKind: input.eventKind,
      disabledActionId: input.disabledActionId,
      disabledReasonCode: input.disabledReasonCode,
      activation: input.activation,
      error: undefined,
      matchesProfileGeneration: (generation) =>
        generation === TEST_PROFILE_GENERATION,
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
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    observation: () => undefined,
    projectionUpdate: () => undefined,
    free,
  };
  return { view, free, errorFree };
}

function intentResult(input: Readonly<{
  status: "committed" | "blocked" | "unhandled";
  successor: WasmCommandObservationView;
  intentId?: string;
  bindingId?: string;
  actionId?: string;
  bindingPriority?: number;
  blockedReasonCode?: string;
  blockedActivation?: WasmIntentResultView["blockedActivation"];
  blockedValueStatus?: WasmIntentResultView["blockedValueStatus"];
  blockedValueContractName?: string;
  blockedValueContractVersion?: number;
  fallthroughs?: readonly Readonly<{
    bindingId: string;
    actionId: string;
    priority: number;
    reasonCode: string;
  }>[];
  update?: SemanticProjectionUpdateView;
  error?: WasmCommandErrorView;
  matchesGeneration?: boolean;
  freeResult?: unknown;
}>): TrackedIntentResult {
  const fallthroughs = input.fallthroughs ?? [];
  const free = input.freeResult === undefined
    ? vi.fn()
    : vi.fn(() => input.freeResult);
  const view: WasmIntentResultView = {
    status: input.status,
    intentId: input.intentId ?? TEST_INTENT_ID,
    bindingId: input.bindingId,
    actionId: input.actionId,
    bindingPriority: input.bindingPriority,
    blockedReasonCode: input.blockedReasonCode,
    blockedActivation: input.blockedActivation,
    blockedValueStatus: input.blockedValueStatus,
    blockedValueContractName: input.blockedValueContractName,
    blockedValueContractVersion: input.blockedValueContractVersion,
    fallthroughCount: fallthroughs.length,
    error: input.error,
    matchesProfileGeneration: (generation) =>
      input.matchesGeneration !== false && generation === TEST_PROFILE_GENERATION,
    observation: () => input.successor,
    projectionUpdate: () => input.update,
    blockedReasonDetailJson: () => {
      throw new Error("unused intent detail helper");
    },
    blockedValueJson: () => {
      throw new Error("unused intent value helper");
    },
    commitJson: () => {
      throw new Error("unused intent commit helper");
    },
    fallthroughBindingId: (index) => fallthroughs[index]?.bindingId,
    fallthroughActionId: (index) => fallthroughs[index]?.actionId,
    fallthroughPriority: (index) => fallthroughs[index]?.priority,
    fallthroughReasonCode: (index) => fallthroughs[index]?.reasonCode,
    fallthroughReasonDetailJson: () => {
      throw new Error("unused intent fallthrough detail helper");
    },
    free,
  };
  return { view, free };
}

function intentError(code: string) {
  const errorFree = vi.fn();
  const error: WasmCommandErrorView = {
    code,
    message: "the semantic intent was rejected",
    free: errorFree,
  };
  const free = vi.fn();
  const view: WasmIntentResultView = {
    status: "error",
    intentId: undefined,
    bindingId: undefined,
    actionId: undefined,
    bindingPriority: undefined,
    blockedReasonCode: undefined,
    blockedActivation: undefined,
    blockedValueStatus: undefined,
    blockedValueContractName: undefined,
    blockedValueContractVersion: undefined,
    fallthroughCount: 0,
    error,
    matchesProfileGeneration: matchesTestProfile,
    observation: () => undefined,
    projectionUpdate: () => undefined,
    blockedReasonDetailJson: () => {
      throw new Error("unused intent detail helper");
    },
    blockedValueJson: () => {
      throw new Error("unused intent value helper");
    },
    commitJson: () => {
      throw new Error("unused intent commit helper");
    },
    fallthroughBindingId: () => undefined,
    fallthroughActionId: () => undefined,
    fallthroughPriority: () => undefined,
    fallthroughReasonCode: () => undefined,
    fallthroughReasonDetailJson: () => {
      throw new Error("unused intent fallthrough detail helper");
    },
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
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
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
    schemaFingerprint: TEST_SCHEMA_FINGERPRINT,
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
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
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    free: vi.fn(),
  };
}

function selectionResult(view: SemanticSelectionView) {
  let taken = false;
  const free = vi.fn();
  const result: WasmSelectionResultView = {
    status: "selection",
    error: undefined,
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
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

function emptyActionStateResult(revision: number) {
  const valueFree = vi.fn();
  const valueResult: WasmActionStateStringResultView = {
    status: "absent",
    error: undefined,
    takeValue: () => undefined,
    free: valueFree,
  };
  const snapshotFree = vi.fn();
  const snapshot: WasmActionStateSnapshotView = {
    snapshotLineage: "adapter-tests",
    snapshotRevision: String(revision),
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    entryCount: 0,
    changedCount: 0,
    entryId: () => undefined,
    entryStatus: () => undefined,
    entryActivation: () => undefined,
    entryReasonCode: () => undefined,
    entryValueStatus: () => undefined,
    entryValueContractName: () => undefined,
    entryValueContractVersion: () => undefined,
    entryUniformValueJson: () => valueResult,
    changedId: () => undefined,
    free: snapshotFree,
  };
  const free = vi.fn();
  let taken = false;
  const view: WasmActionStatesResultView = {
    status: "full",
    error: undefined,
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    takeSnapshot: () => {
      if (taken) return undefined;
      taken = true;
      return snapshot;
    },
    free,
  };
  return { view, free, snapshotFree, valueFree };
}

function profileDescriptorWithActionState(): BrowserCompiledProfileDescriptor {
  const noEntry = (): undefined => undefined;
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "breditor/base",
    schemaVersion: 1,
    schemaFingerprint: TEST_SCHEMA_FINGERPRINT,
    formatCount: 1,
    intentCount: 1,
    actionStateCount: 1,
    matchesProfileGeneration: matchesTestProfile,
    formatKind: (index) => index === 0 ? "breditor/strong" : undefined,
    formatRevision: (index) => index === 0 ? 1 : undefined,
    intentId: (index) => index === 0 ? TEST_INTENT_ID : undefined,
    intentInputKind: (index) => index === 0 ? "none" : undefined,
    intentInputContractName: noEntry,
    intentInputContractVersion: noEntry,
    intentActivationContract: (index) => index === 0 ? "tracked" : undefined,
    intentValueContractName: noEntry,
    intentValueContractVersion: noEntry,
    actionStateId: (index) => index === 0 ? "breditor/control-bold" : undefined,
    actionStateSourceKind: (index) => index === 0 ? "routed" : undefined,
    actionStateSourceActionId: noEntry,
    actionStateSourceIntentId: (index) => index === 0 ? TEST_INTENT_ID : undefined,
    actionStateHistoryDirection: noEntry,
    actionStateActivationContract: (index) => index === 0 ? "tracked" : undefined,
    actionStateValueContractName: noEntry,
    actionStateValueContractVersion: noEntry,
    free: () => undefined,
  };
  const consumed = consumeWasmCompiledProfileDescriptor(
    TEST_PROFILE_GENERATION,
    view,
  );
  if (!consumed.ok) throw new Error("action-state descriptor was rejected");
  return consumed.descriptor;
}

function profileDescriptorWithIntentContract(options: Readonly<{
  input: "none" | "typed";
  value: boolean;
}>): BrowserCompiledProfileDescriptor {
  const noEntry = (): undefined => undefined;
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "breditor/base",
    schemaVersion: 1,
    schemaFingerprint: TEST_SCHEMA_FINGERPRINT,
    formatCount: 1,
    intentCount: 1,
    actionStateCount: 0,
    matchesProfileGeneration: matchesTestProfile,
    formatKind: (index) => index === 0 ? "breditor/strong" : undefined,
    formatRevision: (index) => index === 0 ? 1 : undefined,
    intentId: (index) => index === 0 ? TEST_INTENT_ID : undefined,
    intentInputKind: (index) => index === 0 ? options.input : undefined,
    intentInputContractName: (index) =>
      index === 0 && options.input === "typed" ? "example/input" : undefined,
    intentInputContractVersion: (index) =>
      index === 0 && options.input === "typed" ? 1 : undefined,
    intentActivationContract: (index) => index === 0 ? "tracked" : undefined,
    intentValueContractName: (index) =>
      index === 0 && options.value ? "example/value" : undefined,
    intentValueContractVersion: (index) =>
      index === 0 && options.value ? 2 : undefined,
    actionStateId: noEntry,
    actionStateSourceKind: noEntry,
    actionStateSourceActionId: noEntry,
    actionStateSourceIntentId: noEntry,
    actionStateHistoryDirection: noEntry,
    actionStateActivationContract: noEntry,
    actionStateValueContractName: noEntry,
    actionStateValueContractVersion: noEntry,
    free: () => undefined,
  };
  const consumed = consumeWasmCompiledProfileDescriptor(
    TEST_PROFILE_GENERATION,
    view,
  );
  if (!consumed.ok) throw new Error("intent contract descriptor was rejected");
  return consumed.descriptor;
}

function checkpointResult(revision: number): Readonly<{
  view: WasmSessionCheckpointStringResultView;
  free: ReturnType<typeof vi.fn>;
}> {
  const free = vi.fn();
  let taken = false;
  const checkpointJson = JSON.stringify({
    format: "breditor/session-checkpoint",
    formatVersion: 1,
    historyBase: {
      format: "breditor/editor-state",
      formatVersion: 1,
      snapshot: { lineage: "adapter-tests", revision: "0" },
    },
    currentRevision: String(revision),
    historyCapacity: 0,
    cursor: 0,
    entries: [],
    openMergeGroup: null,
  });
  const view: WasmSessionCheckpointStringResultView = {
    status: "value",
    error: undefined,
    takeValue: () => {
      if (taken) return undefined;
      taken = true;
      return checkpointJson;
    },
    free,
  };
  return { view, free };
}

function engineQueues(input: Readonly<{
  setSelection?: WasmCommandResultView[];
  setRangeSelection?: () => WasmCommandResultView;
  stringAction?: WasmCommandResultView[];
  noInputAction?: WasmCommandResultView[];
  intents?: WasmIntentResultView[];
  closeHistory?: WasmCommandResultView[];
  selection?: WasmSelectionResultView[];
  actionStates?: WasmActionStatesResultView[];
  sessionCheckpoints?: WasmSessionCheckpointStringResultView[];
  documents?: WasmDocumentJsonStringResultView[];
}>): WasmCommandEngineView {
  const take = <T>(values: T[] | undefined, name: string): T => {
    const value = values?.shift();
    if (value === undefined) throw new Error(`unexpected ${name}`);
    return value;
  };
  return {
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    actionStates: () => take(input.actionStates, "actionStates"),
    sessionCheckpointJson: () =>
      take(input.sessionCheckpoints, "sessionCheckpointJson"),
    documentJson: () => take(input.documents, "documentJson"),
    clearSelection: () => take(input.setSelection, "clearSelection"),
    setRangeSelection: () => input.setRangeSelection?.() ?? take(input.setSelection, "setRangeSelection"),
    selection: () => take(input.selection, "selection"),
    executeNoInputAction: () => take(input.noInputAction, "executeNoInputAction"),
    executeNoInputIntent: () => take(input.intents, "executeNoInputIntent"),
    executeStringAction: () => take(input.stringAction, "executeStringAction"),
    undo: () => { throw new Error("unexpected undo"); },
    redo: () => { throw new Error("unexpected redo"); },
    closeHistoryGroup: () => take(input.closeHistory, "closeHistoryGroup"),
  };
}

function documentResult(text: string): Readonly<{
  view: WasmDocumentJsonStringResultView;
  free: ReturnType<typeof vi.fn>;
}> {
  const free = vi.fn();
  let taken = false;
  const documentJson = JSON.stringify({
    format: "breditor/document",
    formatVersion: 1,
    schema: { name: "breditor/base", version: 1 },
    root: {
      kind: "element",
      type: "breditor/document",
      entityId: null,
      properties: {},
      children: [
        {
          kind: "element",
          type: "breditor/paragraph",
          entityId: null,
          properties: {},
          children: text.length === 0 ? [] : [{ kind: "text", text, formats: [] }],
        },
      ],
    },
  });
  return {
    view: {
      status: "value",
      error: undefined,
      takeValue: () => {
        if (taken) return undefined;
        taken = true;
        return documentJson;
      },
      free,
    },
    free,
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
