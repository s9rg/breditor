import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import {SharedRichEditor,SharedPersistentSession,mountSharedEditor,createStandardSharedToolbarV1,insertSharedImageFiles,compileSharedProfile,compileStandardSharedProfileV1,SharedPresence,SharedPresenceOverlay,SharedRelaySync,SharedRelayAssets,registerSharedRelayWriter} from "@breditor/experimental-collaboration";
import {render,model,refreshAssets} from "@breditor/experimental-rich-content/rendering";
import {createRichInlinePresentation,compileRichProfile,compileStandardRichProfileV1,createStandardRichInlinePresentationV1,createStandardRichToolbarV1} from "@breditor/experimental-rich-content";
import * as localWasm from "@breditor/experimental-rich-content/wasm";
import {createInlineFormatRenderManifest,compileInlineFormatRecipes} from "@breditor/browser/presentation";
import {assertLocalFormatBudget} from "./local-format-budget.mjs";
const wasm=await import(pathToFileURL(process.env.BREDITOR_PROBE_MODULE).href);
wasm.initSync({module:readFileSync(process.env.BREDITOR_PROBE_BINARY)});
const vector=JSON.parse(readFileSync(process.env.BREDITOR_PROBE_VECTOR,"utf8"));
const require=createRequire(import.meta.url);
localWasm.initSync({module:readFileSync(require.resolve("@breditor/experimental-rich-content/wasm-binary"))});
const localProfile=compileRichProfile(localWasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/installed-local",version:1},extensions:[]}));
try{const catalog=JSON.parse(localProfile.inlineCatalogJson()),binding=localProfile.descriptor();assert.equal(catalog.schema.fingerprint,binding.schemaFingerprint);assert.equal(catalog.formats[0].kind,"breditor/strong");
 const local=localProfile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"installed-local"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p"},children:[]}]}}));try{assert.equal(local.inlineFormatState("breditor/strong").state.kind,"unavailable");}finally{local.dispose();}
}finally{localProfile.dispose();}
const simpleConfiguration={format:"breditor/shared-rich-profile",formatVersion:1,schema:{name:"example/installed-presentation",version:1},extensions:[]};
const standardSchema={name:"example/installed-standard",version:1},localStandard=compileStandardRichProfileV1(localWasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:standardSchema,extensions:[]})),sharedStandard=compileStandardSharedProfileV1(wasm,{format:"breditor/shared-rich-profile",formatVersion:1,schema:standardSchema,extensions:[]});
try{
 assert.equal(localStandard.inlineCatalogJson(),sharedStandard.inline_catalog_json());assert.equal(createStandardRichInlinePresentationV1(localStandard.inlineCatalogJson()).recipesOuterToInner.length,12);
 assertLocalFormatBudget(localStandard);
 const binding=localStandard.descriptor(),local=localStandard.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"installed-standard"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p"},children:[{kind:"text",text:"a🙂b",formats:[{type:"breditor-inline/superscript",properties:{}}]}]}]}}));
 try{
  const presentation=createStandardRichInlinePresentationV1(localStandard.inlineCatalogJson());assert.equal(local.supportsStandardInlineControls(),true);assert.ok(createStandardRichToolbarV1(local,presentation).some(c=>c.id==="link"));assert.throws(()=>createStandardRichToolbarV1({supportsStandardInlineControls:()=>false},presentation));
  local.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:"1",affinity:"before"},focus:{block:"p",offset:"1",affinity:"before"}}});assert.deepEqual(local.caretFormats(),[{type:"breditor-inline/superscript",properties:{}}]);
  const before=local.documentJson();local.execute({kind:"changeInlineFormats",data:{changes:[{kind:"set",formatsJson:'[{"type":"breditor-inline/subscript","properties":{}}]'},{kind:"remove",format:"breditor-inline/superscript"}],targets:[{block:"p",start:"0",end:"4"}]}});
  assert.equal(local.view().undoDepth,1);const after=local.documentJson();assert.ok(after.includes("breditor-inline/subscript"));assert.ok(!after.includes("breditor-inline/superscript"));local.execute({kind:"undo"});assert.equal(local.documentJson(),before);
  const restored=localStandard.restoreEditor(local.checkpointJson());try{restored.execute({kind:"redo"});assert.equal(restored.documentJson(),after);restored.execute({kind:"undo"});assert.equal(restored.documentJson(),before);}finally{restored.dispose();}
 }finally{local.dispose();}
}finally{localStandard.dispose();sharedStandard.free();}
const simple=compileSharedProfile(wasm,simpleConfiguration);
const simpleCatalog=JSON.parse(simple.inline_catalog_json()),manifest=createInlineFormatRenderManifest({recipes:[{formatKind:"breditor/strong",element:"strong"}]});
const presentation=createRichInlinePresentation(simple.inline_catalog_json(),manifest);
assert.equal(presentation.schema.fingerprint,simpleCatalog.schema.fingerprint);assert.ok(Object.isFrozen(presentation));
assert.equal(compileInlineFormatRecipes(simpleCatalog.formats,manifest).length,1);simple.free();
const a=new SharedRichEditor(new wasm.RichReplicaProbe(vector.rich_local_input,"101"));
assert.equal(a.supportsInlineFormatState(),true);assert.equal(a.inlineFormatState("breditor/strong").state.kind,"unavailable");
a.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Packaged "}}]});
a.undo();const checkpoint=a.checkpointJson(),b=new SharedRichEditor(wasm.RichReplicaProbe.restore("room",checkpoint));
a.redo();b.redo();assert.equal(a.checkpointJson(),b.checkpointJson());assert.equal(a.documentJson(),b.documentJson());
for(const api of[SharedPersistentSession,mountSharedEditor,createStandardSharedToolbarV1,createStandardRichToolbarV1,insertSharedImageFiles,render,model,refreshAssets,SharedRelaySync,SharedRelayAssets,SharedPresenceOverlay,registerSharedRelayWriter])assert.equal(typeof api,"function");
a.dispose();b.dispose();
const v=vector.shared_profile,p=compileSharedProfile(wasm,v.configuration),custom=new SharedRichEditor(p.restore("room",v.checkpoint));p.free();
const state=name=>{assert.deepEqual(custom.view(),JSON.parse(v[name].view));assert.equal(custom.checkpointJson(),v[name].checkpoint);};
state("current");custom.undo();state("undo");custom.redo();state("redo");custom.type("!");state("typed");custom.undo();state("undo_typed");custom.redo();state("redo_typed");assert.ok(custom.documentJson().includes('"example/priority":0'));
const q=compileSharedProfile(wasm,v.configuration),peer=new SharedRichEditor(q.join_frame("room","404",custom.updateFrame()));q.free();const presence=new SharedPresence(custom,{autoExpire:false});peer.select({kind:"node",block:"image-block"});presence.announce({writer:"404",session:"consumer-peer",label:"Peer"});const unchanged=custom.checkpointJson();presence.receive("404","consumer-peer","1",peer.presenceFrame());assert.equal(presence.view()[0].resolution.kind,"resolved");assert.equal(custom.checkpointJson(),unchanged);presence.dispose();peer.dispose();custom.dispose();
const transport=new SharedRichEditor(wasm.RichReplicaProbe.restore("room",vector.shared_writer.initialA));transport.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Packaged transport"}}]});const prior=transport.checkpointJson(),outgoing=transport.writerGroups("0");assert.equal(outgoing.groups.length,1);assert.equal(JSON.parse(outgoing.groups[0]).kind,"action");assert.equal(outgoing.through,transport.writerClock("9007199254740993").through);assert.equal(transport.checkpointJson(),prior);assert.deepEqual(transport.writerGroups(outgoing.through).groups,[]);transport.dispose();
console.log("Installed shared package imports, configured factories, generated types and real Wasm future history passed");
const offlineCore=new SharedRichEditor(wasm.RichReplicaProbe.restore("room",vector.shared_writer.initialA)),beforeOffline=offlineCore.checkpointJson();
const sync=new SharedRelaySync(offlineCore,{identity:{endpoint:"ws://127.0.0.1:1/ws",principal:"consumer",room:"room",writer:"9007199254740993",credential:"a".repeat(64)},getToken:()=>{throw Error("Offline consumer must not fetch a token");},autoConnect:false});
assert.equal(sync.state().status,"offline");assert.equal(offlineCore.checkpointJson(),beforeOffline);
const cancelled=offlineCore.receiveFrame("not-json",{signal:AbortSignal.abort()}).then(()=>"accepted",error=>error.code);assert.equal(await cancelled,"remote_cancelled");assert.equal(offlineCore.checkpointJson(),beforeOffline);
sync.dispose();assert.equal(sync.state().status,"closed");offlineCore.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Transport disposal retains editor"}}]});assert.ok(offlineCore.documentJson().includes("Transport disposal retains editor"));offlineCore.dispose();
console.log("Installed relay API, offline ownership and cancellable remote publication passed");
let tokenCalls=0;
const assets=new SharedRelayAssets({endpoint:"ws://127.0.0.1:1/ws",principal:"consumer",getToken:()=>{tokenCalls++;throw Error("Offline assets must not authenticate");},store:{resolve:async()=>undefined,cacheRemote:async()=>{throw Error("No remote bytes");},flush:async()=>{}}});
assets.setOnline(false);assert.equal(await assets.resolve("sha256:"+"0".repeat(64)),undefined);assert.equal(await assets.resolve("custom:host-asset"),undefined);assert.equal(tokenCalls,0);assets.dispose();await assert.rejects(assets.resolve("custom:host-asset"),e=>e.code==="closed");
console.log("Installed asset provider offline lifecycle and rendering refresh exports passed");
