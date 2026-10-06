import assert from "node:assert/strict";
import { checkFlatListDeclarations } from "./check-flat-list-declarations.mjs";

/** Nested builds add exactly three profile methods and their raw exports. */
export function checkNestedListDeclarations(base, nested) {
  const additions = new Map([
    ["BreditorCompiledProfile", new Set([
      "createEngineFromDocumentJsonV7(lineage: string, document_json: string, history_capacity: number): BreditorEngineResult;",
      "createEngineFromSessionCheckpointJsonV7(checkpoint_json: string): BreditorEngineResult;",
      "static fromBootstrapJsonV5(json: string): BreditorCompiledProfileResult;",
    ])],
    ["InitOutput", new Set([
      "readonly breditorcompiledprofile_createEngineFromDocumentJsonV7: (a: number, b: number, c: number, d: number, e: number, f: number) => number;",
      "readonly breditorcompiledprofile_createEngineFromSessionCheckpointJsonV7: (a: number, b: number, c: number) => number;",
      "readonly breditorcompiledprofile_fromBootstrapJsonV5: (a: number, b: number) => number;",
    ])],
  ]);
  let owner;
  const flat = nested.split(/\r?\n/).filter(line => {
    const declaration = /^export (?:class|interface) (\w+) \{$/.exec(line.trim());
    if (declaration) owner = declaration[1];
    if (line.trim() === "}") owner = undefined;
    return !additions.get(owner)?.delete(line.trim());
  }).join("\n");
  for (const [name, expected] of additions) assert.equal(expected.size, 0, `missing nested API on ${name}`);
  checkFlatListDeclarations(base, flat);
}
