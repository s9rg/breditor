import assert from "node:assert/strict";
import test from "node:test";
import {webkitReplayTier} from "./webkit-replay-tier.mjs";

test("WebKit replay options are explicit, process-local and do not disable Wasm tiers", () => {
  const original = Object.freeze({PATH: "/bin"});
  assert.deepEqual(webkitReplayTier(original), {mode: "default", overrides: {}, browserEnvironment: {PATH: "/bin"}});
  for (const mode of ["no-ftl", "no-dfg"]) {
    const input = Object.freeze({...original, BREDITOR_REPLAY_JSC_TIER: mode});
    const value = webkitReplayTier(input);
    assert.equal(value.mode, mode);
    assert.equal(value.browserEnvironment.JSC_useFTLJIT, "false");
    assert.equal(value.browserEnvironment.__XPC_JSC_useFTLJIT, "false");
    assert.equal(value.browserEnvironment.JSC_dumpOptions, "1");
    assert.equal(value.browserEnvironment.__XPC_JSC_dumpOptions, "1");
    assert.equal(value.browserEnvironment.JSC_useDFGJIT, mode === "no-dfg" ? "false" : undefined);
    assert.equal(value.browserEnvironment.JSC_useJIT, undefined);
    assert.equal(input.JSC_useFTLJIT, undefined);
    assert.ok(Object.keys(value.overrides).every(key => /^(?:JSC_|__XPC_JSC_)(?:useFTLJIT|useDFGJIT|dumpOptions)$/.test(key)));
  }
});

test("replay rejects invalid modes and hidden inherited tier overrides", () => {
  assert.throws(() => webkitReplayTier({BREDITOR_WEBKIT_JS_TIER: "no-dfg"}), /use BREDITOR_REPLAY_JSC_TIER/);
  for (const mode of ["", "off", "NO-FTL", "no-wasm"]) {
    assert.throws(() => webkitReplayTier({BREDITOR_REPLAY_JSC_TIER: mode}));
  }
  for (const name of ["JSC_useFTLJIT", "JSC_useDFGJIT", "JSC_useJIT", "__XPC_JSC_useFTLJIT", "JSC_useGC", "__XPC_JSC_dumpOptions"]) {
    assert.throws(() => webkitReplayTier({[name]: "false"}));
  }
});
