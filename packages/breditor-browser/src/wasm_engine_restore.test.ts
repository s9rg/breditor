import { describe, expect, it, vi } from "vitest";

import {
  isOwnedBrowserWasmEngineRestoreResult,
  restoreWasmEngine,
  type WasmEngineRestoreFactoryView,
  type WasmEngineRestoreResultView,
  type WasmRestoredEngineView,
} from "./wasm_engine_restore.js";
import {
  MAX_BROWSER_SESSION_CHECKPOINT_JSON_BYTES,
  type WasmSessionCheckpointErrorView,
} from "./wasm_session_checkpoint.js";

class FakeError implements WasmSessionCheckpointErrorView {
  freeCalls = 0;

  constructor(
    readonly code = "codec.invalid_session_checkpoint",
    readonly message = "the session checkpoint was rejected",
  ) {}

  free(): void {
    this.freeCalls += 1;
  }
}

class FakeResult implements WasmEngineRestoreResultView {
  freeCalls = 0;
  takeCalls = 0;

  constructor(
    readonly status: "engine" | "taken" | "error",
    private engine: WasmRestoredEngineView | undefined,
    readonly error: WasmSessionCheckpointErrorView | undefined = undefined,
  ) {}

  takeEngine(): WasmRestoredEngineView | undefined {
    this.takeCalls += 1;
    const engine = this.engine;
    this.engine = undefined;
    return engine;
  }

  free(): void {
    this.freeCalls += 1;
  }
}

describe("Wasm engine restore boundary", () => {
  it("transfers one validated engine and consumes only its factory result", () => {
    const restored = engine();
    const resultView = new FakeResult("engine", restored.view);
    const factory = factoryReturning(resultView);

    const result = restoreWasmEngine(factory.view, "{}");

    expect(result).toEqual({ ok: true, engine: restored.view });
    expect(isOwnedBrowserWasmEngineRestoreResult(result)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(factory.call).toHaveBeenCalledWith("{}");
    expect(resultView.takeCalls).toBe(1);
    expect(resultView.freeCalls).toBe(1);
    expect(restored.free).not.toHaveBeenCalled();
  });

  it("returns a redacted core failure and frees its cloned error", () => {
    const error = new FakeError();
    const resultView = new FakeResult("error", undefined, error);

    const result = restoreWasmEngine(factoryReturning(resultView).view, "{}");

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "core",
        code: "codec.invalid_session_checkpoint",
        message: "the session checkpoint was rejected",
      },
    });
    expect(error.freeCalls).toBe(1);
    expect(resultView.freeCalls).toBe(1);
  });

  it("rejects malformed browser strings before invoking Wasm", () => {
    const factory = factoryReturning(new FakeResult("error", undefined));
    const values = [
      "",
      "\ud800",
      "x".repeat(MAX_BROWSER_SESSION_CHECKPOINT_JSON_BYTES + 1),
    ];

    for (const value of values) {
      expect(restoreWasmEngine(factory.view, value).ok).toBe(false);
    }
    expect(factory.call).not.toHaveBeenCalled();
  });

  it("contains a throwing factory accessor", () => {
    const factory = {
      get fromSessionCheckpointJson(): never {
        throw new Error("hostile factory getter");
      },
    } as unknown as WasmEngineRestoreFactoryView;

    expect(() => restoreWasmEngine(factory, "{}")).not.toThrow();
    expect(restoreWasmEngine(factory, "{}").ok).toBe(false);
  });

  it("contains a rejected Promise returned by the factory method getter", async () => {
    const rejected = Promise.reject(new Error("must be contained"));
    const factory = Object.create(null) as WasmEngineRestoreFactoryView;
    Object.defineProperty(factory, "fromSessionCheckpointJson", {
      value: rejected,
    });

    expect(restoreWasmEngine(factory, "{}").ok).toBe(false);
    await Promise.resolve();
  });

  it("contains a rejected Promise returned by the synchronous factory", async () => {
    const rejected = Promise.reject(new Error("must be contained"));
    const factory = {
      fromSessionCheckpointJson: () => rejected,
    } as unknown as WasmEngineRestoreFactoryView;

    expect(restoreWasmEngine(factory, "{}").ok).toBe(false);
    await Promise.resolve();
  });

  it("rejects thenable engines, frees them, and contains rejection", async () => {
    const free = vi.fn();
    const rejected = Promise.reject(new Error("must be contained"));
    Object.defineProperty(rejected, "free", { value: free });
    const resultView = new FakeResult(
      "engine",
      rejected as unknown as WasmRestoredEngineView,
    );

    expect(restoreWasmEngine(factoryReturning(resultView).view, "{}").ok).toBe(
      false,
    );
    expect(free).toHaveBeenCalledOnce();
    expect(resultView.freeCalls).toBe(1);
    await Promise.resolve();
  });

  it("captures result, cloned-error, and engine cleanup before hostile then inspection", () => {
    const resultFree = vi.fn();
    const poisonedResultFree = vi.fn();
    const hostileResult = {
      status: "error" as const,
      error: undefined,
      takeEngine: () => undefined,
      free: resultFree,
      get then() {
        this.free = poisonedResultFree;
        return (resolve: (value: undefined) => void): void => resolve(undefined);
      },
    };

    expect(
      restoreWasmEngine(
        factoryReturning(
          hostileResult as unknown as WasmEngineRestoreResultView,
        ).view,
        "{}",
      ).ok,
    ).toBe(false);
    expect(resultFree).toHaveBeenCalledOnce();
    expect(poisonedResultFree).not.toHaveBeenCalled();

    const errorFree = vi.fn();
    const poisonedErrorFree = vi.fn();
    const hostileError = {
      code: "codec.invalid_session_checkpoint",
      message: "the session checkpoint was rejected",
      free: errorFree,
      get then() {
        this.free = poisonedErrorFree;
        return (resolve: (value: undefined) => void): void => resolve(undefined);
      },
    };
    const errorResult = new FakeResult(
      "error",
      undefined,
      hostileError as unknown as WasmSessionCheckpointErrorView,
    );

    expect(restoreWasmEngine(factoryReturning(errorResult).view, "{}").ok).toBe(
      false,
    );
    expect(errorFree).toHaveBeenCalledOnce();
    expect(poisonedErrorFree).not.toHaveBeenCalled();
    expect(errorResult.freeCalls).toBe(1);

    const restored = engine();
    const poisonedEngineFree = vi.fn();
    Object.defineProperty(restored.view, "then", {
      configurable: true,
      get: () => {
        Reflect.set(restored.view, "free", poisonedEngineFree);
        return (resolve: (value: undefined) => void): void => resolve(undefined);
      },
    });
    const engineResult = new FakeResult("engine", restored.view);

    expect(restoreWasmEngine(factoryReturning(engineResult).view, "{}").ok).toBe(
      false,
    );
    expect(restored.free).toHaveBeenCalledOnce();
    expect(poisonedEngineFree).not.toHaveBeenCalled();
    expect(engineResult.freeCalls).toBe(1);
  });

  it("contains rejected result and engine fields after capturing ownership", async () => {
    const rejectedStatus = Promise.reject(new Error("must be contained"));
    const resultFree = vi.fn();
    const hostileResult = {
      status: rejectedStatus,
      takeEngine: () => undefined,
      error: undefined,
      free: resultFree,
    } as unknown as WasmEngineRestoreResultView;

    expect(
      restoreWasmEngine(factoryReturning(hostileResult).view, "{}").ok,
    ).toBe(false);
    expect(resultFree).toHaveBeenCalledOnce();

    const restored = engine();
    const rejectedMethod = Promise.reject(new Error("must be contained"));
    Object.defineProperty(restored.view, "actionStates", {
      value: rejectedMethod,
    });
    const engineResult = new FakeResult("engine", restored.view);
    expect(restoreWasmEngine(factoryReturning(engineResult).view, "{}").ok).toBe(
      false,
    );
    expect(restored.free).toHaveBeenCalledOnce();
    expect(engineResult.freeCalls).toBe(1);
    await Promise.resolve();
  });

  it("frees registered handles when later access or extraction throws", () => {
    const accessorFree = vi.fn();
    const throwingAccessor = {
      get status(): never {
        throw new Error("hostile status getter");
      },
      free: accessorFree,
    } as unknown as WasmEngineRestoreResultView;
    const takeView = new FakeResult("engine", engine().view);
    Object.defineProperty(takeView, "takeEngine", {
      value: () => {
        throw new Error("hostile take");
      },
    });

    expect(
      restoreWasmEngine(factoryReturning(throwingAccessor).view, "{}").ok,
    ).toBe(false);
    expect(accessorFree).toHaveBeenCalledOnce();
    expect(restoreWasmEngine(factoryReturning(takeView).view, "{}").ok).toBe(
      false,
    );
    expect(takeView.freeCalls).toBe(1);
  });

  it("never frees the factory when a result aliases that protected owner", () => {
    const free = vi.fn();
    const factory = {
      fromSessionCheckpointJson(): WasmEngineRestoreResultView {
        return factory as unknown as WasmEngineRestoreResultView;
      },
      get status(): never {
        throw new Error("must not inspect aliased factory result");
      },
      free,
    } as unknown as WasmEngineRestoreFactoryView;

    expect(restoreWasmEngine(factory, "{}").ok).toBe(false);
    expect(free).not.toHaveBeenCalled();
  });

  it("contains a hostile protected-handle iterable before invoking Wasm", () => {
    const resultView = new FakeResult("engine", engine().view);
    const factory = factoryReturning(resultView);
    const revoked = Proxy.revocable<unknown[]>([], {});
    revoked.revoke();

    expect(() =>
      restoreWasmEngine(
        factory.view,
        "{}",
        revoked.proxy as readonly unknown[],
      ),
    ).not.toThrow();
    expect(
      restoreWasmEngine(
        factory.view,
        "{}",
        revoked.proxy as readonly unknown[],
      ).ok,
    ).toBe(false);
    expect(factory.call).not.toHaveBeenCalled();
    expect(resultView.freeCalls).toBe(0);
  });

  it("frees a duplicate result/engine alias exactly once", () => {
    const free = vi.fn();
    const aliased = Object.assign(engine().view, {
      status: "engine" as const,
      error: undefined,
      takeEngine: () => aliased,
      free,
    }) as unknown as WasmEngineRestoreResultView;

    expect(restoreWasmEngine(factoryReturning(aliased).view, "{}").ok).toBe(
      false,
    );
    expect(free).toHaveBeenCalledOnce();
  });

  it("reclaims a transferred engine when result cleanup fails", () => {
    const restored = engine();
    const resultView = new FakeResult("engine", restored.view);
    Object.defineProperty(resultView, "free", {
      value: () => {
        throw new Error("result cleanup failed");
      },
    });

    expect(restoreWasmEngine(factoryReturning(resultView).view, "{}").ok).toBe(
      false,
    );
    expect(restored.free).toHaveBeenCalledOnce();
  });

  it("reclaims provisional engines after undefined throws and non-void cleanup", () => {
    const thrownEngine = engine();
    const thrownResult = new FakeResult("engine", thrownEngine.view);
    const throwingCleanup = vi.fn((): never => {
      throw undefined;
    });
    Object.defineProperty(thrownResult, "free", { value: throwingCleanup });

    expect(() =>
      restoreWasmEngine(factoryReturning(thrownResult).view, "{}"),
    ).not.toThrow();
    expect(throwingCleanup).toHaveBeenCalledOnce();
    expect(thrownEngine.free).toHaveBeenCalledOnce();

    const nonvoidEngine = engine();
    const nonvoidResult = new FakeResult("engine", nonvoidEngine.view);
    const nonvoidCleanup = vi.fn(() => 1);
    Object.defineProperty(nonvoidResult, "free", { value: nonvoidCleanup });

    expect(restoreWasmEngine(factoryReturning(nonvoidResult).view, "{}").ok).toBe(
      false,
    );
    expect(nonvoidCleanup).toHaveBeenCalledOnce();
    expect(nonvoidEngine.free).toHaveBeenCalledOnce();
  });

  it("contains rejected cleanup and reclaims a provisional engine", async () => {
    const restored = engine();
    const resultView = new FakeResult("engine", restored.view);
    Object.defineProperty(resultView, "free", {
      value: () => Promise.reject(new Error("private cleanup rejection")),
    });

    expect(restoreWasmEngine(factoryReturning(resultView).view, "{}").ok).toBe(
      false,
    );
    expect(restored.free).toHaveBeenCalledOnce();
    await Promise.resolve();
  });
});

function factoryReturning(result: WasmEngineRestoreResultView): Readonly<{
  view: WasmEngineRestoreFactoryView;
  call: ReturnType<typeof vi.fn>;
}> {
  const call = vi.fn((_checkpointJson: string) => result);
  return {
    view: { fromSessionCheckpointJson: call },
    call,
  };
}

function engine(): Readonly<{
  view: WasmRestoredEngineView;
  free: ReturnType<typeof vi.fn>;
}> {
  const free = vi.fn();
  const unsupported = (): never => {
    throw new Error("fixture method must not be called");
  };
  const observation = Object.freeze({
    snapshotLineage: "restore-tests",
    snapshotRevision: "0",
    free: vi.fn(),
  });
  const view: WasmRestoredEngineView = {
    actionStates: unsupported,
    sessionCheckpointJson: unsupported,
    documentJson: unsupported,
    clearSelection: unsupported,
    setRangeSelection: unsupported,
    selection: unsupported,
    executeNoInputAction: unsupported,
    executeStringAction: unsupported,
    undo: unsupported,
    redo: unsupported,
    closeHistoryGroup: unsupported,
    observation: () => observation,
    free,
  };
  return { view, free };
}
