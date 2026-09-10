import { describe, expect, it, vi } from "vitest";

import {
  type BrowserCompiledProfileDescriptor,
  type BrowserProjectionResult,
  type SemanticProjectionImpact,
  type SemanticProjectionUpdateView,
  type SemanticProjectionView,
  consumeSemanticProjection as consumeSemanticProjectionRaw,
  consumeSemanticProjectionUpdate as consumeSemanticProjectionUpdateRaw,
  consumeWasmCompiledProfileDescriptor,
  type WasmCompiledProfileDescriptorView,
  type WasmProfileGenerationView,
} from "./advanced.js";

const TEST_SCHEMA_FINGERPRINT =
  "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
const TEST_PROFILE_GENERATION: WasmProfileGenerationView = {
  matches(other) {
    return other === TEST_PROFILE_GENERATION;
  },
  free: vi.fn(),
};

type FlatNode =
  | { readonly kind: "element"; readonly elementType: string; readonly children: readonly number[] }
  | {
      readonly kind: "text";
      readonly text: string;
      readonly formats: readonly FlatFormat[];
    };

type FlatProperty = Readonly<{
  name: string;
  kind: "boolean" | "integer" | "string";
  value: boolean | number | string;
}>;

type FlatFormat = Readonly<{
  kind: string;
  properties: readonly FlatProperty[];
}>;

class FakeProjectionView implements SemanticProjectionView {
  readonly schemaName: string;
  readonly schemaVersion: number;
  readonly schemaFingerprint: string;
  readonly snapshotLineage = "adapter-tests";
  readonly snapshotRevision: string;
  readonly rootIndex = 0;
  readonly nodes: readonly FlatNode[];
  freeCalls = 0;

  constructor(
    revision: string,
    paragraphs: readonly (readonly Readonly<{
      text: string;
      strong: boolean;
      formats?: readonly string[];
      formatDetails?: readonly FlatFormat[];
    }>[])[],
    schema: Readonly<{
      name: string;
      version: number;
      fingerprint: string;
    }> = {
      name: "breditor/base",
      version: 1,
      fingerprint: TEST_SCHEMA_FINGERPRINT,
    },
  ) {
    this.snapshotRevision = revision;
    this.schemaName = schema.name;
    this.schemaVersion = schema.version;
    this.schemaFingerprint = schema.fingerprint;
    const nodes: FlatNode[] = [
      { kind: "element", elementType: "breditor/document", children: [] },
    ];
    const paragraphIndexes: number[] = [];
    for (const paragraph of paragraphs) {
      const paragraphIndex = nodes.length;
      paragraphIndexes.push(paragraphIndex);
      nodes.push({ kind: "element", elementType: "breditor/paragraph", children: [] });
      const runIndexes: number[] = [];
      for (const run of paragraph) {
        runIndexes.push(nodes.length);
        nodes.push({
          kind: "text",
          text: run.text,
          formats: run.formatDetails ??
            (run.formats ?? (run.strong ? ["breditor/strong"] : []))
              .map((kind) => ({ kind, properties: [] })),
        });
      }
      nodes[paragraphIndex] = {
        kind: "element",
        elementType: "breditor/paragraph",
        children: runIndexes,
      };
    }
    nodes[0] = {
      kind: "element",
      elementType: "breditor/document",
      children: paragraphIndexes,
    };
    this.nodes = nodes;
  }

  get nodeCount(): number {
    return this.nodes.length;
  }

  nodeKind(index: number): "element" | "text" | undefined {
    return this.nodes[index]?.kind;
  }

  elementType(index: number): string | undefined {
    const node = this.nodes[index];
    return node?.kind === "element" ? node.elementType : undefined;
  }

  childCount(index: number): number | undefined {
    const node = this.nodes[index];
    return node?.kind === "element" ? node.children.length : undefined;
  }

  childAt(index: number, ordinal: number): number | undefined {
    const node = this.nodes[index];
    return node?.kind === "element" ? node.children[ordinal] : undefined;
  }

  text(index: number): string | undefined {
    const node = this.nodes[index];
    return node?.kind === "text" ? node.text : undefined;
  }

  formatCount(index: number): number | undefined {
    const node = this.nodes[index];
    return node?.kind === "text" ? node.formats.length : undefined;
  }

  formatType(index: number, ordinal: number): string | undefined {
    const node = this.nodes[index];
    return node?.kind === "text" ? node.formats[ordinal]?.kind : undefined;
  }

  formatPropertyCount(index: number, formatOrdinal: number): number | undefined {
    const node = this.nodes[index];
    return node?.kind === "text"
      ? node.formats[formatOrdinal]?.properties.length
      : undefined;
  }

  formatPropertyName(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): string | undefined {
    return this.property(index, formatOrdinal, propertyOrdinal)?.name;
  }

  formatPropertyValueKind(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): "boolean" | "integer" | "string" | undefined {
    return this.property(index, formatOrdinal, propertyOrdinal)?.kind;
  }

  formatPropertyBoolean(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): boolean | undefined {
    const property = this.property(index, formatOrdinal, propertyOrdinal);
    return property?.kind === "boolean" && typeof property.value === "boolean"
      ? property.value
      : undefined;
  }

  formatPropertyInteger(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): number | undefined {
    const property = this.property(index, formatOrdinal, propertyOrdinal);
    return property?.kind === "integer" && typeof property.value === "number"
      ? property.value
      : undefined;
  }

  formatPropertyString(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): string | undefined {
    const property = this.property(index, formatOrdinal, propertyOrdinal);
    return property?.kind === "string" && typeof property.value === "string"
      ? property.value
      : undefined;
  }

  private property(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): FlatProperty | undefined {
    const node = this.nodes[index];
    return node?.kind === "text"
      ? node.formats[formatOrdinal]?.properties[propertyOrdinal]
      : undefined;
  }

  free(): void {
    this.freeCalls += 1;
  }

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === TEST_PROFILE_GENERATION;
  }
}

class FakeUpdateView implements SemanticProjectionUpdateView {
  readonly baseLineage = "adapter-tests";
  readonly baseRevision: string;
  readonly resultLineage = "adapter-tests";
  readonly resultRevision: string;
  readonly impact: SemanticProjectionImpact;
  readonly affectedParagraphCount: number;
  readonly oldChildStart: number | undefined;
  readonly oldChildEnd: number | undefined;
  readonly newChildStart: number | undefined;
  readonly newChildEnd: number | undefined;
  readonly #affected: readonly number[];
  #projection: SemanticProjectionView | undefined;
  freeCalls = 0;

  constructor(options: {
    readonly baseRevision: string;
    readonly resultRevision: string;
    readonly impact: SemanticProjectionImpact;
    readonly projection: SemanticProjectionView | undefined;
    readonly affected?: readonly number[];
    readonly oldRange?: readonly [number, number];
    readonly newRange?: readonly [number, number];
  }) {
    this.baseRevision = options.baseRevision;
    this.resultRevision = options.resultRevision;
    this.impact = options.impact;
    this.#projection = options.projection;
    this.#affected = options.affected ?? [];
    this.affectedParagraphCount = this.#affected.length;
    this.oldChildStart = undefined;
    this.oldChildEnd = undefined;
    this.newChildStart = undefined;
    this.newChildEnd = undefined;
    if (options.oldRange !== undefined) {
      [this.oldChildStart, this.oldChildEnd] = options.oldRange;
    }
    if (options.newRange !== undefined) {
      [this.newChildStart, this.newChildEnd] = options.newRange;
    }
  }

  affectedParagraphIndex(index: number): number | undefined {
    return this.#affected[index];
  }

  takeProjection(): SemanticProjectionView | undefined {
    const projection = this.#projection;
    this.#projection = undefined;
    return projection;
  }

  free(): void {
    this.freeCalls += 1;
  }

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === TEST_PROFILE_GENERATION;
  }
}

function consumeSemanticProjection(
  view: SemanticProjectionView,
): BrowserProjectionResult<import("./projection.js").BaseDocumentProjection> {
  return consumeSemanticProjectionRaw(
    view,
    TEST_PROFILE_GENERATION,
    TEST_SCHEMA_FINGERPRINT,
  );
}

function consumeSemanticProjectionUpdate(
  base: import("./projection.js").BaseDocumentProjection,
  view: SemanticProjectionUpdateView,
  protectedHandles: readonly unknown[] = [],
) {
  return consumeSemanticProjectionUpdateRaw(
    base,
    view,
    TEST_PROFILE_GENERATION,
    TEST_SCHEMA_FINGERPRINT,
    protectedHandles,
  );
}

function valueOf<T>(result: BrowserProjectionResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

type ProfilePropertyFixture = Readonly<{
  name: string;
  presence: "required" | "optional";
  valueType:
    | Readonly<{ kind: "boolean" }>
    | Readonly<{ kind: "integer"; minimum?: number; maximum?: number }>
    | Readonly<{
        kind: "string";
        minimumUtf8Bytes: number;
        maximumUtf8Bytes: number;
      }>;
}>;

type ProfileFormatFixture = string | Readonly<{
  kind: string;
  properties: readonly ProfilePropertyFixture[];
}>;

function ownedProfileDescriptor(
  formats: readonly ProfileFormatFixture[],
  generation: WasmProfileGenerationView = TEST_PROFILE_GENERATION,
): BrowserCompiledProfileDescriptor {
  const absent = (): undefined => undefined;
  const normalized = formats.map((format) => typeof format === "string"
    ? { kind: format, properties: [] }
    : format);
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "example/document",
    schemaVersion: 1,
    schemaFingerprint: TEST_SCHEMA_FINGERPRINT,
    formatCount: formats.length,
    intentCount: 0,
    actionStateCount: 0,
    inlineFormatSetCount: 0,
    matchesProfileGeneration: (candidate) => candidate === generation,
    formatKind: (index) => normalized[index]?.kind,
    formatRevision: (index) =>
      index >= 0 && index < normalized.length ? 1 : undefined,
    formatPropertyCount: (formatIndex) =>
      normalized[formatIndex]?.properties.length,
    formatPropertyName: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.name,
    formatPropertyPresence: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.presence,
    formatPropertyValueType: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.valueType.kind,
    formatPropertyIntegerMinimum: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "integer" ? type.minimum : undefined;
    },
    formatPropertyIntegerMaximum: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "integer" ? type.maximum : undefined;
    },
    formatPropertyStringMinimumUtf8Bytes: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "string" ? type.minimumUtf8Bytes : undefined;
    },
    formatPropertyStringMaximumUtf8Bytes: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "string" ? type.maximumUtf8Bytes : undefined;
    },
    intentId: absent,
    intentInputKind: absent,
    intentInputContractName: absent,
    intentInputContractVersion: absent,
    intentActivationContract: absent,
    intentValueContractName: absent,
    intentValueContractVersion: absent,
    actionStateId: absent,
    actionStateSourceKind: absent,
    actionStateSourceActionId: absent,
    actionStateSourceIntentId: absent,
    actionStateHistoryDirection: absent,
    actionStateActivationContract: absent,
    actionStateValueContractName: absent,
    actionStateValueContractVersion: absent,
    inlineFormatSetFormatKind: absent,
    inlineFormatSetIntentId: absent,
    inlineFormatSetActionStateId: absent,
    free: () => undefined,
  };
  const result = consumeWasmCompiledProfileDescriptor(
    generation,
    view,
  );
  if (!result.ok) throw new Error("test profile descriptor was rejected");
  return result.descriptor;
}

const TYPED_FORMAT: Readonly<{
  kind: string;
  properties: readonly ProfilePropertyFixture[];
}> = Object.freeze({
  kind: "example/metadata",
  properties: Object.freeze([
    Object.freeze({
      name: "example/enabled",
      presence: "required" as const,
      valueType: Object.freeze({ kind: "boolean" as const }),
    }),
    Object.freeze({
      name: "example/priority",
      presence: "optional" as const,
      valueType: Object.freeze({
        kind: "integer" as const,
        minimum: 0,
        maximum: 10,
      }),
    }),
    Object.freeze({
      name: "example/title",
      presence: "required" as const,
      valueType: Object.freeze({
        kind: "string" as const,
        minimumUtf8Bytes: 1,
        maximumUtf8Bytes: 64,
      }),
    }),
  ]),
});

const PROPERTY_BUDGET_FORMAT: Readonly<{
  kind: string;
  properties: readonly ProfilePropertyFixture[];
}> = Object.freeze({
  kind: "example/value",
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
});

function typedProperties(priority = 7): readonly FlatProperty[] {
  return Object.freeze([
    Object.freeze({
      name: "example/enabled",
      kind: "boolean" as const,
      value: true,
    }),
    Object.freeze({
      name: "example/priority",
      kind: "integer" as const,
      value: priority,
    }),
    Object.freeze({
      name: "example/title",
      kind: "string" as const,
      value: "safe title",
    }),
  ]);
}

describe("Wasm semantic projection adapter", () => {
  it("consumes profile formats against the exact owned descriptor", () => {
    const descriptor = ownedProfileDescriptor([
      "breditor/strong",
      "example/highlight",
    ]);
    const baseView = new FakeProjectionView("0", [[
      {
        text: "mixed",
        strong: true,
        formats: ["breditor/strong", "example/highlight"],
      },
    ]], descriptor.schema);
    const base = valueOf(consumeSemanticProjectionRaw(
      baseView,
      TEST_PROFILE_GENERATION,
      descriptor,
    ));

    expect(base.schema).toEqual(descriptor.schema);
    expect(base.paragraphs[0]?.runs[0]?.formats).toEqual([
      "breditor/strong",
      "example/highlight",
    ]);
    expect(base.paragraphs[0]?.runs[0]?.strong).toBe(true);

    const resultView = new FakeProjectionView("1", [[
      { text: "plain", strong: false, formats: ["example/highlight"] },
    ]], descriptor.schema);
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "textContainers",
      affected: [0],
      projection: resultView,
    });
    const update = valueOf(consumeSemanticProjectionUpdateRaw(
      base,
      updateView,
      TEST_PROFILE_GENERATION,
      descriptor,
    ));
    expect(update.result.paragraphs[0]?.runs[0]?.formats).toEqual([
      "example/highlight",
    ]);
    expect(update.result.paragraphs[0]?.runs[0]?.strong).toBe(false);
  });

  it("owns canonical typed format details while retaining the format-kind index", () => {
    const descriptor = ownedProfileDescriptor([
      "breditor/strong",
      TYPED_FORMAT,
    ]);
    const view = new FakeProjectionView("0", [[{
      text: "typed",
      strong: true,
      formatDetails: [
        { kind: "breditor/strong", properties: [] },
        { kind: TYPED_FORMAT.kind, properties: typedProperties() },
      ],
    }]], descriptor.schema);

    const projection = valueOf(consumeSemanticProjectionRaw(
      view,
      TEST_PROFILE_GENERATION,
      descriptor,
    ));
    const run = projection.paragraphs[0]?.runs[0];

    expect(run?.formats).toEqual(["breditor/strong", "example/metadata"]);
    expect(run?.formatDetails).toEqual([
      { kind: "breditor/strong", properties: [] },
      {
        kind: "example/metadata",
        properties: [
          { name: "example/enabled", value: true },
          { name: "example/priority", value: 7 },
          { name: "example/title", value: "safe title" },
        ],
      },
    ]);
    expect(Object.isFrozen(run)).toBe(true);
    expect(Object.isFrozen(run?.formats)).toBe(true);
    expect(Object.isFrozen(run?.formatDetails)).toBe(true);
    expect(Object.isFrozen(run?.formatDetails[1])).toBe(true);
    expect(Object.isFrozen(run?.formatDetails[1]?.properties)).toBe(true);
    expect(Object.isFrozen(run?.formatDetails[1]?.properties[0])).toBe(true);
    expect(Reflect.ownKeys(run ?? {})).toEqual([
      "text",
      "strong",
      "formatDetails",
      "formats",
    ]);
    expect(Object.keys(run ?? {})).toEqual(["text", "strong", "formatDetails"]);
    expect(view.freeCalls).toBe(1);
  });

  it("keeps adjacent runs separate when only typed property values differ", () => {
    const descriptor = ownedProfileDescriptor([TYPED_FORMAT]);
    const differing = new FakeProjectionView("0", [[
      {
        text: "left",
        strong: false,
        formatDetails: [{ kind: TYPED_FORMAT.kind, properties: typedProperties(1) }],
      },
      {
        text: "right",
        strong: false,
        formatDetails: [{ kind: TYPED_FORMAT.kind, properties: typedProperties(2) }],
      },
    ]], descriptor.schema);
    expect(consumeSemanticProjectionRaw(
      differing,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(true);

    const equivalent = new FakeProjectionView("0", [[
      {
        text: "left",
        strong: false,
        formatDetails: [{ kind: TYPED_FORMAT.kind, properties: typedProperties(1) }],
      },
      {
        text: "right",
        strong: false,
        formatDetails: [{ kind: TYPED_FORMAT.kind, properties: typedProperties(1) }],
      },
    ]], descriptor.schema);
    expect(consumeSemanticProjectionRaw(
      equivalent,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(equivalent.freeCalls).toBe(1);
  });

  it("rejects noncanonical, uncontracted, wrong-domain, and unsafe property values", () => {
    const descriptor = ownedProfileDescriptor([TYPED_FORMAT]);
    const valid = typedProperties();
    const cases: readonly [string, readonly FlatProperty[]][] = [
      ["missing required", valid.slice(1)],
      [
        "unknown property",
        [
          valid[0] as FlatProperty,
          { name: "example/rogue", kind: "boolean", value: true },
          valid[2] as FlatProperty,
        ],
      ],
      [
        "noncanonical property order",
        [valid[1] as FlatProperty, valid[0] as FlatProperty, valid[2] as FlatProperty],
      ],
      [
        "integer below contract",
        [
          valid[0] as FlatProperty,
          { name: "example/priority", kind: "integer", value: -1 },
          valid[2] as FlatProperty,
        ],
      ],
      [
        "string below contract",
        [
          valid[0] as FlatProperty,
          valid[1] as FlatProperty,
          { name: "example/title", kind: "string", value: "" },
        ],
      ],
      [
        "unsafe integer",
        [
          valid[0] as FlatProperty,
          {
            name: "example/priority",
            kind: "integer",
            value: Number.MAX_SAFE_INTEGER + 1,
          },
          valid[2] as FlatProperty,
        ],
      ],
      [
        "negative zero",
        [
          valid[0] as FlatProperty,
          { name: "example/priority", kind: "integer", value: -0 },
          valid[2] as FlatProperty,
        ],
      ],
    ];

    for (const [_name, properties] of cases) {
      const view = new FakeProjectionView("0", [[{
        text: "typed",
        strong: false,
        formatDetails: [{ kind: TYPED_FORMAT.kind, properties }],
      }]], descriptor.schema);
      expect(consumeSemanticProjectionRaw(
        view,
        TEST_PROFILE_GENERATION,
        descriptor,
      ).ok).toBe(false);
      expect(view.freeCalls).toBe(1);
    }
  });

  it("requires exact scalar channels, bounded counts, and absent sentinels", () => {
    const descriptor = ownedProfileDescriptor([TYPED_FORMAT]);
    const createView = () => new FakeProjectionView("0", [[{
      text: "typed",
      strong: false,
      formatDetails: [{ kind: TYPED_FORMAT.kind, properties: typedProperties() }],
    }]], descriptor.schema);

    const crossKind = createView();
    const boolean = crossKind.formatPropertyBoolean.bind(crossKind);
    crossKind.formatPropertyBoolean = (node, format, property) =>
      property === 1 ? false : boolean(node, format, property);
    expect(consumeSemanticProjectionRaw(
      crossKind,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(crossKind.freeCalls).toBe(1);

    const overCount = createView();
    overCount.formatPropertyCount = () => 33;
    expect(consumeSemanticProjectionRaw(
      overCount,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(overCount.freeCalls).toBe(1);

    const propertySentinelLeaks: readonly ((view: FakeProjectionView) => void)[] = [
      (view) => {
        const original = view.formatPropertyName.bind(view);
        view.formatPropertyName = (node, format, property) =>
          property === 3 ? "example/extra" : original(node, format, property);
      },
      (view) => {
        const original = view.formatPropertyValueKind.bind(view);
        view.formatPropertyValueKind = (node, format, property) =>
          property === 3 ? "boolean" : original(node, format, property);
      },
      (view) => {
        const original = view.formatPropertyBoolean.bind(view);
        view.formatPropertyBoolean = (node, format, property) =>
          property === 3 ? true : original(node, format, property);
      },
      (view) => {
        const original = view.formatPropertyInteger.bind(view);
        view.formatPropertyInteger = (node, format, property) =>
          property === 3 ? 1 : original(node, format, property);
      },
      (view) => {
        const original = view.formatPropertyString.bind(view);
        view.formatPropertyString = (node, format, property) =>
          property === 3 ? "extra" : original(node, format, property);
      },
    ];
    for (const leak of propertySentinelLeaks) {
      const sentinel = createView();
      leak(sentinel);
      expect(consumeSemanticProjectionRaw(
        sentinel,
        TEST_PROFILE_GENERATION,
        descriptor,
      ).ok).toBe(false);
      expect(sentinel.freeCalls).toBe(1);
    }

    const formatSentinel = createView();
    const formatPropertyCount = formatSentinel.formatPropertyCount.bind(formatSentinel);
    formatSentinel.formatPropertyCount = (node, format) =>
      format === 1 ? 0 : formatPropertyCount(node, format);
    expect(consumeSemanticProjectionRaw(
      formatSentinel,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(formatSentinel.freeCalls).toBe(1);
  });

  it("contains thenable property results and throwing method accessors", async () => {
    const descriptor = ownedProfileDescriptor([TYPED_FORMAT]);
    const createView = () => new FakeProjectionView("0", [[{
      text: "typed",
      strong: false,
      formatDetails: [{ kind: TYPED_FORMAT.kind, properties: typedProperties() }],
    }]], descriptor.schema);

    const asynchronous = createView();
    asynchronous.formatPropertyString = (() => Promise.reject(
      new Error("projected property rejection must be contained"),
    )) as unknown as SemanticProjectionView["formatPropertyString"];
    expect(consumeSemanticProjectionRaw(
      asynchronous,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(asynchronous.freeCalls).toBe(1);

    const throwing = createView();
    Object.defineProperty(throwing, "formatPropertyName", {
      get() {
        throw new Error("hostile method accessor");
      },
    });
    expect(consumeSemanticProjectionRaw(
      throwing,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(throwing.freeCalls).toBe(1);
    await Promise.resolve();
  });

  it("matches the core aggregate property-value and string-byte budgets", () => {
    const descriptor = ownedProfileDescriptor([PROPERTY_BUDGET_FORMAT]);
    const exactValueRuns = Array.from({ length: 10_000 }, (_, index) => ({
      text: "x",
      strong: false,
      formatDetails: [{
        kind: PROPERTY_BUDGET_FORMAT.kind,
        properties: propertyBudgetProjection(index % 2 === 0 ? "a" : "b"),
      }],
    }));
    const exactValues = new FakeProjectionView(
      "0",
      [exactValueRuns],
      descriptor.schema,
    );
    expect(consumeSemanticProjectionRaw(
      exactValues,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(true);
    expect(exactValues.freeCalls).toBe(1);

    const overValues = new FakeProjectionView(
      "0",
      [exactValueRuns, [{
        text: "x",
        strong: false,
        formatDetails: [{
          kind: PROPERTY_BUDGET_FORMAT.kind,
          properties: propertyBudgetProjection("c"),
        }],
      }]],
      descriptor.schema,
    );
    expect(consumeSemanticProjectionRaw(
      overValues,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(overValues.freeCalls).toBe(1);

    const left = "💡".repeat(16_384);
    const right = "🚀".repeat(16_384);
    const exactStringRuns = Array.from({ length: 16 }, (_, index) => ({
      text: "x",
      strong: false,
      formatDetails: [{
        kind: PROPERTY_BUDGET_FORMAT.kind,
        properties: propertyBudgetProjection(index % 2 === 0 ? left : right),
      }],
    }));
    const exactStrings = new FakeProjectionView(
      "0",
      [exactStringRuns],
      descriptor.schema,
    );
    expect(consumeSemanticProjectionRaw(
      exactStrings,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(true);
    expect(exactStrings.freeCalls).toBe(1);

    const overStrings = new FakeProjectionView(
      "0",
      [[...exactStringRuns, {
        text: "x",
        strong: false,
        formatDetails: [{
          kind: PROPERTY_BUDGET_FORMAT.kind,
          properties: propertyBudgetProjection("é"),
        }],
      }]],
      descriptor.schema,
    );
    expect(consumeSemanticProjectionRaw(
      overStrings,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(overStrings.freeCalls).toBe(1);
  });

  it("rejects projections and updates from another profile generation", () => {
    const foreignGeneration: WasmProfileGenerationView = {
      matches(other) { return other === foreignGeneration; },
      free: vi.fn(),
    };
    const projectionView = new FakeProjectionView("0", [[]]);
    expect(
      consumeSemanticProjectionRaw(
        projectionView,
        foreignGeneration,
        TEST_SCHEMA_FINGERPRINT,
      ).ok,
    ).toBe(false);
    expect(projectionView.freeCalls).toBe(1);

    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "root",
      projection: new FakeProjectionView("1", [[]]),
    });
    expect(
      consumeSemanticProjectionUpdateRaw(
        base,
        updateView,
        foreignGeneration,
        TEST_SCHEMA_FINGERPRINT,
      ).ok,
    ).toBe(false);
    expect(updateView.freeCalls).toBe(1);
  });

  it("rejects an owned descriptor minted by a different live generation", () => {
    const foreignGeneration: WasmProfileGenerationView = {
      matches(other) { return other === foreignGeneration; },
      free: vi.fn(),
    };
    const descriptor = ownedProfileDescriptor(
      ["breditor/strong"],
      foreignGeneration,
    );
    const view = new FakeProjectionView("0", [[{
      text: "x",
      strong: true,
    }]], descriptor.schema);

    expect(consumeSemanticProjectionRaw(
      view,
      TEST_PROFILE_GENERATION,
      descriptor,
    )).toMatchObject({ ok: false });
    expect(view.freeCalls).toBe(1);
  });

  it("consumes an exact flattened preorder view without parsing JSON", () => {
    const view = new FakeProjectionView("0", [
      [{ text: "plain", strong: false }, { text: "strong", strong: true }],
      [],
    ]);

    const projection = valueOf(consumeSemanticProjection(view));
    expect(view.freeCalls).toBe(1);
    expect(projection.snapshot).toEqual({ lineage: "adapter-tests", revision: "0" });
    expect(projection.paragraphs).toEqual([
      {
        runs: [
          { text: "plain", strong: false, formatDetails: [] },
          {
            text: "strong",
            strong: true,
            formatDetails: [{ kind: "breditor/strong", properties: [] }],
          },
        ],
      },
      { runs: [] },
    ]);
  });

  it("uses the projection cleanup captured before thenable inspection", () => {
    const view = new FakeProjectionView("0", [[{ text: "plain", strong: false }]]);
    const replacementFree = vi.fn();
    Object.defineProperty(view, "then", {
      get() {
        Object.assign(view, { free: replacementFree });
        return undefined;
      },
    });

    expect(consumeSemanticProjection(view).ok).toBe(true);
    expect(view.freeCalls).toBe(1);
    expect(replacementFree).not.toHaveBeenCalled();
  });

  it("rejects same-handle reentry without double-freeing the outer owner", () => {
    const view = new FakeProjectionView("0", [[{ text: "plain", strong: false }]]);
    let nested: BrowserProjectionResult<import("./projection.js").BaseDocumentProjection> |
      undefined;
    const fingerprint = view.schemaFingerprint;
    Object.defineProperty(view, "schemaFingerprint", {
      configurable: true,
      get() {
        nested = consumeSemanticProjection(view);
        return fingerprint;
      },
    });

    expect(consumeSemanticProjection(view).ok).toBe(true);
    expect(nested).toMatchObject({ ok: false });
    expect(view.freeCalls).toBe(1);
  });

  it("contains thenables returned by generated scalar methods", async () => {
    const view = new FakeProjectionView("0", [[{ text: "plain", strong: false }]]);
    view.nodeKind = (() => Promise.reject(
      new Error("generated scalar rejection must be contained"),
    )) as unknown as SemanticProjectionView["nodeKind"];

    expect(consumeSemanticProjection(view).ok).toBe(false);
    expect(view.freeCalls).toBe(1);
    await Promise.resolve();
  });

  it("fails closed and frees a view with a non-preorder child index", () => {
    const view = new FakeProjectionView("0", [[{ text: "text", strong: false }]]);
    const root = view.nodes[0];
    if (root?.kind !== "element") {
      throw new Error("fixture root missing");
    }
    (view.nodes as FlatNode[])[0] = { ...root, children: [2] };

    const result = consumeSemanticProjection(view);
    expect(result.ok).toBe(false);
    expect(view.freeCalls).toBe(1);
  });

  it("bounds traversal by nodeCount before iterating a hostile run count", () => {
    const view = new FakeProjectionView("0", [[{ text: "text", strong: false }]]);
    const childCount = view.childCount.bind(view);
    const childAt = vi.spyOn(view, "childAt");
    view.childCount = (index) => index === 1 ? 10_000 : childCount(index);

    expect(consumeSemanticProjection(view).ok).toBe(false);
    expect(childAt).toHaveBeenCalledTimes(1);
    expect(view.freeCalls).toBe(1);
  });

  it("rejects cross-kind getter data and hidden nodes beyond nodeCount", () => {
    const elementFormat = new FakeProjectionView("0", [[{ text: "text", strong: false }]]);
    const baseFormatType = elementFormat.formatType.bind(elementFormat);
    elementFormat.formatType = (index, ordinal) =>
      index === 0 && ordinal === 0 ? "breditor/strong" : baseFormatType(index, ordinal);
    expect(consumeSemanticProjection(elementFormat).ok).toBe(false);
    expect(elementFormat.freeCalls).toBe(1);

    const textChild = new FakeProjectionView("0", [[{ text: "text", strong: false }]]);
    const baseChildAt = textChild.childAt.bind(textChild);
    textChild.childAt = (index, ordinal) =>
      index === 2 && ordinal === 0 ? 0 : baseChildAt(index, ordinal);
    expect(consumeSemanticProjection(textChild).ok).toBe(false);
    expect(textChild.freeCalls).toBe(1);

    const hiddenNode = new FakeProjectionView("0", [[]]);
    const baseNodeKind = hiddenNode.nodeKind.bind(hiddenNode);
    hiddenNode.nodeKind = (index) =>
      index === hiddenNode.nodeCount ? "text" : baseNodeKind(index);
    expect(consumeSemanticProjection(hiddenNode).ok).toBe(false);
    expect(hiddenNode.freeCalls).toBe(1);
  });

  it("consumes and verifies a text-container update and both handles", () => {
    const baseView = new FakeProjectionView("8", [
      [{ text: "left", strong: false }],
      [{ text: "right", strong: false }],
    ]);
    const base = valueOf(consumeSemanticProjection(baseView));
    const resultView = new FakeProjectionView("9", [
      [{ text: "LEFT", strong: true }],
      [{ text: "right", strong: false }],
    ]);
    const updateView = new FakeUpdateView({
      baseRevision: "8",
      resultRevision: "9",
      impact: "textContainers",
      projection: resultView,
      affected: [0],
    });

    const update = valueOf(consumeSemanticProjectionUpdate(base, updateView));
    expect(update.impact).toEqual({ kind: "textContainers", paragraphIndexes: [0] });
    expect(update.result.paragraphs[0]?.runs[0]).toEqual({
      text: "LEFT",
      strong: true,
      formatDetails: [{ kind: "breditor/strong", properties: [] }],
    });
    expect(resultView.freeCalls).toBe(1);
    expect(updateView.freeCalls).toBe(1);
    expect(updateView.takeProjection()).toBeUndefined();
  });

  it("rejects mismatched duplicate snapshots and still frees the update", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const resultView = new FakeProjectionView("1", [[]]);
    const updateView = new FakeUpdateView({
      baseRevision: "wrong",
      resultRevision: "1",
      impact: "none",
      projection: resultView,
    });

    const result = consumeSemanticProjectionUpdate(base, updateView);
    expect(result.ok).toBe(false);
    expect(updateView.freeCalls).toBe(1);
    expect(resultView.freeCalls).toBe(0);
  });

  it("rejects an inconsistent root-splice shape", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const resultView = new FakeProjectionView("1", [[]]);
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "rootSplice",
      projection: resultView,
      oldRange: [0, 1],
    });

    expect(consumeSemanticProjectionUpdate(base, updateView).ok).toBe(false);
    expect(updateView.freeCalls).toBe(1);
    expect(resultView.freeCalls).toBe(0);
  });

  it("rejects a protected nested projection without freeing its owner", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const protectedProjection = new FakeProjectionView("1", [[]]);
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "root",
      projection: protectedProjection,
    });

    expect(
      consumeSemanticProjectionUpdate(base, updateView, [protectedProjection]).ok,
    ).toBe(false);
    expect(updateView.freeCalls).toBe(1);
    expect(protectedProjection.freeCalls).toBe(0);
  });

  it("snapshots protected ownership before takeProjection can mutate its source list", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const protectedProjection = new FakeProjectionView("1", [[]]);
    const protectedHandles: unknown[] = [protectedProjection];
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "root",
      projection: undefined,
    });
    Object.assign(updateView, {
      takeProjection: () => {
        protectedHandles.splice(0, protectedHandles.length);
        return protectedProjection;
      },
    });

    expect(
      consumeSemanticProjectionUpdate(base, updateView, protectedHandles).ok,
    ).toBe(false);
    expect(updateView.freeCalls).toBe(1);
    expect(protectedProjection.freeCalls).toBe(0);
  });

  it("leaves the update caller-owned when protected ownership cannot be snapshotted", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const protectedProjection = new FakeProjectionView("1", [[]]);
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "root",
      projection: protectedProjection,
    });
    const protectedHandles = new Proxy([protectedProjection], {
      getOwnPropertyDescriptor(_target, property) {
        if (property === "0") throw new Error("hostile ownership list");
        return Reflect.getOwnPropertyDescriptor(_target, property);
      },
    });

    expect(
      consumeSemanticProjectionUpdate(base, updateView, protectedHandles).ok,
    ).toBe(false);
    expect(updateView.freeCalls).toBe(0);
    expect(protectedProjection.freeCalls).toBe(0);
  });

  it("never reads a hostile protected-list length before rejecting its ownership snapshot", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const protectedProjection = new FakeProjectionView("1", [[]]);
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "root",
      projection: protectedProjection,
    });
    const lengthRead = vi.fn(() => {
      throw new Error("hostile length getter");
    });
    const protectedHandles = new Proxy([protectedProjection], {
      get(target, property, receiver) {
        if (property === "length") return lengthRead();
        return Reflect.get(target, property, receiver);
      },
      getOwnPropertyDescriptor(target, property) {
        if (property === "length") {
          throw new Error("hostile ownership descriptor");
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });

    expect(
      consumeSemanticProjectionUpdate(base, updateView, protectedHandles).ok,
    ).toBe(false);
    expect(lengthRead).not.toHaveBeenCalled();
    expect(updateView.freeCalls).toBe(0);
    expect(protectedProjection.freeCalls).toBe(0);
  });

  it("reads the affected-paragraph count exactly once", () => {
    const base = valueOf(
      consumeSemanticProjection(
        new FakeProjectionView("0", [[{ text: "a", strong: false }]]),
      ),
    );
    const resultView = new FakeProjectionView("1", [
      [{ text: "b", strong: false }],
    ]);
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "textContainers",
      projection: resultView,
      affected: [0],
    });
    const reads = vi.fn(() => 1);
    Object.defineProperty(updateView, "affectedParagraphCount", { get: reads });

    expect(consumeSemanticProjectionUpdate(base, updateView).ok).toBe(true);
    expect(reads).toHaveBeenCalledOnce();
  });

  it("contains a rejected projection impostor even when it has no cleanup", async () => {
    const rejected = Promise.reject(new Error("projection rejection must be contained"));

    expect(
      consumeSemanticProjection(rejected as unknown as SemanticProjectionView).ok,
    ).toBe(false);
    await Promise.resolve();
  });

  it("frees a self-aliased update exactly once", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    let updateView: SemanticProjectionUpdateView;
    const free = vi.fn();
    updateView = {
      baseLineage: "adapter-tests",
      baseRevision: "0",
      resultLineage: "adapter-tests",
      resultRevision: "1",
      impact: "root",
      affectedParagraphCount: 0,
      oldChildStart: undefined,
      oldChildEnd: undefined,
      newChildStart: undefined,
      newChildEnd: undefined,
      matchesProfileGeneration: (generation) =>
        generation === TEST_PROFILE_GENERATION,
      affectedParagraphIndex: () => undefined,
      takeProjection: () => updateView as unknown as SemanticProjectionView,
      free,
    };

    expect(consumeSemanticProjectionUpdate(base, updateView).ok).toBe(false);
    expect(free).toHaveBeenCalledOnce();
  });
});

function propertyBudgetProjection(value: string): readonly FlatProperty[] {
  return [{
    name: "example/value",
    kind: "string",
    value,
  }];
}
