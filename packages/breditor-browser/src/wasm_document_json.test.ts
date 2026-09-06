import { describe, expect, it, vi } from "vitest";

import {
  MAX_BROWSER_DOCUMENT_JSON_BYTES,
  consumeWasmDocumentJson,
  documentJsonUtf8Bytes,
  documentJsonMatchesProjection,
  isOwnedBrowserDocumentJsonReadResult,
  type WasmDocumentJsonErrorView,
  type WasmDocumentJsonStringResultView,
} from "./wasm_document_json.js";
import { BaseDocumentProjection } from "./projection.js";

const EXPECTED = Object.freeze({ lineage: "document-export-tests", revision: "7" });

class FakeError implements WasmDocumentJsonErrorView {
  freeCalls = 0;

  constructor(
    readonly code = "codec.document_encoding_failed",
    readonly message = "the document could not be encoded",
  ) {}

  free(): void {
    this.freeCalls += 1;
  }
}

class FakeStringResult implements WasmDocumentJsonStringResultView {
  freeCalls = 0;
  takeCalls = 0;

  constructor(
    readonly status: "value" | "taken" | "absent" | "error",
    private readonly encoded: string | undefined,
    readonly error: WasmDocumentJsonErrorView | undefined = undefined,
  ) {}

  takeValue(): string | undefined {
    this.takeCalls += 1;
    return this.status === "value" ? this.encoded : undefined;
  }

  free(): void {
    this.freeCalls += 1;
  }
}

describe("Wasm Document V1 export boundary", () => {
  it("copies exact canonical Unicode bytes, correlates the snapshot, and deep-freezes", () => {
    const json = documentJson([
      paragraph([run("A💡", false), run("強", true)]),
      paragraph([]),
    ]);
    const view = new FakeStringResult("value", json);

    const result = consumeWasmDocumentJson(EXPECTED, view);

    expect(result).toEqual({
      ok: true,
      document: {
        documentJson: json,
        documentUtf8Bytes: new TextEncoder().encode(json).byteLength,
        snapshot: EXPECTED,
      },
    });
    expect(isOwnedBrowserDocumentJsonReadResult(result)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.ok && Object.isFrozen(result.document)).toBe(true);
    expect(result.ok && Object.isFrozen(result.document.snapshot)).toBe(true);
    expect(view.takeCalls).toBe(1);
    expect(view.freeCalls).toBe(1);
  });

  it("admits exactly canonical base-schema Document V1 envelopes", () => {
    const valid = documentJson([paragraph([])]);
    const parsed = JSON.parse(valid) as Record<string, unknown>;
    const malformed = [
      "not-json",
      ` ${valid}`,
      JSON.stringify({ ...parsed, format: "other/document" }),
      JSON.stringify({ ...parsed, formatVersion: 2 }),
      JSON.stringify({ ...parsed, extra: true }),
      JSON.stringify({
        formatVersion: parsed["formatVersion"],
        format: parsed["format"],
        schema: parsed["schema"],
        root: parsed["root"],
      }),
      JSON.stringify({ ...parsed, schema: { name: "other/schema", version: 1 } }),
      JSON.stringify({ ...parsed, root: { ...(parsed["root"] as object), children: [] } }),
      documentJson([paragraph([run("a", false), run("b", false)])]),
      `${valid.slice(0, -1)}\ud800}`,
      "x".repeat(MAX_BROWSER_DOCUMENT_JSON_BYTES + 1),
    ];

    expect(documentJsonUtf8Bytes(valid)).toBe(new TextEncoder().encode(valid).byteLength);
    for (const value of malformed) {
      expect(documentJsonUtf8Bytes(value)).toBeNull();
      const view = new FakeStringResult("value", value);
      expect(consumeWasmDocumentJson(EXPECTED, view)).toMatchObject({
        ok: false,
        error: { code: "document_json.invalid_wasm_view" },
      });
      expect(view.freeCalls).toBe(1);
    }
  });

  it("proves full document semantics against the exact owned projection", () => {
    const projected = BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: EXPECTED,
      paragraphs: [
        { runs: [{ text: "A", strong: false }, { text: "💡", strong: true }] },
        { runs: [] },
      ],
    });
    if (!projected.ok) throw new Error(projected.error.code);

    expect(
      documentJsonMatchesProjection(
        documentJson([
          paragraph([run("A", false), run("💡", true)]),
          paragraph([]),
        ]),
        projected.value,
      ),
    ).toBe(true);
    expect(
      documentJsonMatchesProjection(
        documentJson([paragraph([run("different", false)]), paragraph([])]),
        projected.value,
      ),
    ).toBe(false);
    expect(
      documentJsonMatchesProjection(
        documentJson([
          paragraph([run("A", true), run("💡", false)]),
          paragraph([]),
        ]),
        projected.value,
      ),
    ).toBe(false);
  });

  it("collapses a structural core failure to fixed payload-free data and releases both handles", () => {
    const error = new FakeError(
      "codec.private_document_title",
      "private document contents must not escape",
    );
    const view = new FakeStringResult("error", undefined, error);

    const result = consumeWasmDocumentJson(EXPECTED, view);
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "core",
        code: "document_json.core_rejected",
        message: "The Rust editor core could not export Document V1.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(error.freeCalls).toBe(1);
    expect(view.freeCalls).toBe(1);
  });

  it("rejects malformed expected snapshots while still consuming the result", () => {
    for (const expected of [
      { lineage: "", revision: "7" },
      { lineage: EXPECTED.lineage, revision: "01" },
      { lineage: EXPECTED.lineage, revision: "18446744073709551616" },
    ]) {
      const view = new FakeStringResult("value", documentJson([paragraph([])]));
      expect(consumeWasmDocumentJson(expected, view).ok).toBe(false);
      expect(view.takeCalls).toBe(0);
      expect(view.freeCalls).toBe(1);
    }
  });

  it.each(["taken", "absent"] as const)("rejects an unpaired %s result", (status) => {
    const view = new FakeStringResult(status, undefined);
    expect(consumeWasmDocumentJson(EXPECTED, view).ok).toBe(false);
    expect(view.freeCalls).toBe(1);
  });

  it("contains throwing accessors, rejected thenables, and captures cleanup first", async () => {
    const cleanup = vi.fn();
    const throwing = {
      get status(): never {
        throw new Error("private getter payload");
      },
      error: undefined,
      takeValue: () => documentJson([paragraph([])]),
      free: cleanup,
    } as unknown as WasmDocumentJsonStringResultView;
    expect(() => consumeWasmDocumentJson(EXPECTED, throwing)).not.toThrow();
    expect(cleanup).toHaveBeenCalledOnce();

    const free = vi.fn();
    const poisonedFree = vi.fn();
    const hostile = {
      status: "value" as const,
      error: undefined,
      takeValue: () => documentJson([paragraph([])]),
      free,
      get then() {
        this.free = poisonedFree;
        return (_resolve: (value: undefined) => void, reject: (reason: unknown) => void): void =>
          reject(new Error("contained"));
      },
    };
    expect(
      consumeWasmDocumentJson(
        EXPECTED,
        hostile as unknown as WasmDocumentJsonStringResultView,
      ).ok,
    ).toBe(false);
    expect(free).toHaveBeenCalledOnce();
    expect(poisonedFree).not.toHaveBeenCalled();

    const asynchronous = new FakeStringResult("value", documentJson([paragraph([])]));
    Object.defineProperty(asynchronous, "takeValue", {
      value: () => Promise.reject(new Error("contained value")),
    });
    expect(consumeWasmDocumentJson(EXPECTED, asynchronous).ok).toBe(false);
    expect(asynchronous.freeCalls).toBe(1);
    await Promise.resolve();
  });

  it("never reads or frees protected aliases and frees duplicate aliases once", () => {
    const protectedFree = vi.fn();
    const protectedView = {
      get status(): never {
        throw new Error("must not read protected owner");
      },
      free: protectedFree,
    } as unknown as WasmDocumentJsonStringResultView;
    const duplicate = new FakeStringResult("error", undefined);
    Object.defineProperty(duplicate, "error", { value: duplicate });

    expect(consumeWasmDocumentJson(EXPECTED, protectedView, [protectedView]).ok).toBe(false);
    expect(protectedFree).not.toHaveBeenCalled();
    expect(consumeWasmDocumentJson(EXPECTED, duplicate).ok).toBe(false);
    expect(duplicate.freeCalls).toBe(1);
  });

  it("invalidates provisional bytes when cleanup throws, returns a value, or rejects", async () => {
    const values: unknown[] = [
      () => {
        throw new Error("cleanup failed");
      },
      () => 1,
      () => Promise.reject(new Error("cleanup rejected")),
    ];
    for (const cleanup of values) {
      const view = new FakeStringResult("value", documentJson([paragraph([])]));
      Object.defineProperty(view, "free", { value: cleanup });
      expect(consumeWasmDocumentJson(EXPECTED, view)).toMatchObject({
        ok: false,
        error: { code: "document_json.invalid_wasm_view" },
      });
    }
    await Promise.resolve();
  });
});

function documentJson(paragraphs: readonly unknown[]): string {
  return JSON.stringify({
    format: "breditor/document",
    formatVersion: 1,
    schema: { name: "breditor/base", version: 1 },
    root: {
      kind: "element",
      type: "breditor/document",
      entityId: null,
      properties: {},
      children: paragraphs,
    },
  });
}

function paragraph(children: readonly unknown[]): unknown {
  return {
    kind: "element",
    type: "breditor/paragraph",
    entityId: null,
    properties: {},
    children,
  };
}

function run(text: string, strong: boolean): unknown {
  return {
    kind: "text",
    text,
    formats: strong ? [{ type: "breditor/strong", properties: {} }] : [],
  };
}
