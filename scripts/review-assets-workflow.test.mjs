import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {IDBFactory} from "fake-indexeddb";
import {pixel,pixelAsset,secondPixel,secondAsset,ReviewFixtureImage} from "./fixtures/review-assets/pixels.mjs";
import {probeSuggestionSyncSdk} from "./probe-suggestion-sync-sdk.mjs";
import {collectReviewAssetMatrix,reviewAssetPolicies} from "./probe-review-assets-matrix.mjs";
import {checkOwnedReviewInstalled} from "./check-owned-review-installed.mjs";
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("two distinct exact PNG fixtures retain their content identities",async()=>{
 assert.notEqual(pixelAsset,secondAsset);
 for(const [bytes,id] of [[pixel,pixelAsset],[secondPixel,secondAsset]]){
  assert.equal(id,`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
  const url=URL.createObjectURL(new Blob([bytes],{type:"image/png"}));
  try{const image=new ReviewFixtureImage();image.src=url;await image.decode();assert.equal(image.naturalWidth,1);assert.equal(image.naturalHeight,1);}finally{URL.revokeObjectURL(url);}
 }
});
test("fixture decoding refuses arbitrary bytes instead of claiming browser raster coverage",async()=>{
 const bytes=Buffer.from(secondPixel);bytes[bytes.length-1]^=1;
 const url=URL.createObjectURL(new Blob([bytes],{type:"image/png"}));
 try{const image=new ReviewFixtureImage();image.src=url;await assert.rejects(image.decode(),/Only the two exact fixture PNGs/);}finally{URL.revokeObjectURL(url);}
});
test("pinned fixture retains completed rollback history while same-origin recovery uses the last committed value",async()=>{
 const factory=new IDBFactory(),open=indexedDB=>new Promise((resolve,reject)=>{const request=indexedDB.open("review-fixture",1);request.onupgradeneeded=()=>request.result.createObjectStore("saved");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 const db=await open(factory);
 for(let index=0;index<3;index++)await new Promise((resolve,reject)=>{const tx=db.transaction("saved","readwrite");tx.objectStore("saved").put({checkpoint:`revision-${index}`},"source");tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 // Diagnostic for the pinned fake-indexeddb, not production IndexedDB introspection:
 // finished transactions retain rollback closures even though only the last value is stored.
 assert.ok(db._rawDatabase.transactions.filter(tx=>tx._state==="finished"&&tx._rollbackLog.length>0).length>=3);
 db.close();const recovered=await open(factory);
 const saved=await new Promise((resolve,reject)=>{const tx=recovered.transaction("saved"),request=tx.objectStore("saved").get("source");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 assert.deepEqual(saved,{checkpoint:"revision-2"});recovered.close();
 assert.deepEqual(await(new IDBFactory()).databases(),[],"A different policy origin cannot retain the previous origin's completed transactions");
});
test("asset workflow is explicitly selected and cannot silently switch original history",async()=>{
 await assert.rejects(probeSuggestionSyncSdk("unused","unused",{assetWorkflow:true}),/requires explicit reviewed history/);
 const probe=read("scripts/probe-suggestion-sync-sdk.mjs");
 assert.match(probe,/assetWorkflow=false/);assert.match(probe,/const assetArgs=assetWorkflow\?/);
 assert.match(probe,/requests<\(controls\?16000:6000\)/,"Existing anti-spin budgets remain unchanged");
 assert.match(probe,/for\(const \[key,value\] of Object.entries\(counts\)\)assert.equal\(value,expected,key\)/);
 assert.match(probe,/if\(assetWorkflow\)\{assert.equal\(assetWorkflows.length,expected\)/);
 await assert.rejects(probeSuggestionSyncSdk("unused","unused",{selectedAssetPolicy:{scope:"original",natural:false}}),/single asset policy is only valid/);
 await assert.rejects(checkOwnedReviewInstalled("unused",{assetWorkflow:true}),/requires installed vanilla\/React controls/);
 await assert.rejects(checkOwnedReviewInstalled("unused",{assetWorkflow:true,includeControls:true,includeObserver:true}),/does not replace the observer fixture/);
});
test("process matrix preserves six distinct policies, hashes and the original total request budget",()=>{
 const reports=reviewAssetPolicies.map(policy=>({formatVersion:1,passed:true,trials:1,exactOfflineReopens:1,wireRequests:2000,sharedWasmSha256:"same-wasm",nativeRelaySha256:"same-native",policies:[policy],assetWorkflows:[{passed:true}],controlWorkflows:[{builtInActions:9,serverFinalOwnedAccepts:9}]}));
 const combined=collectReviewAssetMatrix(reports);assert.equal(combined.trials,6);assert.equal(combined.exactOfflineReopens,6);assert.equal(combined.wireRequests,12000);assert.equal(combined.controlWorkflows.length,6);
 assert.throws(()=>collectReviewAssetMatrix(reports.slice(1)),/Every original policy/);
 for(const mutation of [rows=>rows[1].policies=rows[0].policies,rows=>rows[1].sharedWasmSha256="different",rows=>rows[1].exactOfflineReopens=0,rows=>rows[1].wireRequests=6000,rows=>rows[1].controlWorkflows[0].builtInActions=8]){const copy=structuredClone(reports);mutation(copy);assert.throws(()=>collectReviewAssetMatrix(copy));}
});
test("separate asset fixture validates room binding without upgrading existing logs",()=>{
 const fixture=read("experiments/relay/examples/review_assets_functional.rs");
 assert.match(fixture,/if Path::new\(log\).exists\(\) \{\s*Room::open/);
 assert.match(fixture,/AssetStore::open\(Path::new\(asset_path\), room.asset_binding\(\)\)/);
 assert.match(fixture,/server::router_with_assets/);assert.match(fixture,/address.ip\(\).is_loopback\(\)/);
 const original=read("experiments/relay/examples/suggestions_functional.rs");
 assert.ok(!original.includes("AssetStore")&&!original.includes("asset_path"),"Original fixture's argument contract stays independent");
});
