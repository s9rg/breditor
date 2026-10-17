/** Actual old/new application Wasm: unchanged original histories and bidirectional semantic replay. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
import {SharedRichEditor,createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/core.js";
import {coverageSeed} from "./fixtures/editor-consumer/coverage-seed.mjs";
const hash=b=>createHash("sha256").update(b).digest("hex");
async function runtime(directory){const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm")),module=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await module.default({module_or_path:bytes});return{module,sha256:hash(bytes)};}
function wrap(raw,mode){return mode==="document"?createSharedDocumentEditor(raw):new SharedRichEditor(raw);}
function restore(profile,room,bytes,mode,natural){const name=mode==="document"?(natural?"restore_document_typing":"restore_document"):mode==="general"?(natural?"restore_general_typing":"restore_general"):(natural?"restore_typing":"restore");return wrap(profile[name](room,bytes),mode);}
function insert(core,text){core.dispatch({commands:[{kind:"insert_text",data:{block:"q1",offset:1,text}}]});}
export async function probeSemanticRemoteCompat(oldDirectory,newDirectory,reproductionDirectory){
 const old=await runtime(oldDirectory),current=await runtime(newDirectory),configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema:{name:"example/remote-replay-compat",version:1},extensions:[]}),p=old.module.SharedRichProfile.from_standard_configuration_json_v3(configuration),q=current.module.SharedRichProfile.from_standard_configuration_json_v3(configuration);
 let cases=0,restores=0,future=0,originalComparisons=0,newDeltaCases=0,reproductionRestores=0,knownCausalNoopCases=0,oldRuntimeEchoGrowthBytes=0;
 try{const source=coverageSeed(JSON.parse(p.descriptor_json()));
  for(const mode of ["original","general","document"])for(const natural of [false,true]){let a,b,oldCopy,newCopy,legacyReader;
   try{a=wrap(p.create(source,"101"),mode);if(mode==="general")a.enableGeneralRanges();if(natural)a.enableTypingHistory();b=new SharedRichEditor(p.join_frame("room","202",a.updateFrame()));insert(a,"OWN");for(let i=0;i<3;i++){insert(b,"PEER");await a.receiveFrame(b.updateFrame());}
    const bytes=a.checkpointJson();oldCopy=restore(p,"room",bytes,mode,natural);newCopy=restore(q,"room",bytes,mode,natural);assert.equal(oldCopy.checkpointJson(),bytes);assert.equal(newCopy.checkpointJson(),bytes);restores+=2;
    for(const command of ["undo","redo","undo","redo"]){oldCopy[command]();newCopy[command]();assert.equal(newCopy.checkpointJson(),oldCopy.checkpointJson());future++;}
    insert(b,"NEXT");const frame=b.updateFrame();await oldCopy.receiveFrame(frame);await newCopy.receiveFrame(frame);assert.equal(oldCopy.documentJson(),newCopy.documentJson());
    if(mode==="original"){assert.equal(oldCopy.checkpointJson(),newCopy.checkpointJson());originalComparisons++;}
    else{const journal=JSON.parse(newCopy.checkpointJson()),entries=(journal.journal??journal).entries,last=entries.at(-1);assert.equal(last.kind,"remote");assert.ok(JSON.stringify(last).length<frame.length/2,"The known causal prefix should not be retained again");newDeltaCases++;}
    legacyReader=restore(p,"room",newCopy.checkpointJson(),mode,natural);assert.equal(legacyReader.checkpointJson(),newCopy.checkpointJson());restores++;
    for(const command of ["undo","redo","undo","redo"]){legacyReader[command]();newCopy[command]();assert.equal(newCopy.checkpointJson(),legacyReader.checkpointJson());future++;}
    if(mode!=="original"){
     // Same operations, a different cumulative encoding: this is an old-runtime
     // regression reproduction, not a claim that visible document equality is
     // sufficient for dropping arbitrary incoming records in the product.
     const echo=newCopy.updateFrame(),exact=newCopy.checkpointJson(),document=newCopy.documentJson(),legacyBefore=Buffer.byteLength(legacyReader.checkpointJson());
     await newCopy.receiveFrame(echo);await legacyReader.receiveFrame(echo);
     assert.equal(newCopy.checkpointJson(),exact);assert.equal(newCopy.documentJson(),document);assert.equal(legacyReader.documentJson(),document);
     const growth=Buffer.byteLength(legacyReader.checkpointJson())-legacyBefore;assert.ok(growth>0,"Old runtime must reproduce known-causal echo growth");oldRuntimeEchoGrowthBytes+=growth;knownCausalNoopCases++;
    }
    cases++;
   }finally{a?.dispose();b?.dispose();oldCopy?.dispose();newCopy?.dispose();legacyReader?.dispose();}
  }
  if(reproductionDirectory){const config=readFileSync(resolve(reproductionDirectory,"profile.json"),"utf8"),profile=current.module.SharedRichProfile.from_standard_configuration_json_v3(config);try{for(const name of ["alice","bob"]){const bytes=readFileSync(resolve(reproductionDirectory,`${name}.failure.json`),"utf8"),owner=restore(profile,"room",bytes,"document",false);try{assert.equal(owner.checkpointJson(),bytes);reproductionRestores++;}finally{owner.dispose();}}}finally{profile.free();}}
 }finally{p.free();q.free();}
 assert.equal(cases,6);assert.equal(restores,18);assert.equal(future,48);assert.equal(originalComparisons,2);assert.equal(newDeltaCases,4);assert.equal(knownCausalNoopCases,4);
 return{format:"breditor/semantic-remote-replay-compatibility",formatVersion:1,passed:true,oldSharedWasmSha256:old.sha256,sharedWasmSha256:current.sha256,cases,byteExactRestores:restores,byteExactFutureCheckpoints:future,unchangedOriginalRemoteComparisons:originalComparisons,newSemanticDeltaCases:newDeltaCases,knownCausalNoopCases,oldRuntimeEchoGrowthBytes,nearBudgetReproductionRestores:reproductionRestores,scope:"Actual old/new application Wasm, original/general/document and explicit/natural replay; old journals remain byte-exact on new readers and new minimal Remote records remain byte-exact on old readers, including future local Undo/Redo. Four old-runtime known-causal echo growth reproductions are exact no-ops in the repair. Optional actual near-budget failure checkpoints restored unchanged. No protocol migration, byte ceiling increase or release claim."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length<2||args.length>3)throw Error("Expected old/new Wasm and optional reproduction directory");console.log(JSON.stringify(await probeSemanticRemoteCompat(...args),null,2));}
