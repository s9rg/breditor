/** Recover new native general-range histories with a real earlier V3 local Wasm runtime. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
export async function probeGeneralRangeCheckpointCompatibility(vectorsPath,runtimeDirectory){
 const vectors=JSON.parse(readFileSync(vectorsPath,"utf8"));assert.equal(vectors.format,"breditor/general-range-checkpoint-probe");assert.equal(vectors.formatVersion,1);assert.equal(vectors.trials.length,12);
 const bytes=readFileSync(resolve(runtimeDirectory,"breditor_wasm_bg.wasm")),wasm=await import(pathToFileURL(resolve(runtimeDirectory,"breditor_wasm.js")));await wasm.default({module_or_path:bytes});
 const take=(result,kind)=>{try{assert.equal(result.status,kind);return result[kind==="profile"?"takeProfile":"takeEditor"]();}finally{result.free();}};
 const read=result=>{try{assert.equal(result.status,"value");return result.takeValue();}finally{result.free();}};
 const profile=take(wasm.BreditorRichProfile.fromStandardLayoutBootstrapJsonV3(vectors.bootstrap),"profile");let restores=0,future=0;
 const seen=new Set();
 try{for(const trial of vectors.trials){assert.equal(typeof trial.natural,"boolean");assert.equal(typeof trial.backwards,"boolean");assert.ok([["p-0-0","p-1-1"],["z-intro","caption"],["z-intro","nested-text"]].some(([a,b])=>a===trial.first&&b===trial.last));const key=JSON.stringify([trial.first,trial.last,trial.natural,trial.backwards]);assert.ok(!seen.has(key));seen.add(key);assert.deepEqual(trial.history.map(step=>step.command),["undo","redo","undo","redo"]);const owner=take(profile[trial.natural?"restoreTypingEditor":"restoreEditor"](trial.checkpoint),"editor");try{
  assert.equal(read(owner.checkpointJson()),trial.checkpoint);restores++;
  for(const step of trial.history){const observation=owner.observe();try{const result=owner.execute(observation,JSON.stringify({kind:step.command}));try{assert.equal(result.status,step.command);}finally{result.free();}}finally{observation.free();}assert.equal(read(owner.checkpointJson()),step.checkpoint);future++;}
 }finally{owner.free();}}}finally{profile.free();}
 assert.equal(restores,12);assert.equal(future,48);
 return {format:"breditor/general-range-checkpoint-interoperability",formatVersion:1,restores,exactFutureComparisons:future,oldRuntimeSha256:createHash("sha256").update(bytes).digest("hex"),passed:true,scope:"Original rich-local-session and typing-session histories; does not qualify a new Wasm editing command, shared lowering or browser integration"};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected native-vector JSON and earlier local Wasm directory");console.log(JSON.stringify(await probeGeneralRangeCheckpointCompatibility(...args),null,2));}
