import { parseSync } from "rolldown/utils";
import { expect, it } from "vitest";
import { instrumentWasmFormatCount } from "./wasm_format_count_instrumentation";

const source = 'class Projection {formatCount(e){let t=$.breditorprojection_formatCount(this.__wbg_ptr,e);return t===2**53-1?void 0:t}}';
it("records original count and decoder output without repeating either read", () => {
  const output = instrumentWasmFormatCount(source);
  expect(parseSync("test.js", output).errors).toEqual([]);
  expect(output.match(/\.breditorprojection_formatCount\(/g)).toHaveLength(1);
  expect(output.match(/===2\*\*53-1/g)).toHaveLength(1);
  let calls = 0;
  const fixture = new Function("$", output.replace("export function", "function") +
    ";return {projection:new Projection(),read:__breditorReadFormatCounts};")({
      breditorprojection_formatCount: (_pointer: unknown, index: number) => { calls++; return index === 0 ? 0 : 2 ** 53 - 1; },
    }) as { projection: { formatCount(index: number): number | undefined }; read(): unknown };
  expect(fixture.projection.formatCount(0)).toBe(0);
  expect(fixture.projection.formatCount(1)).toBeUndefined();
  expect(calls).toBe(2);
  expect(fixture.read()).toEqual([{ index: 0, raw: 0, decodedType: "number", decoded: 0 },
    { index: 1, raw: 2 ** 53 - 1, decodedType: "undefined", decoded: undefined }]);
  expect(() => instrumentWasmFormatCount("export {};" )).toThrow();
  expect(() => instrumentWasmFormatCount(source + source)).toThrow();
});
