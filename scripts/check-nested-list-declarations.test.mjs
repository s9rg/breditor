import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { experimental as flat } from "./check-flat-list-declarations.test.mjs";
import { checkNestedListDeclarations } from "./check-nested-list-declarations.mjs";

const base = await readFile(new URL("../crates/breditor-wasm/api/breditor_wasm.d.ts", import.meta.url), "utf8");
// Independent signatures: do not derive the fixture from the checker allowlist.
const nested = flat.replace("export class BreditorCompiledProfile {", `export class BreditorCompiledProfile {
    static fromBootstrapJsonV5(json: string): BreditorCompiledProfileResult;
    createEngineFromDocumentJsonV7(lineage: string, document_json: string, history_capacity: number): BreditorEngineResult;
    createEngineFromSessionCheckpointJsonV7(checkpoint_json: string): BreditorEngineResult;`)
  .replace("export interface InitOutput {", `export interface InitOutput {
    readonly breditorcompiledprofile_fromBootstrapJsonV5: (a: number, b: number) => number;
    readonly breditorcompiledprofile_createEngineFromDocumentJsonV7: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly breditorcompiledprofile_createEngineFromSessionCheckpointJsonV7: (a: number, b: number, c: number) => number;`);

test("accepts exactly the nested additive API", () => checkNestedListDeclarations(base, nested));
const reorderRaw = (source) => source.replace(/(export interface InitOutput \{\n)([\s\S]*?)(\n\})/u,
  (_, open, members, close) => open + members.split("\n").reverse().join("\n") + close);
test("accepts reordered raw exports without changing signatures", () => {
  assert.notEqual(reorderRaw(nested), nested);
  checkNestedListDeclarations(base, reorderRaw(nested));
});
test("rejects duplicate inherited raw export after reordering", () => {
  const duplicate = nested.replace("export interface InitOutput {",
    "export interface InitOutput {\n    readonly breditorWasmAbiVersion: (a: number) => void;");
  assert.throws(() => checkNestedListDeclarations(base, reorderRaw(duplicate)));
});
for (const [label, source] of [
  ["missing nested API", flat],
  ["wrong version", nested.replace("static fromBootstrapJsonV5", "static fromBootstrapJsonV7")],
  ["nonstatic compiler", nested.replace("static fromBootstrapJsonV5", "fromBootstrapJsonV5")],
  ["wrong argument", nested.replace("createEngineFromSessionCheckpointJsonV7(checkpoint_json: string)", "createEngineFromSessionCheckpointJsonV7(checkpoint_json: number)")],
  ["duplicate", nested.replace("export class BreditorCompiledProfile {", "export class BreditorCompiledProfile {\n    static fromBootstrapJsonV5(json: string): BreditorCompiledProfileResult;")],
  ["wrong owner", nested.replace("    static fromBootstrapJsonV5(json: string): BreditorCompiledProfileResult;", "").replace("export class BreditorProjection {", "export class BreditorProjection {\n    static fromBootstrapJsonV5(json: string): BreditorCompiledProfileResult;")],
  ["wrong raw ABI", nested.replace("breditorcompiledprofile_fromBootstrapJsonV5: (a: number, b: number)", "breditorcompiledprofile_fromBootstrapJsonV5: (a: number)")],
  ["changed inherited API", nested.replace("static fromBootstrapJsonV2(json: string)", "static fromBootstrapJsonV2(json: number)")],
  ["extra export", `${nested}\nexport const accidental: number;`],
]) test(`rejects nested ${label}`, () => assert.throws(() => checkNestedListDeclarations(base, source)));
