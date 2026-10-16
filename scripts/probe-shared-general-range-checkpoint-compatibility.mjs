/** Recover new shared general-range histories with an actual earlier V3 Wasm binary. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
export async function probeSharedGeneralRangeCheckpointCompatibility(vectorsPath,runtimeDirectory){
 const vectors=JSON.parse(readFileSync(vectorsPath,"utf8"));assert.equal(vectors.format,"breditor/shared-general-range-checkpoint-probe");assert.equal(vectors.formatVersion,1);assert.equal(vectors.trials.length,12);
 const bytes=readFileSync(resolve(runtimeDirectory,"breditor_shared_bg.wasm")),wasm=await import(pathToFileURL(resolve(runtimeDirectory,"breditor_shared.js")));await wasm.default({module_or_path:bytes});
 const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(vectors.configuration),seen=new Set();let restores=0,future=0;
 try{for(const trial of vectors.trials){
  assert.equal(typeof trial.natural,"boolean");assert.equal(typeof trial.backwards,"boolean");assert.ok([["p-0-0","p-1-1"],["z-intro","caption"],["z-intro","nested-text"]].some(([a,b])=>trial.first===a&&trial.last===b));const key=JSON.stringify([trial.first,trial.last,trial.natural,trial.backwards]);assert.ok(!seen.has(key));seen.add(key);assert.deepEqual(trial.history.map(step=>step.command),["undo","redo","undo","redo"]);
  const owner=profile[trial.natural?"restore_typing":"restore"]("room",trial.checkpoint),checkpoint=()=>trial.natural?owner.typing_checkpoint():owner.checkpoint();
  try{assert.equal(checkpoint(),trial.checkpoint);restores++;for(const step of trial.history){const observation=owner.observe();try{assert.equal(owner[`${step.command}_observed`](observation),true);}finally{observation.free();}assert.equal(checkpoint(),step.checkpoint);future++;}}finally{owner.free();}
 }}finally{profile.free();}
 assert.equal(restores,12);assert.equal(future,48);
 return {format:"breditor/shared-general-range-checkpoint-interoperability",formatVersion:1,restores,exactFutureComparisons:future,oldRuntimeSha256:createHash("sha256").update(bytes).digest("hex"),passed:true,scope:"Original shared explicit/natural journals produced by the initial native adapter; does not qualify unresolved normalization/headroom cases or a new Wasm/browser editing request"};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected native shared-vector JSON and earlier shared Wasm directory");console.log(JSON.stringify(await probeSharedGeneralRangeCheckpointCompatibility(...args),null,2));}
