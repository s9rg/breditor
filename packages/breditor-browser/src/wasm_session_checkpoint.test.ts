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
    Object.freeze({ kind: "breditor/strong", revision: 1, properties: Object.freeze([]) }),
    Object.freeze({ kind: "example/highlight", revision: 2, properties: Object.freeze([]) }),
  ]),
});
const V3_LINK_PROPERTIES = Object.freeze([
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
    Object.freeze({
      kind: "example/link",
      revision: 1,
      properties: V3_LINK_PROPERTIES,
    }),
  ]),
});
const V5_CONTRACT: WasmDurableJsonContract = { ...V3_CONTRACT, mode: "v5" };

describe("explicit nested Session V7 preflight", () => {
  const contract: WasmDurableJsonContract = {...V3_CONTRACT, mode: "v7"};
  function fixture() {
    const value = checkpointV3Value(); value["formatVersion"] = 7;
    const block = listElement("paragraph", [{kind: "text", text: "a🙂", formats: []}]);
    const root = listElement("document", [listElement("bullet-list", [listElement("list-item", [
      listElement("paragraph", []), listElement("ordered-list", [listElement("list-item", [block])], {"breditor/start": 8}),
    ])])]);
    value["historyBase"]["document"]["root"] = root;
    const point = {kind: "text", textPath: [0, 0, 1, 0, 0, 0], utf16Offset: 1, affinity: "after"};
    const selection = {kind: "range", anchor: point, focus: point};
    value["historyBase"]["selection"] = selection;
    value["entries"] = [{forwardOperations: [{kind: "nestedListTextSplice", block: [0, 0, 1, 0, 0], start: 1, end: 3,
      expected: root, replacement: {runs: [{text: "z", formats: []}]}}], resultSelection: selection, resultPendingFormats: null}];
    value["cursor"] = 1; value["historyCapacity"] = 20; value["openMergeGroup"] = null;
    return value;
  }
  it("admits explicit V7 nested state and history in either cursor branch", () => {
    for (const cursor of [0, 1]) {
      const value = fixture(); value["cursor"] = cursor;
      const json = JSON.stringify(value);
      expect(sessionCheckpointJsonMatchesDurableContract(json, contract)).not.toBeNull();
      expect(sessionCheckpointJsonMatchesDurableContract(json, {...contract, mode: "v6"})).toBeNull();
    }
  });
  it.each(["state", "scalar", "legacyTag", "nullOperation"])("rejects malformed V7 %s", fault => {
    const value = fixture();
    if (fault === "state") value["historyBase"]["formatVersion"] = 7;
    if (fault === "scalar") value["entries"][0]["forwardOperations"][0]["end"] = 2;
    if (fault === "legacyTag") value["entries"][0]["forwardOperations"][0]["kind"] = "flatListTextSplice";
    if (fault === "nullOperation") value["entries"][0]["forwardOperations"][0] = null;
    expect(sessionCheckpointJsonMatchesDurableContract(JSON.stringify(value), contract)).toBeNull();
  });
  it.each([10, 100, 500])("admits typed grandchild splice history with %i sibling items across Undo/Redo cursors", items => {
    const typedContract: WasmDurableJsonContract = {...contract, formats: [
      {kind: "breditor/strong", revision: 1, properties: []},
      {kind: "example/link", revision: 1, properties: [
        {name: "example/href", presence: "required", valueType: {kind: "string", minimumUtf8Bytes: 1, maximumUtf8Bytes: 2048}},
        {name: "example/open-in-new-window", presence: "required", valueType: {kind: "boolean"}},
      ]},
      {kind: "example/text-color", revision: 1, properties: [
        {name: "example/rgb24", presence: "required", valueType: {kind: "integer", minimum: 0, maximum: 16777215}},
      ]},
    ]};
    const formats = [
      {type: "breditor/strong", properties: {}},
      {type: "example/link", properties: {"example/href": "https://example.test/", "example/open-in-new-window": false}},
      {type: "example/text-color", properties: {"example/rgb24": 0x123456}},
    ];
    const text = (value: string) => ({kind: "text", text: value, formats});
    const root = listElement("document", [listElement("ordered-list", Array.from({length: items}, (_, i) =>
      listElement("list-item", [
        listElement(i % 10 === 0 ? "heading" : "paragraph", [text(`Item ${i}: A🙂`)], i % 10 === 0 ? {"breditor/level": 2} : {}),
        ...(i % 10 === 0 ? [listElement("bullet-list", [listElement("list-item", [
          listElement("paragraph", [text(`Child ${i}`)]),
          listElement("ordered-list", [listElement("list-item", [listElement("paragraph", [text(`Grandchild ${i}`)])])], {"breditor/start": 4}),
        ])])] : []),
      ])), {"breditor/start": 7})]);
    const middle = Math.floor(Math.floor(items / 2) / 10) * 10;
    const block = [0, middle, 1, 0, 1, 0, 0];
    const offset = `Grandchild ${middle}`.length;
    const point = {kind: "text", textPath: [...block, 0], utf16Offset: offset + 1, affinity: "after"};
    for (const cursor of [0, 1]) {
      const value = checkpointV3Value(); value["formatVersion"] = 7;
      value["historyBase"]["document"]["root"] = root;
      value["historyBase"]["selection"] = null; value["historyBase"]["pendingFormats"] = null;
      value["currentRevision"] = cursor === 0 ? "3" : "4";
      value["historyCapacity"] = 20; value["cursor"] = cursor; value["openMergeGroup"] = null;
      value["entries"] = [{forwardOperations: [{kind: "nestedListTextSplice", block, start: offset, end: offset,
        expected: root, replacement: {runs: [{text: "X", formats}]}}],
        resultSelection: {kind: "range", anchor: point, focus: point}, resultPendingFormats: null}];
      expect(sessionCheckpointJsonMatchesDurableContract(JSON.stringify(value), typedContract)).not.toBeNull();
      value["entries"][0]["forwardOperations"][0]["replacement"]["runs"][0]["formats"] = [
        {type: "example/text-color", properties: {"example/rgb24": 16777216}},
      ];
      expect(sessionCheckpointJsonMatchesDurableContract(JSON.stringify(value), typedContract)).toBeNull();
    }
  });
});

describe("explicit flat-list Session V6 preflight", () => {
  const contract: WasmDurableJsonContract = { ...V3_CONTRACT, mode: "v6" };
  const accepts = (value: unknown) => sessionCheckpointJsonMatchesDurableContract(JSON.stringify(value), contract);
  it("admits all three list recipes with State V3 and Document V2, not an inferred mode", () => {
    const value = checkpointV6Value();
    expect(accepts(value)).not.toBeNull();
    for (const legacy of [V2_CONTRACT, V3_CONTRACT, V5_CONTRACT]) {
      expect(sessionCheckpointJsonMatchesDurableContract(JSON.stringify(value), legacy)).toBeNull();
    }
    const view = new FakeStringResult("value", JSON.stringify(value));
    expect(consumeWasmSessionCheckpoint(EXPECTED, view, [], contract).ok).toBe(true);
    expect(view.freeCalls).toBe(1);
    value["historyBase"]["formatVersion"] = 6;
    expect(accepts(value)).toBeNull();
  });

  it("retains older operations without admitting list guards to old text-block tags", () => {
    const old = checkpointV5Value(); old["formatVersion"] = 6;
    expect(accepts(old)).not.toBeNull();
    old["entries"][0]["forwardOperations"][0]["expected"] = checkpointV6Value()["entries"][0]["forwardOperations"][0]["expected"];
    expect(accepts(old)).toBeNull();
  });

  it.each([
    [0, "root span overflow", (op: Record<string, any>) => { op["start"] = 10_000; }],
    [0, "reframe content changed", (op: Record<string, any>) => { op["replacement"]["children"][0]["children"][0]["children"][0]["properties"]["breditor/level"] = 3; }],
    [0, "empty guard", (op: Record<string, any>) => { op["expected"]["children"] = []; }],
    [0, "extra field", (op: Record<string, any>) => { op["extra"] = 1; }],
    [1, "invalid path depth", (op: Record<string, any>) => { op["block"] = [0, 0]; }],
    [1, "nonzero block slot", (op: Record<string, any>) => { op["block"] = [0, 0, 1]; }],
    [1, "wrapper rather than block", (op: Record<string, any>) => { op["block"] = [0]; }],
    [1, "missing guarded item", (op: Record<string, any>) => { op["block"] = [0, 1, 0]; }],
    [1, "path index limit", (op: Record<string, any>) => { op["block"] = [10_000, 0, 0]; }],
    [1, "surrogate split", (op: Record<string, any>) => { op["start"] = 2; }],
    [1, "offset beyond text", (op: Record<string, any>) => { op["end"] = 4; }],
    [1, "backward offsets", (op: Record<string, any>) => { op["start"] = 3; op["end"] = 1; }],
    [1, "unsafe offset", (op: Record<string, any>) => { op["start"] = Number.MAX_SAFE_INTEGER + 1; }],
    [1, "multiple root guard", (op: Record<string, any>) => { op["expected"]["children"].push(structuredClone(op["expected"]["children"][0])); }],
    [1, "unknown format", (op: Record<string, any>) => { op["replacement"]["runs"][0]["formats"] = [{ type: "example/unknown", properties: {} }]; }],
    [2, "guard does not contain start", (op: Record<string, any>) => { op["guardStart"] = 1; }],
    [2, "missing end block", (op: Record<string, any>) => { op["end"]["block"] = [2]; }],
    [2, "backward block order", (op: Record<string, any>) => { [op["start"], op["end"]] = [op["end"], op["start"]]; }],
    [2, "inserting wrappers", (op: Record<string, any>) => { op["inserted"] = structuredClone(op["expected"]); }],
    [2, "empty layout", (op: Record<string, any>) => { op["layout"] = []; }],
    [2, "wrong layout count", (op: Record<string, any>) => { op["layout"] = [{ kind: "bullet", items: 2 }]; }],
    [2, "zero items", (op: Record<string, any>) => { op["layout"] = [{ kind: "bullet", items: 0 }]; }],
    [2, "too many items", (op: Record<string, any>) => { op["layout"] = [{ kind: "bullet", items: 10_001 }]; }],
    [2, "numbering overflow", (op: Record<string, any>) => { op["layout"] = [{ kind: "ordered", items: 2, start: 2_147_483_647 }]; }],
    [2, "missing ordered start", (op: Record<string, any>) => { op["layout"] = [{ kind: "ordered", items: 1 }]; }],
    [2, "bullet has start", (op: Record<string, any>) => { op["layout"] = [{ kind: "bullet", items: 1, start: 1 }]; }],
    [2, "block has extra", (op: Record<string, any>) => { op["layout"] = [{ kind: "block", items: 1 }]; }],
    [2, "unknown layout kind", (op: Record<string, any>) => { op["layout"] = [{ kind: "nested", items: 1 }]; }],
  ] as const)("rejects operation %i: %s", (index, _label, mutate) => {
    const value = checkpointV6Value(); mutate(value["entries"][index]["forwardOperations"][0]);
    expect(accepts(value)).toBeNull();
  });

  it("accepts bare/ordered layouts and shifted guards while retaining canonical object-key order", () => {
    for (const layout of [[{ kind: "block" }], [{ kind: "ordered", start: 2_147_483_647, items: 1 }]]) {
      const value = checkpointV6Value(); value["entries"][2]["forwardOperations"][0]["layout"] = layout;
      expect(accepts(value)).not.toBeNull();
    }
    const value = checkpointV6Value();
    const op = value["entries"][2]["forwardOperations"][0];
    op["guardStart"] = 4; op["start"]["block"][0] = 4; op["end"]["block"][0] = 5;
    // Static preflight intentionally does not claim these guards exist live.
    expect(accepts(value)).not.toBeNull();
    const reframe = value["entries"][0]["forwardOperations"][0];
    const block = reframe["replacement"]["children"][0]["children"][0]["children"][0];
    block["children"][0] = { formats: block["children"][0]["formats"], text: "A🙂", kind: "text" };
    expect(accepts(value)).toBeNull();
  });

  it("counts ordered starts and nested heading/format properties in retained lower bounds", () => {
    const retained = retainedPropertyBudgetCheckpoint(99);
    const value = retained.value;
    value["formatVersion"] = 6;
    const contract: WasmDurableJsonContract = { ...retained.contract, mode: "v6" } as WasmDurableJsonContract;
    const root = value["historyBase"]["document"]["root"];
    const block = root["children"][0];
    root["children"] = [listElement("bullet-list", [listElement("list-item", [block])])];
    expect(sessionCheckpointJsonMatchesDurableContract(JSON.stringify(value), contract)).not.toBeNull();
    root["children"][0]["type"] = "breditor/ordered-list";
    root["children"][0]["properties"] = { "breditor/start": 8 };
    expect(sessionCheckpointJsonMatchesDurableContract(JSON.stringify(value), contract)).toBeNull();
    root["children"][0]["type"] = "breditor/bullet-list"; root["children"][0]["properties"] = {};
    block["type"] = "breditor/heading"; block["properties"] = { "breditor/level": 2 };
    expect(sessionCheckpointJsonMatchesDurableContract(JSON.stringify(value), contract)).toBeNull();
    block["type"] = "breditor/paragraph"; block["properties"] = {};
    block["children"][0]["formats"] = value["historyBase"]["pendingFormats"];
    expect(sessionCheckpointJsonMatchesDurableContract(JSON.stringify(value), contract)).toBeNull();
  });

  it("rejects invalid redo topology, selections and result pending properties", () => {
    const value = checkpointV6Value(); value["cursor"] = 1; value["openMergeGroup"] = null;
    expect(accepts(value)).not.toBeNull();
    value["openMergeGroup"] = "example/typing";
    expect(accepts(value)).toBeNull();
    value["openMergeGroup"] = null;
    value["entries"][2]["resultSelection"]["focus"]["textPath"] = [-1];
    expect(accepts(value)).toBeNull();
    value["entries"][2]["resultSelection"] = null;
    value["entries"][2]["resultPendingFormats"] = [{ type: "example/link", properties: {} }];
    expect(accepts(value)).toBeNull();
  });
});

function listElement(type: string, children: unknown[], properties: Record<string, unknown> = {}): Record<string, any> {
  return { kind: "element", type: `breditor/${type}`, entityId: null, properties, children };
}

/** Static recipe fixture; live bidirectional replay is separately exercised with real Wasm. */
function checkpointV6Value(): Record<string, any> {
  const value = checkpointV3Value(); value["formatVersion"] = 6;
  const block = value["historyBase"]["document"]["root"]["children"][0];
  block["type"] = "breditor/heading"; block["properties"] = { "breditor/level": 2 };
  block["children"][0]["text"] = "A🙂";
  const ordered = listElement("ordered-list", [listElement("list-item", [block])], { "breditor/start": 8 });
  const bullet = listElement("bullet-list", [listElement("list-item", [structuredClone(block)])]);
  const tail = listElement("paragraph", [{ kind: "text", text: "B", formats: [] }]);
  const root = (...children: unknown[]) => listElement("document", children);
  value["historyBase"]["document"]["root"] = root(ordered, tail);
  const point = { kind: "text", textPath: [0, 0, 0, 0], utf16Offset: 1, affinity: "before" };
  const selection = { kind: "range", anchor: point, focus: { ...point } };
  value["historyBase"]["selection"] = selection;
  value["entries"] = [
    { kind: "flatListReframe", start: 0, expected: root(ordered), replacement: root(bullet) },
    { kind: "flatListTextSplice", block: [0, 0, 0], start: 1, end: 3, expected: root(bullet), replacement: { runs: [{ text: "z", formats: [] }] } },
    { kind: "flatListTextReplace", guardStart: 0, start: { block: [0, 0, 0], offset: 1 }, end: { block: [1], offset: 1 },
      expected: root(bullet, tail), inserted: root(listElement("paragraph", [{ kind: "text", text: "XY", formats: [] }])),
      layout: [{ kind: "bullet", items: 1 }] },
  ].map(operation => ({ forwardOperations: [operation], resultSelection: selection, resultPendingFormats: null }));
  value["cursor"] = 3; value["historyCapacity"] = 20; value["openMergeGroup"] = null;
  return value;
}

describe("explicit heading Session V5 preflight", () => {
  const accepts = (value: unknown) => sessionCheckpointJsonMatchesDurableContract(JSON.stringify(value), V5_CONTRACT);
  it("accepts State V3, Document V2 and each full-guard V5 operation without relabeling", () => {
    const value = checkpointV5Value();
    expect(accepts(value)).not.toBeNull();
    const view = new FakeStringResult("value", JSON.stringify(value));
    expect(consumeWasmSessionCheckpoint(EXPECTED, view, [], V5_CONTRACT).ok).toBe(true);
    expect(view.freeCalls).toBe(1);
    expect(sessionCheckpointJsonMatchesDurableContract(JSON.stringify(value), V3_CONTRACT)).toBeNull();
    expect(sessionCheckpointJsonMatchesDurableContract(checkpointV3Json(), V5_CONTRACT)).toBeNull();
  });

  it.each([
    ["session V3", (v: Record<string, any>) => { v["formatVersion"] = 3; }],
    ["State V5", (v: Record<string, any>) => { v["historyBase"]["formatVersion"] = 5; }],
    ["Document V5", (v: Record<string, any>) => { v["historyBase"]["document"]["formatVersion"] = 5; }],
    ["foreign fingerprint", (v: Record<string, any>) => { v["schemaFingerprint"] = `sha256:${"f".repeat(64)}`; }],
    ["invalid base rank", (v: Record<string, any>) => { v["historyBase"]["document"]["root"]["children"][0]["properties"]["breditor/level"] = 7; }],
    ["cursor beyond history", (v: Record<string, any>) => { v["cursor"] = 4; }],
  ] as const)("rejects %s", (_label, mutate) => {
    const value = checkpointV5Value(); mutate(value); expect(accepts(value)).toBeNull();
  });

  it.each([
    [0, "multiple splice guards", (op: Record<string, any>) => { op["expected"]["children"].push(op["expected"]["children"][0]); }],
    [0, "backward splice", (op: Record<string, any>) => { op["start"] = 2; }],
    [0, "unsafe offset", (op: Record<string, any>) => { op["end"] = Number.MAX_SAFE_INTEGER + 1; }],
    [0, "out-of-bounds block", (op: Record<string, any>) => { op["block"] = 10_000; }],
    [0, "invalid replacement format", (op: Record<string, any>) => { op["replacement"]["runs"][0]["formats"][0]["properties"]["example/enabled"] = "true"; }],
    [0, "nested guard", (op: Record<string, any>) => { op["expected"]["children"][0]["children"] = [{ kind: "element", type: "breditor/paragraph", entityId: null, properties: {}, children: [] }]; }],
    [1, "replacement count", (op: Record<string, any>) => { op["replacement"] = []; }],
    [1, "invalid replacement rank", (op: Record<string, any>) => { op["replacement"][0]["level"] = "4"; }],
    [1, "extra replacement key", (op: Record<string, any>) => { op["replacement"][0]["extra"] = true; }],
    [1, "overflowing kind span", (op: Record<string, any>) => { op["start"] = 4_294_967_295; }],
    [2, "mismatched range count", (op: Record<string, any>) => { op["end"]["block"] = 1; }],
    [2, "backward range", (op: Record<string, any>) => { op["start"]["offset"] = 2; }],
    [2, "empty replacement root", (op: Record<string, any>) => { op["replacement"]["children"] = []; }],
    [2, "foreign replacement node", (op: Record<string, any>) => { op["replacement"]["children"][0]["type"] = "example/unknown"; }],
  ] as const)("rejects operation %i %s", (index, _label, mutate) => {
    const value = checkpointV5Value();
    const operation = value["entries"][index]["forwardOperations"][0];
    mutate(operation);
    expect(accepts(value)).toBeNull();
  });

  it("rejects unknown payload fields/tags and duplicate or noncanonical JSON", () => {
    for (const index of [0, 1, 2]) {
      const value = checkpointV5Value();
      value["entries"][index]["forwardOperations"][0]["extra"] = true;
      expect(accepts(value)).toBeNull();
      delete value["entries"][index]["forwardOperations"][0]["extra"];
      value["entries"][index]["forwardOperations"][0]["kind"] = "unknown";
      expect(accepts(value)).toBeNull();
    }
    const json = JSON.stringify(checkpointV5Value());
    expect(sessionCheckpointJsonMatchesDurableContract(` ${json}`, V5_CONTRACT)).toBeNull();
    expect(sessionCheckpointJsonMatchesDurableContract(json.replace('"formatVersion":5', '"formatVersion":5,"formatVersion":5'), V5_CONTRACT)).toBeNull();
  });

  it("bounds the result span and counts heading ranks in retained property totals", () => {
    const value = checkpointV5Value();
    const operation = value["entries"][2]["forwardOperations"][0];
    operation["start"]["block"] = 9_999;
    operation["end"]["block"] = 9_999;
    expect(accepts(value)).not.toBeNull(); // Static shape only; Rust proves live indexes.
    operation["replacement"]["children"].push(structuredClone(operation["replacement"]["children"][0]));
    expect(accepts(value)).toBeNull();

    const retained = retainedPropertyBudgetCheckpoint(99);
    retained.value["formatVersion"] = 5;
    if (retained.contract.mode === "v1") throw new Error("expected compiled contract");
    const contract: WasmDurableJsonContract = { ...retained.contract, mode: "v5" };
    expect(sessionCheckpointJsonMatchesDurableContract(JSON.stringify(retained.value), contract)).not.toBeNull();
    const block = retained.value["historyBase"]["document"]["root"]["children"][0];
    block["type"] = "breditor/heading";
    block["properties"] = { "breditor/level": 2 };
    expect(sessionCheckpointJsonMatchesDurableContract(JSON.stringify(retained.value), contract)).toBeNull();
  });
});

function checkpointV5Value(): Record<string, any> {
  const value = checkpointV3Value();
  value["formatVersion"] = 5;
  const root = value["historyBase"]["document"]["root"];
  root["children"][0]["type"] = "breditor/heading";
  root["children"][0]["properties"] = { "breditor/level": 2 };
  const changed = structuredClone(root);
  changed["children"][0]["children"][0]["text"] = "B";
  const ranked = structuredClone(changed);
  ranked["children"][0]["properties"]["breditor/level"] = 4;
  const replacement = structuredClone(ranked);
  replacement["children"][0]["type"] = "breditor/paragraph";
  replacement["children"][0]["properties"] = {};
  const previous = value["entries"][0];
  value["entries"] = [
    { kind: "textBlockSplice", block: 0, start: 0, end: 1, expected: structuredClone(root),
      replacement: { runs: [{ text: "B", formats: changed["children"][0]["children"][0]["formats"] }] } },
    { kind: "textBlockKindChange", start: 0, expected: changed, replacement: [{ kind: "heading", level: 4 }] },
    { kind: "textBlockReplace", start: { block: 0, offset: 0 }, end: { block: 0, offset: 1 }, expected: ranked, replacement },
  ].map((operation) => ({ ...previous, forwardOperations: [operation] }));
  value["cursor"] = 3;
  return value;
}

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
  it.each(["free getter", "status", "error", "takeValue", "cleanup", "expected", "protected list"])(
    "rejects overlapping ownership when %s reenters the same result",
    (stage) => {
      let nested: ReturnType<typeof consumeWasmSessionCheckpoint> | undefined;
      let entered = false;
      const enter = () => {
        if (entered) return;
        entered = true;
        nested = consumeWasmSessionCheckpoint(EXPECTED, view);
      };
      const free = vi.fn(() => { if (stage === "cleanup") enter(); });
      const takeValue = vi.fn(() => {
        if (stage === "takeValue") enter();
        return checkpointJson();
      });
      const view: WasmSessionCheckpointStringResultView = {
        get status() { if (stage === "status") enter(); return "value" as const; },
        get error() { if (stage === "error") enter(); return undefined; },
        get free() { if (stage === "free getter") enter(); return free; },
        takeValue,
      };
      const expected = {
        get lineage() { if (stage === "expected") enter(); return EXPECTED.lineage; },
        revision: EXPECTED.revision,
      };
      const protectedHandles = new Proxy<unknown[]>([], {
        getOwnPropertyDescriptor(target, property) {
          if (stage === "protected list") enter();
          return Reflect.getOwnPropertyDescriptor(target, property);
        },
      });
      expect(consumeWasmSessionCheckpoint(expected, view, protectedHandles).ok).toBe(true);
      expect(nested).toMatchObject({ ok: false, error: { code: "session_checkpoint.invalid_wasm_view" } });
      expect(free).toHaveBeenCalledOnce();
      expect(takeValue).toHaveBeenCalledOnce();
    },
  );

  it.each(["free getter", "code", "cleanup"])("does not consume a shared error twice during %s reentry", (stage) => {
    let nested: ReturnType<typeof consumeWasmSessionCheckpoint> | undefined;
    let entered = false;
    const enter = () => {
      if (entered) return;
      entered = true;
      nested = consumeWasmSessionCheckpoint(EXPECTED, second);
    };
    const free = vi.fn(() => { if (stage === "cleanup") enter(); });
    const error: WasmSessionCheckpointErrorView = {
      get code() { if (stage === "code") enter(); return "codec.invalid_session_checkpoint"; },
      message: "checkpoint rejected",
      get free() { if (stage === "free getter") enter(); return free; },
    };
    const first = new FakeStringResult("error", undefined, error);
    const second = new FakeStringResult("error", undefined, error);
    expect(consumeWasmSessionCheckpoint(EXPECTED, first)).toMatchObject({
      ok: false, error: { kind: "core", code: error.code },
    });
    expect(nested).toMatchObject({ ok: false, error: { kind: "boundary" } });
    expect(free).toHaveBeenCalledOnce();
    expect(first.freeCalls).toBe(1);
    expect(second.freeCalls).toBe(1);
  });

  it("allows nested independent checkpoint results", () => {
    const second = new FakeStringResult("value", checkpointJson());
    const first = new FakeStringResult("value", checkpointJson());
    Object.defineProperty(first, "status", { get() {
      expect(consumeWasmSessionCheckpoint(EXPECTED, second).ok).toBe(true);
      return "value";
    } });
    // FakeStringResult.takeValue also reads status, so use a fixed method here.
    first.takeValue = () => checkpointJson();
    expect(consumeWasmSessionCheckpoint(EXPECTED, first).ok).toBe(true);
    expect(first.freeCalls).toBe(1);
    expect(second.freeCalls).toBe(1);
  });

  it("releases the guard when protected-handle capture rejects without taking ownership", () => {
    const view = new FakeStringResult("value", checkpointJson());
    const array = Proxy.revocable<unknown[]>([], {});
    array.revoke();
    expect(consumeWasmSessionCheckpoint(EXPECTED, view, array.proxy).ok).toBe(false);
    expect(view.freeCalls).toBe(0);
    expect(consumeWasmSessionCheckpoint(EXPECTED, view).ok).toBe(true);
    expect(view.freeCalls).toBe(1);
  });

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

  it("admits Session and Editor State V3 while retaining nested Document V2", () => {
    const json = checkpointV3Json();
    const parsed = JSON.parse(json) as Record<string, any>;
    expect(parsed["formatVersion"]).toBe(3);
    expect(parsed["historyBase"]["formatVersion"]).toBe(3);
    expect(parsed["historyBase"]["document"]["formatVersion"]).toBe(2);
    expect(sessionCheckpointJsonMatchesDurableContract(json, V3_CONTRACT)).toBe(
      new TextEncoder().encode(json).byteLength,
    );
    expect(sessionCheckpointJsonMatchesDurableContract(json, V2_CONTRACT)).toBeNull();
    expect(sessionCheckpointJsonMatchesDurableContract(checkpointV2Json(), V3_CONTRACT))
      .toBeNull();

    const view = new FakeStringResult("value", json);
    expect(consumeWasmSessionCheckpoint(EXPECTED, view, [], V3_CONTRACT)).toMatchObject({
      ok: true,
      checkpoint: { checkpointJson: json, snapshot: EXPECTED },
    });
    expect(view.freeCalls).toBe(1);
  });

  it("validates V3 properties in the document, pending formats, and operation recipes", () => {
    const optionalOmitted = checkpointV3Value();
    for (const properties of v3PropertyMaps(optionalOmitted)) {
      delete properties["example/priority"];
    }
    const optionalOmittedJson = JSON.stringify(optionalOmitted);
    expect(sessionCheckpointJsonMatchesDurableContract(optionalOmittedJson, V3_CONTRACT))
      .not.toBeNull();

    const mutations: readonly ((value: Record<string, any>) => void)[] = [
      (value) => {
        delete v3PropertyMaps(value)[0]?.["example/href"];
      },
      (value) => {
        const pending = v3PropertyMaps(value)[1];
        if (pending !== undefined) pending["example/enabled"] = "true";
      },
      (value) => {
        const operation = v3PropertyMaps(value)[2];
        if (operation !== undefined) operation["example/unknown"] = true;
      },
      (value) => {
        const operation = v3PropertyMaps(value)[3];
        if (operation !== undefined) operation["example/priority"] = 10;
      },
      (value) => {
        const resultPending = v3PropertyMaps(value).at(-1);
        if (resultPending !== undefined) resultPending["example/href"] = "💡💡💡💡";
      },
    ];
    for (const mutate of mutations) {
      const value = checkpointV3Value();
      mutate(value);
      expect(sessionCheckpointJsonMatchesDurableContract(
        JSON.stringify(value),
        V3_CONTRACT,
      )).toBeNull();
    }
  });

  it("rejects noncanonical V3 property order, duplicate keys, and contract order", () => {
    const outOfOrder = checkpointV3Value();
    const first = v3PropertyMaps(outOfOrder)[0];
    if (first === undefined) throw new Error("missing property fixture");
    replaceObject(first, {
      "example/href": "a",
      "example/enabled": true,
      "example/priority": 1,
    });
    expect(sessionCheckpointJsonMatchesDurableContract(
      JSON.stringify(outOfOrder),
      V3_CONTRACT,
    )).toBeNull();

    const valid = checkpointV3Json();
    const duplicate = valid.replace(
      '"example/enabled":true',
      '"example/enabled":true,"example/enabled":true',
    );
    expect(sessionCheckpointJsonMatchesDurableContract(duplicate, V3_CONTRACT)).toBeNull();

    const reversedContract: WasmDurableJsonContract = Object.freeze({
      mode: "v3",
      schema: V3_CONTRACT.schema,
      formats: Object.freeze([
        V3_CONTRACT.formats[0]!,
        Object.freeze({
          kind: "example/link",
          revision: 1,
          properties: Object.freeze([...V3_LINK_PROPERTIES].reverse()),
        }),
      ]),
    });
    expect(sessionCheckpointJsonMatchesDurableContract(valid, reversedContract)).toBeNull();
  });

  it("fails closed for every mixed V2/V3 layer and malformed V3 operation payload", () => {
    const mutations: readonly ((value: Record<string, any>) => void)[] = [
      (value) => { value["formatVersion"] = 2; },
      (value) => { value["historyBase"]["formatVersion"] = 2; },
      (value) => { value["historyBase"]["document"]["formatVersion"] = 3; },
      (value) => { value["entries"][0]["forwardOperations"] = []; },
      (value) => { value["entries"][0]["forwardOperations"][0]["extra"] = true; },
      (value) => { value["entries"][0]["forwardOperations"][0]["range"]["start"] = 2; },
      (value) => { value["historyCapacity"] = 0; },
      (value) => { value["cursor"] = 2; },
      (value) => { value["openMergeGroup"] = "example/group"; value["cursor"] = 0; },
    ];
    for (const mutate of mutations) {
      const value = checkpointV3Value();
      mutate(value);
      expect(sessionCheckpointJsonMatchesDurableContract(
        JSON.stringify(value),
        V3_CONTRACT,
      )).toBeNull();
    }

    // No generation retry occurs at capture time either.
    const v2View = new FakeStringResult("value", checkpointV2Json());
    expect(consumeWasmSessionCheckpoint(EXPECTED, v2View, [], V3_CONTRACT).ok)
      .toBe(false);
    expect(v2View.freeCalls).toBe(1);
  });

  it("enforces the exact V3 aggregate operation ceiling from the wire", () => {
    const exact = checkpointV3Value();
    const operation = {
      kind: "paragraphSplit",
      paragraphPath: [0],
      offset: 0,
      expected: { runs: [] },
    };
    const entry = (count: number): Record<string, unknown> => ({
      forwardOperations: Array.from({ length: count }, () => operation),
      resultSelection: null,
      resultPendingFormats: null,
    });
    exact["historyCapacity"] = 17;
    exact["cursor"] = 16;
    exact["entries"] = Array.from({ length: 16 }, () => entry(1_024));
    expect(sessionCheckpointJsonMatchesDurableContract(
      JSON.stringify(exact),
      V3_CONTRACT,
    )).not.toBeNull();

    exact["cursor"] = 17;
    exact["entries"].push(entry(1));
    expect(sessionCheckpointJsonMatchesDurableContract(
      JSON.stringify(exact),
      V3_CONTRACT,
    )).toBeNull();
  });

  it("bounds the provable retained-property lower bound across V3 boundaries", () => {
    const { contract, value } = retainedPropertyBudgetCheckpoint(99);
    expect(sessionCheckpointJsonMatchesDurableContract(
      JSON.stringify(value),
      contract,
    )).not.toBeNull();

    const baseRun = value["historyBase"]["document"]["root"]["children"][0]
      ["children"][0];
    baseRun["formats"] = [value["historyBase"]["pendingFormats"][0]];
    expect(sessionCheckpointJsonMatchesDurableContract(
      JSON.stringify(value),
      contract,
    )).toBeNull();
    baseRun["formats"] = [];

    value["cursor"] = 100;
    value["entries"].push(retainedPropertyBudgetEntry(
      value["historyBase"]["pendingFormats"],
    ));
    expect(sessionCheckpointJsonMatchesDurableContract(
      JSON.stringify(value),
      contract,
    )).toBeNull();
  });

  it("leaves semantic replay proof to the authoritative Rust restore", () => {
    const replayMismatch = checkpointV3Value();
    replayMismatch["entries"][0]["forwardOperations"][0]
      ["expectedRemoved"]["runs"][0]["text"] = "not-the-base-text";

    // This is canonical and structurally bounded, but its guard cannot replay
    // against the history base. Browser admission is intentionally a preflight;
    // the V3 Rust factory performs the authoritative forward/inverse proof.
    expect(sessionCheckpointJsonMatchesDurableContract(
      JSON.stringify(replayMismatch),
      V3_CONTRACT,
    )).not.toBeNull();
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

function checkpointV3Json(): string {
  return JSON.stringify(checkpointV3Value());
}

function checkpointV3Value(): Record<string, any> {
  const properties = (href: string): Record<string, unknown> => ({
    "example/enabled": true,
    "example/href": href,
    "example/priority": 1,
  });
  const format = (href: string): unknown => ({
    type: "example/link",
    properties: properties(href),
  });
  const run = (text: string, href: string): unknown => ({
    text,
    formats: [format(href)],
  });
  const selection = {
    kind: "range",
    anchor: {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: 1,
      affinity: "after",
    },
    focus: {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: 1,
      affinity: "after",
    },
  };
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
        children: [{ kind: "text", text: "A", formats: [format("a")] }],
      }],
    },
  };
  return {
    format: "breditor/session-checkpoint",
    formatVersion: 3,
    schema: { name: "example/rich-document", version: 3 },
    schemaFingerprint: PROFILE_FINGERPRINT,
    historyBase: {
      format: "breditor/editor-state",
      formatVersion: 3,
      schema: { name: "example/rich-document", version: 3 },
      schemaFingerprint: PROFILE_FINGERPRINT,
      snapshot: { lineage: EXPECTED.lineage, revision: "0" },
      document,
      selection,
      pendingFormats: [format("a")],
    },
    currentRevision: EXPECTED.revision,
    historyCapacity: 10,
    cursor: 1,
    entries: [{
      forwardOperations: [{
        kind: "textSplice",
        range: { containerPath: [0], start: 0, end: 1 },
        expectedRemoved: { runs: [run("A", "a")] },
        replacement: { runs: [run("B", "b")] },
      }],
      resultSelection: selection,
      resultPendingFormats: [format("b")],
    }],
    openMergeGroup: null,
  };
}

function v3PropertyMaps(value: Record<string, any>): Record<string, unknown>[] {
  return [
    value["historyBase"]["document"]["root"]["children"][0]["children"][0]
      ["formats"][0]["properties"],
    value["historyBase"]["pendingFormats"][0]["properties"],
    value["entries"][0]["forwardOperations"][0]["expectedRemoved"]["runs"][0]
      ["formats"][0]["properties"],
    value["entries"][0]["forwardOperations"][0]["replacement"]["runs"][0]
      ["formats"][0]["properties"],
    value["entries"][0]["resultPendingFormats"][0]["properties"],
  ];
}

function replaceObject(
  target: Record<string, unknown>,
  replacement: Record<string, unknown>,
): void {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, replacement);
}

function retainedPropertyBudgetCheckpoint(entryCount: number): {
  readonly contract: WasmDurableJsonContract;
  readonly value: Record<string, any>;
} {
  if (V3_CONTRACT.mode === "v1") {
    throw new Error("the V3 fixture lost its compiled schema binding");
  }
  const formats = Array.from({ length: 32 }, (_, formatIndex) => {
    const propertyCount = formatIndex === 31 ? 8 : 32;
    return Object.freeze({
      kind: formatIndex === 0
        ? "breditor/strong"
        : `example/format-${String(formatIndex).padStart(2, "0")}`,
      revision: 1,
      properties: Object.freeze(Array.from(
        { length: propertyCount },
        (_, propertyIndex) => Object.freeze({
          name: `example/property-${String(propertyIndex).padStart(2, "0")}`,
          presence: "required" as const,
          valueType: Object.freeze({ kind: "boolean" as const }),
        }),
      )),
    });
  });
  const contract: WasmDurableJsonContract = Object.freeze({
    mode: "v3",
    schema: V3_CONTRACT.schema,
    formats: Object.freeze(formats),
  });
  const pendingFormats = formats.map((format) => ({
    type: format.kind,
    properties: Object.fromEntries(
      format.properties.map((property) => [property.name, true]),
    ),
  }));
  const value = checkpointV3Value();
  value["historyBase"]["document"]["root"]["children"][0]["children"][0]
    ["formats"] = [];
  value["historyBase"]["pendingFormats"] = pendingFormats;
  value["historyCapacity"] = 100;
  value["cursor"] = entryCount;
  value["entries"] = Array.from(
    { length: entryCount },
    () => retainedPropertyBudgetEntry(pendingFormats),
  );
  return { contract, value };
}

function retainedPropertyBudgetEntry(
  pendingFormats: unknown,
): Record<string, unknown> {
  return {
    forwardOperations: [{
      kind: "paragraphSplit",
      paragraphPath: [0],
      offset: 0,
      expected: { runs: [] },
    }],
    resultSelection: null,
    resultPendingFormats: pendingFormats,
  };
}
