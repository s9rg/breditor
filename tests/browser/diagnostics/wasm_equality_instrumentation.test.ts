import { parseSync } from "rolldown/utils";
import { expect, it } from "vitest";
import { instrumentWasmEquality } from "./wasm_equality_instrumentation";
import { recordWasmEquality, readWasmEqualities } from "./wasm_equality_recorder";

const source = 'const imports={__wbg___wbindgen_jsval_eq_1234abcd:function(e,t){return H(e)===H(t)}};';
it("captures each lookup once and passes the original comparison result", () => {
  const output = instrumentWasmEquality(source, "/recorder.ts");
  expect(parseSync("test.js", output.code).errors).toEqual([]);
  expect(output.code.match(/H\(e\)/g)).toHaveLength(1);
  expect(output.code.match(/H\(t\)/g)).toHaveLength(1);
  expect(output.code).toContain("const __result=__left===__right;return __breditorWasmEquality(__result,__left,__right)");
  expect(output.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(() => instrumentWasmEquality("export {};", "/recorder.ts")).toThrow();
  expect(() => instrumentWasmEquality(source + source, "/recorder.ts")).toThrow();
});
it("keeps only sixteen sanitized equality results without recomputing them", () => {
  for (let i = 0; i < 20; i++) recordWasmEquality(false, "private document text", {});
  expect(recordWasmEquality(true, "children", "text")).toBe(true);
  const events = readWasmEqualities();
  expect(events).toHaveLength(16);
  expect(events[0]).toEqual({ left: { type: "string" }, right: { type: "object" }, result: false });
  expect(events.at(-1)).toEqual({ left: { type: "string", label: "children" }, right: { type: "string", label: "text" }, result: true });
  events.pop();
  expect(readWasmEqualities()).toHaveLength(16);
});

it("inline capture adds no recorder function call to the original import", () => {
  const output = instrumentWasmEquality(source, "/recorder.ts", "inline");
  expect(parseSync("test.js", output.code).errors).toEqual([]);
  expect(output.code).toContain("__breditorEqCursor=(__breditorEqCursor+1)%16;return __result");
  expect(output.code).not.toContain("__breditorWasmEquality");
  expect(output.code.match(/H\(e\)/g)).toHaveLength(1);
  expect(output.code.match(/H\(t\)/g)).toHaveLength(1);
});

it("inline history retains the last sixteen comparisons in order without changing returns", () => {
  const output = instrumentWasmEquality(source, "/recorder.ts", "inline").code;
  const executable = output.replace(/^import .*;\n/, "const __breditorSanitizeEq=values=>values;\n")
    .replace("export function", "function");
  let reads = 0;
  const fixture = new Function("H", executable +
    ";return {compare:imports.__wbg___wbindgen_jsval_eq_1234abcd,read:__breditorReadWasmEqualities};")(
    (value: number) => { reads++; return value; },
  ) as { compare(left: number, right: number): boolean; read(): unknown };
  expect(fixture.read()).toEqual([]);
  for (let i = 0; i < 20; i++) expect(fixture.compare(i, i + i % 2)).toBe(i % 2 === 0);
  expect(reads).toBe(40);
  expect(fixture.read()).toEqual(Array.from({ length: 16 }, (_, i) => {
    const value = i + 4;
    return [value, value + value % 2, value % 2 === 0];
  }));
});
