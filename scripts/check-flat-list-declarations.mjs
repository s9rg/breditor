// The experimental API is an explicit additive delta, never a replacement for
// the reviewed shipping declaration. Comments are ignored; all signatures and
// top-level declarations must otherwise remain identical.
import assert from "node:assert/strict";

const additions = {
  BreditorCompiledProfile: [
    "createEngineFromDocumentJsonV6(lineage: string, document_json: string, history_capacity: number): BreditorEngineResult;",
    "createEngineFromSessionCheckpointJsonV6(checkpoint_json: string): BreditorEngineResult;",
    "static fromBootstrapJsonV4(json: string): BreditorCompiledProfileResult;",
    "createEngineFromDocumentJsonV5(lineage: string, document_json: string, history_capacity: number): BreditorEngineResult;",
    "createEngineFromSessionCheckpointJsonV5(checkpoint_json: string): BreditorEngineResult;",
    "static fromBootstrapJsonV3(json: string): BreditorCompiledProfileResult;",
  ],
  BreditorProjection: ["listKind(index: number): 'bullet' | 'ordered' | undefined;", "orderedListStart(index: number): number | undefined;","headingLevel(index: number): number | undefined;"],
  InitOutput: [
    "readonly breditorcompiledprofile_createEngineFromDocumentJsonV6: (a: number, b: number, c: number, d: number, e: number, f: number) => number;",
    "readonly breditorcompiledprofile_createEngineFromSessionCheckpointJsonV6: (a: number, b: number, c: number) => number;",
    "readonly breditorcompiledprofile_fromBootstrapJsonV4: (a: number, b: number) => number;",
    "readonly breditorprojection_listKind: (a: number, b: number) => number;",
    "readonly breditorprojection_orderedListStart: (a: number, b: number) => number;",
    "readonly breditorcompiledprofile_createEngineFromDocumentJsonV5: (a: number, b: number, c: number, d: number, e: number, f: number) => number;",
    "readonly breditorcompiledprofile_createEngineFromSessionCheckpointJsonV5: (a: number, b: number, c: number) => number;",
    "readonly breditorcompiledprofile_fromBootstrapJsonV3: (a: number, b: number) => number;",
    "readonly breditorprojection_headingLevel: (a: number, b: number) => number;",
  ],
};
// wasm-bindgen emits one declaration per line and standalone JSDoc blocks.
// Compare that deterministic output, not a permissive TypeScript rewrite.
const lines = (source) => source.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*$/gm, "")
  .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

// LLVM can reorder equivalent Wasm exports between optimization profiles.
// Interface member order is not ABI; retain every full signature (including
// duplicates) and normalize only this generated raw-export interface.
const canonicalExportOrder = (sourceLines) => {
  const result = [...sourceLines];
  const start = result.indexOf("export interface InitOutput {");
  if (start < 0) return result;
  const end = result.indexOf("}", start + 1);
  if (end < 0) return result;
  result.splice(start + 1, end - start - 1,
    ...result.slice(start + 1, end).sort());
  return result;
};

/** Fails on missing/extra experimental APIs, signature drift, or legacy changes. */
export function checkFlatListDeclarations(baseSource, experimentalSource) {
  const expected = new Map(Object.entries(additions).map(([name, members]) => [name, new Set(members)]));
  let owner;
  const actual = lines(experimentalSource).filter((line) => {
    const declaration = /^export (?:class|interface) (\w+) \{$/.exec(line);
    if (declaration) owner = declaration[1];
    if (line === "}") owner = undefined;
    return !expected.get(owner)?.delete(line);
  });
  for (const [name, members] of expected) assert.equal(members.size, 0, `missing or changed experimental API on ${name}`);
  assert.deepEqual(canonicalExportOrder(actual), canonicalExportOrder(lines(baseSource)),
    "experimental API changed the reviewed shipping surface");
}
