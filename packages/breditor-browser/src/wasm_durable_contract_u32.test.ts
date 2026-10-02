import { expect, it, vi } from "vitest";
import { resolveWasmDurableJsonContract, type WasmDurableJsonContract } from "./wasm_document_json.js";

/** Exercise both durable positive-u32 call sites, not a duplicate test predicate. */
function contract(field: "version" | "revision", value: unknown): WasmDurableJsonContract {
  return {
    mode: "v2",
    schema: { name: "example/document", version: field === "version" ? value : 1,
      fingerprint: `sha256:${"2".repeat(64)}` },
    formats: [{ kind: "example/link", revision: field === "revision" ? value : 1, properties: [] }],
  } as WasmDurableJsonContract;
}

for (const field of ["version", "revision"] as const) {
  it.each([1, 7, 2_147_483_647, 2_147_483_648, 4_294_967_295])(`admits exact ${field} %s without truncation`, value => {
    const resolved = resolveWasmDurableJsonContract(contract(field, value));
    expect(resolved).not.toBeNull();
    expect(field === "version" ? resolved!.schema.version : resolved!.formatsByKind.get("example/link")!.revision).toBe(value);
  });

  it.each([0, -0, -1, 0.5, 1.5, 4_294_967_295.5, 4_294_967_296, 4_294_967_297,
    Number.MIN_VALUE, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER, NaN, Infinity, -Infinity,
    undefined, null, true, false, "7", 7n, Symbol("7"), new Number(7), {}, []].map(value => ({ value })))(`rejects malformed ${field} %#`, ({ value }) => {
    expect(resolveWasmDurableJsonContract(contract(field, value))).toBeNull();
  });

  it(`never coerces foreign ${field} values`, () => {
    const access = vi.fn(() => { throw new Error("must not coerce"); });
    const foreign = new Proxy({}, { get: access });
    expect(resolveWasmDurableJsonContract(contract(field, foreign))).toBeNull();
    expect(access).not.toHaveBeenCalled();
  });
}
