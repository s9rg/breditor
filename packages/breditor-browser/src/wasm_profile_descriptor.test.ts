import { describe, expect, it, vi } from "vitest";

import {
  browserCompiledProfileDescriptorMatchesGeneration,
  consumeWasmCompiledProfileDescriptor,
  consumeWasmCompiledProfileDescriptorWithCleanup,
  isOwnedBrowserCompiledProfileDescriptor,
  wasmProfileGenerationIsLive,
  wasmViewMatchesProfileGeneration,
  type WasmCompiledProfileDescriptorView,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

const FINGERPRINT =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

class Generation implements WasmProfileGenerationView {
  freeCalls = 0;

  matches(other: WasmProfileGenerationView): boolean {
    return other === this;
  }

  free(): void {
    this.freeCalls += 1;
  }
}

class CorrelatedGeneration implements WasmProfileGenerationView {
  #live = true;

  constructor(readonly token: object = Object.freeze({})) {}

  matches(other: WasmProfileGenerationView): boolean {
    return this.#live &&
      other instanceof CorrelatedGeneration &&
      other.#live &&
      other.token === this.token;
  }

  free(): void {
    this.#live = false;
  }

  clone(): CorrelatedGeneration {
    return new CorrelatedGeneration(this.token);
  }
}

class Descriptor implements WasmCompiledProfileDescriptorView {
  readonly schemaName = "example/document";
  readonly schemaVersion = 7;
  readonly schemaFingerprint = FINGERPRINT;
  readonly formatCount = 2;
  readonly intentCount = 2;
  readonly actionStateCount = 3;
  freeCalls = 0;

  constructor(readonly generation: WasmProfileGenerationView) {}

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === this.generation;
  }

  formatKind(index: number): string | undefined {
    return ["example/comment", "example/highlight"][index];
  }

  formatRevision(index: number): number | undefined {
    return [2, 1][index];
  }

  intentId(index: number): string | undefined {
    return ["example/set-link", "example/toggle-mark"][index];
  }

  intentInputKind(index: number): "none" | "typed" | undefined {
    return index === 0 ? "typed" : index === 1 ? "none" : undefined;
  }

  intentInputContractName(index: number): string | undefined {
    return index === 0 ? "example/link-input" : undefined;
  }

  intentInputContractVersion(index: number): number | undefined {
    return index === 0 ? 2 : undefined;
  }

  intentActivationContract(index: number): "stateless" | "tracked" | undefined {
    return index === 0 || index === 1 ? "tracked" : undefined;
  }

  intentValueContractName(index: number): string | undefined {
    return index === 0 ? "example/link-value" : undefined;
  }

  intentValueContractVersion(index: number): number | undefined {
    return index === 0 ? 1 : undefined;
  }

  actionStateId(index: number): string | undefined {
    return [
      "example/control-direct",
      "example/control-link",
      "example/control-undo",
    ][index];
  }

  actionStateSourceKind(index: number): "direct" | "routed" | "history" | undefined {
    return index === 0 ? "direct" : index === 1 ? "routed" : index === 2 ? "history" : undefined;
  }

  actionStateSourceActionId(index: number): string | undefined {
    return index === 0 ? "example/toggle-direct" : undefined;
  }

  actionStateSourceIntentId(index: number): string | undefined {
    return index === 1 ? "example/set-link" : undefined;
  }

  actionStateHistoryDirection(index: number): "undo" | "redo" | undefined {
    return index === 2 ? "undo" : undefined;
  }

  actionStateActivationContract(index: number): "stateless" | "tracked" | undefined {
    return index === 0 ? "stateless" : index === 1 ? "tracked" : index === 2 ? "stateless" : undefined;
  }

  actionStateValueContractName(index: number): string | undefined {
    return index === 1 ? "example/link-value" : undefined;
  }

  actionStateValueContractVersion(index: number): number | undefined {
    return index === 1 ? 1 : undefined;
  }

  free(): void {
    this.freeCalls += 1;
  }
}

describe("compiled Wasm profile descriptor boundary", () => {
  it("copies the complete contract into deeply frozen handle-free metadata", () => {
    const generation = new Generation();
    const view = new Descriptor(generation);

    const result = consumeWasmCompiledProfileDescriptor(generation, view);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("descriptor fixture was rejected");
    expect(result.descriptor).toEqual({
      schema: {
        name: "example/document",
        version: 7,
        fingerprint: FINGERPRINT,
      },
      formats: [
        { kind: "example/comment", revision: 2 },
        { kind: "example/highlight", revision: 1 },
      ],
      intents: [
        {
          id: "example/set-link",
          input: {
            kind: "typed",
            contract: { name: "example/link-input", version: 2 },
          },
          state: {
            activation: "tracked",
            value: { name: "example/link-value", version: 1 },
          },
        },
        {
          id: "example/toggle-mark",
          input: { kind: "none" },
          state: { activation: "tracked", value: undefined },
        },
      ],
      actionStates: [
        {
          id: "example/control-direct",
          source: { kind: "direct", actionId: "example/toggle-direct" },
          state: { activation: "stateless", value: undefined },
        },
        {
          id: "example/control-link",
          source: { kind: "routed", intentId: "example/set-link" },
          state: {
            activation: "tracked",
            value: { name: "example/link-value", version: 1 },
          },
        },
        {
          id: "example/control-undo",
          source: { kind: "history", direction: "undo" },
          state: { activation: "stateless", value: undefined },
        },
      ],
    });
    expect(Object.isFrozen(result.descriptor)).toBe(true);
    expect(Object.isFrozen(result.descriptor.schema)).toBe(true);
    expect(Object.isFrozen(result.descriptor.formats)).toBe(true);
    expect(Object.isFrozen(result.descriptor.intents[0]?.input)).toBe(true);
    expect(Object.isFrozen(result.descriptor.actionStates[1]?.source)).toBe(true);
    expect(isOwnedBrowserCompiledProfileDescriptor(result.descriptor)).toBe(true);
    expect(
      browserCompiledProfileDescriptorMatchesGeneration(
        result.descriptor,
        generation,
      ),
    ).toBe(true);
    expect(view.freeCalls).toBe(1);
    expect(generation.freeCalls).toBe(0);
  });

  it("retains an opaque symmetric generation correlation in a private sidecar", () => {
    const generation = new CorrelatedGeneration();
    const view = new Descriptor(generation);
    const result = consumeWasmCompiledProfileDescriptor(generation, view);
    if (!result.ok) throw new Error("descriptor fixture was rejected");
    const matchingClone = generation.clone();
    const foreign = new CorrelatedGeneration();

    expect(
      browserCompiledProfileDescriptorMatchesGeneration(
        result.descriptor,
        matchingClone,
      ),
    ).toBe(true);
    expect(
      browserCompiledProfileDescriptorMatchesGeneration(
        result.descriptor,
        foreign,
      ),
    ).toBe(false);
    expect(Reflect.ownKeys(result.descriptor)).toEqual([
      "schema",
      "formats",
      "intents",
      "actionStates",
    ]);

    generation.free();
    expect(
      browserCompiledProfileDescriptorMatchesGeneration(
        result.descriptor,
        matchingClone,
      ),
    ).toBe(false);
  });

  it("fails closed for forged, asymmetric, throwing, and asynchronous correlations", async () => {
    const generation = new Generation();
    const result = consumeWasmCompiledProfileDescriptor(
      generation,
      new Descriptor(generation),
    );
    if (!result.ok) throw new Error("descriptor fixture was rejected");

    let forgedReads = 0;
    const forgedDescriptor = new Proxy({}, {
      get: () => {
        forgedReads += 1;
        throw new Error("must not inspect a foreign descriptor");
      },
    });
    expect(
      browserCompiledProfileDescriptorMatchesGeneration(
        forgedDescriptor,
        generation,
      ),
    ).toBe(false);
    expect(forgedReads).toBe(0);

    let asymmetric!: WasmProfileGenerationView;
    const accepting: WasmProfileGenerationView = {
      matches: (candidate) => candidate === accepting || candidate === asymmetric,
      free: () => undefined,
    };
    asymmetric = {
      matches: (candidate) => candidate === asymmetric,
      free: () => undefined,
    };
    const asymmetricResult = consumeWasmCompiledProfileDescriptor(
      accepting,
      new Descriptor(accepting),
    );
    if (!asymmetricResult.ok) throw new Error("descriptor fixture was rejected");
    expect(
      browserCompiledProfileDescriptorMatchesGeneration(
        asymmetricResult.descriptor,
        asymmetric,
      ),
    ).toBe(false);

    let throwing!: WasmProfileGenerationView;
    const permitsThrowing: WasmProfileGenerationView = {
      matches: (candidate) =>
        candidate === permitsThrowing || candidate === throwing,
      free: () => undefined,
    };
    throwing = {
      matches: (candidate) => {
        if (candidate === throwing) return true;
        throw new Error("contained reverse comparison");
      },
      free: () => undefined,
    };
    const throwingResult = consumeWasmCompiledProfileDescriptor(
      permitsThrowing,
      new Descriptor(permitsThrowing),
    );
    if (!throwingResult.ok) throw new Error("descriptor fixture was rejected");
    expect(
      browserCompiledProfileDescriptorMatchesGeneration(
        throwingResult.descriptor,
        throwing,
      ),
    ).toBe(false);

    let asynchronous!: WasmProfileGenerationView;
    const permitsAsynchronous: WasmProfileGenerationView = {
      matches: (candidate) =>
        candidate === permitsAsynchronous || candidate === asynchronous,
      free: () => undefined,
    };
    asynchronous = {
      matches: (candidate) => candidate === asynchronous
        ? true
        : Promise.reject(
            new Error("contained asynchronous reverse comparison"),
          ) as unknown as boolean,
      free: () => undefined,
    };
    const asynchronousResult = consumeWasmCompiledProfileDescriptor(
      permitsAsynchronous,
      new Descriptor(permitsAsynchronous),
    );
    if (!asynchronousResult.ok) throw new Error("descriptor fixture was rejected");
    expect(
      browserCompiledProfileDescriptorMatchesGeneration(
        asynchronousResult.descriptor,
        asynchronous,
      ),
    ).toBe(false);
    await Promise.resolve();
  });

  it.each([
    ["generation mismatch", (view: Descriptor) => {
      Object.defineProperty(view, "matchesProfileGeneration", { value: () => false });
    }],
    ["unsorted formats", (view: Descriptor) => {
      Object.defineProperty(view, "formatKind", {
        value: (index: number) => ["example/z", "example/a"][index],
      });
    }],
    ["present sentinel", (view: Descriptor) => {
      Object.defineProperty(view, "intentId", {
        value: (index: number) => index === 2 ? "example/extra" :
          ["example/set-link", "example/toggle-mark"][index],
      });
    }],
    ["routed-state contract mismatch", (view: Descriptor) => {
      Object.defineProperty(view, "actionStateActivationContract", {
        value: (index: number) => index === 1 ? "stateless" :
          index === 0 || index === 2 ? "stateless" : undefined,
      });
    }],
  ] as const)("rejects %s and disposes the descriptor", (_label, mutate) => {
    const generation = new Generation();
    const view = new Descriptor(generation);
    mutate(view);

    expect(consumeWasmCompiledProfileDescriptor(generation, view)).toMatchObject({
      ok: false,
      error: { code: "profile_descriptor.invalid_wasm_view" },
    });
    expect(view.freeCalls).toBe(1);
    expect(generation.freeCalls).toBe(0);
  });

  it("rejects aliases without releasing the protected owner", () => {
    const generation = new Generation();

    const aliased = consumeWasmCompiledProfileDescriptor(
      generation,
      generation as unknown as WasmCompiledProfileDescriptorView,
    );

    expect(aliased.ok).toBe(false);
    expect(generation.freeCalls).toBe(0);

    const view = new Descriptor(generation);
    const protectedAlias = consumeWasmCompiledProfileDescriptor(
      generation,
      view,
      [view],
    );
    expect(protectedAlias.ok).toBe(false);
    expect(view.freeCalls).toBe(0);
  });

  it("contains hostile and rejected thenables while retaining captured cleanup", async () => {
    const generation = new Generation();
    const view = new Descriptor(generation);
    const originalFree = vi.fn();
    const replacementFree = vi.fn();
    Object.defineProperty(view, "free", { configurable: true, value: originalFree });
    Object.defineProperty(view, "then", {
      get: () => {
        Object.defineProperty(view, "free", { value: replacementFree });
        return (
          _resolve: (value: unknown) => void,
          reject: (reason: unknown) => void,
        ): void => reject(new Error("contained descriptor rejection"));
      },
    });

    expect(consumeWasmCompiledProfileDescriptor(generation, view).ok).toBe(false);
    expect(originalFree).toHaveBeenCalledOnce();
    expect(replacementFree).not.toHaveBeenCalled();
    await Promise.resolve();

    const methodView = new Descriptor(generation);
    const rejected = Promise.reject(new Error("contained method rejection"));
    Object.defineProperty(methodView, "formatKind", { value: () => rejected });
    expect(consumeWasmCompiledProfileDescriptor(generation, methodView).ok).toBe(false);
    expect(methodView.freeCalls).toBe(1);
    await Promise.resolve();
  });

  it("rejects non-void cleanup and hostile protected-handle arrays", () => {
    const generation = new Generation();
    const view = new Descriptor(generation);
    Object.defineProperty(view, "free", { value: () => "not void" });
    expect(consumeWasmCompiledProfileDescriptor(generation, view).ok).toBe(false);

    const second = new Descriptor(generation);
    const protectedHandles: readonly unknown[] = new Proxy([], {
      get(target, property, receiver) {
        if (property === Symbol.iterator) throw new Error("must not iterate");
        return Reflect.get(target, property, receiver);
      },
    });
    expect(
      consumeWasmCompiledProfileDescriptor(generation, second, protectedHandles).ok,
    ).toBe(true);
    expect(second.freeCalls).toBe(1);
  });

  it("does not invoke hostile array or Set facade reads before ownership", () => {
    const generation = new Generation();
    const lengthRead = vi.fn(() => {
      throw new Error("must not read length");
    });
    const array = new Proxy<unknown[]>([], {
      get(target, property, receiver) {
        if (property === "length") return lengthRead();
        return Reflect.get(target, property, receiver);
      },
      getOwnPropertyDescriptor(target, property) {
        if (property === "length") throw new Error("unprovable length");
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });
    const arrayView = new Descriptor(generation);

    expect(
      consumeWasmCompiledProfileDescriptor(generation, arrayView, array).ok,
    ).toBe(false);
    expect(lengthRead).not.toHaveBeenCalled();
    expect(arrayView.freeCalls).toBe(0);

    const sizeRead = vi.fn(() => {
      throw new Error("must not read size");
    });
    const setFacade = new Proxy(new Set<object>(), {
      get(target, property, receiver) {
        if (property === "size") return sizeRead();
        return Reflect.get(target, property, receiver);
      },
    });
    const setView = new Descriptor(generation);
    const cleanup = vi.fn();
    expect(
      consumeWasmCompiledProfileDescriptorWithCleanup(
        generation,
        setView,
        cleanup,
        setFacade,
      ).ok,
    ).toBe(false);
    expect(sizeRead).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    expect(setView.freeCalls).toBe(0);
  });

  it("contains throwing or asynchronous generation comparisons", async () => {
    const generation = new Generation();
    const view = new Descriptor(generation);
    expect(wasmProfileGenerationIsLive(generation)).toBe(true);
    expect(wasmViewMatchesProfileGeneration(view, generation)).toBe(true);

    Object.defineProperty(view, "matchesProfileGeneration", {
      value: () => Promise.reject(new Error("contained comparison rejection")),
    });
    expect(wasmViewMatchesProfileGeneration(view, generation)).toBe(false);
    await Promise.resolve();

    Object.defineProperty(generation, "matches", {
      value: () => {
        throw new Error("hostile comparison");
      },
    });
    expect(wasmProfileGenerationIsLive(generation)).toBe(false);
  });
});
