import { expect, it } from "vitest";
import { jscTierEnvironment } from "./jsc_tier_control";

it("isolates inherited JSC flags without changing unrelated environment", () => {
  const inherited = { PATH: "/test", JSC_useJIT: "false", __XPC_JSC_useDFGJIT: "false", absent: undefined };
  const result = jscTierEnvironment("normal", inherited);
  expect(result).toEqual({ PATH: "/test", JSC_dumpOptions: "1", __XPC_JSC_dumpOptions: "1", JSC_useJIT: "true", __XPC_JSC_useJIT: "true" });
  expect(inherited.JSC_useJIT).toBe("false");
});
it("selectively disables tiers, with matching XPC flags", () => {
  expect(jscTierEnvironment("baseline", {})).toMatchObject({ JSC_useJIT: "true", JSC_useDFGJIT: "false", __XPC_JSC_useDFGJIT: "false", JSC_useFTLJIT: "false" });
  expect(jscTierEnvironment("no-ftl", {})).not.toHaveProperty("JSC_useDFGJIT");
  expect(jscTierEnvironment("no-jit", {})).toMatchObject({ JSC_useJIT: "false", __XPC_JSC_useJIT: "false" });
});
it("rejects unknown modes", () => { expect(() => jscTierEnvironment("typo", {})).toThrow("Unknown"); });
it("only enables compilation logging explicitly, with matching XPC flags", () => {
  expect(jscTierEnvironment("no-jit", {}, true)).toMatchObject({ JSC_useJIT: "false", JSC_logJIT: "true", __XPC_JSC_logJIT: "true" });
  expect(jscTierEnvironment("normal", { JSC_logJIT: "true" })).not.toHaveProperty("JSC_logJIT");
});
