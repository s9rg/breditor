import assert from "node:assert/strict";

/** Explicit target for exact-byte comparison; never infer from source evidence. */
export function replayBrowserName(environment, javaScriptTierMode) {
  const name=environment.BREDITOR_REPLAY_BROWSER??"webkit";
  assert.ok(["webkit","chromium","firefox"].includes(name),"invalid replay browser");
  assert.ok(name==="webkit"||javaScriptTierMode==="default","WebKit tier overrides cannot qualify another browser");
  return name;
}
