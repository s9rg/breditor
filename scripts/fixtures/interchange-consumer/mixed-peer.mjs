/** One installed consumer process, independent native engine, DOM, storage and causal writer. */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {JSDOM} from "jsdom";
import {IDBFactory} from "fake-indexeddb";
import {WebSocket as NativeWebSocket} from "undici";
import {RichAssetStore} from "@breditor/editor";
import {initializeSharedRuntime,openSharedDocumentEditor,createLayoutSharedProfileV3,createSharedDocumentEditor,restoreSharedDocumentEditor,createSharedDocumentRelaySync,SharedRelayAssets,registerSharedRelayWriter,insertSharedImageFiles} from "@breditor/editor/collaboration";
import {pixel,pixelAsset,FixtureImage} from "./pixel.mjs";
const {createRichInterchange}=await import("@breditor/interchange");
const realm=new JSDOM("<!doctype html><body><main></main></body>",{pretendToBeVisual:true}),{window}=realm,held=new Set();let clock=1000;
Object.defineProperty(window.performance,"now",{value:()=>clock++});
const locks={request(name,options,callback){if(typeof options==="function"){callback=options;options={mode:"exclusive"};}const occupied=held.has(name);if(!occupied)held.add(name);return Promise.resolve().then(()=>callback(occupied?null:{name,mode:"exclusive"})).finally(()=>{if(!occupied)held.delete(name);});}};
Object.assign(globalThis,{window,document:window.document,indexedDB:new IDBFactory(),Image:FixtureImage});Object.defineProperty(globalThis,"navigator",{value:{locks},configurable:true});
for(const name of ["HTMLElement","HTMLInputElement","HTMLSelectElement","Node","Element","AbortController"])globalThis[name]=window[name];
let config,session,sync,store,assets,profile,identity,shadow,frames=[],assetProbe=0;const errors=[],reports=[],losses=[],remoteMetrics=[];
const nativeFetch=globalThis.fetch;
const host=window.document.querySelector("main");
function select(selection){window.document.getSelection().removeAllRanges();if(selection.kind==="document")session.selectDocument();else session.select(selection,false);}
function clip(kind,values={}){const data=new Map(Object.entries(values)),event=new window.Event(kind,{bubbles:true,cancelable:true});Object.defineProperty(event,"clipboardData",{value:{files:[],get types(){return [...data.keys()];},getData:k=>data.get(k)??"",setData:(k,v)=>data.set(k,v)}});session.surface.dispatchEvent(event);assert.equal(event.defaultPrevented,true);return Object.fromEntries(data);}
function key(key,extra={}){const event=new window.KeyboardEvent("keydown",{key,...extra,bubbles:true,cancelable:true});session.surface.dispatchEvent(event);if(key==="Enter"&&!event.defaultPrevented){const input=new window.InputEvent("beforeinput",{inputType:extra.shiftKey?"insertLineBreak":"insertParagraph",bubbles:true,cancelable:true});session.surface.dispatchEvent(input);assert.equal(input.defaultPrevented,true);}else assert.equal(event.defaultPrevented,true);}
function toolbar(id,fields={}){for(const [name,value]of Object.entries(fields)){const input=session.toolbar.querySelector(`[data-shared-field="${id}-${name}"]`);assert.ok(input,`Missing ${id}-${name}`);input.value=value;input.dispatchEvent(new window.Event("input",{bubbles:true}));}const button=session.toolbar.querySelector(`[data-shared-action="${id}"]`);assert.ok(button,`Missing ${id}`);assert.equal(button.disabled,false,`${id} unavailable`);button.click();}
async function open(initial){
 store=await RichAssetStore.open(`mixed-assets-${config.principal}`);assets=new SharedRelayAssets({endpoint:config.endpoint,principal:config.principal,getToken:()=>config.token,store});
 session=await openSharedDocumentEditor({host,selectionEditing:"document-v1",rangeEditing:"general-v1",richLanguage:3,history:config.history,database:`mixed-journal-${config.principal}`,room:"room",writer:identity.writer,initial,clipboardInterchange:core=>createRichInterchange(core,{resolveImage:({src})=>src==="https://example.test/pixel.png"?{asset:pixelAsset,generation:"pixel-generation"}:undefined,exportImage:({asset})=>asset===pixelAsset?"https://example.test/pixel.png":undefined}),resolveAsset:value=>assets.resolve(value.asset),onFiles:(files,position,revision)=>insertSharedImageFiles(session.core,store,files,position,revision),onInterchange:r=>reports.push(r),onPasteLoss:r=>losses.push(r),onError:e=>errors.push(String(e)),onClosing:()=>{sync?.dispose();assets.dispose();store.close();}});
 const receive=session.core.receiveFrame.bind(session.core),digest=()=>createHash("sha256").update(session.core.updateFrame()).digest("hex");
 session.core.receiveFrame=(frame,options)=>{const before=Buffer.byteLength(session.core.checkpointJson()),causal=digest(),pending=receive(frame,options);void pending.then(changed=>{frames.push(frame);remoteMetrics.push({frameBytes:Buffer.byteLength(frame),before,after:Buffer.byteLength(session.core.checkpointJson()),publicationChanged:changed,causalExportUnchanged:causal===digest()});if(remoteMetrics.length>256)remoteMetrics.shift();}).catch(error=>{remoteMetrics.push({frameBytes:Buffer.byteLength(frame),before,error:String(error)});});return pending;};
 sync=createSharedDocumentRelaySync(session.core,{selectionEditing:"document-v1",identity,getToken:()=>config.token,autoConnect:false,persistLocal:()=>session.flush(),onError:e=>errors.push(String(e)),onAssetsChanged:()=>session.refreshAssets()});
}
async function mirror(){if(!shadow)return;await Promise.resolve();while(frames.length)await shadow.receiveFrame(frames.shift());assert.equal(shadow.checkpointJson(),session.checkpointJson(),"Exact shadow recovery");}
async function flush(){await sync.flush();const receipt=sync.state(),clock=session.core.writerClockV2(identity.writer);assert.equal(receipt.serverThrough,clock.through);assert.equal(receipt.serverPrefixDigest,clock.prefixDigest);await mirror();}
async function state(){return{document:session.view().documentJson,checkpoint:session.checkpointJson(),view:session.view(),errors:[...errors],reports:[...reports],losses:[...losses],remoteMetrics:[...remoteMetrics],assets:await store.list(),sync:sync.state()};}
async function command(method,args){
 if(method==="init"){config=args;globalThis.WebSocket=class extends NativeWebSocket{constructor(url){super(url,{headers:{Origin:config.origin}});}};globalThis.fetch=(input,options={})=>{const url=String(input);if(url.startsWith(config.endpoint.replace("ws:","http:").replace(/\/ws$/,"/"))){const headers=new Headers(options.headers);headers.set("Origin",config.origin);return nativeFetch(input,{...options,headers});}return nativeFetch(input,options);};await initializeSharedRuntime(readFileSync(new URL(import.meta.resolve("@breditor/collaboration/wasm-binary"))));profile=await createLayoutSharedProfileV3();const registration=await registerSharedRelayWriter({endpoint:config.endpoint,principal:config.principal,room:"room",writerTransport:"atomic-v2",getToken:()=>config.token,saveIdentity:value=>{writeFileSync(config.identityPath,JSON.stringify(value),{mode:0o600,flag:"wx",flush:true});}});identity=JSON.parse(readFileSync(config.identityPath,"utf8"));assert.deepEqual(identity,registration.identity);await open({kind:"frame",frame:registration.frame});return state();}
 // Verify remote-only future steps as they arrive too. Otherwise this reference
 // replica accumulates the other author's full history until reconnect, charging
 // a backlog of test-only replay work to the online operation's RPC deadline.
 if(method==="state"){await mirror();return state();}
 if(method==="select"){select(args);return state();}
 if(method==="toolbar"){toolbar(args.id,args.fields);return state();}
 if(method==="paste"){const depth=session.view().undoDepth;clip("paste",args);assert.equal(session.view().undoDepth,depth+1,"Paste is one native group");return state();}
 if(method==="copy")return clip("copy");
 if(method==="key"){key(args.key,args.extra);return state();}
 if(method==="input"){const event=new window.InputEvent("beforeinput",{inputType:"insertText",data:args,bubbles:true,cancelable:true});session.surface.dispatchEvent(event);assert.equal(event.defaultPrevented,true);session.closeTypingGroup();return state();}
 if(method==="composition"){const depth=session.view().undoDepth;session.surface.dispatchEvent(new window.CompositionEvent("compositionstart",{bubbles:true}));session.surface.dispatchEvent(new window.CompositionEvent("compositionend",{bubbles:true,data:args}));await new Promise(resolve=>window.requestAnimationFrame(resolve));assert.equal(session.view().undoDepth,depth+1);return state();}
 if(method==="dispatch"){session.execute(args,false);return state();}
 if(method==="image"){const file=Object.assign(new Blob([pixel],{type:"image/png"}),{name:"pixel.png"});await insertSharedImageFiles(session.core,store,[file],{parent:null,before:null});return state();}
 if(method==="upload"){await assets.flush();assert.equal((await store.get(pixelAsset)).status,"uploaded");return state();}
 if(method==="download"){assert.ok(await assets.resolve(pixelAsset));assert.deepEqual(Buffer.from(await(await store.blob(pixelAsset)).arrayBuffer()),pixel);assert.equal((await store.get(pixelAsset)).status,"uploaded");const empty=await RichAssetStore.open(`mixed-download-${config.principal}-${assetProbe++}`),provider=new SharedRelayAssets({endpoint:config.endpoint,principal:config.principal,getToken:()=>config.token,store:empty});try{assert.equal((await empty.list()).length,0);assert.ok(await provider.resolve(pixelAsset));assert.deepEqual(Buffer.from(await(await empty.blob(pixelAsset)).arrayBuffer()),pixel);assert.equal((await empty.get(pixelAsset)).status,"uploaded");assert.equal((await empty.get(pixelAsset)).attempts,0);}finally{provider.dispose();empty.close();}return state();}
 if(method==="connect"){await sync.connect();await flush();return state();}
 if(method==="flush"){await flush();return state();}
 if(method==="offline"){sync.disconnect();assets.setOnline(false);return state();}
 if(method==="online"){const started=Date.now(),phases=[],trace=phase=>{phases.push({phase,elapsedMs:Date.now()-started,state:sync.state(),errors:[...errors]});writeFileSync(`${config.identityPath}.recovery.json`,JSON.stringify(phases,null,2),{mode:0o600});};trace("begin");assets.setOnline(true);await sync.connect();trace("connected");await flush();trace("verified");return state();}
 if(method==="reload"){const before=session.checkpointJson();await session.close();assert.equal(held.size,0);assert.deepEqual(JSON.parse(readFileSync(config.identityPath,"utf8")),identity);await open({kind:"resume"});assert.equal(session.checkpointJson(),before,"Durable session restart");assert.equal(session.recovered,true);return state();}
 if(method==="shadow"){shadow?.dispose();shadow=createSharedDocumentEditor(restoreSharedDocumentEditor(profile,"room",session.checkpointJson(),config.history));frames=[];await mirror();return state();}
 if(method==="history"){await mirror();const field=args==="undo"?"undoDepth":"redoDepth",before=session.view()[field],changed=session.core[args](),after=session.view()[field];assert.ok(after<before,"History must consume the selected native direction; a call may pop multiple invisible keys");if(shadow){assert.equal(shadow[args](),changed);await mirror();}return state();}
 if(method==="close"){shadow?.dispose();await session.close();profile.free();assert.equal(held.size,0);window.close();return{errors};}
 throw Error("Unknown test operation");
}
let lane=Promise.resolve();process.on("message",message=>{lane=lane.then(async()=>{try{const result=await command(message.method,message.args);process.send({id:message.id,result});}catch(error){process.send({id:message.id,error:{message:error.message,stack:error.stack}});}});});
