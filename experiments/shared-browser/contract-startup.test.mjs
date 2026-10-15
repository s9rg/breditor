import {test} from "node:test";
import assert from "node:assert/strict";
import {loadContractResources} from "./contract-startup.mjs";

test("contract startup starts both independent resources and waits for both",async()=>{
 const events=[],vector={exact:"native bytes"};let initialize,load;
 const ready=loadContractResources(()=>{events.push("wasm");return new Promise(resolve=>{initialize=resolve;});},()=>{events.push("vector");return new Promise(resolve=>{load=resolve;});});
 assert.deepEqual(events,["wasm","vector"]);let settled=false;ready.then(()=>{settled=true;});
 load(vector);await Promise.resolve();assert.equal(settled,false);
 initialize();assert.equal(await ready,vector);
});
test("contract startup rejects a Wasm initialization error without returning a partial fixture",async()=>{
 const error=new Error("init failed");let loaded=false;
 await assert.rejects(loadContractResources(async()=>{throw error;},async()=>{loaded=true;return {}; }),value=>value===error);
 assert.equal(loaded,true);
});
test("contract startup rejects a fixture error without masking it behind successful Wasm initialization",async()=>{
 const error=new Error("fixture failed");
 await assert.rejects(loadContractResources(async()=>{},async()=>{throw error;}),value=>value===error);
});
