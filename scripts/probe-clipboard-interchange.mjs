/** Actual paired application Wasm: pure adapter admission, guarded paste and exact recovery. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {compileStandardLayoutRichProfileV3} from "../packages/breditor-experimental-rich-content/index.js";
import {createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/core.js";
import {restoreSharedDocumentEditor} from "../packages/breditor-collaboration/dist/profile.js";
import {coverageSeed,range,grid} from "./fixtures/editor-consumer/coverage-seed.mjs";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
async function runtime(directory,name){const bytes=readFileSync(resolve(directory,`${name}_bg.wasm`)),module=await import(pathToFileURL(resolve(directory,`${name}.js`)));await module.default({module_or_path:bytes});return{module,sha256:hash(bytes)};}
const schema={name:"example/interchange",version:1};
const localProfile=module=>compileStandardLayoutRichProfileV3(module,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema,extensions:[]}));
const sharedProfile=module=>module.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema,extensions:[]}));
function semantic(source){const value=JSON.parse(source);const visit=node=>{for(const m of node.properties?.["breditor/merges"]??[]){delete m.lamport;delete m.writer;delete m.counter;}for(const c of node.children??[])visit(c);};visit(value.root);return value;}
export async function probeClipboardInterchange(localDirectory,sharedDirectory,previousLocalDirectory,previousSharedDirectory){
 const local=await runtime(localDirectory,"breditor_wasm"),shared=await runtime(sharedDirectory,"breditor_shared"),oldLocal=await runtime(previousLocalDirectory,"breditor_wasm"),oldShared=await runtime(previousSharedDirectory,"breditor_shared");
 assert.equal(hash(readFileSync("packages/breditor-experimental-rich-content/dist/breditor_wasm_bg.wasm")),local.sha256,"Probe needs the matching packaged local runtime");
 assert.equal(hash(readFileSync("packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm")),shared.sha256,"Probe needs the matching packaged shared runtime");
 const lp=localProfile(local.module),sp=sharedProfile(shared.module),op=localProfile(oldLocal.module),os=sharedProfile(oldShared.module);
 let trials=0,pureStates=0,refusals=0,restores=0,future=0,previousExact=0,oldCapabilities=0,textProjections=0,inlinePolicyRefusals=0;
 try{
  const source=coverageSeed(lp.descriptor()),clips=[],donor=lp.createDocumentEditor(source);
  try{
   donor.execute({kind:"setInlineFormat",data:{change:{kind:"set",formatsJson:JSON.stringify([{type:"breditor-inline/italic",properties:{}}])},targets:[{block:"q1",start:"0",end:"2"}]}});
   for(const selection of [range("q1",0,"q1",2),{kind:"node",block:"table"},{kind:"node",block:"image"},grid(),{kind:"node",block:"list"}]){donor.execute({kind:"setSelection",selection});clips.push(donor.copyDocument());}
   donor.selectDocument();clips.push(donor.copyDocument());assert.ok(clips.every(Boolean));
  }finally{donor.dispose();}
  for(const natural of [false,true])for(const clip of clips){
   const a=createSharedDocumentEditor(sp.create(source,"101")),b=lp.createDocumentEditor(source);let ar,br;
   try{
    if(natural){a.enableTypingHistory();b.enableTypingHistory();}
    const initialDocument=a.documentJson();
    a.setReadOnly(true);b.setReadOnly(true);
    const beforeA=[a.checkpointJson(),a.view(),a.updateFrame()],beforeB=[b.checkpointJson(),b.view()];
    const root=JSON.parse(clip.structuredJson).document.root;
    for(const owner of [a,b]){
     assert.equal(owner.supportsClipboardInterchange(),true);
     assert.deepEqual(owner.admitClipboardRoot(clip.kind,JSON.stringify(root)),clip);
     assert.deepEqual(owner.validateClipboard(clip.structuredJson),clip);
     for(const [kind,value]of [[clip.kind,"{}"],["unsupported",JSON.stringify(root)],[clip.kind,JSON.stringify({...root,extra:true})],[clip.kind,JSON.stringify({...root,properties:{"breditor/document-id":"not-neutral"}})],[clip.kind," ".repeat(1024*1024+1)]]){assert.throws(()=>owner.admitClipboardRoot(kind,value));refusals++;}
     const foreign=JSON.parse(clip.structuredJson);foreign.document.schemaFingerprint=`${"0".repeat(64)}`;assert.throws(()=>owner.validateClipboard(JSON.stringify(foreign)));refusals++;
     for(const target of ["caption","code"]){if(clip.kind==="text"){assert.throws(()=>owner.projectClipboardText(range(target,0),clip.structuredJson));inlinePolicyRefusals++;continue;}const projected=owner.projectClipboardText(range(target,0),clip.structuredJson);assert.equal(projected.target,target);assert.equal(projected.text,clip.plainText);assert.ok(projected.losses.includes("block-structure"));textProjections++;}
    }
    assert.deepEqual([a.checkpointJson(),a.view(),a.updateFrame()],beforeA);assert.deepEqual([b.checkpointJson(),b.view()],beforeB);pureStates+=2;
    a.setReadOnly(false);b.setReadOnly(false);a.selectDocument();b.selectDocument();
    a.pasteDocumentClipboard(clip.structuredJson,`interchange-${trials}`);b.pasteDocumentClipboard(clip.structuredJson,`interchange-${trials}`);
    assert.equal(a.view().undoDepth,1);assert.equal(b.view().undoDepth,1);assert.deepEqual(semantic(a.documentJson()),semantic(b.documentJson()));
    const ca=a.checkpointJson(),cb=b.checkpointJson();ar=createSharedDocumentEditor(restoreSharedDocumentEditor(sp,"room",ca,natural?"typing-v1":"explicit"));br=natural?lp.restoreDocumentTypingEditor(cb):lp.restoreDocumentEditor(cb);assert.equal(ar.checkpointJson(),ca);assert.equal(br.checkpointJson(),cb);restores+=2;
    const pa=createSharedDocumentEditor(restoreSharedDocumentEditor(os,"room",ca,natural?"typing-v1":"explicit")),pb=natural?op.restoreDocumentTypingEditor(cb):op.restoreDocumentEditor(cb);
    try{
     assert.equal(pa.checkpointJson(),ca);assert.equal(pb.checkpointJson(),cb);previousExact+=2;
     for(const owner of [pa,pb]){assert.equal(owner.supportsClipboardInterchange(),false);const checkpoint=owner.checkpointJson();assert.throws(()=>owner.admitClipboardRoot(clip.kind,JSON.stringify(root)),/matching native clipboard interchange/);assert.equal(owner.checkpointJson(),checkpoint);oldCapabilities++;}
     for(const command of ["undo","redo","undo","redo"]){a[command]();ar[command]();pa[command]();b.execute({kind:command});br.execute({kind:command});pb.execute({kind:command});assert.equal(a.checkpointJson(),ar.checkpointJson());assert.equal(b.checkpointJson(),br.checkpointJson());future+=2;assert.equal(a.checkpointJson(),pa.checkpointJson());assert.equal(b.checkpointJson(),pb.checkpointJson());previousExact+=2;assert.deepEqual(semantic(a.documentJson()),semantic(b.documentJson()));if(command==="undo")assert.equal(a.documentJson(),initialDocument);}
    }finally{pa.dispose();pb.dispose();}
    trials++;
   }finally{a.dispose();b.dispose();ar?.dispose();br?.dispose();}
  }
 }finally{lp.dispose();sp.free();op.dispose();os.free();}
 assert.equal(trials,12);assert.equal(pureStates,24);assert.equal(refusals,144);assert.equal(restores,24);assert.equal(future,96);assert.equal(previousExact,120);assert.equal(oldCapabilities,24);assert.equal(textProjections,40);assert.equal(inlinePolicyRefusals,8);
 return{format:"breditor/clipboard-interchange-functional-probe",formatVersion:1,localWasmSha256:local.sha256,sharedWasmSha256:shared.sha256,previousLocalWasmSha256:oldLocal.sha256,previousSharedWasmSha256:oldShared.sha256,trials,pureNativeStates:pureStates,rejectedDraftsAndBindings:refusals,exactRestores:restores,exactFutureCheckpoints:future,previousRuntimeExactCheckpoints:previousExact,previousCapabilityRefusals:oldCapabilities,explicitCaptionCodeTextProjections:textProjections,unchangedInlinePolicyRefusals:inlinePolicyRefusals,passed:true,scope:"Actual paired application Wasm and compiled SDKs: pure native schema admission of mixed inline, table/merge, image/caption, grid, nested list and whole-root clipboard content; separate guarded paste; exact recovery/future Undo/Redo and previous-runtime bytes. No foreign HTML/Markdown parsing, system clipboard, browser, IME, accessibility or release claim."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==4)throw Error("Expected current local/shared and previous local/shared Wasm directories");console.log(JSON.stringify(await probeClipboardInterchange(...args),null,2));}
