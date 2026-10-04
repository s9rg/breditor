import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkFlatListDeclarations } from "./check-flat-list-declarations.mjs";

const base = await readFile(new URL("../crates/breditor-wasm/api/breditor_wasm.d.ts", import.meta.url), "utf8");
// Independent fixture: the exact eighteen additions currently authorized for the
// experimental build. Keep these explicit rather than importing the allowlist.
const experimental = base
  .replace("export class BreditorCompiledProfile {", `export class BreditorCompiledProfile {
    static fromBootstrapJsonV4(json: string): BreditorCompiledProfileResult;
    createEngineFromDocumentJsonV6(lineage: string, document_json: string, history_capacity: number): BreditorEngineResult;
    createEngineFromSessionCheckpointJsonV6(checkpoint_json: string): BreditorEngineResult;
    static fromBootstrapJsonV3(json: string): BreditorCompiledProfileResult;
    createEngineFromDocumentJsonV5(lineage: string, document_json: string, history_capacity: number): BreditorEngineResult;
    createEngineFromSessionCheckpointJsonV5(checkpoint_json: string): BreditorEngineResult;`)
  .replace("export class BreditorProjection {", "export class BreditorProjection {\n    listKind(index: number): 'bullet' | 'ordered' | undefined;\n    orderedListStart(index: number): number | undefined;\n    headingLevel(index: number): number | undefined;")
  .replace("export interface InitOutput {", `export interface InitOutput {
    readonly breditorcompiledprofile_createEngineFromDocumentJsonV6: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly breditorcompiledprofile_createEngineFromSessionCheckpointJsonV6: (a: number, b: number, c: number) => number;
    readonly breditorcompiledprofile_fromBootstrapJsonV4: (a: number, b: number) => number;
    readonly breditorprojection_listKind: (a: number, b: number) => number;
    readonly breditorprojection_orderedListStart: (a: number, b: number) => number;
    readonly breditorcompiledprofile_createEngineFromDocumentJsonV5: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly breditorcompiledprofile_createEngineFromSessionCheckpointJsonV5: (a: number, b: number, c: number) => number;
    readonly breditorcompiledprofile_fromBootstrapJsonV3: (a: number, b: number) => number;
    readonly breditorprojection_headingLevel: (a: number, b: number) => number;`);

test("accepts exactly the reviewed additive flat-list surface", () => {
  checkFlatListDeclarations(base, experimental);
  checkFlatListDeclarations(base, `/** extra documentation */\n${experimental}`);
});
for (const [label, source] of [
  ["missing feature", base],
  ["wrong list kind", experimental.replace("listKind(index: number): 'bullet' | 'ordered' | undefined", "listKind(index: number): string")],
  ["missing ordinal absence", experimental.replace("orderedListStart(index: number): number | undefined", "orderedListStart(index: number): number")],
  ["wrong list factory version", experimental.replace("static fromBootstrapJsonV4", "static fromBootstrapJsonV6")],
  ["wrong rank return", experimental.replace("headingLevel(index: number): number | undefined", "headingLevel(index: number): number")],
  ["wrong static factory", experimental.replace("static fromBootstrapJsonV3", "fromBootstrapJsonV3")],
  ["extra method", experimental.replace("export class BreditorProjection {", "export class BreditorProjection {\n    surprising(): void;")],
  ["changed legacy API", experimental.replace("static fromBootstrapJsonV2(json: string)", "static fromBootstrapJsonV2(json: number)")],
  ["changed low-level ABI", experimental.replace("breditorprojection_headingLevel: (a: number, b: number) => number", "breditorprojection_headingLevel: (a: number) => number")],
  ["duplicate method", experimental.replace("export class BreditorProjection {", "export class BreditorProjection {\n    headingLevel(index: number): number | undefined;")],
  ["wrong method owner", experimental.replace("    headingLevel(index: number): number | undefined;", "").replace("export class BreditorCompiledProfile {", "export class BreditorCompiledProfile {\n    headingLevel(index: number): number | undefined;")],
  ["extra export", `${experimental}\nexport const accidental: number;`],
  ["invalid syntax", `${experimental}\nexport class {`],
]) {
  test(`rejects ${label}`, () => assert.throws(() => checkFlatListDeclarations(base, source)));
}
