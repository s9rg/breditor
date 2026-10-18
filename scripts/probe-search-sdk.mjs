/** Actual optional local/application shared Wasm and programmatic SDK; no physical-browser claim. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {compileStandardRichProfileV1,compileStandardStructuralRichProfileV2,compileStandardLayoutRichProfileV3} from "../packages/breditor-experimental-rich-content/index.js";
import {SharedRichEditor,createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/core.js";
import {restoreSharedSearchEditor} from "../packages/breditor-collaboration/dist/profile.js";
import {checkSearchCheckpoint} from "../packages/breditor-collaboration/dist/persistence/search_checkpoint.js";
import {coverageSeed,paragraph,range} from "./fixtures/editor-consumer/coverage-seed.mjs";
const query=(pattern="(?P<word>cat)",mode="regex")=>({pattern,mode,caseSensitive:true,wholeWords:false});
const replacement={text:"${word}!",mode:"captures"};
const reviewed={binding:"a".repeat(64),principal:"alice",effectWriter:"303"};
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
function seed(binding,text="cat🙂cat"){return JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("body",text)]}});}
async function load(directory,name){const bytes=readFileSync(resolve(directory,`${name}_bg.wasm`)),module=await import(pathToFileURL(resolve(directory,`${name}.js`)));await module.default({module_or_path:bytes});return{module,sha256:sha(bytes)};}
function metadata(result){const read=result.metadata();assert.equal(read.count,"2");assert.equal(read.captureCount,"2");assert.deepEqual(read.matches,[{block:"body",start:"0",end:"3"},{block:"body",start:"5",end:"8"}]);for(const part of [read,read.schema,read.matches,read.matches[0]])assert.ok(Object.isFrozen(part));assert.equal(result.navigate(null,"next",false),"0");assert.equal(result.navigate("1","next",false),null);assert.equal(result.navigate("1","next",true),"0");assert.throws(()=>result.navigate("01","next",true));assert.ok(!JSON.stringify(read).includes("(?P<word>"));}
export async function probeSearchSdk(localDirectory,sharedDirectory){
 const local=await load(localDirectory,"breditor_wasm"),shared=await load(sharedDirectory,"breditor_shared");
 let localCases=0,sharedCases=0,exactRestores=0,exactFutureCheckpoints=0,readonlyNavigations=0,ownerRefusals=0,resourceCaps=0,queuedRemotes=0,mixedDomains=0;
 for(const language of [1,2,3]){
  const p=[compileStandardRichProfileV1,compileStandardStructuralRichProfileV2,compileStandardLayoutRichProfileV3][language-1](local.module,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:language+5,schema:{name:`example/local-search-${language}`,version:1},extensions:[]}));
  try{for(const natural of [false,true])for(const document of [false,true]){
   const a=document?p.createDocumentEditor(seed(p.descriptor())):p.createEditor(seed(p.descriptor()));let recovered;
   try{
    if(natural)a.enableTypingHistory();a.execute({kind:"setSelection",selection:range("body",8,"body",0)});
    const before=a.checkpointJson(),r=a.findText(query(),a.view().revision);metadata(r);assert.equal(a.checkpointJson(),before);a.checkSearchResults(r);
    for(const index of ["01","-1","2","4096"]){assert.throws(()=>a.selectSearchMatch(r,index));assert.equal(a.checkpointJson(),before);}
    assert.throws(()=>a.replaceSearchOne(r,"0",{text:"${unknown}",mode:"captures"}));assert.equal(a.checkpointJson(),before);
    const revision=a.view().revision;a.selectSearchMatch(r,"1",revision);assert.throws(()=>a.selectSearchMatch(r,"0",revision));a.checkSearchResults(r);
    a.setReadOnly(true);const readOnlyDocument=a.documentJson();a.selectSearchMatch(r,"0");const readOnly=a.checkpointJson();assert.throws(()=>a.replaceSearchAll(r,replacement));assert.equal(a.checkpointJson(),readOnly);assert.equal(a.documentJson(),readOnlyDocument);assert.equal(a.view().undoDepth,0);readonlyNavigations++;a.setReadOnly(false);
    assert.equal(a.replaceSearchAll(r,replacement),"content");assert.equal(a.view().undoDepth,1);assert.throws(()=>a.checkSearchResults(r));
    const saved=a.checkpointJson();assert.ok(!saved.includes("(?P<word>")&&!saved.includes("${word}!"));
    recovered=document?(natural?p.restoreDocumentTypingEditor(saved):p.restoreDocumentEditor(saved)):(natural?p.restoreTypingEditor(saved):p.restoreEditor(saved));assert.equal(recovered.checkpointJson(),saved);exactRestores++;assert.throws(()=>recovered.selectSearchMatch(r,"0"));ownerRefusals++;
    for(const method of ["undo","redo","undo","redo"]){a.execute({kind:method});recovered.execute({kind:method});assert.equal(a.checkpointJson(),recovered.checkpointJson());exactFutureCheckpoints++;}
    const frozen=r.metadata();r.dispose();r.dispose();assert.equal(r.metadata(),frozen);assert.throws(()=>a.checkSearchResults(r));
    if(language===1&&!natural&&!document){const reads=Array.from({length:8},()=>a.findText(query("cat","literal")));assert.throws(()=>a.findText(query("cat","literal")));reads.pop().dispose();const ninth=a.findText(query("cat","literal"));reads.forEach(read=>read.dispose());ninth.dispose();resourceCaps++;}
    localCases++;
   }finally{recovered?.dispose();a.dispose();}
  }}finally{p.dispose();}
 }
 for(const language of [1,2,3]){
  const method=["from_standard_configuration_json_v1","from_standard_configuration_json_v2","from_standard_configuration_json_v3"][language-1],p=shared.module.SharedRichProfile[method](JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:language,schema:{name:`example/shared-search-${language}`,version:1},extensions:[]})),binding=JSON.parse(p.descriptor_json());
  try{for(const natural of [false,true])for(const scope of ["original","general-v1","document-v1"])for(const owned of [false,true]){
   const options={searchHistory:"search-v1",...(owned?{reviewedHistory:reviewed}:{})},a=scope==="document-v1"?createSharedDocumentEditor(p.create(seed(binding),"101"),options):new SharedRichEditor(p.create(seed(binding),"101"),options);let recovered,peer;
   try{
    if(natural)a.enableTypingHistory();if(scope==="general-v1")a.enableGeneralRanges();a.select(range("body",8,"body",0));
    const before=a.checkpointJson(),r=a.findText(query(),a.view().revision);metadata(r);assert.equal(a.checkpointJson(),before);a.checkSearchResults(r);
    const revision=a.view().revision;a.selectSearchMatch(r,"1",revision);assert.throws(()=>a.selectSearchMatch(r,"0",revision));
    a.setReadOnly(true);const causal=a.view().causalVersion;a.selectSearchMatch(r,"0");assert.equal(a.view().causalVersion,causal);assert.equal(a.view().undoDepth,0);assert.throws(()=>a.replaceSearchAll(r,replacement));readonlyNavigations++;a.setReadOnly(false);
    const stable=a.checkpointJson();for(const index of ["01","-1","2","4096"])assert.throws(()=>a.selectSearchMatch(r,index));assert.throws(()=>a.replaceSearchOne(r,"0",{text:"${unknown}",mode:"captures"}));assert.equal(a.checkpointJson(),stable);
    assert.equal(a.replaceSearchAll(r,replacement),true);assert.equal(a.view().undoDepth,1);assert.throws(()=>a.checkSearchResults(r));
    const saved=a.checkpointJson();checkSearchCheckpoint(saved,"room","101",language,natural?"typing-v1":"explicit",scope==="original"?"original":"general-v1",scope==="document-v1"?"document-v1":"original",owned?reviewed:null);assert.ok(!saved.includes("(?P<word>")&&!saved.includes("${word}!"));
    assert.throws(()=>p.restore("room",saved));assert.throws(()=>p.restore_typing("room",saved));assert.throws(()=>new SharedRichEditor(restoreSharedSearchEditor(p,"room",saved)));
    recovered=scope==="document-v1"?createSharedDocumentEditor(restoreSharedSearchEditor(p,"room",saved),options):new SharedRichEditor(restoreSharedSearchEditor(p,"room",saved),options);assert.equal(recovered.checkpointJson(),saved);exactRestores++;assert.throws(()=>recovered.checkSearchResults(r));ownerRefusals++;
    for(const method of ["undo","redo","undo","redo"]){a[method]();recovered[method]();assert.equal(a.checkpointJson(),recovered.checkpointJson());exactFutureCheckpoints++;}
    r.dispose();
    if(language===1&&!natural&&scope==="original"&&!owned){
     const fresh=a.findText(query("cat","literal"));peer=new SharedRichEditor(p.join_frame("room","202",a.updateFrame()));const foreign=peer.findText(query("cat","literal"));assert.throws(()=>a.checkSearchResults(foreign));assert.throws(()=>peer.replaceSearchAll(foreign,{text:"dog",mode:"literal"}),e=>e.code==="search_history_required");ownerRefusals++;
     const reads=Array.from({length:7},()=>a.findText(query("cat","literal")));assert.throws(()=>a.findText(query("cat","literal")));reads.pop().dispose();const ninth=a.findText(query("cat","literal"));reads.forEach(read=>read.dispose());ninth.dispose();resourceCaps++;
     const release=a.holdRemotes();peer.dispatch({commands:[{kind:"insert_text",data:{block:"body",offset:0,text:"PEER"}}]});const pending=a.receiveFrame(peer.updateFrame());assert.equal(a.pendingRemote().frames,1);release();await pending;assert.throws(()=>a.checkSearchResults(fresh));assert.ok(a.documentJson().includes("PEER"));fresh.dispose();foreign.dispose();queuedRemotes++;
    }
    sharedCases++;
   }finally{peer?.dispose();recovered?.dispose();a.dispose();}
  }
  if(language===3){for(const mode of ["local","shared"]){let owner,profile;if(mode==="local"){profile=compileStandardLayoutRichProfileV3(local.module,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema:{name:"example/mixed-search",version:1},extensions:[]}));owner=profile.createEditor(coverageSeed(profile.descriptor()));}else owner=new SharedRichEditor(p.create(coverageSeed(binding),"101"),{searchHistory:"search-v1"});try{const r=owner.findText(query("a🙂b","literal")),before=owner.documentJson();assert.equal(r.metadata().count,"13");assert.equal(new Set(r.metadata().matches.map(v=>v.block)).size,13);owner.replaceSearchAll(r,{text:"R",mode:"literal"});if(mode==="local")owner.execute({kind:"undo"});else owner.undo();assert.equal(owner.documentJson(),before);r.dispose();mixedDomains++;}finally{owner.dispose();profile?.dispose();}}}
  }finally{p.free();}
 }
 assert.equal(localCases,12);assert.equal(sharedCases,36);assert.equal(exactRestores,48);assert.equal(exactFutureCheckpoints,192);assert.equal(readonlyNavigations,48);assert.equal(resourceCaps,2);assert.equal(queuedRemotes,1);assert.equal(mixedDomains,2);
 return{format:"breditor/search-programmatic-sdk-probe",formatVersion:1,localWasmSha256:local.sha256,sharedWasmSha256:shared.sha256,localCases,sharedCases,exactRestores,exactFutureCheckpoints,readonlyNavigations,ownerRefusals,resourceCaps,queuedRemotes,mixedDomains,passed:true,scope:"Actual local and application shared Wasm, all three grammars, local/document and shared original/general/document scopes, explicit/natural and reviewed histories, opaque disposal/ownership, canonical indices, readonly navigation, exact replay/future Undo/Redo, bounded handles, mixed merged table domains and queued remote invalidation. No DOM, React, durable storage, installed-package or physical-browser qualification."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error("Expected local and actual application shared Wasm directories");console.log(JSON.stringify(await probeSearchSdk(process.argv[2],process.argv[3]),null,2));}
