import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkHeadingDeclarations } from "./check-heading-declarations.mjs";

const base = await readFile(new URL("../crates/breditor-wasm/api/breditor_wasm.d.ts", import.meta.url), "utf8");
// Independent fixture: the exact eight additions currently authorized for the
// experimental build. Keep these explicit rather than importing the allowlist.
const experimental = base
  .replace("export class BreditorCompiledProfile {", `export class BreditorCompiledProfile {
    static fromBootstrapJsonV3(json: string): BreditorCompiledProfileResult;
    createEngineFromDocumentJsonV5(lineage: string, document_json: string, history_capacity: number): BreditorEngineResult;
    createEngineFromSessionCheckpointJsonV5(checkpoint_json: string): BreditorEngineResult;`)
  .replace("export class BreditorProjection {", "export class BreditorProjection {\n    headingLevel(index: number): number | undefined;")
  .replace("export interface InitOutput {", `export interface InitOutput {
    readonly breditorcompiledprofile_createEngineFromDocumentJsonV5: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly breditorcompiledprofile_createEngineFromSessionCheckpointJsonV5: (a: number, b: number, c: number) => number;
    readonly breditorcompiledprofile_fromBootstrapJsonV3: (a: number, b: number) => number;
    readonly breditorprojection_headingLevel: (a: number, b: number) => number;`);

test("accepts exactly the reviewed additive heading surface", () => {
  checkHeadingDeclarations(base, experimental);
  checkHeadingDeclarations(base, `/** extra documentation */\n${experimental}`);
});
for (const [label, source] of [
  ["missing feature", base],
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
  test(`rejects ${label}`, () => assert.throws(() => checkHeadingDeclarations(base, source)));
}
