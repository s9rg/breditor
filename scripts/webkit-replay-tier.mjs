import assert from "node:assert/strict";

/** Process-local diagnostic only; no OS settings or production artifact changes.
 * WebKit documents JSC_<option> environment overrides in OptionsList.h:
 * https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/OptionsList.h
 * These disable JS optimizing tiers, not the separately named Wasm JIT tiers.
 */
export function webkitReplayTier(environment) {
  const mode = environment.BREDITOR_REPLAY_JSC_TIER ?? "default";
  assert.ok(["default", "no-ftl", "no-dfg"].includes(mode), "invalid replay JavaScript tier mode");
  for (const name of Object.keys(environment)) {
    assert.ok(!name.startsWith("JSC_") && !name.startsWith("__XPC_JSC_"), `unrecorded inherited override: ${name}`);
  }
  const overrides = {};
  if (mode !== "default") {
    // Match the existing macOS WebKit probes: forward into XPC content processes
    // as well as the launcher. Dump only modified options for observable evidence.
    for (const prefix of ["JSC_", "__XPC_JSC_"]) {
      overrides[prefix + "useFTLJIT"] = "false";
      overrides[prefix + "dumpOptions"] = "1";
      if (mode === "no-dfg") overrides[prefix + "useDFGJIT"] = "false";
    }
  }
  return {mode, overrides, browserEnvironment: {...environment, ...overrides}};
}
