// Functional native/Wasm proof through package-root APIs; reused by clean external consumers.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {initializeLocalRuntime,createLocalProfile,createStructuralLocalProfileV2,createLayoutLocalProfileV3,emptyDocumentJson} from "@breditor/editor";
import {initializeSharedRuntime,createSharedProfile,createStructuralSharedProfileV2,createLayoutSharedProfileV3,SharedRichEditor} from "@breditor/editor/collaboration";
import {coverageSeed,range,grid} from "./coverage-seed.mjs";
const require=createRequire(import.meta.url),bytes=name=>readFileSync(require.resolve(name));
const localBytes=bytes("@breditor/experimental-rich-content/wasm-binary"),sharedBytes=bytes("@breditor/collaboration/wasm-binary");
await initializeLocalRuntime(localBytes);await initializeSharedRuntime(sharedBytes);
const local=await createLayoutLocalProfileV3(),shared=await createLayoutSharedProfileV3();
const full={alignment:"start",direction:"rtl",indent:12,lineHeightPercent:300};
const binding=local.descriptor(),sharedBinding=JSON.parse(shared.descriptor_json()),source=coverageSeed(binding);
const cases={local:0,shared:0,legacy:0,clipboard:0};
const fields=c=>{const s=c.blockLayoutState();assert.deepEqual(s.alignment,{kind:"uniform",value:"start"});assert.deepEqual(s.direction,{kind:"uniform",value:"rtl"});assert.deepEqual(s.indent,{kind:"uniform",value:12});assert.deepEqual(s.lineHeightPercent,{kind:"uniform",value:300});};
const synchronize=async(a,b)=>{const x=a.updateFrame(),y=b.updateFrame();await a.receiveFrame(y);await b.receiveFrame(x);assert.equal(a.documentJson(),b.documentJson());};
try{
 assert.equal(binding.richLanguageVersion,3);assert.equal(binding.taskStructureVersion,1);assert.equal(binding.blockLayoutVersion,1);
 assert.equal(sharedBinding.modelVersion,13);assert.equal(sharedBinding.journalVersion,14);assert.equal(sharedBinding.blockLayoutVersion,1);
 assert.deepEqual(binding.schema,sharedBinding.schema);assert.equal(binding.schemaFingerprint,sharedBinding.schemaFingerprint);assert.equal(local.inlineCatalogJson(),shared.inline_catalog_json());
 for(const selection of [range("empty",0),range("code",5,"task-head",2),grid(),{kind:"node",block:"image"},{kind:"node",block:"list"}])for(const typing of [false,true]){
  const c=local.createEditor(source);let recovered;
  try{
   if(typing)c.enableTypingHistory();c.execute({kind:"setSelection",selection});assert.equal(c.supportsBlockLayout(),true);
   const before=c.documentJson();assert.equal(c.execute({kind:"changeSelectionLayout",data:full}),"content");fields(c);
   const saved=c.checkpointJson();assert.equal(c.execute({kind:"changeSelectionLayout",data:full}),"unchanged");assert.equal(c.checkpointJson(),saved);
   recovered=typing?local.restoreTypingEditor(saved):local.restoreEditor(saved);
   for(const kind of ["undo","redo","undo","redo"]){assert.equal(c.execute({kind}),kind);assert.equal(recovered.execute({kind}),kind);assert.equal(c.checkpointJson(),recovered.checkpointJson());if(kind==="undo")assert.equal(c.documentJson(),before);}
   c.execute({kind:"changeSelectionLayout",data:{alignment:null,indent:0}});assert.deepEqual(c.blockLayoutState().alignment,{kind:"uniform",value:null});assert.deepEqual(c.blockLayoutState().direction,{kind:"uniform",value:"rtl"});
   cases.local++;
  }finally{c.dispose();recovered?.dispose();}
 }
 for(const typing of [false,true])for(const reverse of [false,true]){
  const a=new SharedRichEditor(shared.create(source,"101")),b=new SharedRichEditor(shared.join_frame("room","202",a.updateFrame()));let restored;
  try{
   if(typing)a.enableTypingHistory();a.select(grid());b.select(grid());
   a.changeSelectionLayout({alignment:"start",indent:12});b.changeSelectionLayout({direction:"rtl",lineHeightPercent:300});
   b.dispatch({commands:[{kind:"insert_text",data:{block:"p-0-0",offset:1,text:"PEER"}}]});
   if(reverse)await synchronize(b,a);else await synchronize(a,b);fields(a);fields(b);
   const saved=a.checkpointJson();restored=new SharedRichEditor(typing?shared.restore_typing("room",saved):shared.restore("room",saved));
   for(const redo of [false,true,false,true]){
    if(redo){a.redo();restored.redo();fields(a);}else{a.undo();restored.undo();assert.deepEqual(a.blockLayoutState().alignment,{kind:"uniform",value:null});assert.deepEqual(a.blockLayoutState().direction,{kind:"uniform",value:"rtl"});assert.ok(a.documentJson().includes("PEER"));}
    assert.equal(a.checkpointJson(),restored.checkpointJson());
   }
   const revision=a.view().revision;a.setReadOnly(true,revision);const locked=a.checkpointJson();assert.throws(()=>a.changeSelectionLayout(full,revision),/older shared publication/);assert.throws(()=>a.changeSelectionLayout(full),/read-only/);assert.equal(a.checkpointJson(),locked);fields(a);
   cases.shared++;
  }finally{a.dispose();b.dispose();restored?.dispose();}
 }
 const c=local.createEditor(source);try{
  c.execute({kind:"setSelection",selection:{kind:"node",block:"image"}});c.execute({kind:"changeSelectionLayout",data:full});
  const clipboard=c.clipboard(),before=c.documentJson();assert.equal(clipboard.kind,"flow");
  c.execute({kind:"pasteFlowClipboard",data:{clipboardJson:clipboard.structuredJson,position:{parent:{kind:"document"},before:null},allocation:{prefix:"layout-paste",replica:"909",counter:"1",lamport:"1"}}});
  const image=JSON.parse(c.documentJson()).root.children.at(-1);assert.equal(image.type,"breditor/image");assert.equal(image.properties["breditor/asset-id"],"asset");assert.equal(image.children[0].properties["breditor/block-align"],1);assert.notEqual(image.children[0].properties["breditor/block-id"],"caption");
  c.execute({kind:"undo"});assert.equal(c.documentJson(),before);c.execute({kind:"redo"});cases.clipboard++;
 }finally{c.dispose();}
 for(const factory of [createLocalProfile,createStructuralLocalProfileV2]){
  const p=await factory();let c;
  try{c=p.createEditor(emptyDocumentJson(p.descriptor(),"legacy-room","p"));c.execute({kind:"setSelection",selection:range("p",0)});assert.equal(c.supportsBlockLayout(),false);const saved=c.checkpointJson();assert.throws(()=>c.execute({kind:"changeSelectionLayout",data:full}));assert.equal(c.checkpointJson(),saved);cases.legacy++;}finally{c?.dispose();p.dispose();}
 }
 for(const factory of [createSharedProfile,createStructuralSharedProfileV2]){
  const p=await factory();let c;
  try{const d=JSON.parse(p.descriptor_json());c=new SharedRichEditor(p.create(emptyDocumentJson(d,"legacy-room","p"),"303"));assert.equal(c.supportsBlockLayout(),false);const saved=c.checkpointJson();assert.throws(()=>c.changeSelectionLayout(full));assert.equal(c.checkpointJson(),saved);cases.legacy++;}finally{c?.dispose();p.free();}
 }
 console.log(JSON.stringify({format:"breditor/layout-runtime-proof",formatVersion:1,cases,localWasmSha256:createHash("sha256").update(localBytes).digest("hex"),sharedWasmSha256:createHash("sha256").update(sharedBytes).digest("hex"),scope:"Actual Wasm through package-root factories; no DOM/browser or clean-install claim unless run by the external consumer gate"}));
}finally{local.dispose();shared.free();}
