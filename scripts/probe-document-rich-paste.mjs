/** Paired actual release Wasm through explicit facades; no browser/clipboard/production claim. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {compileStandardLayoutRichProfileV3} from "../packages/breditor-experimental-rich-content/index.js";
import {SharedRichEditor,createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/core.js";
import {restoreSharedDocumentEditor} from "../packages/breditor-collaboration/dist/profile.js";
import {coverageSeed,paragraph,range,grid} from "./fixtures/editor-consumer/coverage-seed.mjs";

async function runtime(directory,name){const bytes=readFileSync(resolve(directory,`${name}_bg.wasm`)),module=await import(pathToFileURL(resolve(directory,`${name}.js`)));await module.default({module_or_path:bytes});return{module,sha256:createHash("sha256").update(bytes).digest("hex")};}
// Native authored merge priorities differ by owner. Remove only these three known causal words
// when comparing local/shared semantic ASTs; all identities, geometry, content and formats stay.
function semantic(source){const value=JSON.parse(source);function visit(node){for(const merge of node.properties?.["breditor/merges"]??[]){delete merge.lamport;delete merge.writer;delete merge.counter;}for(const child of node.children??[])visit(child);}visit(value.root);return value;}
function text(source,id){function find(node){if(node.properties?.["breditor/block-id"]===id)return node.children.filter(n=>n.kind==="text").map(n=>n.text).join("");for(const child of node.children??[]){const result=find(child);if(result!==undefined)return result;}}return find(JSON.parse(source).root);}
function hidden(seed){const value=JSON.parse(seed);value.root.children=value.root.children.filter(n=>n.properties["breditor/block-id"]==="hidden");return JSON.stringify(value);}
const schema={name:"example/document-rich-paste",version:1};
function localProfile(module){return compileStandardLayoutRichProfileV3(module,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema,extensions:[]}));}
function sharedProfile(module){return module.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema,extensions:[]}));}

export async function probeDocumentRichPaste(localDirectory,sharedDirectory,previousLocalDirectory,previousSharedDirectory){
 const local=await runtime(localDirectory,"breditor_wasm"),shared=await runtime(sharedDirectory,"breditor_shared"),previousLocal=await runtime(previousLocalDirectory,"breditor_wasm"),previousShared=await runtime(previousSharedDirectory,"breditor_shared");
 const lp=localProfile(local.module),sp=sharedProfile(shared.module),oldLocal=localProfile(previousLocal.module),oldShared=sharedProfile(previousShared.module);
 let trials=0,semanticDocuments=0,restores=0,future=0,peerDocuments=0,oldSharedRefusals=0,oldLocalRestores=0,guardedRefusals=0,oldBytes=0;
 const seed=coverageSeed(lp.descriptor()),clips=[];
 try{
  const donor=lp.createDocumentEditor(seed),hiddenDonor=lp.createDocumentEditor(hidden(seed));
  try{
   donor.execute({kind:"setInlineFormat",data:{change:{kind:"set",formatsJson:JSON.stringify([{type:"breditor/strong",properties:{}}])},targets:[{block:"q1",start:"0",end:"2"}]}});
   for(const selection of [range("q1",0,"q1",2),{kind:"node",block:"table"},{kind:"node",block:"image"},grid()]){donor.execute({kind:"setSelection",selection});const clip=donor.copyDocument();assert.ok(clip);clips.push(clip);}
   donor.selectDocument();clips.push(donor.copyDocument());hiddenDonor.selectDocument();clips.push(hiddenDonor.copyDocument());assert.equal(clips[5].plainText,"");
  }finally{donor.dispose();hiddenDonor.dispose();}
  for(const natural of [false,true])for(const onlyHidden of [false,true])for(const clip of clips){
   let a,b,ar,br;
   try{
    b=lp.createDocumentEditor(onlyHidden?hidden(seed):seed);a=createSharedDocumentEditor(sp.create(b.documentJson(),"101"));
    if(natural){a.enableTypingHistory();b.enableTypingHistory();}
    assert.equal(a.supportsDocumentClipboard(),true);assert.equal(b.supportsDocumentClipboard(),true);
    a.selectDocument();b.selectDocument();const before=a.documentJson(),sa=a.checkpointJson(),sb=b.checkpointJson(),ra=a.view().revision,rb=b.view().revision,prefix=`rich-${trials}`;
    assert.throws(()=>a.pasteDocumentClipboard("malformed",`${prefix}:rejected`));assert.throws(()=>b.pasteDocumentClipboard("malformed",`${prefix}:rejected`));assert.equal(a.checkpointJson(),sa);assert.equal(b.checkpointJson(),sb);guardedRefusals+=2;
    a.pasteDocumentClipboard(clip.structuredJson,prefix,ra);b.pasteDocumentClipboard(clip.structuredJson,prefix,rb);
    assert.deepEqual(semantic(a.documentJson()),semantic(b.documentJson()));semanticDocuments++;
    assert.deepEqual(a.view().tables,b.view().tables);assert.equal(a.view().undoDepth,1);assert.equal(b.view().undoDepth,1);
    const roots=JSON.parse(b.documentJson()).root.children;assert.equal(roots.at(-1).type,"breditor/paragraph");if(clip.kind!=="text")assert.deepEqual(roots.at(-1).children,[]);else assert.ok(JSON.stringify(roots).includes("breditor/strong"));
    assert.throws(()=>a.pasteDocumentClipboard(clip.structuredJson,`${prefix}:stale`,ra));assert.throws(()=>b.pasteDocumentClipboard(clip.structuredJson,`${prefix}:stale`,rb));guardedRefusals+=2;
    const ca=a.checkpointJson(),cb=b.checkpointJson();ar=createSharedDocumentEditor(restoreSharedDocumentEditor(sp,"room",ca,natural?"typing-v1":"explicit"));br=natural?lp.restoreDocumentTypingEditor(cb):lp.restoreDocumentEditor(cb);
    assert.equal(ar.checkpointJson(),ca);assert.equal(br.checkpointJson(),cb);restores+=2;
    assert.throws(()=>restoreSharedDocumentEditor(oldShared,"room",ca,natural?"typing-v1":"explicit"));oldSharedRefusals++;
    // Local recipes were already supported; old local readers must retain their exact meaning.
    const old=natural?oldLocal.restoreDocumentTypingEditor(cb):oldLocal.restoreDocumentEditor(cb);try{assert.equal(old.checkpointJson(),cb);assert.equal(old.supportsDocumentClipboard(),false);oldLocalRestores++;}finally{old.dispose();}
    for(const command of ["undo","redo","undo","redo"]){a[command]();ar[command]();b.execute({kind:command});br.execute({kind:command});assert.equal(a.checkpointJson(),ar.checkpointJson());assert.equal(b.checkpointJson(),br.checkpointJson());future+=2;assert.deepEqual(semantic(a.documentJson()),semantic(b.documentJson()));semanticDocuments++;if(command==="undo"){assert.equal(a.documentJson(),before);assert.deepEqual(a.view().selection,{kind:"document"});assert.deepEqual(b.view().selection,{kind:"document"});}}
    trials++;
   }finally{ar?.dispose();br?.dispose();a?.dispose();b?.dispose();}
  }
  // A prior application peer has no document-UI/paste authoring, yet receives the same causal model.
  for(const natural of [false,true]){
   const a=createSharedDocumentEditor(sp.create(seed,"101")),peer=new SharedRichEditor(oldShared.join_frame("room","202",a.updateFrame()));let ar,pr;
   try{
    if(natural)a.enableTypingHistory();a.selectDocument();peer.dispatch({commands:[{kind:"insert_blocks",data:{parent:null,before:null,nodes:[paragraph("peer-root","OFFLINE")]}},{kind:"insert_text",data:{block:"q1",offset:1,text:"PEER"}}]});
    a.pasteDocumentClipboard(clips[4].structuredJson,"offline-rich");await a.receiveFrame(peer.updateFrame());await peer.receiveFrame(a.updateFrame());assert.equal(a.documentJson(),peer.documentJson());assert.equal(text(a.documentJson(),"peer-root"),"OFFLINE");peerDocuments++;
    ar=createSharedDocumentEditor(restoreSharedDocumentEditor(sp,"room",a.checkpointJson(),natural?"typing-v1":"explicit"));pr=new SharedRichEditor(oldShared.restore("room",peer.checkpointJson()));assert.equal(ar.checkpointJson(),a.checkpointJson());assert.equal(pr.checkpointJson(),peer.checkpointJson());restores+=2;
    for(const command of ["undo","redo","undo","redo"]){a[command]();ar[command]();await peer.receiveFrame(a.updateFrame());await pr.receiveFrame(a.updateFrame());assert.equal(a.documentJson(),peer.documentJson());assert.equal(a.checkpointJson(),ar.checkpointJson());assert.equal(peer.checkpointJson(),pr.checkpointJson());future+=2;peerDocuments++;assert.equal(text(a.documentJson(),"peer-root"),"OFFLINE");if(command==="undo")assert.ok(text(a.documentJson(),"q1").includes("PEER"));}
   }finally{ar?.dispose();pr?.dispose();a.dispose();peer.dispose();}
  }
  // Existing original sessions still emit identical recovery bytes in actual previous runtimes.
  for(const natural of [false,true]){
   const a=new SharedRichEditor(sp.create(seed,"101")),p=new SharedRichEditor(oldShared.create(seed,"101")),b=lp.createEditor(seed),q=oldLocal.createEditor(seed);
   try{if(natural){a.enableTypingHistory();p.enableTypingHistory();b.enableTypingHistory();q.enableTypingHistory();}for(const command of ["insert","undo","redo"]){if(command==="insert"){a.select(range("q1",1));p.select(range("q1",1));a.type("X🙂");p.type("X🙂");b.execute({kind:"setSelection",selection:range("q1",1)});q.execute({kind:"setSelection",selection:range("q1",1)});b.execute({kind:"insertPlainText",text:"X🙂"});q.execute({kind:"insertPlainText",text:"X🙂"});}else{a[command]();p[command]();b.execute({kind:command});q.execute({kind:command});}assert.equal(a.checkpointJson(),p.checkpointJson());assert.equal(b.checkpointJson(),q.checkpointJson());oldBytes+=2;}}
   finally{a.dispose();p.dispose();b.dispose();q.dispose();}
  }
 }finally{lp.dispose();sp.free();oldLocal.dispose();oldShared.free();}
 assert.equal(trials,24);assert.equal(semanticDocuments,120);assert.equal(restores,52);assert.equal(future,208);assert.equal(peerDocuments,10);assert.equal(oldSharedRefusals,24);assert.equal(oldLocalRestores,24);assert.equal(guardedRefusals,96);assert.equal(oldBytes,12);
 return{format:"breditor/document-rich-paste-functional-probe",formatVersion:1,localWasmSha256:local.sha256,sharedWasmSha256:shared.sha256,previousLocalWasmSha256:previousLocal.sha256,previousSharedWasmSha256:previousShared.sha256,trials,localSharedSemanticDocumentComparisons:semanticDocuments,exactRestores:restores,exactFutureCheckpoints:future,exactPreviousPeerDocuments:peerDocuments,previousSharedUnknownCommandRefusals:oldSharedRefusals,previousLocalExactRecipeRestores:oldLocalRestores,guardedRefusals,byteIdenticalOriginalCheckpoints:oldBytes,passed:true,scope:"Explicit programmatic local/shared whole-document native rich text/table/image/grid/flow/hidden paste and future history, offline previous-runtime peers and unchanged original recovery. Only authored merge-priority words are excluded from local/shared semantic comparisons. No native clipboard/DOM/IME/accessibility/relay/release claim."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==4)throw Error("Expected current local/shared and preserved previous document local/shared Wasm directories");console.log(JSON.stringify(await probeDocumentRichPaste(...args),null,2));}
