import { describe, expect, it, vi } from "vitest";

import {
  BreditorActionStateStore,
  MAX_ACTION_STATE_STORE_LISTENERS,
  type WasmActionStateReadPort,
} from "./action_state_store.js";
import {
  consumeWasmActionStates,
  type BrowserActionStateReadResult,
  type BrowserActionStateSnapshot,
  type WasmActionStateErrorView,
  type WasmActionStateSnapshotView,
  type WasmActionStateStringResultView,
  type WasmActionStatesResultView,
} from "./wasm_action_state_adapter.js";
import type { WasmProfileGenerationView } from "./wasm_profile_descriptor.js";

const TEST_PROFILE_GENERATION: WasmProfileGenerationView = {
  matches(other): boolean {
    return other === TEST_PROFILE_GENERATION;
  },
  free: vi.fn(),
};

interface EntryFixture {
  readonly id: string;
  readonly availability: "enabled" | "disabled";
  readonly activation: "stateless" | "inactive" | "active" | "mixed";
}

class AbsentStringResult implements WasmActionStateStringResultView {
  readonly status = "absent";
  readonly error = undefined;
  freeCalls = 0;

  takeValue(): undefined {
    return undefined;
  }

  free(): void {
    this.freeCalls += 1;
  }
}

class SnapshotView implements WasmActionStateSnapshotView {
  readonly snapshotLineage = "store-tests";
  readonly entryCount: number;
  readonly changedCount: number;
  readonly values: AbsentStringResult[] = [];
  freeCalls = 0;

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === TEST_PROFILE_GENERATION;
  }

  constructor(
    readonly snapshotRevision: string,
    readonly entries: readonly EntryFixture[],
    readonly changedIds: readonly string[],
  ) {
    this.entryCount = entries.length;
    this.changedCount = changedIds.length;
  }

  entryId(index: number): string | undefined {
    return this.entries[index]?.id;
  }

  entryStatus(index: number): "enabled" | "disabled" | undefined {
    return this.entries[index]?.availability;
  }

  entryActivation(index: number): EntryFixture["activation"] | undefined {
    return this.entries[index]?.activation;
  }

  entryReasonCode(index: number): string | undefined {
    return this.entries[index]?.availability === "disabled"
      ? "breditor/unavailable"
      : undefined;
  }

  entryValueStatus(index: number): "unsupported" | undefined {
    return this.entries[index] === undefined ? undefined : "unsupported";
  }

  entryValueContractName(): undefined {
    return undefined;
  }

  entryValueContractVersion(): undefined {
    return undefined;
  }

  entryUniformValueJson(): AbsentStringResult {
    const value = new AbsentStringResult();
    this.values.push(value);
    return value;
  }

  changedId(index: number): string | undefined {
    return this.changedIds[index];
  }

  free(): void {
    this.freeCalls += 1;
  }
}

class ResultView implements WasmActionStatesResultView {
  readonly error = undefined;
  freeCalls = 0;

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === TEST_PROFILE_GENERATION;
  }

  constructor(
    readonly status: "full" | "unchanged" | "delta",
    private snapshot: WasmActionStateSnapshotView | undefined,
  ) {}

  takeSnapshot(): WasmActionStateSnapshotView | undefined {
    const snapshot = this.snapshot;
    this.snapshot = undefined;
    return snapshot;
  }

  free(): void {
    this.freeCalls += 1;
  }
}

class ErrorView implements WasmActionStateErrorView {
  readonly code = "breditor_wasm.action_state";
  readonly message = "the guarded action-state read was rejected";
  freeCalls = 0;

  free(): void {
    this.freeCalls += 1;
  }
}

class ErrorResultView implements WasmActionStatesResultView {
  readonly status = "error";
  freeCalls = 0;

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === TEST_PROFILE_GENERATION;
  }

  constructor(readonly error: WasmActionStateErrorView) {}

  takeSnapshot(): undefined {
    return undefined;
  }

  free(): void {
    this.freeCalls += 1;
  }
}

class SequencePort implements WasmActionStateReadPort {
  calls = 0;

  constructor(
    readonly values: Array<BrowserActionStateReadResult | undefined | (() => BrowserActionStateReadResult | undefined)>,
  ) {}

  read(): BrowserActionStateReadResult | undefined {
    this.calls += 1;
    const value = this.values.shift();
    return typeof value === "function" ? value() : value;
  }
}

const DEFAULT_ENTRIES: readonly EntryFixture[] = Object.freeze([
  Object.freeze({
    id: "breditor/control-bold",
    availability: "enabled",
    activation: "inactive",
  }),
  Object.freeze({
    id: "breditor/control-redo",
    availability: "disabled",
    activation: "stateless",
  }),
  Object.freeze({
    id: "breditor/control-undo",
    availability: "enabled",
    activation: "stateless",
  }),
]);

function readResult(
  kind: "full" | "unchanged" | "delta",
  revision: string,
  entries: readonly EntryFixture[] = DEFAULT_ENTRIES,
  changedIds: readonly string[] =
    kind === "full" ? entries.map((entry) => entry.id) : [],
): BrowserActionStateReadResult {
  return consumeWasmActionStates(
    { lineage: "store-tests", revision },
    new ResultView(kind, new SnapshotView(revision, entries, changedIds)),
    TEST_PROFILE_GENERATION,
  );
}

function coreFailure(): BrowserActionStateReadResult {
  return consumeWasmActionStates(
    { lineage: "store-tests", revision: "1" },
    new ErrorResultView(new ErrorView()),
    TEST_PROFILE_GENERATION,
  );
}

function snapshotOf(store: BreditorActionStateStore): BrowserActionStateSnapshot {
  const snapshot = store.getSnapshot();
  if (snapshot === undefined) throw new Error("store snapshot fixture missing");
  return snapshot;
}

describe("BreditorActionStateStore", () => {
  it("publishes an initial full snapshot and supports bounded lexical lookup", () => {
    const port = new SequencePort([readResult("full", "1")]);
    const store = new BreditorActionStateStore(port);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.getStatus()).toEqual({
      status: "unavailable",
      lastError: undefined,
    });

    const result = store.refresh();

    expect(result.status).toBe("published");
    expect(store.getSnapshot()).toBe(
      result.status === "published" ? result.snapshot : undefined,
    );
    expect(store.getEntry("breditor/control-bold")).toMatchObject({
      availability: "enabled",
      activation: "inactive",
    });
    expect(store.getEntry("breditor/control-missing")).toBeUndefined();
    expect(store.getStatus()).toEqual({ status: "fresh", lastError: undefined });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(port.calls).toBe(1);
  });

  it("exposes one stable command-queue observer which refreshes after delivery", () => {
    const port = new SequencePort([readResult("full", "1")]);
    const store = new BreditorActionStateStore(port);
    const observer = store.queueObserver;

    observer(Object.freeze({ sequence: 1n }));

    expect(store.queueObserver).toBe(observer);
    expect(store.getSnapshot()).toBeDefined();
    expect(port.calls).toBe(1);
  });

  it("keeps its queue observer behind the public refresh capability boundary", () => {
    class ShadowingStore extends BreditorActionStateStore {
      override refresh(): never {
        throw new Error("subclass refresh must not receive queue authority");
      }
    }

    const subclassPort = new SequencePort([readResult("full", "1")]);
    const subclassStore = new ShadowingStore(subclassPort);
    expect(() => subclassStore.queueObserver(Object.freeze({ sequence: 1n }))).not.toThrow();
    expect(subclassStore.getSnapshot()).toBeDefined();
    expect(subclassPort.calls).toBe(1);

    const ownPort = new SequencePort([readResult("full", "1")]);
    const ownStore = new BreditorActionStateStore(ownPort);
    Object.defineProperty(ownStore, "refresh", {
      value: () => {
        throw new Error("own refresh must not receive queue authority");
      },
    });
    expect(() => ownStore.queueObserver(Object.freeze({ sequence: 1n }))).not.toThrow();
    expect(ownStore.getSnapshot()).toBeDefined();
    expect(ownPort.calls).toBe(1);
  });

  it("notifies in order without recursion and contains sync and async listener failures", async () => {
    const port = new SequencePort([readResult("full", "1")]);
    const store = new BreditorActionStateStore(port);
    const calls: string[] = [];
    let nested: unknown;
    const first = () => {
      calls.push("first");
      nested = store.refresh();
      return Promise.reject(new Error("async listener failed"));
    };
    store.subscribe(first as () => void);
    store.subscribe(() => {
      calls.push("throwing");
      throw new Error("listener failed");
    });
    store.subscribe(() => {
      calls.push("last");
    });

    expect(() => store.refresh()).not.toThrow();
    await Promise.resolve();

    expect(calls).toEqual(["first", "throwing", "last"]);
    expect(nested).toEqual({ status: "rejected", reason: "refreshing" });
    expect(port.calls).toBe(1);
  });

  it("deduplicates listener identity while retaining independent subscriptions", () => {
    const port = new SequencePort([
      readResult("full", "1"),
      readResult("delta", "2", DEFAULT_ENTRIES, []),
      readResult("delta", "3", DEFAULT_ENTRIES, []),
    ]);
    const store = new BreditorActionStateStore(port);
    const listener = vi.fn();
    const first = store.subscribe(listener);
    const second = store.subscribe(listener);

    store.refresh();
    expect(listener).toHaveBeenCalledTimes(1);
    first();
    first();
    store.refresh();
    expect(listener).toHaveBeenCalledTimes(2);
    second();
    store.refresh();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps exact duplicates and explicit unchanged reads silent", () => {
    const port = new SequencePort([
      readResult("full", "1"),
      readResult("full", "1"),
      readResult("unchanged", "1"),
    ]);
    const store = new BreditorActionStateStore(port);
    const listener = vi.fn();
    store.subscribe(listener);
    store.refresh();
    const initial = snapshotOf(store);

    expect(store.refresh()).toEqual({ status: "unchanged", snapshot: initial });
    expect(store.refresh()).toEqual({ status: "unchanged", snapshot: initial });
    expect(store.getSnapshot()).toBe(initial);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("publishes stale and restored-fresh status without replacing equal data", () => {
    const port = new SequencePort([
      readResult("full", "1"),
      undefined,
      undefined,
      readResult("unchanged", "1"),
    ]);
    const store = new BreditorActionStateStore(port);
    store.refresh();
    const initial = snapshotOf(store);
    const observed: string[] = [];
    store.subscribe(() => {
      observed.push(store.getStatus().status);
    });

    expect(store.refresh()).toMatchObject({
      status: "failed",
      error: { code: "action_state.read_unavailable" },
    });
    expect(store.getStatus()).toMatchObject({
      status: "stale",
      lastError: { code: "action_state.read_unavailable" },
    });
    const staleStatus = store.getStatus();
    expect(store.getSnapshot()).toBe(initial);

    // An identical failure does not invent another observable transition.
    expect(store.refresh().status).toBe("failed");
    expect(store.getStatus()).toBe(staleStatus);
    expect(observed).toEqual(["stale"]);

    expect(store.refresh()).toEqual({ status: "unchanged", snapshot: initial });
    expect(store.getStatus()).toEqual({ status: "fresh", lastError: undefined });
    expect(store.getSnapshot()).toBe(initial);
    expect(observed).toEqual(["stale", "fresh"]);
  });

  it("reports unavailable failures before any good snapshot", () => {
    const store = new BreditorActionStateStore(new SequencePort([undefined]));
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.refresh().status).toBe("failed");
    expect(store.getSnapshot()).toBeUndefined();
    expect(store.getStatus()).toMatchObject({
      status: "unavailable",
      lastError: { code: "action_state.read_unavailable" },
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("publishes a valid delta and exposes its exact changed-ID hint", () => {
    const changedEntries: readonly EntryFixture[] = Object.freeze([
      Object.freeze({ ...DEFAULT_ENTRIES[0]!, activation: "active" as const }),
      DEFAULT_ENTRIES[1]!,
      DEFAULT_ENTRIES[2]!,
    ]);
    const port = new SequencePort([
      readResult("full", "1"),
      readResult("delta", "2", changedEntries, []),
    ]);
    const store = new BreditorActionStateStore(port);
    const listener = vi.fn();
    store.subscribe(listener);
    store.refresh();

    const result = store.refresh();

    expect(result).toMatchObject({
      status: "published",
      kind: "delta",
      changedIds: ["breditor/control-bold"],
    });
    expect(store.getEntry("breditor/control-bold")?.activation).toBe("active");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("rejects snapshot regression and catalog drift while preserving its baseline", () => {
    const driftedEntries = Object.freeze([
      DEFAULT_ENTRIES[0]!,
      DEFAULT_ENTRIES[1]!,
      Object.freeze({
        id: "breditor/control-zoom",
        availability: "enabled" as const,
        activation: "stateless" as const,
      }),
    ]);
    const invalidReads = [
      readResult("delta", "0", DEFAULT_ENTRIES, []),
      readResult("full", "2", driftedEntries),
    ];
    const port = new SequencePort([readResult("full", "1"), ...invalidReads]);
    const store = new BreditorActionStateStore(port);
    store.refresh();
    const initial = snapshotOf(store);

    for (const _ of invalidReads) {
      expect(store.refresh()).toEqual({ status: "failed", error: {
        kind: "store",
        code: "action_state.invalid_transition",
        message: "The action-state refresh does not follow the current snapshot.",
      } });
      expect(store.getSnapshot()).toBe(initial);
    }
  });

  it("derives a local baseline across engine-global delta and unchanged relations", () => {
    const changedEntries: readonly EntryFixture[] = Object.freeze([
      Object.freeze({ ...DEFAULT_ENTRIES[0]!, activation: "active" as const }),
      DEFAULT_ENTRIES[1]!,
      DEFAULT_ENTRIES[2]!,
    ]);
    const port = new SequencePort([
      readResult("delta", "1", DEFAULT_ENTRIES, []),
      readResult("unchanged", "2", changedEntries, []),
      readResult("full", "2", changedEntries),
    ]);
    const store = new BreditorActionStateStore(port);

    expect(store.refresh()).toMatchObject({
      status: "published",
      kind: "full",
      changedIds: DEFAULT_ENTRIES.map((entry) => entry.id),
    });
    expect(store.refresh()).toMatchObject({
      status: "published",
      kind: "delta",
      changedIds: ["breditor/control-bold"],
    });
    const current = snapshotOf(store);
    expect(store.refresh()).toEqual({ status: "unchanged", snapshot: current });
  });

  it("rejects foreign structurally forged read results", () => {
    const realDelta = readResult("delta", "1", DEFAULT_ENTRIES, []);
    const forged = Object.freeze({ ...readResult("full", "1") });
    const port = new SequencePort([
      forged as BrowserActionStateReadResult,
      realDelta,
    ]);
    const store = new BreditorActionStateStore(port);

    expect(store.refresh()).toMatchObject({
      status: "failed",
      error: { code: "action_state.read_unavailable" },
    });
    expect(store.getSnapshot()).toBeUndefined();
    expect(store.refresh()).toMatchObject({
      status: "published",
      kind: "full",
    });
  });

  it("contains a rejected Promise returned by a broken synchronous port", async () => {
    const rejected = Promise.reject(new Error("asynchronous read is invalid"));
    const store = new BreditorActionStateStore({
      read: () => rejected as never,
    });

    expect(store.refresh()).toMatchObject({
      status: "failed",
      error: { code: "action_state.read_unavailable" },
    });
    await expect(rejected).rejects.toThrow(/asynchronous read/u);
    await Promise.resolve();
  });

  it("preserves the prior snapshot across unavailable, throwing, and core-failed reads", () => {
    const unavailablePort = new SequencePort([
      readResult("full", "1"),
      undefined,
      () => {
        throw new Error("adapter unavailable");
      },
      coreFailure(),
    ]);
    const store = new BreditorActionStateStore(unavailablePort);
    store.refresh();
    const initial = snapshotOf(store);
    const observedErrors: Array<string | undefined> = [];
    store.subscribe(() => {
      observedErrors.push(store.getStatus().lastError?.code);
    });

    for (let index = 0; index < 3; index += 1) {
      expect(store.refresh().status).toBe("failed");
      expect(store.getSnapshot()).toBe(initial);
    }
    expect(store.getStatus()).toMatchObject({
      status: "stale",
      lastError: { kind: "core", code: "breditor_wasm.action_state" },
    });
    expect(observedErrors).toEqual([
      "action_state.read_unavailable",
      "breditor_wasm.action_state",
    ]);
  });

  it("captures the constructor port method instead of following later shadowing", () => {
    const port = new SequencePort([readResult("full", "1")]);
    const store = new BreditorActionStateStore(port);
    Object.defineProperty(port, "read", {
      value: () => {
        throw new Error("shadowed");
      },
    });

    expect(store.refresh().status).toBe("published");
    expect(port.calls).toBe(1);
  });

  it("makes reentrant disposal observable without recursive notification", () => {
    const port = new SequencePort([
      readResult("full", "1"),
      readResult("delta", "2", DEFAULT_ENTRIES, []),
    ]);
    const store = new BreditorActionStateStore(port);
    store.refresh();
    const initial = snapshotOf(store);
    const calls: string[] = [];
    let depth = 0;
    let maximumDepth = 0;
    store.subscribe(() => {
      depth += 1;
      maximumDepth = Math.max(maximumDepth, depth);
      const status = store.getStatus().status;
      calls.push(`dispose:${status}`);
      if (status === "fresh") store.dispose();
      depth -= 1;
    });
    store.subscribe(() => {
      calls.push(`sibling:${store.getStatus().status}`);
    });

    expect(store.refresh().status).toBe("published");
    const finalSnapshot = snapshotOf(store);
    expect(finalSnapshot).not.toBe(initial);
    expect(calls).toEqual([
      "dispose:fresh",
      "dispose:disposed",
      "sibling:disposed",
    ]);
    expect(maximumDepth).toBe(1);
    expect(store.disposed).toBe(true);
    expect(store.getStatus()).toEqual({
      status: "disposed",
      lastError: undefined,
    });
    expect(store.getSnapshot()).toBe(finalSnapshot);
    expect(store.refresh()).toEqual({ status: "rejected", reason: "disposed" });
    expect(port.calls).toBe(2);
    expect(() => store.subscribe(() => {})).not.toThrow();
  });

  it("notifies current subscribers of standalone disposal before releasing them", () => {
    const store = new BreditorActionStateStore(
      new SequencePort([readResult("full", "1"), undefined]),
    );
    store.refresh();
    store.refresh();
    const statuses: string[] = [];
    const listener = () => {
      statuses.push(store.getStatus().status);
    };
    store.subscribe(listener);

    store.dispose();
    store.dispose();

    expect(statuses).toEqual(["disposed"]);
    expect(store.getSnapshot()).toBeDefined();
    expect(store.getStatus()).toMatchObject({
      status: "disposed",
      lastError: { code: "action_state.read_unavailable" },
    });
    store.subscribe(listener);
    expect(statuses).toEqual(["disposed"]);
  });

  it("does not install a read when the port disposes the store reentrantly", () => {
    let store: BreditorActionStateStore;
    const next = readResult("full", "1");
    const port = new SequencePort([
      () => {
        store.dispose();
        return next;
      },
    ]);
    store = new BreditorActionStateStore(port);

    expect(store.refresh()).toEqual({ status: "rejected", reason: "disposed" });
    expect(store.getSnapshot()).toBeUndefined();
    expect(store.disposed).toBe(true);
    expect(store.getStatus()).toEqual({
      status: "disposed",
      lastError: undefined,
    });
  });

  it("does not overwrite terminal status when a disposing port also fails", () => {
    let store: BreditorActionStateStore;
    const port = new SequencePort([
      () => {
        store.dispose();
        return undefined;
      },
    ]);
    store = new BreditorActionStateStore(port);

    expect(store.refresh()).toEqual({ status: "rejected", reason: "disposed" });
    expect(store.getSnapshot()).toBeUndefined();
    expect(store.getStatus()).toEqual({
      status: "disposed",
      lastError: undefined,
    });
  });

  it("validates constructor and listener boundaries", () => {
    expect(
      () => new BreditorActionStateStore({ read: 1 } as unknown as WasmActionStateReadPort),
    ).toThrow(TypeError);
    const store = new BreditorActionStateStore(new SequencePort([]));
    expect(() => store.subscribe(1 as unknown as () => void)).toThrow(TypeError);
    for (let index = 0; index < MAX_ACTION_STATE_STORE_LISTENERS; index += 1) {
      store.subscribe(() => index);
    }
    expect(() => store.subscribe(() => {})).toThrow(RangeError);
  });
});
