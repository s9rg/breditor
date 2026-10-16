/** Actual application Wasm must exactly replay native general semantic history. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
export async function probeGeneralSemanticRecovery(vectorsPath,runtimeDirectory){
 const vectors=JSON.parse(readFileSync(vectorsPath,"utf8"));assert.equal(vectors.format,"breditor/general-semantic-frame-probe");assert.equal(vectors.formatVersion,1);assert.equal(vectors.trials.length,12);assert.equal(vectors.joinedTrials.length,6);
 const bytes=readFileSync(resolve(runtimeDirectory,"breditor_shared_bg.wasm")),wasm=await import(pathToFileURL(resolve(runtimeDirectory,"breditor_shared.js")));await wasm.default({module_or_path:bytes});
 let restores=0,futureComparisons=0,joinedRestores=0;const seen=new Set();
 for(const trial of [...vectors.trials,...vectors.joinedTrials]){
  const key=JSON.stringify([trial.case,trial.natural,trial.backwards,trial.joined]);assert.ok(!seen.has(key));seen.add(key);
  assert.deepEqual(trial.history.map(s=>s.command),["undo","redo","undo","redo"]);
  const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(trial.configuration);let owner;
  const restore=trial.natural?"restore_general_typing":"restore_general",save=trial.natural?"general_typing_checkpoint":"general_checkpoint";
  try{
   assert.throws(()=>profile.restore("room",trial.checkpoint));assert.throws(()=>profile.restore_typing("room",trial.checkpoint));
   assert.throws(()=>profile[trial.natural?"restore_general":"restore_general_typing"]("room",trial.checkpoint));
   owner=profile[restore]("room",trial.checkpoint);assert.equal(owner[save](),trial.checkpoint);assert.equal(owner.document_json(),trial.document);restores++;if(trial.joined){assert.equal(JSON.parse(trial.checkpoint).joins.length,1);joinedRestores++;}
   assert.throws(()=>owner.checkpoint());assert.throws(()=>owner.typing_checkpoint());
   for(const step of trial.history){const observation=owner.observe();try{assert.equal(owner[`${step.command}_observed`](observation),true);}finally{observation.free();}assert.equal(owner[save](),step.checkpoint);assert.equal(owner.document_json(),step.document);futureComparisons++;
    const restart=profile[restore]("room",owner[save]());assert.equal(restart[save](),owner[save]());owner.free();owner=restart;
   }
  }finally{owner?.free();profile.free();}
 }
 assert.equal(restores,18);assert.equal(joinedRestores,6);assert.equal(futureComparisons,72);
 return {format:"breditor/general-semantic-release-wasm-recovery",formatVersion:1,sharedWasmSha256:createHash("sha256").update(bytes).digest("hex"),exactNativeJournalRestores:restores,joinedFirstKeyRestores:joinedRestores,exactFutureComparisonsWithReload:futureComparisons,passed:true,scope:"Explicit new history families only; no browser event, SDK editing, relay V2 deployment or original protocol promotion is inferred"};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected semantic-vector JSON and candidate application Wasm directory");console.log(JSON.stringify(await probeGeneralSemanticRecovery(...args),null,2));}
