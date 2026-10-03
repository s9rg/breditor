import {
  BaseDocumentProjection,
  consumeSemanticSelection,
  type SemanticSelectionView,
  type WasmProfileGenerationView,
} from "@breditor/browser/advanced";
import { associateProjectionWithProfileGeneration } from "../../../packages/breditor-browser/dist/wasm_projection_adapter.js";

type Endpoint = "anchor" | "focus";

interface Fixture {
  readonly name: string;
  readonly value: unknown;
  readonly admitted: boolean;
}

/** Raw values stay in the browser realm, with no JSON or Wasm numeric transport. */
const fixtures: readonly Fixture[] = [
  { name: "+0", value: 0, admitted: true },
  { name: "-0", value: -0, admitted: true },
  { name: "one", value: 1, admitted: true },
  { name: "two", value: 2, admitted: true },
  { name: "2^31", value: 2_147_483_648, admitted: true },
  { name: "2^32 - 2", value: 4_294_967_294, admitted: true },
  { name: "2^32 - 1", value: 4_294_967_295, admitted: true },
  { name: "negative integer", value: -1, admitted: false },
  { name: "negative fraction", value: -0.5, admitted: false },
  { name: "small positive fraction", value: Number.MIN_VALUE, admitted: false },
  { name: "positive fraction", value: 0.5, admitted: false },
  { name: "fraction above one", value: 1.5, admitted: false },
  { name: "2^32 - 0.5", value: 4_294_967_295.5, admitted: false },
  { name: "2^32", value: 4_294_967_296, admitted: false },
  { name: "2^32 + 1", value: 4_294_967_297, admitted: false },
  { name: "max safe integer", value: Number.MAX_SAFE_INTEGER, admitted: false },
  { name: "NaN", value: NaN, admitted: false },
  { name: "+Infinity", value: Infinity, admitted: false },
  { name: "-Infinity", value: -Infinity, admitted: false },
  { name: "undefined", value: undefined, admitted: false },
  { name: "null", value: null, admitted: false },
  { name: "false", value: false, admitted: false },
  { name: "true", value: true, admitted: false },
  { name: "numeric string", value: "2", admitted: false },
  { name: "bigint", value: 2n, admitted: false },
  { name: "symbol", value: Symbol("coordinate"), admitted: false },
  { name: "boxed number", value: new Number(2), admitted: false },
  { name: "array", value: [2], admitted: false },
  { name: "object", value: { value: 2 }, admitted: false },
];

/**
 * The production adapter keeps isU32 private. Its observable handoff is the
 * point input it freezes after readPoint admits both offsets. Intercept only
 * that synchronous handoff, then restore Object.freeze before the next case.
 * This distinguishes 2^32 - 1 from 2^32 even though neither is a valid text
 * position in this small projection.
 */
export function probeProductionSelectionU32(cycles: number): {
  cycles: number;
  fixtures: number;
  checks: number;
} {
  if (!Number.isSafeInteger(cycles) || cycles < 1 || cycles > 2_000) {
    throw new Error("invalid oracle cycle count");
  }
  const generation: WasmProfileGenerationView = {
    matches(other) { return other === generation; },
    free() { throw new Error("caller-owned generation was freed"); },
  };
  const created = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "selection-u32-production-oracle", revision: "0" },
    paragraphs: [{ runs: [{ text: "Hello", strong: false }] }],
  });
  if (!created.ok) throw new Error(`oracle projection: ${created.error.code}`);
  const projection = created.value;
  associateProjectionWithProfileGeneration(projection, generation);

  let coercions = 0;
  const foreign: Fixture = {
    name: "throwing coercion",
    value: { [Symbol.toPrimitive]() { coercions++; throw new Error("coerced coordinate"); } },
    admitted: false,
  };
  let checks = 0;
  for (let cycle = 0; cycle < cycles; cycle++) {
    for (const fixture of [...fixtures, foreign]) {
      for (const endpoint of ["anchor", "focus"] as const) {
        let frees = 0;
        let anchorReads = 0;
        let focusReads = 0;
        const view = {
          snapshotLineage: "selection-u32-production-oracle",
          snapshotRevision: "0",
          kind: "range",
          anchorPointKind: "text",
          anchorNodeIndex: 2,
          get anchorOffset() { anchorReads++; return endpoint === "anchor" ? fixture.value : 1; },
          anchorAffinity: "before",
          focusPointKind: "text",
          focusNodeIndex: 2,
          get focusOffset() { focusReads++; return endpoint === "focus" ? fixture.value : 1; },
          focusAffinity: "after",
          rangeOrder: "collapsed",
          matchesProfileGeneration(other: WasmProfileGenerationView) { return other === generation; },
          free() { frees++; },
        } as unknown as SemanticSelectionView;
        const handoffs: { endpoint: Endpoint; offset: unknown }[] = [];
        const freeze = Object.freeze;
        Object.freeze = ((value: unknown) => {
          if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            const kind = Object.getOwnPropertyDescriptor(value, "kind");
            const path = Object.getOwnPropertyDescriptor(value, "textPath");
            const offset = Object.getOwnPropertyDescriptor(value, "utf16Offset");
            const affinity = Object.getOwnPropertyDescriptor(value, "affinity");
            if (kind?.value === "text" && Array.isArray(path?.value) &&
                offset !== undefined && (affinity?.value === "before" || affinity?.value === "after")) {
              const point = affinity.value === "before" ? "anchor" : "focus";
              // The selection constructor may freeze the same shape again.
              if (!handoffs.some(handoff => handoff.endpoint === point)) {
                handoffs.push({ endpoint: point, offset: offset.value });
              }
            }
          }
          return freeze(value);
        }) as typeof Object.freeze;
        let consumed;
        try {
          consumed = consumeSemanticSelection(projection, view, generation);
        } finally {
          Object.freeze = freeze;
        }
        const where = `cycle=${cycle} fixture=${fixture.name} endpoint=${endpoint}`;
        if (anchorReads !== 1 || focusReads !== 1) {
          throw new Error(`${where}: offsets were read ${anchorReads}/${focusReads} times`);
        }
        if (frees !== 1) throw new Error(`${where}: cleanup ran ${frees} times`);
        if (coercions !== 0) throw new Error(`${where}: foreign coordinate was coerced`);
        if (fixture.admitted) {
          if (handoffs.length !== 2 || handoffs[0]?.endpoint !== "anchor" ||
              handoffs[1]?.endpoint !== "focus") {
            throw new Error(`${where}: admitted offset did not reach both point-input handoffs`);
          }
          const actual = handoffs.find(handoff => handoff.endpoint === endpoint)?.offset;
          if (!Object.is(actual, fixture.value)) {
            throw new Error(`${where}: admitted offset changed at point-input handoff`);
          }
        } else if (handoffs.length !== 0 || consumed.ok) {
          throw new Error(`${where}: invalid offset passed selection admission`);
        }
        checks++;
      }
    }
  }
  return { cycles, fixtures: fixtures.length + 1, checks };
}
