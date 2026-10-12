import assert from "node:assert/strict";
import test from "node:test";
import {replayBrowserName} from "./replay-browser.mjs";

test("exact-byte replay target is explicit and tier overrides stay WebKit-only",()=>{
  assert.equal(replayBrowserName(Object.freeze({}),"default"),"webkit");
  for(const name of ["webkit","chromium","firefox"])assert.equal(replayBrowserName(Object.freeze({BREDITOR_REPLAY_BROWSER:name}),"default"),name);
  for(const name of ["","Chrome","safari","all"])assert.throws(()=>replayBrowserName({BREDITOR_REPLAY_BROWSER:name},"default"));
  for(const name of ["chromium","firefox"])for(const tier of ["no-dfg","no-ftl"])assert.throws(()=>replayBrowserName({BREDITOR_REPLAY_BROWSER:name},tier));
  assert.equal(replayBrowserName({},"no-dfg"),"webkit");
});
