import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = readFileSync(new URL("../../../crates/breditor-wasm/src/selection/token_input.rs", import.meta.url), "utf8");
const javascript = source.match(/inline_js = r#"([\s\S]*?)"#/u)?.[1];
if (!javascript) throw new Error("bounded token import missing");
const { breditorBoundedSelectionToken: read } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`) as {
  breditorBoundedSelectionToken(value: unknown): string | undefined;
};

it("bounds primitive input before copying and leaves classification to Rust", () => {
  for (const token of ["text", "children", "before", "after", "", "invalid!", "🙂🙂🙂🙂"]) {
    expect(read(token)).toBe(token);
  }
  for (const token of ["children!", "🙂🙂🙂🙂x", "x".repeat(1_048_576)]) expect(read(token)).toBeUndefined();
  expect(source).toContain("bounded_selection_token(value).as_string()");
});

it("rejects non-strings without getters, conversion hooks or proxy traps", () => {
  let calls = 0;
  const trapped = { get length() { calls++; throw new Error("length"); },
    [Symbol.toPrimitive]() { calls++; throw new Error("coercion"); } };
  const proxy = new Proxy({}, { get() { calls++; throw new Error("get"); } });
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const value of [undefined, null, false, 0, 8n, Symbol("text"), new String("text"), trapped, proxy, revoked.proxy]) {
    expect(read(value)).toBeUndefined();
  }
  expect(calls).toBe(0);
});
