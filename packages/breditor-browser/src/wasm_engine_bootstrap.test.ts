import { describe, expect, it, vi } from "vitest";

import {
  BREDITOR_BROWSER_PACKAGE_VERSION,
  BREDITOR_WASM_ABI_VERSION,
  bootstrapWasmEngine,
  isOwnedBrowserWasmEngineBootstrapResult,
  type WasmBootstrappedEngineView,
  type WasmEngineBootstrapFactoryView,
  type WasmEngineBootstrapModuleView,
  type WasmEngineBootstrapResultView,
  type WasmProjectionReadResultView,
} from "./wasm_engine_bootstrap.js";
import type {
  WasmCompiledProfileDescriptorView,
  WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";
import type {
  WasmCommandObservationView,
} from "./wasm_command_adapter.js";
import type { SemanticProjectionView } from "./wasm_projection_adapter.js";
import type { WasmSessionCheckpointErrorView } from "./wasm_session_checkpoint.js";

const BASE_SCHEMA_FINGERPRINT =
  "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";

class FakeGeneration implements WasmProfileGenerationView {
  freeCalls = 0;

  matches(other: WasmProfileGenerationView): boolean {
    return other === this;
  }

  free(): void {
    this.freeCalls += 1;
  }
}

class FakeDescriptor implements WasmCompiledProfileDescriptorView {
  readonly schemaName = "breditor/base";
  readonly schemaVersion = 1;
  readonly schemaFingerprint = BASE_SCHEMA_FINGERPRINT;
  readonly formatCount = 1;
  readonly intentCount = 0;
  readonly actionStateCount = 3;
  freeCalls = 0;

  constructor(readonly generation: WasmProfileGenerationView) {}

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === this.generation;
  }

  formatKind(index: number): string | undefined {
    return index === 0 ? "breditor/strong" : undefined;
  }

  formatRevision(index: number): number | undefined {
    return index === 0 ? 1 : undefined;
  }

  intentId(): undefined { return undefined; }
  intentInputKind(): undefined { return undefined; }
  intentInputContractName(): undefined { return undefined; }
  intentInputContractVersion(): undefined { return undefined; }
  intentActivationContract(): undefined { return undefined; }
  intentValueContractName(): undefined { return undefined; }
  intentValueContractVersion(): undefined { return undefined; }

  actionStateId(index: number): string | undefined {
    return [
      "breditor/control-bold",
      "breditor/control-redo",
      "breditor/control-undo",
    ][index];
  }

  actionStateSourceKind(index: number): "direct" | "history" | undefined {
    return index === 0 ? "direct" : index === 1 || index === 2 ? "history" : undefined;
  }

  actionStateSourceActionId(index: number): string | undefined {
    return index === 0 ? "breditor/toggle-strong" : undefined;
  }

  actionStateSourceIntentId(): undefined { return undefined; }

  actionStateHistoryDirection(index: number): "undo" | "redo" | undefined {
    return index === 1 ? "redo" : index === 2 ? "undo" : undefined;
  }

  actionStateActivationContract(index: number): "stateless" | "tracked" | undefined {
    return index === 0 ? "tracked" : index === 1 || index === 2 ? "stateless" : undefined;
  }

  actionStateValueContractName(): undefined { return undefined; }
  actionStateValueContractVersion(): undefined { return undefined; }

  free(): void {
    this.freeCalls += 1;
  }
}

class FakeError implements WasmSessionCheckpointErrorView {
  freeCalls = 0;

  constructor(
    readonly code = "codec.invalid_document",
    readonly message = "hostile payload detail which must not escape",
  ) {}

  free(): void {
    this.freeCalls += 1;
  }
}

class FakeProjection implements SemanticProjectionView {
  readonly schemaName = "breditor/base";
  readonly schemaVersion = 1;
  readonly schemaFingerprint = BASE_SCHEMA_FINGERPRINT;
  readonly rootIndex = 0;
  readonly nodeCount = 3;
  freeCalls = 0;

  constructor(
    readonly snapshotLineage = "bootstrap-tests",
    readonly snapshotRevision = "0",
    readonly contents = "hello",
    readonly generation: WasmProfileGenerationView = new FakeGeneration(),
  ) {}

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === this.generation;
  }

  nodeKind(index: number): "element" | "text" | undefined {
    return index < 2 ? "element" : index === 2 ? "text" : undefined;
  }

  elementType(index: number): string | undefined {
    return index === 0
      ? "breditor/document"
      : index === 1
        ? "breditor/paragraph"
        : undefined;
  }

  childCount(index: number): number | undefined {
    return index < 2 ? 1 : undefined;
  }

  childAt(index: number, ordinal: number): number | undefined {
    return ordinal === 0 && index < 2 ? index + 1 : undefined;
  }

  text(index: number): string | undefined {
    return index === 2 ? this.contents : undefined;
  }

  formatCount(index: number): number | undefined {
    return index === 2 ? 0 : undefined;
  }

  formatType(): undefined {
    return undefined;
  }

  free(): void {
    this.freeCalls += 1;
  }
}

class FakeProjectionResult implements WasmProjectionReadResultView {
  freeCalls = 0;
  takeCalls = 0;

  constructor(
    readonly status: "projection" | "taken" | "error",
    private projectionView: SemanticProjectionView | undefined,
    readonly generation: WasmProfileGenerationView,
    readonly error: WasmSessionCheckpointErrorView | undefined = undefined,
  ) {}

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === this.generation;
  }

  takeProjection(): SemanticProjectionView | undefined {
    this.takeCalls += 1;
    const projection = this.projectionView;
    this.projectionView = undefined;
    return projection;
  }

  free(): void {
    this.freeCalls += 1;
  }
}

class FakeConstructionResult implements WasmEngineBootstrapResultView {
  freeCalls = 0;
  takeCalls = 0;

  constructor(
    readonly status: "engine" | "taken" | "error",
    private engineView: WasmBootstrappedEngineView | undefined,
    readonly error: WasmSessionCheckpointErrorView | undefined = undefined,
  ) {}

  takeEngine(): WasmBootstrappedEngineView | undefined {
    this.takeCalls += 1;
    const engine = this.engineView;
    this.engineView = undefined;
    return engine;
  }

  free(): void {
    this.freeCalls += 1;
  }
}

interface EngineFixture {
  readonly engine: WasmBootstrappedEngineView;
  readonly engineFree: ReturnType<typeof vi.fn>;
  readonly observation: WasmCommandObservationView;
  readonly observationFree: ReturnType<typeof vi.fn>;
  readonly generation: FakeGeneration;
  readonly descriptor: FakeDescriptor;
  readonly projection: FakeProjection;
  readonly projectionResult: FakeProjectionResult;
  readonly command: ReturnType<typeof vi.fn>;
}

function engineFixture(
  lineage = "bootstrap-tests",
  revision = "0",
): EngineFixture {
  const generation = new FakeGeneration();
  const descriptor = new FakeDescriptor(generation);
  const observationFree = vi.fn();
  const observation: WasmCommandObservationView = {
    snapshotLineage: lineage,
    snapshotRevision: revision,
    matchesProfileGeneration: (candidate) => candidate === generation,
    free: observationFree,
  };
  const projection = new FakeProjection(lineage, revision, "hello", generation);
  const projectionResult = new FakeProjectionResult(
    "projection",
    projection,
    generation,
  );
  const engineFree = vi.fn();
  const command = vi.fn(() => ({ marker: "command-result" }));
  const engine = {
    actionStates: command,
    sessionCheckpointJson: command,
    documentJson: command,
    clearSelection: command,
    setRangeSelection: command,
    selection: command,
    executeNoInputAction: command,
    executeStringAction: command,
    undo: command,
    redo: command,
    closeHistoryGroup: command,
    matchesProfileGeneration: (candidate: WasmProfileGenerationView) =>
      candidate === generation,
    profileGeneration: vi.fn(() => generation),
    profileDescriptor: vi.fn(() => descriptor),
    observation: vi.fn(() => observation),
    projection: vi.fn(() => projectionResult),
    free: engineFree,
  } as unknown as WasmBootstrappedEngineView;
  return {
    engine,
    engineFree,
    observation,
    observationFree,
    generation,
    descriptor,
    projection,
    projectionResult,
    command,
  };
}

function factoryReturning(result: WasmEngineBootstrapResultView) {
  const fromDocumentJson = vi.fn(() => result);
  const fromSessionCheckpointJson = vi.fn(() => result);
  const factory: WasmEngineBootstrapFactoryView = {
    fromDocumentJson,
    fromSessionCheckpointJson,
  };
  return { factory, fromDocumentJson, fromSessionCheckpointJson };
}

function moduleFor(factory: WasmEngineBootstrapFactoryView): WasmEngineBootstrapModuleView {
  return {
    BreditorEngine: factory,
    breditorWasmAbiVersion: () => BREDITOR_WASM_ABI_VERSION,
    breditorVersion: () => BREDITOR_BROWSER_PACKAGE_VERSION,
  };
}

const DOCUMENT_SOURCE = Object.freeze({
  kind: "document" as const,
  lineageId: "bootstrap-tests",
  documentJson: "{}",
  historyCapacity: 100,
});

const CHECKPOINT_SOURCE = Object.freeze({
  kind: "sessionCheckpoint" as const,
  checkpointJson: "{}",
});

describe("Wasm engine bootstrap", () => {
  it("constructs Document V1, consumes temporary handles, and transfers three owners", () => {
    const fixture = engineFixture();
    const construction = new FakeConstructionResult("engine", fixture.engine);
    const factory = factoryReturning(construction);

    const result = bootstrapWasmEngine(moduleFor(factory.factory), DOCUMENT_SOURCE);

    expect(result.ok).toBe(true);
    expect(isOwnedBrowserWasmEngineBootstrapResult(result)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    if (!result.ok) throw new Error("bootstrap failed");
    expect(result.projection.snapshot).toEqual({
      lineage: "bootstrap-tests",
      revision: "0",
    });
    expect(result.projection.paragraphs[0]?.runs[0]?.text).toBe("hello");
    expect(factory.fromDocumentJson).toHaveBeenCalledWith(
      "bootstrap-tests",
      "{}",
      100,
    );
    expect(factory.fromSessionCheckpointJson).not.toHaveBeenCalled();
    expect(construction.freeCalls).toBe(1);
    expect(construction.takeCalls).toBe(1);
    expect(fixture.projectionResult.freeCalls).toBe(1);
    expect(fixture.projectionResult.takeCalls).toBe(1);
    expect(fixture.projection.freeCalls).toBe(1);
    expect(fixture.engineFree).not.toHaveBeenCalled();
    expect(fixture.observationFree).not.toHaveBeenCalled();
    expect(fixture.generation.freeCalls).toBe(0);
    expect(Object.isFrozen(result.engine)).toBe(true);

    result.observation.free();
    result.observation.free();
    result.profileGeneration.free();
    result.profileGeneration.free();
    result.engine.free();
    result.engine.free();
    expect(fixture.observationFree).toHaveBeenCalledOnce();
    expect(fixture.generation.freeCalls).toBe(1);
    expect(fixture.engineFree).toHaveBeenCalledOnce();
  });

  it("restores a checkpoint through the same correlated module bootstrap", () => {
    const fixture = engineFixture("restored", "42");
    const construction = new FakeConstructionResult("engine", fixture.engine);
    const factory = factoryReturning(construction);

    const result = bootstrapWasmEngine(moduleFor(factory.factory), CHECKPOINT_SOURCE);

    expect(result.ok).toBe(true);
    expect(factory.fromSessionCheckpointJson).toHaveBeenCalledWith("{}");
    expect(factory.fromDocumentJson).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.projection.snapshot).toEqual({
        lineage: "restored",
        revision: "42",
      });
      result.observation.free();
      result.profileGeneration.free();
      result.engine.free();
    }
  });

  it("requires exact module ABI and a valid release-version probe", () => {
    const fixture = engineFixture();
    const construction = new FakeConstructionResult("engine", fixture.engine);
    const factory = factoryReturning(construction);
    const incompatible = {
      ...moduleFor(factory.factory),
      breditorWasmAbiVersion: () => "1",
    };
    const malformedVersion = {
      ...moduleFor(factory.factory),
      breditorVersion: () => "dev",
    };

    expect(bootstrapWasmEngine(incompatible, DOCUMENT_SOURCE)).toMatchObject({
      ok: false,
      error: { code: "engine_bootstrap.incompatible_wasm_abi" },
    });
    expect(bootstrapWasmEngine(malformedVersion, DOCUMENT_SOURCE)).toMatchObject({
      ok: false,
      error: { code: "engine_bootstrap.incompatible_wasm_version" },
    });
    expect(factory.fromDocumentJson).not.toHaveBeenCalled();
    expect(fixture.engineFree).not.toHaveBeenCalled();
  });

  it("rejects compatibility mismatches before accessing the generated factory", () => {
    const factoryReads = vi.fn();
    const module = {
      breditorWasmAbiVersion: () => "2",
      breditorVersion: () => BREDITOR_BROWSER_PACKAGE_VERSION,
    } as unknown as WasmEngineBootstrapModuleView;
    Object.defineProperty(module, "BreditorEngine", {
      get: () => {
        factoryReads();
        throw new Error("factory must remain inaccessible");
      },
    });

    expect(bootstrapWasmEngine(module, DOCUMENT_SOURCE)).toMatchObject({
      ok: false,
      error: { code: "engine_bootstrap.incompatible_wasm_abi" },
    });
    expect(factoryReads).not.toHaveBeenCalled();

    Reflect.set(module, "breditorWasmAbiVersion", () => BREDITOR_WASM_ABI_VERSION);
    Reflect.set(module, "breditorVersion", () => "0.2.0-alpha.4");
    expect(bootstrapWasmEngine(module, DOCUMENT_SOURCE)).toMatchObject({
      ok: false,
      error: { code: "engine_bootstrap.incompatible_wasm_version" },
    });
    expect(factoryReads).not.toHaveBeenCalled();
  });

  it("rejects a non-base profile descriptor before reading a projection", () => {
    const fixture = engineFixture();
    Object.defineProperty(fixture.descriptor, "schemaName", {
      value: "example/document",
    });

    const result = bootstrapWasmEngine(
      moduleFor(
        factoryReturning(new FakeConstructionResult("engine", fixture.engine)).factory,
      ),
      DOCUMENT_SOURCE,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "engine_bootstrap.invalid_profile_descriptor" },
    });
    expect(fixture.engine.projection).not.toHaveBeenCalled();
    expect(fixture.descriptor.freeCalls).toBe(1);
    expect(fixture.generation.freeCalls).toBe(1);
    expect(fixture.engineFree).toHaveBeenCalledOnce();
    expect(fixture.observationFree).not.toHaveBeenCalled();
  });

  it.each([
    [
      "engine",
      "engine_bootstrap.invalid_profile_generation",
      (fixture: EngineFixture) => {
        Reflect.set(fixture.engine, "matchesProfileGeneration", () => false);
      },
    ],
    [
      "descriptor",
      "engine_bootstrap.invalid_profile_descriptor",
      (fixture: EngineFixture) => {
        Reflect.set(fixture.descriptor, "matchesProfileGeneration", () => false);
      },
    ],
    [
      "observation",
      "engine_bootstrap.invalid_wasm_view",
      (fixture: EngineFixture) => {
        Reflect.set(fixture.observation, "matchesProfileGeneration", () => false);
      },
    ],
    [
      "projection result",
      "engine_bootstrap.invalid_wasm_view",
      (fixture: EngineFixture) => {
        Reflect.set(fixture.projectionResult, "matchesProfileGeneration", () => false);
      },
    ],
    [
      "projection",
      "engine_bootstrap.invalid_wasm_view",
      (fixture: EngineFixture) => {
        Reflect.set(fixture.projection, "matchesProfileGeneration", () => false);
      },
    ],
  ] as const)("rejects a mismatched %s generation", (_label, code, mutate) => {
    const fixture = engineFixture();
    mutate(fixture);

    const result = bootstrapWasmEngine(
      moduleFor(
        factoryReturning(new FakeConstructionResult("engine", fixture.engine)).factory,
      ),
      DOCUMENT_SOURCE,
    );

    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(fixture.engineFree).toHaveBeenCalledOnce();
    expect(fixture.generation.freeCalls).toBe(1);
  });

  it("rejects malformed sources before calling generated code", () => {
    const fixture = engineFixture();
    const factory = factoryReturning(
      new FakeConstructionResult("engine", fixture.engine),
    );
    const values = [
      { ...DOCUMENT_SOURCE, lineageId: "-bad" },
      { ...DOCUMENT_SOURCE, historyCapacity: 101 },
      { ...DOCUMENT_SOURCE, documentJson: "\ud800" },
      { ...DOCUMENT_SOURCE, extra: true },
      { kind: "sessionCheckpoint", checkpointJson: "" },
    ];

    for (const value of values) {
      expect(
        bootstrapWasmEngine(
          moduleFor(factory.factory),
          value as unknown as typeof DOCUMENT_SOURCE,
        ),
      ).toMatchObject({
        ok: false,
        error: { code: "engine_bootstrap.invalid_request" },
      });
    }
    expect(factory.fromDocumentJson).not.toHaveBeenCalled();
    expect(factory.fromSessionCheckpointJson).not.toHaveBeenCalled();
  });

  it("copies only a stable core code and frees a construction error", () => {
    const error = new FakeError();
    const construction = new FakeConstructionResult("error", undefined, error);

    const result = bootstrapWasmEngine(
      moduleFor(factoryReturning(construction).factory),
      DOCUMENT_SOURCE,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "core",
        code: "codec.invalid_document",
        message: "The Rust editor core rejected engine bootstrap.",
      },
    });
    expect(error.freeCalls).toBe(1);
    expect(construction.freeCalls).toBe(1);
  });

  it("frees the engine and observation when the guarded projection fails", () => {
    const fixture = engineFixture();
    const error = new FakeError("editor_engine.stale_snapshot");
    const projectionResult = new FakeProjectionResult(
      "error",
      undefined,
      fixture.generation,
      error,
    );
    Reflect.set(fixture.engine, "projection", vi.fn(() => projectionResult));
    const construction = new FakeConstructionResult("engine", fixture.engine);

    const result = bootstrapWasmEngine(
      moduleFor(factoryReturning(construction).factory),
      DOCUMENT_SOURCE,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "core", code: "editor_engine.stale_snapshot" },
    });
    expect(error.freeCalls).toBe(1);
    expect(projectionResult.freeCalls).toBe(1);
    expect(fixture.engineFree).toHaveBeenCalledOnce();
    expect(fixture.observationFree).toHaveBeenCalledOnce();
  });

  it("rejects projection/observation snapshot disagreement and releases all owners", () => {
    const fixture = engineFixture();
    Reflect.set(
      fixture.engine,
      "projection",
      vi.fn(
        () =>
          new FakeProjectionResult(
            "projection",
            new FakeProjection("bootstrap-tests", "1", "hello", fixture.generation),
            fixture.generation,
          ),
      ),
    );
    const construction = new FakeConstructionResult("engine", fixture.engine);

    const result = bootstrapWasmEngine(
      moduleFor(factoryReturning(construction).factory),
      DOCUMENT_SOURCE,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "engine_bootstrap.invalid_initial_projection" },
    });
    expect(fixture.engineFree).toHaveBeenCalledOnce();
    expect(fixture.observationFree).toHaveBeenCalledOnce();
  });

  it("rejects aliases without freeing the protected or multiply-owned handle", () => {
    const fixture = engineFixture();
    const resultAsEngine = new FakeConstructionResult("engine", undefined);
    Reflect.set(resultAsEngine, "engineView", resultAsEngine);
    const engineAlias = bootstrapWasmEngine(
      moduleFor(factoryReturning(resultAsEngine).factory),
      DOCUMENT_SOURCE,
    );
    expect(engineAlias.ok).toBe(false);
    expect(resultAsEngine.freeCalls).toBe(1);

    const observationAliasEngine = engineFixture();
    Reflect.set(
      observationAliasEngine.engine,
      "observation",
      vi.fn(() => observationAliasEngine.engine),
    );
    const aliasedObservation = bootstrapWasmEngine(
      moduleFor(factoryReturning(
        new FakeConstructionResult("engine", observationAliasEngine.engine),
      ).factory),
      DOCUMENT_SOURCE,
    );
    expect(aliasedObservation.ok).toBe(false);
    expect(observationAliasEngine.engineFree).toHaveBeenCalledOnce();

    const projectionAlias = engineFixture();
    Reflect.set(
      projectionAlias.engine,
      "projection",
      vi.fn(() => projectionAlias.engine),
    );
    const aliasedProjectionResult = bootstrapWasmEngine(
      moduleFor(factoryReturning(
        new FakeConstructionResult("engine", projectionAlias.engine),
      ).factory),
      DOCUMENT_SOURCE,
    );
    expect(aliasedProjectionResult.ok).toBe(false);
    expect(projectionAlias.engineFree).toHaveBeenCalledOnce();
    expect(projectionAlias.observationFree).toHaveBeenCalledOnce();
  });

  it("captures cleanup before hostile then and sibling getters mutate it", async () => {
    const fixture = engineFixture();
    const originalResultFree = vi.fn();
    const replacementResultFree = vi.fn();
    const construction = new FakeConstructionResult("engine", fixture.engine);
    Reflect.set(construction, "free", originalResultFree);
    Object.defineProperty(construction, "then", {
      configurable: true,
      get: () => {
        Reflect.set(construction, "free", replacementResultFree);
        return (
          _resolve: (value: unknown) => void,
          reject: (reason: unknown) => void,
        ): void => reject(new Error("contained"));
      },
    });

    const result = bootstrapWasmEngine(
      moduleFor(factoryReturning(construction).factory),
      DOCUMENT_SOURCE,
    );

    expect(result.ok).toBe(false);
    expect(originalResultFree).toHaveBeenCalledOnce();
    expect(replacementResultFree).not.toHaveBeenCalled();
    expect(fixture.engineFree).not.toHaveBeenCalled();
    await Promise.resolve();

    const originalErrorFree = vi.fn();
    const replacementErrorFree = vi.fn();
    const error = new FakeError();
    Reflect.set(error, "free", originalErrorFree);
    const hostile = new FakeConstructionResult("error", undefined, error);
    Reflect.set(hostile, "takeEngine", () => {
      Reflect.set(error, "free", replacementErrorFree);
      return undefined;
    });
    expect(
      bootstrapWasmEngine(moduleFor(factoryReturning(hostile).factory), DOCUMENT_SOURCE)
        .ok,
    ).toBe(false);
    expect(originalErrorFree).toHaveBeenCalledOnce();
    expect(replacementErrorFree).not.toHaveBeenCalled();
  });

  it("contains rejected generated projections and frees every claimed owner", async () => {
    const fixture = engineFixture();
    const rejected = Promise.reject(new Error("contained"));
    const projectionFree = vi.fn();
    Object.defineProperty(rejected, "free", { value: projectionFree });
    const projectionResult = new FakeProjectionResult(
      "projection",
      rejected as unknown as SemanticProjectionView,
      fixture.generation,
    );
    Reflect.set(fixture.engine, "projection", vi.fn(() => projectionResult));

    const result = bootstrapWasmEngine(
      moduleFor(factoryReturning(new FakeConstructionResult("engine", fixture.engine))
        .factory),
      DOCUMENT_SOURCE,
    );

    expect(result.ok).toBe(false);
    expect(projectionFree).toHaveBeenCalledOnce();
    expect(projectionResult.freeCalls).toBe(1);
    expect(fixture.engineFree).toHaveBeenCalledOnce();
    expect(fixture.observationFree).toHaveBeenCalledOnce();
    await Promise.resolve();
  });

  it("keeps engine method and cleanup snapshots after raw properties change", () => {
    const fixture = engineFixture();
    const originalCommand = fixture.engine.undo;
    const construction = new FakeConstructionResult("engine", fixture.engine);
    const result = bootstrapWasmEngine(
      moduleFor(factoryReturning(construction).factory),
      DOCUMENT_SOURCE,
    );
    if (!result.ok) throw new Error("bootstrap failed");

    const replacementCommand = vi.fn();
    const replacementFree = vi.fn();
    Reflect.set(fixture.engine, "undo", replacementCommand);
    Reflect.set(fixture.engine, "free", replacementFree);
    result.engine.undo(result.observation);
    expect(originalCommand).toHaveBeenCalledOnce();
    expect(replacementCommand).not.toHaveBeenCalled();
    result.engine.free();
    expect(fixture.engineFree).toHaveBeenCalledOnce();
    expect(replacementFree).not.toHaveBeenCalled();
    result.observation.free();
  });

  it("retains the captured observation cleanup across later sibling cleanup", () => {
    const fixture = engineFixture();
    const replacement = vi.fn();
    Reflect.set(fixture.projectionResult, "free", vi.fn(() => {
      try {
        Reflect.set(fixture.observation, "free", replacement);
      } catch {
        // A non-configurable cleanup is the intended success condition.
      }
    }));
    const result = bootstrapWasmEngine(
      moduleFor(factoryReturning(new FakeConstructionResult("engine", fixture.engine))
        .factory),
      DOCUMENT_SOURCE,
    );
    if (!result.ok) throw new Error("bootstrap failed");

    result.observation.free();
    expect(fixture.observationFree).toHaveBeenCalledOnce();
    expect(replacement).not.toHaveBeenCalled();
    result.engine.free();
  });

  it("rejects a hidden raw-engine result from every forwarding path", () => {
    const fixture = engineFixture();
    Reflect.set(fixture.engine, "undo", vi.fn(() => fixture.engine));
    const result = bootstrapWasmEngine(
      moduleFor(factoryReturning(new FakeConstructionResult("engine", fixture.engine))
        .factory),
      DOCUMENT_SOURCE,
    );
    if (!result.ok) throw new Error("bootstrap failed");

    expect(() => result.engine.undo(result.observation)).toThrow(
      "generated engine returned its private owner",
    );
    expect(fixture.engineFree).not.toHaveBeenCalled();
    result.observation.free();
    result.engine.free();
  });

  it("turns temporary-handle cleanup failure into failure and releases transfers", () => {
    const fixture = engineFixture();
    const construction = new FakeConstructionResult("engine", fixture.engine);
    Reflect.set(construction, "free", vi.fn(() => "not void"));

    const result = bootstrapWasmEngine(
      moduleFor(factoryReturning(construction).factory),
      DOCUMENT_SOURCE,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "engine_bootstrap.invalid_wasm_view" },
    });
    expect(fixture.engineFree).toHaveBeenCalledOnce();
    expect(fixture.observationFree).toHaveBeenCalledOnce();
  });

  it("detects a temporary handle that secretly disposes a transferred owner", () => {
    const fixture = engineFixture();
    const construction = new FakeConstructionResult("engine", fixture.engine);
    Reflect.set(construction, "free", vi.fn(() => {
      fixture.engine.free();
      fixture.observation.free();
    }));

    const result = bootstrapWasmEngine(
      moduleFor(factoryReturning(construction).factory),
      DOCUMENT_SOURCE,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "engine_bootstrap.invalid_wasm_view" },
    });
    expect(fixture.engineFree).toHaveBeenCalledOnce();
    expect(fixture.observationFree).toHaveBeenCalledOnce();
  });

  it("contains throwing accessors and rejected module probes", async () => {
    const throwingFactory = {
      get fromDocumentJson(): never {
        throw new Error("hostile getter");
      },
      fromSessionCheckpointJson: vi.fn(),
    } as unknown as WasmEngineBootstrapFactoryView;
    expect(bootstrapWasmEngine(moduleFor(throwingFactory), DOCUMENT_SOURCE)).toMatchObject({
      ok: false,
      error: { code: "engine_bootstrap.invalid_wasm_module" },
    });

    const rejected = Promise.reject(new Error("contained"));
    const module = {
      BreditorEngine: throwingFactory,
      breditorWasmAbiVersion: () => rejected,
      breditorVersion: () => BREDITOR_BROWSER_PACKAGE_VERSION,
    } as unknown as WasmEngineBootstrapModuleView;
    expect(bootstrapWasmEngine(module, DOCUMENT_SOURCE)).toMatchObject({
      ok: false,
      error: { code: "engine_bootstrap.incompatible_wasm_abi" },
    });
    await Promise.resolve();
  });
});
