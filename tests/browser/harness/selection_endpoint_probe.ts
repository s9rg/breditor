import { BaseDocumentProjection, consumeSemanticSelection, semanticRangeSelectionScalars,
  type SemanticSelectionView, type WasmProfileGenerationView } from "@breditor/browser/advanced";
import { associateProjectionWithProfileGeneration } from "../../../packages/breditor-browser/dist/wasm_projection_adapter.js";

/** Diagnostic control: the real selection consumer, but no Rust/Wasm or DOM.
 * Numeric getters load binary64 values, including zero, from a typed array.
 * This intentionally bypasses profile bootstrap to isolate endpoint admission.
 */
export async function probeJavaScriptSelectionEndpoints(iterations: number) {
  const generation: WasmProfileGenerationView = {
    matches(other) { return other === generation; },
    free() { throw new Error("caller-owned generation was freed"); },
  };
  const created = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "endpoint-js-control", revision: "0" },
    paragraphs: [{ runs: [{ text: "Hello 🙂 world", strong: false }] }],
  });
  if (!created.ok) throw new Error("endpoint control projection rejected");
  const projection = created.value;
  associateProjectionWithProfileGeneration(projection, generation);
  const cases = [[0, 14, "forward"], [14, 0, "backward"], [0, 0, "collapsed"], [14, 14, "collapsed"]] as const;
  let numericReads = 0;
  let frees = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const [anchor, focus, order] = cases[iteration % cases.length]!;
    const values = new Float64Array([2, anchor, focus]);
    const view: SemanticSelectionView = {
      snapshotLineage: "endpoint-js-control", snapshotRevision: "0", kind: "range",
      anchorPointKind: "text", focusPointKind: "text",
      get anchorNodeIndex() { numericReads++; return values[0]!; },
      get focusNodeIndex() { numericReads++; return values[0]!; },
      get anchorOffset() { numericReads++; return values[1]!; },
      get focusOffset() { numericReads++; return values[2]!; },
      anchorAffinity: "before", focusAffinity: "after", rangeOrder: order,
      matchesProfileGeneration(other) { return other === generation; },
      free() { frees++; },
    };
    const consumed = consumeSemanticSelection(projection, view, generation);
    if (!consumed.ok) throw new Error(`JS endpoint rejected at ${iteration}: ${consumed.error.code}`);
    if (consumed.value === null) throw new Error(`JS endpoint absent at ${iteration}`);
    const scalars = semanticRangeSelectionScalars(consumed.value);
    if (!scalars.ok || scalars.value.anchorNodeIndex !== 2 || scalars.value.focusNodeIndex !== 2 ||
        scalars.value.anchorOffset !== anchor || scalars.value.focusOffset !== focus || consumed.value.order !== order) {
      throw new Error(`JS endpoint coordinates differ at ${iteration}`);
    }
    if (numericReads !== (iteration + 1) * 4 || frees !== iteration + 1) throw new Error("endpoint read/cleanup count differs");
    if (iteration % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { iterations, numericReads, frees };
}
