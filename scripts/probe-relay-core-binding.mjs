/** Direct relay lifecycle guards must not execute a shadow public-core getter. No sockets. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import {SharedSegmentedRelaySession} from '../packages/breditor-collaboration/dist/index.js';
const insert=core=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Retained '}}]});
export async function probeRelayCoreBinding(directory){
 const bytes=readFileSync(resolve(directory,'breditor_shared_bg.wasm')),native=await import(pathToFileURL(resolve(directory,'breditor_shared.js')));await native.default({module_or_path:bytes});
 const globals=new Map(['indexedDB','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)])),held=new Set(),locks={request(name,_options,callback){return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}});}};
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:new IDBFactory()});Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks}});
 let cases=0,shadowRefusals=0,getterCalls=0,exactNativeCuts=0,successfulSeals=0,coldReopens=0;
 try{
  for(const language of [1,2,3])for(const standard of [false,true]){
   const factory=language===1?(standard?'from_standard_configuration_json_v1':'from_configuration_json'):(standard?'from_standard_configuration_json_v':'from_configuration_json_v')+language,profile=native.SharedRichProfile[factory](JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:language,schema:{name:'example/relay-core-binding',version:1},extensions:[]})),d=JSON.parse(profile.descriptor_json());
   const document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:d.schema,schemaFingerprint:d.schemaFingerprint,root:{kind:'element',type:'breditor/document',entityId:null,properties:{'breditor/document-id':'room'},children:[{kind:'element',type:'breditor/paragraph',entityId:null,properties:{'breditor/block-id':'p'},children:[{kind:'text',text:'seed',formats:[]}]}]}});
   try{for(const scope of [0,1,2])for(const natural of [false,true]){
    const options={database:'relay-core-binding-'+cases,room:'room',writer:'101',richLanguage:language,history:natural?'typing-v1':'explicit',rangeEditing:scope?'general-v1':'original',selectionEditing:scope===2?'document-v1':'original',searchHistory:null,reviewedHistory:null,readOnly:false,initialGenerations:{root:'root',active:'one'},binding:{document:{endpoint:'ws://127.0.0.1:49999/ws',principal:'alice',room:'room',writer:'101',writerTransport:'atomic-v2'},review:null},create:()=>profile.create(document,'101'),restoreSegmented:input=>profile.restore_segmented('room',input)};
    let session=await SharedSegmentedRelaySession.open(options);const owned=session.core;
    try{
     insert(owned);await session.flush();const before=session.exportRecovery();
     for(const mode of ['getter','data']){
      Object.defineProperty(session,'core',mode==='getter'?{configurable:true,get(){getterCalls++;return owned;}}:{configurable:true,value:owned});
      try{await assert.rejects(session.sealGeneration('refused'),error=>error.code==='segmented_relay_source_retired');}catch(error){console.error(JSON.stringify({mode,getterCalls,nativeCutChanged:owned.checkpointJson()!==before.source.checkpoint}));throw error;}shadowRefusals++;assert.equal(owned.checkpointJson(),before.source.checkpoint);assert.deepEqual(session.exportRecovery(),before);exactNativeCuts++;delete session.core;
     }
     await session.sealGeneration('two');successfulSeals++;const exact=session.exportRecovery();await session.close();session=await SharedSegmentedRelaySession.open(options);assert.deepEqual(session.exportRecovery(),exact);coldReopens++;cases++;
    }finally{await session.discardAndClose();}
   }}finally{profile.free();}
  }
  assert.equal(cases,36);assert.equal(shadowRefusals,72);assert.equal(getterCalls,0);assert.equal(held.size,0);
  return{format:'breditor/relay-core-binding-probe',passed:true,cases,shadowRefusals,getterCalls,exactNativeCuts,successfulSeals,coldReopens,sharedWasmSha256:createHash('sha256').update(bytes).digest('hex'),scope:'Genuine idle relay sessions and actual native owners with synthetic IDB/Web Locks. Direct guards reject own shadow bindings without executing getters. No relay connection, authenticated server or physical durability claim.'};
 }finally{for(const[name,value]of globals){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error('Expected actual generated native runtime');console.log(JSON.stringify(await probeRelayCoreBinding(process.argv[2]),null,2));}
