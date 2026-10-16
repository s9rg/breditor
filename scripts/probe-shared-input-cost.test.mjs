import test from "node:test";
import assert from "node:assert/strict";
import {probeSharedInputCost} from "./probe-shared-input-cost.mjs";

test("shared input cost probe rejects invalid engines before launching any browser",async()=>{
 for(const engine of ["safari","__proto__","constructor","",null]){
  await assert.rejects(probeSharedInputCost(engine,1),/Expected chromium, firefox or webkit/);
 }
});
test("shared input cost probe bounds its input count before launching any browser",async()=>{
 for(const count of [0,-1,17,1.5,NaN,Infinity,"8",null]){
  await assert.rejects(probeSharedInputCost("firefox",count),/Expected 1–16 inputs per phase/);
 }
});
