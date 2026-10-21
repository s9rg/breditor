/** The same native-custody law for unchanged original/search/paired durable formats. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {IDBFactory,IDBDatabase} from 'fake-indexeddb';
import {SharedRichEditor,createSharedDocumentEditor,SharedPersistentSession,SharedReviewPersistentSession} from '../packages/breditor-collaboration/dist/index.js';
const insert=(core,text)=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});
const alive=core=>{try{core.documentJson();return true;}catch{return false;}};
const cut=(core,paired)=>[core.checkpointJson(),paired?core.reviewCheckpoint():null];
function record(database){return new Promise((resolveRecord,reject)=>{const request=indexedDB.open(database,1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('journals','readonly'),get=tx.objectStore('journals').get(['room','101']);let value;get.onsuccess=()=>{value=get.result;};tx.oncomplete=()=>{db.close();resolveRecord(value);};tx.onabort=()=>{db.close();reject(tx.error);};};});}

export async function probeManagedOriginalCoreBinding(directory,{pairedOnly=false}={}){
 const bytes=readFileSync(resolve(directory,'breditor_shared_bg.wasm')),native=await import(pathToFileURL(resolve(directory,'breditor_shared.js')));await native.default({module_or_path:bytes});
 const globals=new Map(['indexedDB','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),held=new Set(),transaction=IDBDatabase.prototype.transaction;
 let abort=false,cases=0,captureRefusals=0,accessorCalls=0,exactPairChecks=0,cleanupChecks=0,failedCloseChecks=0,failedSaveChecks=0;
 const locks={request(name,_options,callback){return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}});}};
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:new IDBFactory()});Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks}});
 IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(abort&&args[1]==='readwrite')queueMicrotask(()=>{try{tx.abort();}catch{}});return tx;};
 try{
  for(const language of [1,2,3])for(const standard of [false,true]){
   const factory=language===1?(standard?'from_standard_configuration_json_v1':'from_configuration_json'):(standard?'from_standard_configuration_json_v':'from_configuration_json_v')+language;
   const profile=native.SharedRichProfile[factory](JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:language,schema:{name:'example/original-managed-custody',version:1},extensions:[]})),descriptor=JSON.parse(profile.descriptor_json());
   const document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:{kind:'element',type:'breditor/document',entityId:null,properties:{'breditor/document-id':'room'},children:[{kind:'element',type:'breditor/paragraph',entityId:null,properties:{'breditor/block-id':'p'},children:[{kind:'text',text:'seed',formats:[]}]}]}});
   try{for(const scope of [0,1,2])for(const natural of [false,true])for(const search of [false,true])for(const paired of pairedOnly?[true]:[false,true]){
    const review={actor:'comments',principal:'alice',access:'comment'},restore=input=>search?profile.restore_search('room',input):scope===2?(natural?profile.restore_document_typing('room',input):profile.restore_document('room',input)):scope===1?(natural?profile.restore_general_typing('room',input):profile.restore_general('room',input)):natural?profile.restore_typing('room',input):profile.restore('room',input);
    const options={database:'original-managed-'+cases,room:'room',writer:'101',richLanguage:language,history:natural?'typing-v1':'explicit',rangeEditing:scope?'general-v1':'original',selectionEditing:scope===2?'document-v1':'original',...(paired?{review}:{}),create:()=>profile.create(document,'101'),restore,restoreDocument:restore,restoreSearch:restore,onError:()=>{}},open=()=>paired?(search?SharedReviewPersistentSession.openSearch(options):SharedReviewPersistentSession.open(options)):search?SharedPersistentSession.openSearch(options):scope===2?SharedPersistentSession.openDocument(options):SharedPersistentSession.open(options);
    let session=await open(),foreign,owned=session.core;
    try{
     insert(owned,'Owned cut ');insert(owned,'Redo retained ');owned.undo();
     if(paired){const anchor=owned.captureReviewAnchor({kind:'selection',selection:{kind:'node',block:'p'}});owned.dispatchReview({kind:'create_thread',data:{anchorJson:anchor,body:'Retained comment'}});session.saveVersion('Owned version','1792450000000');}
     await session.flush();const binding=Object.getOwnPropertyDescriptor(session,'core'),expected=cut(owned,paired),backup=await session.exportBackup(),before=await record(options.database),recovery=paired?session.exportRecovery():null;
     const raw=restore(expected[0]),editor=search?{searchHistory:'search-v1'}:{};foreign=scope===2?createSharedDocumentEditor(raw,editor):new SharedRichEditor(raw,editor);if(paired)foreign.enableReview(review,expected[1]);insert(foreign,'Foreign cut ');const foreignCut=cut(foreign,paired);
     for(const mode of ['value','accessor','deleted']){
      if(mode==='deleted')delete session.core;else Object.defineProperty(session,'core',mode==='accessor'?{configurable:true,get(){accessorCalls++;return foreign;}}:{value:foreign,configurable:true,writable:true});
      assert.throws(()=>session.save(),error=>error.code==='managed_source_unavailable');await assert.rejects(session.exportBackup(),error=>error.code==='managed_source_unavailable');captureRefusals+=2;
      if(paired){for(const call of [()=>session.exportRecovery(),()=>session.versions(),()=>session.saveVersion('Unowned version','1792450000001'),()=>session.retainVersion(recovery.versions[0])]){assert.throws(call,error=>error.code==='managed_source_unavailable');captureRefusals++;}assert.equal(session.state().documentRevision,owned.reviewSnapshot().documentRevision);}
      await session.flush();assert.deepEqual(await record(options.database),before);assert.deepEqual(cut(owned,paired),expected);assert.deepEqual(cut(foreign,paired),foreignCut);exactPairChecks+=2;Object.defineProperty(session,'core',binding);assert.equal(await session.exportBackup(),backup);
     }
     Object.defineProperty(session,'core',{configurable:true,get(){accessorCalls++;return foreign;}});await assert.rejects(session.close(),error=>error.code==='managed_source_unavailable');assert.throws(()=>insert(owned,'retired'),/retired/);assert.equal(alive(owned),true);assert.equal(alive(foreign),true);assert.equal(held.size,paired?2:1);assert.deepEqual(await record(options.database),before);assert.deepEqual(cut(owned,paired),expected);failedCloseChecks++;
     Object.defineProperty(session,'core',binding);assert.equal(await session.exportBackup(),backup);await session.close();assert.equal(alive(owned),false);assert.equal(alive(foreign),true);assert.equal(held.size,0);cleanupChecks++;
     session=await open();owned=session.core;assert.deepEqual(cut(owned,paired),expected);Object.defineProperty(session,'core',{configurable:true,get(){accessorCalls++;return foreign;}});await session.discardAndClose();assert.equal(alive(owned),false);assert.equal(alive(foreign),true);assert.equal(held.size,0);assert.deepEqual(await record(options.database),before);cleanupChecks++;
     if(language===3&&standard&&scope===2&&natural){
      session=await open();owned=session.core;const originalBinding=Object.getOwnPropertyDescriptor(session,'core');abort=true;insert(owned,'Unsaved offline ');await assert.rejects(session.flush());const unsaved=cut(owned,paired),head=await record(options.database);
      Object.defineProperty(session,'core',{configurable:true,get(){accessorCalls++;return foreign;}});await assert.rejects(session.retry(),error=>error.code==='managed_source_unavailable');assert.deepEqual(await record(options.database),head);assert.deepEqual(cut(owned,paired),unsaved);
      Object.defineProperty(session,'core',originalBinding);abort=false;await session.retry();await session.close();session=await open();owned=session.core;assert.deepEqual(cut(owned,paired),unsaved);failedSaveChecks++;
     }
     cases++;
    }finally{abort=false;await session.discardAndClose();if(alive(owned))owned.dispose();if(foreign&&alive(foreign))foreign.dispose();}
   }}finally{profile.free();}
  }
  assert.equal(cases,pairedOnly?72:144);assert.equal(accessorCalls,0);assert.equal(held.size,0);assert.equal(failedSaveChecks,pairedOnly?2:4);
  return{format:'breditor/managed-original-core-binding-probe',passed:true,pairedOnly,cases,captureRefusals,accessorCalls,exactPairChecks,cleanupChecks,failedCloseChecks,failedSaveChecks,sharedWasmSha256:createHash('sha256').update(bytes).digest('hex'),scope:'Unchanged native original/search/document and paired durable families; synthetic IDB/Web Locks. Public binding changes cannot redirect capture, backup, version admission or cleanup. No physical crash-durability claim.'};
 }finally{IDBDatabase.prototype.transaction=transaction;for(const[key,value]of globals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length<3||process.argv.length>4||process.argv[3]!==undefined&&process.argv[3]!=='--paired-only')throw Error('Expected generated shared runtime directory and optional --paired-only diagnosis');console.log(JSON.stringify(await probeManagedOriginalCoreBinding(process.argv[2],{pairedOnly:process.argv[3]==='--paired-only'}),null,2));}
