import { describe, expect, it, vi } from "vitest";

import {
  MAX_BROWSER_DOCUMENT_JSON_BYTES,
  consumeWasmDocumentJson,
  documentJsonUtf8Bytes,
  documentJsonMatchesProjection,
  isOwnedBrowserDocumentJsonReadResult,
  type WasmDurableJsonContract,
  type WasmDocumentJsonErrorView,
  type WasmDocumentJsonStringResultView,
} from "./wasm_document_json.js";
import {
  BaseDocumentProjection,
  createProfiledDocumentProjection,
} from "./projection.js";
import {
  consumeWasmCompiledProfileDescriptor,
  type WasmCompiledProfileDescriptorView,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

const EXPECTED = Object.freeze({ lineage: "document-export-tests", revision: "7" });
const PROFILE_FINGERPRINT = `sha256:${"2".repeat(64)}`;
const V2_CONTRACT: WasmDurableJsonContract = Object.freeze({
  mode: "v2",
  schema: Object.freeze({
    name: "example/rich-document",
    version: 3,
    fingerprint: PROFILE_FINGERPRINT,
  }),
  formats: Object.freeze([
    Object.freeze({ kind: "breditor/strong", revision: 1, properties: Object.freeze([]) }),
    Object.freeze({ kind: "example/highlight", revision: 2, properties: Object.freeze([]) }),
  ]),
});
const LINK_PROPERTIES = Object.freeze([
  Object.freeze({
    name: "example/enabled",
    presence: "required" as const,
    valueType: Object.freeze({ kind: "boolean" as const }),
  }),
  Object.freeze({
    name: "example/href",
    presence: "required" as const,
    valueType: Object.freeze({
      kind: "string" as const,
      minimumUtf8Bytes: 1,
      maximumUtf8Bytes: 12,
    }),
  }),
  Object.freeze({
    name: "example/priority",
    presence: "optional" as const,
    valueType: Object.freeze({
      kind: "integer" as const,
      minimum: -2,
      maximum: 9,
    }),
  }),
]);
const V3_CONTRACT: WasmDurableJsonContract = Object.freeze({
  mode: "v3",
  schema: V2_CONTRACT.schema,
  formats: Object.freeze([
    Object.freeze({ kind: "breditor/strong", revision: 1, properties: Object.freeze([]) }),
    Object.freeze({ kind: "example/link", revision: 1, properties: LINK_PROPERTIES }),
  ]),
});
const PROPERTY_BUDGET_CONTRACT: WasmDurableJsonContract = Object.freeze({
  mode: "v3",
  schema: V2_CONTRACT.schema,
  formats: Object.freeze([
    Object.freeze({
      kind: "example/value",
      revision: 1,
      properties: Object.freeze([
        Object.freeze({
          name: "example/value",
          presence: "required" as const,
          valueType: Object.freeze({
            kind: "string" as const,
            minimumUtf8Bytes: 1,
            maximumUtf8Bytes: 65_536,
          }),
        }),
      ]),
    }),
  ]),
});

class FakeProfileGeneration implements WasmProfileGenerationView {
  matches(other: WasmProfileGenerationView): boolean {
    return other === this;
  }

  free(): void {}
}

class FakeProfileDescriptor implements WasmCompiledProfileDescriptorView {
  readonly schemaName = "example/rich-document";
  readonly schemaVersion = 3;
  readonly schemaFingerprint = PROFILE_FINGERPRINT;
  readonly formatCount = 2;
  readonly intentCount = 0;
  readonly actionStateCount = 0;

  constructor(readonly generation: WasmProfileGenerationView) {}

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === this.generation;
  }

  formatKind(index: number): string | undefined {
    return ["breditor/strong", "example/highlight"][index];
  }

  formatRevision(index: number): number | undefined {
    return [1, 2][index];
  }

  formatPropertyCount(index: number): number | undefined {
    return index >= 0 && index < this.formatCount ? 0 : undefined;
  }

  formatPropertyName(): undefined { return undefined; }
  formatPropertyPresence(): undefined { return undefined; }
  formatPropertyValueType(): undefined { return undefined; }
  formatPropertyIntegerMinimum(): undefined { return undefined; }
  formatPropertyIntegerMaximum(): undefined { return undefined; }
  formatPropertyStringMinimumUtf8Bytes(): undefined { return undefined; }
  formatPropertyStringMaximumUtf8Bytes(): undefined { return undefined; }

  intentId(): undefined { return undefined; }
  intentInputKind(): undefined { return undefined; }
  intentInputContractName(): undefined { return undefined; }
  intentInputContractVersion(): undefined { return undefined; }
  intentActivationContract(): undefined { return undefined; }
  intentValueContractName(): undefined { return undefined; }
  intentValueContractVersion(): undefined { return undefined; }
  actionStateId(): undefined { return undefined; }
  actionStateSourceKind(): undefined { return undefined; }
  actionStateSourceActionId(): undefined { return undefined; }
  actionStateSourceIntentId(): undefined { return undefined; }
  actionStateHistoryDirection(): undefined { return undefined; }
  actionStateActivationContract(): undefined { return undefined; }
  actionStateValueContractName(): undefined { return undefined; }
  actionStateValueContractVersion(): undefined { return undefined; }
  free(): void {}
}

class FakeTypedProfileDescriptor implements WasmCompiledProfileDescriptorView {
  readonly schemaName = "example/rich-document";
  readonly schemaVersion = 3;
  readonly schemaFingerprint = PROFILE_FINGERPRINT;
  readonly formatCount = 2;
  readonly intentCount = 0;
  readonly actionStateCount = 0;

  constructor(readonly generation: WasmProfileGenerationView) {}

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === this.generation;
  }

  formatKind(index: number): string | undefined {
    return ["breditor/strong", "example/link"][index];
  }

  formatRevision(index: number): number | undefined {
    return [1, 1][index];
  }

  formatPropertyCount(index: number): number | undefined {
    return [0, 3][index];
  }

  formatPropertyName(formatIndex: number, propertyIndex: number): string | undefined {
    return formatIndex === 1
      ? ["example/enabled", "example/href", "example/priority"][propertyIndex]
      : undefined;
  }

  formatPropertyPresence(
    formatIndex: number,
    propertyIndex: number,
  ): "required" | "optional" | undefined {
    return formatIndex === 1
      ? (["required", "required", "optional"] as const)[propertyIndex]
      : undefined;
  }

  formatPropertyValueType(
    formatIndex: number,
    propertyIndex: number,
  ): "boolean" | "integer" | "string" | undefined {
    return formatIndex === 1
      ? (["boolean", "string", "integer"] as const)[propertyIndex]
      : undefined;
  }

  formatPropertyIntegerMinimum(formatIndex: number, propertyIndex: number): number | undefined {
    return formatIndex === 1 && propertyIndex === 2 ? -2 : undefined;
  }

  formatPropertyIntegerMaximum(formatIndex: number, propertyIndex: number): number | undefined {
    return formatIndex === 1 && propertyIndex === 2 ? 9 : undefined;
  }

  formatPropertyStringMinimumUtf8Bytes(
    formatIndex: number,
    propertyIndex: number,
  ): number | undefined {
    return formatIndex === 1 && propertyIndex === 1 ? 1 : undefined;
  }

  formatPropertyStringMaximumUtf8Bytes(
    formatIndex: number,
    propertyIndex: number,
  ): number | undefined {
    return formatIndex === 1 && propertyIndex === 1 ? 12 : undefined;
  }

  intentId(): undefined { return undefined; }
  intentInputKind(): undefined { return undefined; }
  intentInputContractName(): undefined { return undefined; }
  intentInputContractVersion(): undefined { return undefined; }
  intentActivationContract(): undefined { return undefined; }
  intentValueContractName(): undefined { return undefined; }
  intentValueContractVersion(): undefined { return undefined; }
  actionStateId(): undefined { return undefined; }
  actionStateSourceKind(): undefined { return undefined; }
  actionStateSourceActionId(): undefined { return undefined; }
  actionStateSourceIntentId(): undefined { return undefined; }
  actionStateHistoryDirection(): undefined { return undefined; }
  actionStateActivationContract(): undefined { return undefined; }
  actionStateValueContractName(): undefined { return undefined; }
  actionStateValueContractVersion(): undefined { return undefined; }
  free(): void {}
}

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

  it("admits only the explicitly selected compiled-profile Document V2 contract", () => {
    const valid = documentV2Json([
      paragraph([
        formattedRun("A", ["breditor/strong"]),
        formattedRun("B", ["example/highlight"]),
      ]),
    ]);
    const parsed = JSON.parse(valid) as Record<string, unknown>;
    const root = parsed["root"] as Record<string, unknown>;
    const firstParagraph = (root["children"] as Array<Record<string, unknown>>)[0];
    if (firstParagraph === undefined) throw new Error("missing paragraph");
    const malformed = [
      documentJson([paragraph([])]),
      JSON.stringify({ ...parsed, formatVersion: 1 }),
      JSON.stringify({ ...parsed, schemaFingerprint: `sha256:${"3".repeat(64)}` }),
      JSON.stringify({ ...parsed, schema: { name: "example/other", version: 3 } }),
      JSON.stringify({ ...parsed, extra: true }),
      JSON.stringify({
        ...parsed,
        root: {
          ...root,
          children: [paragraph([formattedRun("A", ["example/unknown"])])],
        },
      }),
      JSON.stringify({
        ...parsed,
        root: {
          ...root,
          children: [paragraph([{
            kind: "text",
            text: "A",
            formats: [
              { type: "example/highlight", properties: {} },
              { type: "breditor/strong", properties: {} },
            ],
          }])],
        },
      }),
      JSON.stringify({
        ...parsed,
        root: {
          ...root,
          children: [paragraph([{
            kind: "text",
            text: "A",
            formats: [{ type: "example/highlight", properties: { color: "yellow" } }],
          }])],
        },
      }),
      JSON.stringify({
        ...parsed,
        root: {
          ...root,
          children: [paragraph([
            formattedRun("A", ["breditor/strong"]),
            formattedRun("B", ["breditor/strong"]),
          ])],
        },
      }),
      ` ${valid}`,
    ];

    expect(documentJsonUtf8Bytes(valid, V2_CONTRACT)).toBe(
      new TextEncoder().encode(valid).byteLength,
    );
    expect(documentJsonUtf8Bytes(valid)).toBeNull();
    for (const value of malformed) {
      expect(documentJsonUtf8Bytes(value, V2_CONTRACT)).toBeNull();
    }

    const view = new FakeStringResult("value", valid);
    expect(consumeWasmDocumentJson(EXPECTED, view, [], V2_CONTRACT)).toMatchObject({
      ok: true,
      document: { documentJson: valid },
    });
    expect(view.freeCalls).toBe(1);
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

    const encoded = documentV2Json([paragraph([
      formattedRun("A", ["example/highlight"]),
    ])]);
    for (const formats of [sparse, accessorBacked, overCap, iteratorPoisoned]) {
      const contract = {
        mode: "v2",
        schema: V2_CONTRACT.schema,
        formats,
      } as unknown as WasmDurableJsonContract;
      expect(documentJsonUtf8Bytes(encoded, contract)).toBeNull();
      const view = new FakeStringResult("value", encoded);
      expect(consumeWasmDocumentJson(EXPECTED, view, [], contract).ok).toBe(false);
      expect(view.freeCalls).toBe(1);
    }
    expect(accessorReads).not.toHaveBeenCalled();
    expect(iteratorReads).not.toHaveBeenCalled();
    expect(overCapIndexReads).not.toHaveBeenCalled();
  });

  it("correlates every V2 text and format exactly to an owned profiled projection", () => {
    const generation = new FakeProfileGeneration();
    const consumedDescriptor = consumeWasmCompiledProfileDescriptor(
      generation,
      new FakeProfileDescriptor(generation),
    );
    if (!consumedDescriptor.ok) throw new Error(consumedDescriptor.error.code);
    const projected = createProfiledDocumentProjection({
      schema: {
        name: "example/rich-document",
        version: 3,
        fingerprint: PROFILE_FINGERPRINT,
      },
      snapshot: EXPECTED,
      paragraphs: [{
        runs: [
          {
            text: "A",
            formatDetails: [{ kind: "breditor/strong", properties: [] }],
          },
          {
            text: "B",
            formatDetails: [{ kind: "example/highlight", properties: [] }],
          },
        ],
      }],
    }, generation, consumedDescriptor.descriptor);
    if (!projected.ok) throw new Error(projected.error.code);

    const exact = documentV2Json([paragraph([
      formattedRun("A", ["breditor/strong"]),
      formattedRun("B", ["example/highlight"]),
    ])]);
    const differentFormats = documentV2Json([paragraph([
      formattedRun("A", ["example/highlight"]),
      formattedRun("B", ["breditor/strong"]),
    ])]);
    expect(documentJsonMatchesProjection(exact, projected.value, V2_CONTRACT)).toBe(true);
    expect(
      documentJsonMatchesProjection(differentFormats, projected.value, V2_CONTRACT),
    ).toBe(false);
    expect(documentJsonMatchesProjection(exact, projected.value)).toBe(false);
  });

  it("admits bounded scalar format properties only under the explicit V3 contract", () => {
    const optionalOmitted = documentV2Json([paragraph([
      formattedRunWithProperties("A", [{
        type: "example/link",
        properties: {
          "example/enabled": true,
          "example/href": "a",
        },
      }]),
    ])]);
    const full = documentV2Json([paragraph([
      formattedRunWithProperties("A", [linkFormat("a", -2)]),
      formattedRunWithProperties("B", [linkFormat("💡", 9)]),
    ])]);

    expect(documentJsonUtf8Bytes(optionalOmitted, V3_CONTRACT)).not.toBeNull();
    expect(documentJsonUtf8Bytes(full, V3_CONTRACT)).not.toBeNull();
    // V2 remains the property-free generation even though it shares Document V2.
    expect(documentJsonUtf8Bytes(full, V2_CONTRACT)).toBeNull();
    expect(documentJsonUtf8Bytes(full)).toBeNull();

    const view = new FakeStringResult("value", full);
    expect(consumeWasmDocumentJson(EXPECTED, view, [], V3_CONTRACT)).toMatchObject({
      ok: true,
      document: { documentJson: full },
    });
    expect(view.freeCalls).toBe(1);
  });

  it("rejects missing, unknown, duplicate, and noncanonical property names", () => {
    const documents = [
      documentWithLinkProperties({ "example/enabled": true }),
      documentWithLinkProperties({
        "example/enabled": true,
        "example/href": "a",
        "example/unknown": true,
      }),
      documentWithLinkProperties({
        "example/href": "a",
        "example/enabled": true,
      }),
      documentWithLinkProperties({
        "example/enabled": true,
        "example/priority": 1,
        "example/href": "a",
      }),
    ];
    const valid = documentWithLinkProperties({
      "example/enabled": true,
      "example/href": "a",
    });
    documents.push(valid.replace(
      '"example/enabled":true',
      '"example/enabled":true,"example/enabled":true',
    ));

    for (const document of documents) {
      expect(documentJsonUtf8Bytes(document, V3_CONTRACT)).toBeNull();
    }

    const reversedContract: WasmDurableJsonContract = Object.freeze({
      mode: "v3",
      schema: V3_CONTRACT.schema,
      formats: Object.freeze([
        V3_CONTRACT.formats[0]!,
        Object.freeze({
          kind: "example/link",
          revision: 1,
          properties: Object.freeze([...LINK_PROPERTIES].reverse()),
        }),
      ]),
    });
    const duplicateContract: WasmDurableJsonContract = Object.freeze({
      mode: "v3",
      schema: V3_CONTRACT.schema,
      formats: Object.freeze([
        V3_CONTRACT.formats[0]!,
        Object.freeze({
          kind: "example/link",
          revision: 1,
          properties: Object.freeze([LINK_PROPERTIES[0]!, LINK_PROPERTIES[0]!]),
        }),
      ]),
    });
    expect(documentJsonUtf8Bytes(valid, reversedContract)).toBeNull();
    expect(documentJsonUtf8Bytes(valid, duplicateContract)).toBeNull();
  });

  it("enforces exact scalar types, safe integer ranges, and UTF-8 string bounds", () => {
    const invalidProperties: readonly Record<string, unknown>[] = [
      { "example/enabled": "true", "example/href": "a" },
      { "example/enabled": true, "example/href": 1 },
      { "example/enabled": true, "example/href": "", "example/priority": 0 },
      { "example/enabled": true, "example/href": "1234567890123" },
      { "example/enabled": true, "example/href": "💡💡💡💡" },
      { "example/enabled": true, "example/href": "\ud800" },
      { "example/enabled": true, "example/href": "a", "example/priority": -3 },
      { "example/enabled": true, "example/href": "a", "example/priority": 10 },
      { "example/enabled": true, "example/href": "a", "example/priority": 1.5 },
      {
        "example/enabled": true,
        "example/href": "a",
        "example/priority": Number.MAX_SAFE_INTEGER + 1,
      },
    ];
    for (const properties of invalidProperties) {
      expect(documentJsonUtf8Bytes(
        documentWithLinkProperties(properties),
        V3_CONTRACT,
      )).toBeNull();
    }
  });

  it("admits exactly 10,000 property values and rejects the next value", () => {
    const exactRuns = Array.from({ length: 10_000 }, (_, index) =>
      propertyBudgetRun(index % 2 === 0 ? "a" : "b"));
    const exact = documentV2Json([paragraph(exactRuns)]);
    const over = documentV2Json([
      paragraph(exactRuns),
      paragraph([propertyBudgetRun("c")]),
    ]);

    expect(documentJsonUtf8Bytes(exact, PROPERTY_BUDGET_CONTRACT)).not.toBeNull();
    expect(documentJsonUtf8Bytes(over, PROPERTY_BUDGET_CONTRACT)).toBeNull();
  });

  it("admits exactly 1 MiB of property strings and rejects the next byte", () => {
    const left = "💡".repeat(16_384);
    const right = "🚀".repeat(16_384);
    const exactRuns = Array.from({ length: 16 }, (_, index) =>
      propertyBudgetRun(index % 2 === 0 ? left : right));
    const exact = documentV2Json([paragraph(exactRuns)]);
    const over = documentV2Json([paragraph([
      ...exactRuns,
      propertyBudgetRun("é"),
    ])]);

    expect(documentJsonUtf8Bytes(exact, PROPERTY_BUDGET_CONTRACT)).not.toBeNull();
    expect(documentJsonUtf8Bytes(over, PROPERTY_BUDGET_CONTRACT)).toBeNull();
  });

  it("correlates V3 property names and values exactly to formatDetails", () => {
    const generation = new FakeProfileGeneration();
    const consumedDescriptor = consumeWasmCompiledProfileDescriptor(
      generation,
      new FakeTypedProfileDescriptor(generation),
    );
    if (!consumedDescriptor.ok) throw new Error(consumedDescriptor.error.code);
    const projected = createProfiledDocumentProjection({
      schema: {
        name: "example/rich-document",
        version: 3,
        fingerprint: PROFILE_FINGERPRINT,
      },
      snapshot: EXPECTED,
      paragraphs: [{
        runs: [{
          text: "A",
          formatDetails: [{
            kind: "example/link",
            properties: [
              { name: "example/enabled", value: true },
              { name: "example/href", value: "a" },
              { name: "example/priority", value: 7 },
            ],
          }],
        }],
      }],
    }, generation, consumedDescriptor.descriptor);
    if (!projected.ok) throw new Error(projected.error.code);

    const exact = documentWithLinkProperties({
      "example/enabled": true,
      "example/href": "a",
      "example/priority": 7,
    });
    const wrongValue = documentWithLinkProperties({
      "example/enabled": true,
      "example/href": "b",
      "example/priority": 7,
    });
    const missingOptional = documentWithLinkProperties({
      "example/enabled": true,
      "example/href": "a",
    });
    expect(documentJsonMatchesProjection(exact, projected.value, V3_CONTRACT)).toBe(true);
    expect(documentJsonMatchesProjection(wrongValue, projected.value, V3_CONTRACT)).toBe(false);
    expect(documentJsonMatchesProjection(missingOptional, projected.value, V3_CONTRACT))
      .toBe(false);
    expect(documentJsonMatchesProjection(exact, projected.value, V2_CONTRACT)).toBe(false);
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
        message: "The Rust editor core could not export the active Document format.",
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

  it("rejects non-canonical protected-handle arrays before accepting ownership", () => {
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
      const view = new FakeStringResult("value", documentJson([paragraph([])]));
      expect(consumeWasmDocumentJson(EXPECTED, view, protectedHandles).ok).toBe(false);
      expect(view.freeCalls).toBe(0);
    }
    expect(accessorReads).not.toHaveBeenCalled();
    expect(iteratorReads).not.toHaveBeenCalled();
    expect(overCapIndexReads).not.toHaveBeenCalled();
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

function documentV2Json(paragraphs: readonly unknown[]): string {
  return JSON.stringify({
    format: "breditor/document",
    formatVersion: 2,
    schema: { name: "example/rich-document", version: 3 },
    schemaFingerprint: PROFILE_FINGERPRINT,
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

function formattedRun(text: string, formats: readonly string[]): unknown {
  return {
    kind: "text",
    text,
    formats: formats.map((type) => ({ type, properties: {} })),
  };
}

function formattedRunWithProperties(
  text: string,
  formats: readonly Readonly<{
    type: string;
    properties: Readonly<Record<string, unknown>>;
  }>[],
): unknown {
  return { kind: "text", text, formats };
}

function linkFormat(href: string, priority?: number): Readonly<{
  type: string;
  properties: Readonly<Record<string, unknown>>;
}> {
  return {
    type: "example/link",
    properties: priority === undefined
      ? { "example/enabled": true, "example/href": href }
      : {
          "example/enabled": true,
          "example/href": href,
          "example/priority": priority,
        },
  };
}

function documentWithLinkProperties(properties: Record<string, unknown>): string {
  return documentV2Json([paragraph([
    formattedRunWithProperties("A", [{ type: "example/link", properties }]),
  ])]);
}

function propertyBudgetRun(value: string): unknown {
  return formattedRunWithProperties("x", [{
    type: "example/value",
    properties: { "example/value": value },
  }]);
}
