// The experimental API is an explicit additive delta, never a replacement for
// the reviewed shipping declaration. Comments are ignored; all signatures and
// top-level declarations must otherwise remain identical.
import assert from "node:assert/strict";

const additions = {
  BreditorCompiledProfile: [
    "createEngineFromDocumentJsonV5(lineage: string, document_json: string, history_capacity: number): BreditorEngineResult;",
    "createEngineFromSessionCheckpointJsonV5(checkpoint_json: string): BreditorEngineResult;",
    "static fromBootstrapJsonV3(json: string): BreditorCompiledProfileResult;",
  ],
  BreditorProjection: ["headingLevel(index: number): number | undefined;"],
  InitOutput: [
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

/** Fails on missing/extra experimental APIs, signature drift, or legacy changes. */
export function checkHeadingDeclarations(baseSource, experimentalSource) {
  const expected = new Map(Object.entries(additions).map(([name, members]) => [name, new Set(members)]));
  let owner;
  const actual = lines(experimentalSource).filter((line) => {
    const declaration = /^export (?:class|interface) (\w+) \{$/.exec(line);
    if (declaration) owner = declaration[1];
    if (line === "}") owner = undefined;
    return !expected.get(owner)?.delete(line);
  });
  for (const [name, members] of expected) assert.equal(members.size, 0, `missing or changed experimental API on ${name}`);
  assert.deepEqual(actual, lines(baseSource),
    "experimental API changed the reviewed shipping surface");
}
