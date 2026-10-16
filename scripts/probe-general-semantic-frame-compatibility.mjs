/** Actual earlier Wasm must import semantic-edit frames and reject new local save families. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
export async function probeGeneralSemanticFrameCompatibility(vectorsPath,runtimeDirectory){
 const vectors=JSON.parse(readFileSync(vectorsPath,"utf8"));assert.equal(vectors.format,"breditor/general-semantic-frame-probe");assert.equal(vectors.formatVersion,1);assert.equal(vectors.trials.length,12);
 const bytes=readFileSync(resolve(runtimeDirectory,"breditor_shared_bg.wasm")),wasm=await import(pathToFileURL(resolve(runtimeDirectory,"breditor_shared.js")));await wasm.default({module_or_path:bytes});
 const seen=new Set();let saveRejections=0,frameComparisons=0,originalPeerRestores=0;
 for(const trial of vectors.trials){assert.ok(["cells_at_node_limit","generated_head","caption"].includes(trial.case));assert.equal(typeof trial.natural,"boolean");assert.equal(typeof trial.backwards,"boolean");const key=JSON.stringify([trial.case,trial.natural,trial.backwards]);assert.ok(!seen.has(key));seen.add(key);assert.deepEqual(trial.history.map(s=>s.command),["undo","redo","undo","redo"]);
  const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(trial.configuration);let peer;
  try{assert.throws(()=>profile[trial.natural?"restore_typing":"restore"]("room",trial.checkpoint));saveRejections++;
   peer=profile.join_frame("room","202",trial.initialFrame);peer.receive_frame(trial.frame);assert.equal(peer.document_json(),trial.document);frameComparisons++;
   for(const step of trial.history){peer.receive_frame(step.frame);assert.equal(peer.document_json(),step.document);frameComparisons++;}
   const checkpoint=peer.checkpoint(),restored=profile.restore("room",checkpoint);try{assert.equal(restored.checkpoint(),checkpoint);assert.equal(restored.document_json(),peer.document_json());originalPeerRestores++;}finally{restored.free();}
  }finally{peer?.free();profile.free();}
 }
 assert.equal(saveRejections,12);assert.equal(frameComparisons,60);assert.equal(originalPeerRestores,12);
 return {format:"breditor/general-semantic-frame-interoperability",formatVersion:1,oldSharedWasmSha256:createHash("sha256").update(bytes).digest("hex"),newSaveFamilyRejections:saveRejections,exactOriginalFrameDocumentComparisons:frameComparisons,originalPeerJournalRestores:originalPeerRestores,passed:true,scope:"Actual previous V3 Wasm, including strict source-sized node budgets, generated heads, partial captions and four Undo/Redo frames per case; no new browser editing capability is qualified"};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected semantic-vector JSON and earlier shared Wasm directory");console.log(JSON.stringify(await probeGeneralSemanticFrameCompatibility(...args),null,2));}
