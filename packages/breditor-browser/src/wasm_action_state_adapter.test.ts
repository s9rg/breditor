import { describe, expect, it, vi } from "vitest";

import {
  MAX_BROWSER_ACTION_STATE_ENTRIES,
  MAX_BROWSER_ACTION_STATE_VALUE_JSON_BYTES,
  consumeWasmActionStates as consumeWasmActionStatesRaw,
  isOwnedBrowserActionStateReadResult,
  type BrowserActionStateActivation,
  type BrowserActionStateValueStatus,
  type WasmActionStateEntryStatus,
  type WasmActionStateErrorView,
  type WasmActionStateSnapshotView,
  type WasmActionStateStringResultView,
  type WasmActionStatesResultView,
} from "./wasm_action_state_adapter.js";
import type { WasmProfileGenerationView } from "./wasm_profile_descriptor.js";

const TEST_PROFILE_GENERATION: WasmProfileGenerationView = {
  matches(other) {
    return other === TEST_PROFILE_GENERATION;
  },
  free: vi.fn(),
};

interface FakeEntry {
  readonly id: string;
  readonly status: WasmActionStateEntryStatus;
  readonly activation?: BrowserActionStateActivation;
  readonly reasonCode?: string;
  readonly valueStatus?: BrowserActionStateValueStatus;
  readonly contractName?: string;
  readonly contractVersion?: number;
  readonly uniformJson?: string;
}

class FakeError implements WasmActionStateErrorView {
  freeCalls = 0;

  constructor(
    readonly code = "breditor_wasm.action_state",
    readonly message = "the guarded action-state read was rejected",
  ) {}

  free(): void {
    this.freeCalls += 1;
  }
}

class FakeStringResult implements WasmActionStateStringResultView {
  freeCalls = 0;
  takeCalls = 0;

  constructor(
    readonly status: "value" | "taken" | "absent" | "error",
    readonly encoded: string | undefined = undefined,
    readonly error: WasmActionStateErrorView | undefined = undefined,
  ) {}

  takeValue(): string | undefined {
    this.takeCalls += 1;
    return this.status === "value" ? this.encoded : undefined;
  }

  free(): void {
    this.freeCalls += 1;
  }
}

class FakeSnapshot implements WasmActionStateSnapshotView {
  readonly snapshotLineage: string;
  readonly snapshotRevision: string;
  readonly entryCount: number;
  readonly changedCount: number;
  readonly values: FakeStringResult[] = [];
  freeCalls = 0;

  constructor(
    readonly entries: readonly FakeEntry[],
    readonly changed: readonly string[],
    options: Readonly<{ lineage?: string; revision?: string }> = {},
  ) {
    this.snapshotLineage = options.lineage ?? "action-state-tests";
    this.snapshotRevision = options.revision ?? "7";
    this.entryCount = entries.length;
    this.changedCount = changed.length;
  }

  entryId(index: number): string | undefined {
    return this.entries[index]?.id;
  }

  entryStatus(index: number): WasmActionStateEntryStatus | undefined {
    return this.entries[index]?.status;
  }

  entryActivation(index: number): BrowserActionStateActivation | undefined {
    return this.entries[index]?.activation;
  }

  entryReasonCode(index: number): string | undefined {
    return this.entries[index]?.reasonCode;
  }

  entryValueStatus(index: number): BrowserActionStateValueStatus | undefined {
    return this.entries[index]?.valueStatus;
  }

  entryValueContractName(index: number): string | undefined {
    return this.entries[index]?.contractName;
  }

  entryValueContractVersion(index: number): number | undefined {
    return this.entries[index]?.contractVersion;
  }

  entryUniformValueJson(index: number): FakeStringResult {
    const json = this.entries[index]?.uniformJson;
    const value = new FakeStringResult(json === undefined ? "absent" : "value", json);
    this.values.push(value);
    return value;
  }

  changedId(index: number): string | undefined {
    return this.changed[index];
  }

  free(): void {
    this.freeCalls += 1;
  }

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === TEST_PROFILE_GENERATION;
  }
}

class FakeResult implements WasmActionStatesResultView {
  freeCalls = 0;
  takeCalls = 0;

  constructor(
    readonly status: "full" | "unchanged" | "delta" | "taken" | "error",
    private snapshot: WasmActionStateSnapshotView | undefined,
    readonly error: WasmActionStateErrorView | undefined = undefined,
  ) {}

  takeSnapshot(): WasmActionStateSnapshotView | undefined {
    this.takeCalls += 1;
    const snapshot = this.snapshot;
    this.snapshot = undefined;
    return snapshot;
  }

  free(): void {
    this.freeCalls += 1;
  }

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === TEST_PROFILE_GENERATION;
  }
}

const EXPECTED = Object.freeze({ lineage: "action-state-tests", revision: "7" });

function consumeWasmActionStates(
  expected: Parameters<typeof consumeWasmActionStatesRaw>[0],
  view: WasmActionStatesResultView,
  protectedHandles: readonly unknown[] = [],
) {
  return consumeWasmActionStatesRaw(
    expected,
    view,
    TEST_PROFILE_GENERATION,
    protectedHandles,
  );
}

function statelessEntry(
  id: string,
  status: "enabled" | "disabled" | "blocked" = "enabled",
): FakeEntry {
  const base = {
    id,
    status,
    activation: "stateless" as const,
    valueStatus: "unsupported" as const,
  };
  return status === "enabled"
    ? base
    : { ...base, reasonCode: "breditor/not-available" };
}

describe("Wasm action-state adapter", () => {
  it("rejects a result from another profile generation", () => {
    const foreignGeneration: WasmProfileGenerationView = {
      matches(other) { return other === foreignGeneration; },
      free: vi.fn(),
    };
    const snapshot = new FakeSnapshot([], []);
    const resultView = new FakeResult("full", snapshot);

    expect(
      consumeWasmActionStatesRaw(EXPECTED, resultView, foreignGeneration).ok,
    ).toBe(false);
    expect(resultView.freeCalls).toBe(1);
    expect(snapshot.freeCalls).toBe(0);
  });

  it("copies a complete typed snapshot, freezes it deeply, and frees every handle", () => {
    const entries: FakeEntry[] = [
      {
        id: "breditor/control-bold",
        status: "enabled",
        activation: "active",
        valueStatus: "uniform",
        contractName: "breditor/format-value",
        contractVersion: 1,
        uniformJson: '{"family":"serif","weights":[400,700]}',
      },
      statelessEntry("breditor/control-redo", "disabled"),
      { id: "breditor/control-undo", status: "fault" },
    ];
    const snapshot = new FakeSnapshot(entries, entries.map((entry) => entry.id));
    const resultView = new FakeResult("full", snapshot);

    const result = consumeWasmActionStates(EXPECTED, resultView);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("action-state fixture failed");
    expect(result.kind).toBe("full");
    expect(result.changedIds).toEqual([
      "breditor/control-bold",
      "breditor/control-redo",
      "breditor/control-undo",
    ]);
    expect(result.snapshot.entries).toMatchObject([
      {
        id: "breditor/control-bold",
        availability: "enabled",
        activation: "active",
        reasonCode: undefined,
        value: {
          status: "uniform",
          contract: { name: "breditor/format-value", version: 1 },
          value: { family: "serif", weights: [400, 700] },
        },
      },
      { availability: "disabled", reasonCode: "breditor/not-available" },
      { availability: "faulted", activation: undefined, value: undefined },
    ]);
    const uniform = result.snapshot.entries[0]?.value;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.snapshot)).toBe(true);
    expect(Object.isFrozen(result.snapshot.snapshot)).toBe(true);
    expect(Object.isFrozen(result.snapshot.entries)).toBe(true);
    expect(Object.isFrozen(result.snapshot.entries[0])).toBe(true);
    expect(uniform?.status).toBe("uniform");
    if (uniform?.status !== "uniform") throw new Error("uniform fixture failed");
    expect(Object.isFrozen(uniform.value)).toBe(true);
    expect(Object.isFrozen((uniform.value as { weights: readonly number[] }).weights)).toBe(true);
    expect(Object.getPrototypeOf(uniform.value)).toBeNull();
    expect(resultView.freeCalls).toBe(1);
    expect(snapshot.freeCalls).toBe(1);
    expect(snapshot.values).toHaveLength(entries.length + 1);
    expect(snapshot.values.every((value) => value.freeCalls === 1)).toBe(true);
    expect(isOwnedBrowserActionStateReadResult(result)).toBe(true);
    expect(isOwnedBrowserActionStateReadResult({ ...result })).toBe(false);
  });

  it("admits canonical null, scalar, array, and object uniform values", () => {
    for (const json of ["null", "true", "73", '"hello"', "[null,false,3]", '{"a":1}']) {
      const entry: FakeEntry = {
        id: "breditor/control-value",
        status: "enabled",
        activation: "inactive",
        valueStatus: "uniform",
        contractName: "breditor/value",
        contractVersion: 1,
        uniformJson: json,
      };
      const result = consumeWasmActionStates(
        EXPECTED,
        new FakeResult("full", new FakeSnapshot([entry], [entry.id])),
      );
      expect(result.ok, json).toBe(true);
    }
  });

  it("copies a structured core error and frees both owned handles", () => {
    const error = new FakeError();
    const resultView = new FakeResult("error", undefined, error);

    const result = consumeWasmActionStates(EXPECTED, resultView);

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "core",
        code: "breditor_wasm.action_state",
        message: "the guarded action-state read was rejected",
      },
    });
    expect(error.freeCalls).toBe(1);
    expect(resultView.freeCalls).toBe(1);
  });

  it("rejects mismatched snapshots, invalid initial statuses, and malformed scalars", () => {
    const cases: Array<readonly [FakeSnapshot, "full" | "delta" | "unchanged"]> = [
      [new FakeSnapshot([], [], { revision: "8" }), "unchanged"],
      [new FakeSnapshot([statelessEntry("wrong")], ["wrong"]), "full"],
      [
        new FakeSnapshot(
          [
            statelessEntry("breditor/z-control"),
            statelessEntry("breditor/a-control"),
          ],
          ["breditor/z-control", "breditor/a-control"],
        ),
        "full",
      ],
      [
        new FakeSnapshot(
          [
            {
              ...statelessEntry("breditor/control"),
              activation: undefined,
            } as unknown as FakeEntry,
          ],
          ["breditor/control"],
        ),
        "full",
      ],
      [
        new FakeSnapshot(
          [{ ...statelessEntry("breditor/control"), reasonCode: "breditor/unexpected" }],
          ["breditor/control"],
        ),
        "full",
      ],
      [
        new FakeSnapshot(
          [statelessEntry("breditor/control")],
          ["breditor/control", "breditor/control"],
        ),
        "delta",
      ],
    ];

    for (const [snapshot, status] of cases) {
      const resultView = new FakeResult(status, snapshot);
      expect(consumeWasmActionStates(EXPECTED, resultView).ok).toBe(false);
      expect(resultView.freeCalls).toBe(1);
      expect(snapshot.freeCalls).toBe(1);
      expect(snapshot.values.every((value) => value.freeCalls === 1)).toBe(true);
    }
  });

  it("rejects noncanonical, malformed, overdeep, and contract-incoherent values", () => {
    const deep = `${"[".repeat(17)}0${"]".repeat(17)}`;
    const values: readonly Readonly<Partial<FakeEntry>>[] = [
      { uniformJson: '{"b":1,"a":2}' },
      { uniformJson: " 1" },
      { uniformJson: "1.5" },
      { uniformJson: "-0" },
      { uniformJson: deep },
      { uniformJson: `"${"x".repeat(65_537)}"` },
      { contractName: undefined } as unknown as Readonly<Partial<FakeEntry>>,
      { contractVersion: 0 },
      { valueStatus: "mixed", uniformJson: "true" },
    ];

    for (const override of values) {
      const entry: FakeEntry = {
        id: "breditor/control-value",
        status: "enabled",
        activation: "active",
        valueStatus: "uniform",
        contractName: "breditor/value",
        contractVersion: 1,
        uniformJson: "true",
        ...override,
      };
      const snapshot = new FakeSnapshot([entry], [entry.id]);
      expect(
        consumeWasmActionStates(EXPECTED, new FakeResult("full", snapshot)).ok,
        JSON.stringify(override),
      ).toBe(false);
      expect(snapshot.values.every((value) => value.freeCalls === 1)).toBe(true);
    }
  });

  it("rejects an oversized hostile value before scanning its contents", () => {
    const entry: FakeEntry = {
      id: "breditor/control-value",
      status: "enabled",
      activation: "active",
      valueStatus: "uniform",
      contractName: "breditor/value",
      contractVersion: 1,
      uniformJson: "x".repeat(MAX_BROWSER_ACTION_STATE_VALUE_JSON_BYTES + 1),
    };
    const snapshot = new FakeSnapshot([entry], [entry.id]);
    const charCodeAt = vi.spyOn(String.prototype, "charCodeAt");
    try {
      expect(
        consumeWasmActionStates(EXPECTED, new FakeResult("full", snapshot)).ok,
      ).toBe(false);
      expect(charCodeAt).not.toHaveBeenCalled();
    } finally {
      charCodeAt.mockRestore();
    }
    expect(snapshot.values.every((value) => value.freeCalls === 1)).toBe(true);
  });

  it("rejects hidden sentinel fields without leaking the sentinel value result", () => {
    const snapshot = new FakeSnapshot([], []);
    snapshot.entryId = () => "breditor/hidden";
    const resultView = new FakeResult("full", snapshot);

    expect(consumeWasmActionStates(EXPECTED, resultView).ok).toBe(false);
    expect(snapshot.values).toHaveLength(1);
    expect(snapshot.values[0]?.freeCalls).toBe(1);
    expect(snapshot.freeCalls).toBe(1);
    expect(resultView.freeCalls).toBe(1);
  });

  it("bounds entry counts before invoking indexed getters", () => {
    const snapshot = new FakeSnapshot([], []);
    Object.defineProperty(snapshot, "entryCount", {
      value: MAX_BROWSER_ACTION_STATE_ENTRIES + 1,
    });
    let indexedCalls = 0;
    snapshot.entryId = () => {
      indexedCalls += 1;
      return undefined;
    };

    expect(
      consumeWasmActionStates(EXPECTED, new FakeResult("full", snapshot)).ok,
    ).toBe(false);
    expect(indexedCalls).toBe(0);
    expect(snapshot.values).toHaveLength(0);
    expect(snapshot.freeCalls).toBe(1);
  });

  it("enforces the decoded batch value budget across individually valid entries", () => {
    const uniformJson = `[${new Array(256).fill("null").join(",")}]`;
    const entries: FakeEntry[] = Array.from({ length: 256 }, (_, index) => ({
      id: `breditor/control-${String(index).padStart(3, "0")}`,
      status: "enabled",
      activation: "inactive",
      valueStatus: "uniform",
      contractName: "breditor/value",
      contractVersion: 1,
      uniformJson,
    }));
    const snapshot = new FakeSnapshot(entries, entries.map((entry) => entry.id));

    expect(
      consumeWasmActionStates(EXPECTED, new FakeResult("full", snapshot)).ok,
    ).toBe(false);
    expect(snapshot.freeCalls).toBe(1);
    expect(snapshot.values.every((value) => value.freeCalls === 1)).toBe(true);
  });

  it("fails closed on handle aliasing and never frees a protected observation", () => {
    const protectedObservation = new FakeStringResult("absent");
    const entry = statelessEntry("breditor/control");
    const snapshot = new FakeSnapshot([entry], [entry.id]);
    snapshot.entryUniformValueJson = () => protectedObservation;
    const resultView = new FakeResult("full", snapshot);

    expect(
      consumeWasmActionStates(EXPECTED, resultView, [protectedObservation]).ok,
    ).toBe(false);
    expect(protectedObservation.freeCalls).toBe(0);
    expect(snapshot.freeCalls).toBe(1);
    expect(resultView.freeCalls).toBe(1);

    const aliasResult = new FakeResult("full", undefined);
    aliasResult.takeSnapshot = () =>
      aliasResult as unknown as WasmActionStateSnapshotView;
    expect(consumeWasmActionStates(EXPECTED, aliasResult).ok).toBe(false);
    expect(aliasResult.freeCalls).toBe(1);
  });

  it("rejects a hostile protected-handle iterable before accepting ownership", () => {
    const revoked = Proxy.revocable<unknown[]>([], {});
    revoked.revoke();
    const resultView = new FakeResult("taken", undefined);

    expect(() =>
      consumeWasmActionStates(
        EXPECTED,
        resultView,
        revoked.proxy as readonly unknown[],
      ),
    ).not.toThrow();
    expect(resultView.freeCalls).toBe(0);
  });

  it("captures cleanup before hostile expected and nested getters mutate it", async () => {
    const outerFree = vi.fn();
    const poisonedOuterFree = vi.fn();
    const resultView = new FakeResult("taken", undefined);
    Object.defineProperty(resultView, "free", {
      configurable: true,
      writable: true,
      value: outerFree,
    });
    const expected = {
      get lineage(): string {
        Reflect.set(resultView, "free", poisonedOuterFree);
        return EXPECTED.lineage;
      },
      revision: EXPECTED.revision,
    };

    expect(consumeWasmActionStates(expected, resultView).ok).toBe(false);
    expect(outerFree).toHaveBeenCalledOnce();
    expect(poisonedOuterFree).not.toHaveBeenCalled();

    const errorFree = vi.fn();
    const poisonedErrorFree = vi.fn();
    const rejectedCode = Promise.reject(new Error("must be contained"));
    const hostileError = {
      message: "invalid action state",
      free: errorFree,
    };
    Object.defineProperty(hostileError, "code", {
      get: () => {
        hostileError.free = poisonedErrorFree;
        return rejectedCode;
      },
    });
    const nestedResult = new FakeResult(
      "error",
      undefined,
      hostileError as unknown as WasmActionStateErrorView,
    );

    expect(consumeWasmActionStates(EXPECTED, nestedResult).ok).toBe(false);
    expect(errorFree).toHaveBeenCalledOnce();
    expect(poisonedErrorFree).not.toHaveBeenCalled();
    expect(nestedResult.freeCalls).toBe(1);
    await Promise.resolve();
  });

  it("contains rejected indexed scalars and frees all acquired handles", async () => {
    const entry = statelessEntry("breditor/control");
    const snapshot = new FakeSnapshot([entry], [entry.id]);
    const rejectedId = Promise.reject(new Error("must be contained"));
    snapshot.entryId = () => rejectedId as unknown as string;
    const resultView = new FakeResult("full", snapshot);

    expect(consumeWasmActionStates(EXPECTED, resultView).ok).toBe(false);
    expect(snapshot.freeCalls).toBe(1);
    expect(resultView.freeCalls).toBe(1);
    await Promise.resolve();
  });

  it("contains throwing accessors while releasing every handle already acquired", () => {
    const entry = statelessEntry("breditor/control");
    const snapshot = new FakeSnapshot([entry], [entry.id]);
    snapshot.entryActivation = () => {
      throw new Error("hostile getter");
    };
    const resultView = new FakeResult("full", snapshot);

    expect(() => consumeWasmActionStates(EXPECTED, resultView)).not.toThrow();
    expect(consumeWasmActionStates(EXPECTED, new FakeResult("taken", undefined)).ok).toBe(false);
    expect(snapshot.freeCalls).toBe(1);
    expect(resultView.freeCalls).toBe(1);
    expect(snapshot.values.every((value) => value.freeCalls === 1)).toBe(true);
  });

  it("captures cloned errors before later take methods can throw", () => {
    const resultError = new FakeError("breditor_wasm.result", "result failed");
    const throwingResult = new FakeResult("error", undefined, resultError);
    throwingResult.takeSnapshot = () => {
      throw new Error("takeSnapshot failed");
    };

    expect(() => consumeWasmActionStates(EXPECTED, throwingResult)).not.toThrow();
    expect(throwingResult.freeCalls).toBe(1);
    expect(resultError.freeCalls).toBe(1);

    const entry: FakeEntry = {
      id: "breditor/control-value",
      status: "enabled",
      activation: "inactive",
      valueStatus: "uniform",
      contractName: "breditor/value",
      contractVersion: 1,
      uniformJson: "null",
    };
    const snapshot = new FakeSnapshot([entry], [entry.id]);
    const valueError = new FakeError("breditor_wasm.value", "value failed");
    const throwingValue = new FakeStringResult("error", undefined, valueError);
    throwingValue.takeValue = () => {
      throw new Error("takeValue failed");
    };
    snapshot.entryUniformValueJson = () => throwingValue;
    const nestedResult = new FakeResult("full", snapshot);

    expect(() => consumeWasmActionStates(EXPECTED, nestedResult)).not.toThrow();
    expect(nestedResult.freeCalls).toBe(1);
    expect(snapshot.freeCalls).toBe(1);
    expect(throwingValue.freeCalls).toBe(1);
    expect(valueError.freeCalls).toBe(1);
  });

  it("lets a cleanup failure override an otherwise valid publication", () => {
    const entry = statelessEntry("breditor/control");
    const snapshot = new FakeSnapshot([entry], [entry.id]);
    const resultView = new FakeResult("full", snapshot);
    resultView.free = () => {
      resultView.freeCalls += 1;
      throw new Error("free failed");
    };

    const result = consumeWasmActionStates(EXPECTED, resultView);

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "boundary",
        code: "action_state.invalid_wasm_view",
        message: "The Wasm action-state view is invalid.",
      },
    });
    expect(resultView.freeCalls).toBe(1);
    expect(snapshot.freeCalls).toBe(1);
    expect(snapshot.values.every((value) => value.freeCalls === 1)).toBe(true);
  });

  it("fails closed when cleanup throws undefined or returns a non-void value", () => {
    const throwingCleanup = vi.fn((): never => {
      throw undefined;
    });
    const throwingView = new FakeResult("taken", undefined);
    Object.defineProperty(throwingView, "free", { value: throwingCleanup });
    const nonvoidCleanup = vi.fn(() => 1);
    const nonvoidView = new FakeResult("taken", undefined);
    Object.defineProperty(nonvoidView, "free", { value: nonvoidCleanup });

    expect(() => consumeWasmActionStates(EXPECTED, throwingView)).not.toThrow();
    expect(consumeWasmActionStates(EXPECTED, nonvoidView).ok).toBe(false);
    expect(throwingCleanup).toHaveBeenCalledOnce();
    expect(nonvoidCleanup).toHaveBeenCalledOnce();
  });

  it("contains a rejected asynchronous cleanup impostor", async () => {
    const view = new FakeResult("taken", undefined);
    Object.defineProperty(view, "free", {
      value: () => Promise.reject(new Error("private cleanup rejection")),
    });

    expect(consumeWasmActionStates(EXPECTED, view).ok).toBe(false);
    await Promise.resolve();
  });

  it("still frees a result when the expected correlation object is malformed", () => {
    const resultView = new FakeResult("taken", undefined);
    const expected = Object.create(null) as { lineage: string; revision: string };
    Object.defineProperty(expected, "lineage", {
      get() {
        throw new Error("hostile expected snapshot");
      },
    });

    expect(
      consumeWasmActionStates(expected, resultView).ok,
    ).toBe(false);
    expect(resultView.freeCalls).toBe(1);
  });
});
