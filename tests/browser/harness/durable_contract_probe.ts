import { resolveWasmDurableJsonContract, type WasmDurableJsonContract } from "../../../packages/breditor-browser/dist/wasm_document_json.js";

/** Pure-JavaScript control for the exact resolver used by document export.
 * Synthetic profile metadata only: no document, engine, Wasm or DOM editing.
 */
export async function probeDurableContracts(iterations: number) {
  const numeric = new Float64Array([1, 7, 2048]);
  const make = (typed: boolean): WasmDurableJsonContract => ({
    mode: "v3",
    schema: { name: "example/editor", version: typed ? numeric[0]! : 1, fingerprint: `sha256:${"0".repeat(64)}` },
    formats: [
      { kind: "breditor/strong", revision: typed ? numeric[0]! : 1, properties: [] },
      { kind: "example/highlight", revision: typed ? numeric[1]! : 7, properties: [] },
      { kind: "example/link", revision: typed ? numeric[0]! : 1, properties: [
        { name: "example/href", presence: "required", valueType: { kind: "string", minimumUtf8Bytes: typed ? numeric[0]! : 1, maximumUtf8Bytes: typed ? numeric[2]! : 2048 } },
        { name: "example/open-in-new-window", presence: "required", valueType: { kind: "boolean" } },
      ] },
    ],
  });
  const contracts = [make(false), make(true), JSON.parse(JSON.stringify(make(false))) as WasmDurableJsonContract];
  const before = JSON.stringify(contracts);
  let reads = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    for (const contract of contracts) {
      const resolved = resolveWasmDurableJsonContract(contract);
      if (resolved === null) throw new Error(`durable contract rejected at ${iteration}/${reads % 3}`);
      const link = resolved.formatsByKind.get("example/link");
      if (resolved.formatsByKind.size !== 3 || link?.revision !== 1 || link.properties.length !== 2 ||
          JSON.stringify(link.properties) !== JSON.stringify(contract.mode === "v1" ? [] : contract.formats[2]!.properties)) {
        throw new Error(`durable contract differs at ${iteration}/${reads % 3}`);
      }
      reads++;
    }
    if (iteration % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (JSON.stringify(contracts) !== before) throw new Error("durable contract inputs mutated");
  return { iterations, reads };
}
