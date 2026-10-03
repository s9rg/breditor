import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = readFileSync(new URL("../../../crates/breditor-wasm/src/selection/token_code.rs", import.meta.url), "utf8");
const javascript = source.match(/inline_js = r#"([\s\S]*?)"#/u)?.[1];
if (!javascript) throw new Error("token code import missing");
const { breditorSelectionTokenCode: read } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`) as {
  breditorSelectionTokenCode(value: unknown): number;
};

it("maps only exact primitive tokens to private numeric codes", () => {
  for (const [token, code] of [["text", 1], ["children", 2], ["before", 3], ["after", 4]] as const) {
    expect(read(token)).toBe(code);
    expect(typeof read(token)).toBe("number");
    expect(source).toContain(`const ${token.toUpperCase()}: u32 = ${code};`);
    for (const invalid of [token.toUpperCase(), ` ${token}`, `${token}\0`, `${token}x`, new String(token), code]) {
      expect(read(invalid)).toBe(0);
    }
  }
  for (const invalid of ["", "\ud800", "x".repeat(16_777_216), null, undefined, true, 0n, Symbol("text")]) {
    expect(read(invalid)).toBe(0);
  }
});

it("enables codes in production but explicitly opts diagnostic builds out", () => {
  const cargo = readFileSync(new URL("../../../crates/breditor-wasm/Cargo.toml", import.meta.url), "utf8");
  expect(cargo).toContain('default = ["selection-token-codes"]');
  const script = readFileSync(new URL("../../../scripts/build-selection-input-diagnostic.sh", import.meta.url), "utf8");
  expect(script).toContain("--no-default-features");
  expect(script).toContain('task_features+=",selection-token-codes"');
});

it("does not access properties or invoke conversion hooks", () => {
  let calls = 0;
  const object = { get length() { calls++; throw new Error("length"); },
    [Symbol.toPrimitive]() { calls++; throw new Error("conversion"); } };
  const proxy = new Proxy({}, { get() { calls++; throw new Error("get"); } });
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const value of [object, proxy, revoked.proxy]) expect(read(value)).toBe(0);
  expect(calls).toBe(0);
  expect(source).not.toContain(".as_string()");
});
