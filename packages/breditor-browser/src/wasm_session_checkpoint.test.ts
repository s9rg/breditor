import { describe, expect, it, vi } from "vitest";

import {
  MAX_BROWSER_SESSION_CHECKPOINT_JSON_BYTES,
  consumeWasmSessionCheckpoint,
  isOwnedBrowserSessionCheckpointReadResult,
  sessionCheckpointJsonMatchesDurableContract,
  type WasmSessionCheckpointErrorView,
  type WasmSessionCheckpointStringResultView,
} from "./wasm_session_checkpoint.js";
import type { WasmDurableJsonContract } from "./wasm_document_json.js";

const EXPECTED = Object.freeze({ lineage: "checkpoint-tests", revision: "7" });
const PROFILE_FINGERPRINT = `sha256:${"4".repeat(64)}`;
const V2_CONTRACT: WasmDurableJsonContract = Object.freeze({
  mode: "v2",
  schema: Object.freeze({
    name: "example/rich-document",
    version: 3,
    fingerprint: PROFILE_FINGERPRINT,
  }),
  formats: Object.freeze([
    Object.freeze({ kind: "breditor/strong", revision: 1 }),
    Object.freeze({ kind: "example/highlight", revision: 2 }),
  ]),
});

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

class FakeStringResult implements WasmSessionCheckpointStringResultView {
  freeCalls = 0;
  takeCalls = 0;

  constructor(
    readonly status: "value" | "taken" | "absent" | "error",
    private readonly encoded: string | undefined,
    readonly error: WasmSessionCheckpointErrorView | undefined = undefined,
  ) {}

  takeValue(): string | undefined {
    this.takeCalls += 1;
    return this.status === "value" ? this.encoded : undefined;
  }

  free(): void {
    this.freeCalls += 1;
  }
}

describe("Wasm session-checkpoint adapter", () => {
  it("copies an exact snapshot-bound UTF-8 checkpoint and frees its result", () => {
    const json = checkpointJson("💡");
    const view = new FakeStringResult("value", json);

    const result = consumeWasmSessionCheckpoint(EXPECTED, view);

    expect(result).toEqual({
      ok: true,
      checkpoint: {
        checkpointJson: json,
        checkpointUtf8Bytes: new TextEncoder().encode(json).byteLength,
        snapshot: EXPECTED,
      },
    });
    expect(isOwnedBrowserSessionCheckpointReadResult(result)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.ok && Object.isFrozen(result.checkpoint)).toBe(true);
    expect(result.ok && Object.isFrozen(result.checkpoint.snapshot)).toBe(true);
    expect(view.takeCalls).toBe(1);
    expect(view.freeCalls).toBe(1);
  });

  it("admits an explicitly selected, exactly bound Session Checkpoint V2", () => {
    const json = checkpointV2Json();
    const view = new FakeStringResult("value", json);

    expect(sessionCheckpointJsonMatchesDurableContract(json, V2_CONTRACT)).toBe(
      new TextEncoder().encode(json).byteLength,
    );
    expect(sessionCheckpointJsonMatchesDurableContract(checkpointJson(), V2_CONTRACT))
      .toBeNull();
    expect(
      consumeWasmSessionCheckpoint(EXPECTED, view, [], V2_CONTRACT),
    ).toMatchObject({
      ok: true,
      checkpoint: { checkpointJson: json, snapshot: EXPECTED },
    });
    expect(view.freeCalls).toBe(1);

    const defaultMode = new FakeStringResult("value", json);
    expect(consumeWasmSessionCheckpoint(EXPECTED, defaultMode).ok).toBe(false);
    expect(defaultMode.freeCalls).toBe(1);
  });

  it("rejects non-canonical caller-owned V2 format arrays without invoking them", () => {
    const accessorReads = vi.fn();
    const iteratorReads = vi.fn();
    const overCapIndexReads = vi.fn();
    const sparse = new Array<unknown>(2);
    Object.defineProperty(sparse, "0", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: V2_CONTRACT.formats[0],
    });
    const accessorBacked: unknown[] = [V2_CONTRACT.formats[0], undefined];
    Object.defineProperty(accessorBacked, "1", {
      configurable: true,
      enumerable: true,
      get: () => {
        accessorReads();
        return V2_CONTRACT.formats[1];
      },
    });
    const overCap = new Proxy(new Array<unknown>(257).fill(undefined), {
      getOwnPropertyDescriptor(target, property) {
        if (property === "0") {
          overCapIndexReads();
          throw new Error("must reject the length before reading entries");
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });
    const iteratorPoisoned: unknown[] = [
      V2_CONTRACT.formats[0],
      V2_CONTRACT.formats[1],
    ];
    Object.defineProperty(iteratorPoisoned, Symbol.iterator, {
      configurable: true,
      get: () => {
        iteratorReads();
        throw new Error("must not read the caller iterator");
      },
    });

    const encoded = checkpointV2Json();
    for (const formats of [sparse, accessorBacked, overCap, iteratorPoisoned]) {
      const contract = {
        mode: "v2",
        schema: V2_CONTRACT.schema,
        formats,
      } as unknown as WasmDurableJsonContract;
      expect(sessionCheckpointJsonMatchesDurableContract(encoded, contract)).toBeNull();
      const view = new FakeStringResult("value", encoded);
      expect(consumeWasmSessionCheckpoint(EXPECTED, view, [], contract).ok)
        .toBe(false);
      expect(view.freeCalls).toBe(1);
    }
    expect(accessorReads).not.toHaveBeenCalled();
    expect(iteratorReads).not.toHaveBeenCalled();
    expect(overCapIndexReads).not.toHaveBeenCalled();
  });

  it("rejects mixed generations and every mismatched V2 schema binding", () => {
    const valid = JSON.parse(checkpointV2Json()) as Record<string, unknown>;
    const historyBase = valid["historyBase"] as Record<string, unknown>;
    const document = historyBase["document"] as Record<string, unknown>;
    const documentRoot = document["root"] as Record<string, unknown>;
    const paragraph = (documentRoot["children"] as Array<Record<string, unknown>>)[0];
    if (paragraph === undefined) throw new Error("missing paragraph");
    const malformed = [
      JSON.stringify({ ...valid, schemaFingerprint: `sha256:${"5".repeat(64)}` }),
      JSON.stringify({
        ...valid,
        historyBase: { ...historyBase, schemaFingerprint: `sha256:${"5".repeat(64)}` },
      }),
      JSON.stringify({
        ...valid,
        historyBase: { ...historyBase, formatVersion: 1 },
      }),
      JSON.stringify({
        ...valid,
        historyBase: {
          ...historyBase,
          document: { ...document, formatVersion: 1 },
        },
      }),
      JSON.stringify({
        ...valid,
        historyBase: {
          ...historyBase,
          document: {
            ...document,
            root: {
              ...documentRoot,
              children: [{
                ...paragraph,
                children: [{
                  kind: "text",
                  text: "hello",
                  formats: [{ type: "example/unknown", properties: {} }],
                }],
              }],
            },
          },
        },
      }),
      JSON.stringify({ ...valid, unexpected: true }),
      ` ${checkpointV2Json()}`,
    ];

    for (const encoded of malformed) {
      expect(sessionCheckpointJsonMatchesDurableContract(encoded, V2_CONTRACT))
        .toBeNull();
      const view = new FakeStringResult("value", encoded);
      expect(consumeWasmSessionCheckpoint(EXPECTED, view, [], V2_CONTRACT).ok)
        .toBe(false);
      expect(view.freeCalls).toBe(1);
    }
  });

  it("copies a payload-redacted core failure and releases both handles", () => {
    const error = new FakeError();
    const view = new FakeStringResult("error", undefined, error);

    const result = consumeWasmSessionCheckpoint(EXPECTED, view);

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "core",
        code: "codec.invalid_session_checkpoint",
        message: "the session checkpoint was rejected",
      },
    });
    expect(error.freeCalls).toBe(1);
    expect(view.freeCalls).toBe(1);
  });

  it("rejects malformed, wrong-snapshot, unpaired, and oversized values", () => {
    const wrong = JSON.parse(checkpointJson()) as {
      currentRevision: string;
    };
    wrong.currentRevision = "8";
    const cases = [
      "not json",
      JSON.stringify(wrong),
      `${checkpointJson().slice(0, -1)}\ud800}`,
      "x".repeat(MAX_BROWSER_SESSION_CHECKPOINT_JSON_BYTES + 1),
    ];

    for (const encoded of cases) {
      const view = new FakeStringResult("value", encoded);
      const result = consumeWasmSessionCheckpoint(EXPECTED, view);
      expect(result).toMatchObject({
        ok: false,
        error: { code: "session_checkpoint.invalid_wasm_view" },
      });
      expect(view.freeCalls).toBe(1);
    }
  });

  it("bounds invalid expected snapshots and still consumes their result", () => {
    const cases = [
      { lineage: "", revision: "7" },
      { lineage: "checkpoint-tests", revision: "9".repeat(1_000_000) },
    ];

    for (const expected of cases) {
      const view = new FakeStringResult("value", checkpointJson());
      expect(consumeWasmSessionCheckpoint(expected, view).ok).toBe(false);
      expect(view.freeCalls).toBe(1);
      expect(view.takeCalls).toBe(0);
    }
  });

  it.each(["taken", "absent"] as const)(
    "rejects the non-success %s shape",
    (status) => {
      const view = new FakeStringResult(status, undefined);
      expect(consumeWasmSessionCheckpoint(EXPECTED, view).ok).toBe(false);
      expect(view.freeCalls).toBe(1);
    },
  );

  it("contains throwing accessors and methods after registering owned handles", () => {
    const accessorFree = vi.fn();
    const throwingAccessor = {
      status: "value",
      get error(): never {
        throw new Error("hostile error getter");
      },
      takeValue: () => checkpointJson(),
      free: accessorFree,
    } as unknown as WasmSessionCheckpointStringResultView;
    const methodView = new FakeStringResult("value", checkpointJson());
    Object.defineProperty(methodView, "takeValue", {
      value: () => {
        throw new Error("hostile take");
      },
    });

    expect(() => consumeWasmSessionCheckpoint(EXPECTED, throwingAccessor)).not.toThrow();
    expect(accessorFree).toHaveBeenCalledOnce();
    expect(() => consumeWasmSessionCheckpoint(EXPECTED, methodView)).not.toThrow();
    expect(methodView.freeCalls).toBe(1);
  });

  it("rejects and contains an asynchronously rejected value", async () => {
    const view = new FakeStringResult("value", checkpointJson());
    Object.defineProperty(view, "takeValue", {
      value: () => Promise.reject(new Error("must be contained")),
    });

    expect(consumeWasmSessionCheckpoint(EXPECTED, view).ok).toBe(false);
    expect(view.freeCalls).toBe(1);
    await Promise.resolve();
  });

  it("captures outer and cloned-error cleanup before hostile then inspection", () => {
    const outerFree = vi.fn();
    const poisonedOuterFree = vi.fn();
    const outer = {
      status: "value" as const,
      error: undefined,
      takeValue: () => checkpointJson(),
      free: outerFree,
      get then() {
        this.free = poisonedOuterFree;
        return (resolve: (value: undefined) => void): void => resolve(undefined);
      },
    };

    expect(
      consumeWasmSessionCheckpoint(
        EXPECTED,
        outer as unknown as WasmSessionCheckpointStringResultView,
      ).ok,
    ).toBe(false);
    expect(outerFree).toHaveBeenCalledOnce();
    expect(poisonedOuterFree).not.toHaveBeenCalled();

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
    const errorResult = new FakeStringResult(
      "error",
      undefined,
      hostileError as unknown as WasmSessionCheckpointErrorView,
    );

    expect(consumeWasmSessionCheckpoint(EXPECTED, errorResult).ok).toBe(false);
    expect(errorFree).toHaveBeenCalledOnce();
    expect(poisonedErrorFree).not.toHaveBeenCalled();
    expect(errorResult.freeCalls).toBe(1);
  });

  it("contains rejected scalar and method fields without leaking the result", async () => {
    const rejectedLineage = Promise.reject(new Error("must be contained"));
    const expected = {
      lineage: rejectedLineage as unknown as string,
      revision: EXPECTED.revision,
    };
    const expectedView = new FakeStringResult("value", checkpointJson());
    expect(consumeWasmSessionCheckpoint(expected, expectedView).ok).toBe(false);
    expect(expectedView.freeCalls).toBe(1);

    const rejectedTake = Promise.reject(new Error("must be contained"));
    const methodView = new FakeStringResult("value", checkpointJson());
    Object.defineProperty(methodView, "takeValue", { value: rejectedTake });
    expect(consumeWasmSessionCheckpoint(EXPECTED, methodView).ok).toBe(false);
    expect(methodView.freeCalls).toBe(1);
    await Promise.resolve();
  });

  it("captures cloned-error cleanup before a scalar getter mutates it", async () => {
    const errorFree = vi.fn();
    const poisonedErrorFree = vi.fn();
    const rejectedCode = Promise.reject(new Error("must be contained"));
    const hostileError = {
      message: "the session checkpoint was rejected",
      free: errorFree,
    };
    Object.defineProperty(hostileError, "code", {
      get: () => {
        hostileError.free = poisonedErrorFree;
        return rejectedCode;
      },
    });
    const view = new FakeStringResult(
      "error",
      undefined,
      hostileError as unknown as WasmSessionCheckpointErrorView,
    );

    expect(consumeWasmSessionCheckpoint(EXPECTED, view).ok).toBe(false);
    expect(errorFree).toHaveBeenCalledOnce();
    expect(poisonedErrorFree).not.toHaveBeenCalled();
    expect(view.freeCalls).toBe(1);
    await Promise.resolve();
  });

  it("never reads or frees protected aliases and frees duplicate aliases once", () => {
    const protectedFree = vi.fn();
    const protectedView = {
      get status(): never {
        throw new Error("must not read protected owner");
      },
      free: protectedFree,
    } as unknown as WasmSessionCheckpointStringResultView;
    const duplicate = new FakeStringResult("error", undefined);
    Object.defineProperty(duplicate, "error", { value: duplicate });

    expect(
      consumeWasmSessionCheckpoint(EXPECTED, protectedView, [protectedView]).ok,
    ).toBe(false);
    expect(protectedFree).not.toHaveBeenCalled();
    expect(consumeWasmSessionCheckpoint(EXPECTED, duplicate).ok).toBe(false);
    expect(duplicate.freeCalls).toBe(1);
  });

  it("rejects a hostile protected-handle iterable before accepting view ownership", () => {
    const revoked = Proxy.revocable<unknown[]>([], {});
    revoked.revoke();
    const view = new FakeStringResult("value", checkpointJson());

    expect(() =>
      consumeWasmSessionCheckpoint(
        EXPECTED,
        view,
        revoked.proxy as readonly unknown[],
      ),
    ).not.toThrow();
    expect(
      consumeWasmSessionCheckpoint(
        EXPECTED,
        view,
        revoked.proxy as readonly unknown[],
      ).ok,
    ).toBe(false);
    expect(view.freeCalls).toBe(0);
  });

  it("rejects sparse, accessor-backed, over-cap, and iterator-poisoned handle arrays", () => {
    const accessorReads = vi.fn();
    const iteratorReads = vi.fn();
    const overCapIndexReads = vi.fn();
    const sparse = new Array<unknown>(1);
    const accessorBacked: unknown[] = [undefined];
    Object.defineProperty(accessorBacked, "0", {
      configurable: true,
      enumerable: true,
      get: () => {
        accessorReads();
        return undefined;
      },
    });
    const overCap = new Proxy(new Array<unknown>(65).fill(undefined), {
      getOwnPropertyDescriptor(target, property) {
        if (property === "0") {
          overCapIndexReads();
          throw new Error("must reject the length before reading entries");
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });
    const iteratorPoisoned: unknown[] = [undefined];
    Object.defineProperty(iteratorPoisoned, Symbol.iterator, {
      configurable: true,
      get: () => {
        iteratorReads();
        throw new Error("must not read the caller iterator");
      },
    });

    for (const protectedHandles of [
      sparse,
      accessorBacked,
      overCap,
      iteratorPoisoned,
    ]) {
      const view = new FakeStringResult("value", checkpointJson());
      expect(consumeWasmSessionCheckpoint(EXPECTED, view, protectedHandles).ok)
        .toBe(false);
      expect(view.freeCalls).toBe(0);
    }
    expect(accessorReads).not.toHaveBeenCalled();
    expect(iteratorReads).not.toHaveBeenCalled();
    expect(overCapIndexReads).not.toHaveBeenCalled();
  });

  it("turns cleanup failure into a boundary failure", () => {
    const view = {
      status: "value",
      error: undefined,
      takeValue: () => checkpointJson(),
      free: () => {
        throw new Error("free failed");
      },
    } satisfies WasmSessionCheckpointStringResultView;

    const result = consumeWasmSessionCheckpoint(EXPECTED, view);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.invalid_wasm_view" },
    });
  });

  it("fails closed when cleanup throws undefined or returns a non-void value", () => {
    const throwingCleanup = vi.fn((): never => {
      throw undefined;
    });
    const throwingView = new FakeStringResult("value", checkpointJson());
    Object.defineProperty(throwingView, "free", { value: throwingCleanup });
    const nonvoidCleanup = vi.fn(() => 1);
    const nonvoidView = new FakeStringResult("value", checkpointJson());
    Object.defineProperty(nonvoidView, "free", { value: nonvoidCleanup });

    expect(() =>
      consumeWasmSessionCheckpoint(EXPECTED, throwingView),
    ).not.toThrow();
    expect(consumeWasmSessionCheckpoint(EXPECTED, nonvoidView).ok).toBe(false);
    expect(throwingCleanup).toHaveBeenCalledOnce();
    expect(nonvoidCleanup).toHaveBeenCalledOnce();
  });

  it("contains a rejected asynchronous cleanup impostor", async () => {
    const view = new FakeStringResult("value", checkpointJson());
    Object.defineProperty(view, "free", {
      value: () => Promise.reject(new Error("private cleanup rejection")),
    });

    expect(consumeWasmSessionCheckpoint(EXPECTED, view)).toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.invalid_wasm_view" },
    });
    await Promise.resolve();
  });
});

function checkpointJson(extra = ""): string {
  return JSON.stringify({
    format: "breditor/session-checkpoint",
    formatVersion: 1,
    historyBase: {
      format: "breditor/editor-state",
      formatVersion: 1,
      snapshot: { lineage: EXPECTED.lineage, revision: "0" },
      extra,
    },
    currentRevision: EXPECTED.revision,
    historyCapacity: 10,
    cursor: 0,
    entries: [],
    openMergeGroup: null,
  });
}

function checkpointV2Json(): string {
  const document = {
    format: "breditor/document",
    formatVersion: 2,
    schema: { name: "example/rich-document", version: 3 },
    schemaFingerprint: PROFILE_FINGERPRINT,
    root: {
      kind: "element",
      type: "breditor/document",
      entityId: null,
      properties: {},
      children: [{
        kind: "element",
        type: "breditor/paragraph",
        entityId: null,
        properties: {},
        children: [{
          kind: "text",
          text: "hello",
          formats: [{ type: "example/highlight", properties: {} }],
        }],
      }],
    },
  };
  return JSON.stringify({
    format: "breditor/session-checkpoint",
    formatVersion: 2,
    schema: { name: "example/rich-document", version: 3 },
    schemaFingerprint: PROFILE_FINGERPRINT,
    historyBase: {
      format: "breditor/editor-state",
      formatVersion: 2,
      schema: { name: "example/rich-document", version: 3 },
      schemaFingerprint: PROFILE_FINGERPRINT,
      snapshot: { lineage: EXPECTED.lineage, revision: "0" },
      document,
      selection: null,
      pendingFormats: null,
    },
    currentRevision: EXPECTED.revision,
    historyCapacity: 10,
    cursor: 0,
    entries: [],
    openMergeGroup: null,
  });
}
