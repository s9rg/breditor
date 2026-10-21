/** Actual native custody regression; synthetic IDB/locks, not physical crash durability. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {IDBFactory,IDBDatabase} from 'fake-indexeddb';
import {SharedRichEditor,createSharedDocumentEditor,SharedSegmentedPersistentSession} from '../packages/breditor-collaboration/dist/index.js';

const insert=(core,text)=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});
const alive=core=>{try{core.documentJson();return true;}catch{return false;}};
function readHead(database){return new Promise((resolveHead,reject)=>{const request=indexedDB.open(database,1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('generation_heads','readonly'),get=tx.objectStore('generation_heads').get(['room','101']);let value;get.onsuccess=()=>{value=get.result;};tx.oncomplete=()=>{db.close();resolveHead(value);};tx.onabort=()=>{db.close();reject(tx.error);};};});}
function pairedCut(core,paired){return[core.checkpointJson(),paired?core.reviewCheckpoint():null];}

export async function probeManagedCoreBinding(directory){
 const bytes=readFileSync(resolve(directory,'breditor_shared_bg.wasm')),native=await import(pathToFileURL(resolve(directory,'breditor_shared.js')));await native.default({module_or_path:bytes});
 const globals=new Map(['indexedDB','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),held=new Set(),transaction=IDBDatabase.prototype.transaction;
 let abort=false,counter=0,cases=0,captureRefusals=0,accessorCalls=0,exactPairChecks=0,cleanupChecks=0,failedCloseChecks=0,failedSaveChecks=0;
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:new IDBFactory()});
 const locks={request(name,_options,callback){return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}});}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks}});
 IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(abort&&args[1]==='readwrite'&&Array.isArray(args[0])&&args[0].includes('generation_heads'))queueMicrotask(()=>{try{tx.abort();}catch{}});return tx;};
 try{
  for(const language of [1,2,3])for(const standard of [false,true]){
   const factory=language===1?(standard?'from_standard_configuration_json_v1':'from_configuration_json'):(standard?'from_standard_configuration_json_v':'from_configuration_json_v')+language;
   const profile=native.SharedRichProfile[factory](JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:language,schema:{name:'example/managed-core-custody',version:1},extensions:[]})),descriptor=JSON.parse(profile.descriptor_json());
   const document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:{kind:'element',type:'breditor/document',entityId:null,properties:{'breditor/document-id':'room'},children:[{kind:'element',type:'breditor/paragraph',entityId:null,properties:{'breditor/block-id':'p'},children:[{kind:'text',text:'seed',formats:[]}]}]}});
   try{for(const scope of [0,1,2])for(const natural of [false,true])for(const paired of [false,true]){
    const review={actor:'comments',principal:'alice',access:'comment'},options={database:'managed-core-'+counter++,room:'room',writer:'101',richLanguage:language,history:natural?'typing-v1':'explicit',rangeEditing:scope?'general-v1':'original',selectionEditing:scope===2?'document-v1':'original',searchHistory:null,reviewedHistory:null,readOnly:false,initialGenerations:{root:'root',active:'one'},...(paired?{review}:{}),create:()=>profile.create(document,'101'),restoreSegmented:input=>profile.restore_segmented('room',input),onError:()=>{}};
    let session=await SharedSegmentedPersistentSession.open(options),foreign;
    try{
     insert(session.core,'Owned cut ');await session.sealGeneration('two');insert(session.core,'Redo retained ');session.core.undo();
     if(paired){const anchor=session.core.captureReviewAnchor({kind:'selection',selection:{kind:'node',block:'p'}});session.core.dispatchReview({kind:'create_thread',data:{anchorJson:anchor,body:'Retained comment'}});session.saveVersion('Owned version','1792450000000');}
     await session.flush();const owned=session.core,binding=Object.getOwnPropertyDescriptor(session,'core'),expected=pairedCut(owned,paired),recovery=session.exportRecovery();
     const raw=profile.restore_segmented('room',expected[0]);foreign=scope===2?createSharedDocumentEditor(raw,{segmentedHistory:'segmented-v1'}):new SharedRichEditor(raw,{segmentedHistory:'segmented-v1'});if(paired)foreign.enableReview(review,expected[1]);insert(foreign,'Foreign cut ');const foreignCut=pairedCut(foreign,paired),before=await readHead(options.database);
     for(const mode of ['value','accessor','deleted']){
      if(mode==='deleted')delete session.core;
      else Object.defineProperty(session,'core',mode==='accessor'?{configurable:true,get(){accessorCalls++;return foreign;}}:{value:foreign,configurable:true,writable:true});
      for(const call of [()=>session.save(),()=>session.exportRecovery(),()=>session.versions(),()=>session.checkBorrowedSource(owned),()=>session.checkBorrowedSource(foreign)]){assert.throws(call,error=>error.code==='segmented_source_unavailable');captureRefusals++;}
      for(const call of [()=>session.sealGeneration('unowned'),()=>session.sealObserverGeneration('unowned')]){await assert.rejects(call,error=>error.code==='segmented_source_unavailable');captureRefusals++;}
      if(paired){assert.throws(()=>session.saveVersion('Unowned version','1792450000001'),error=>error.code==='segmented_source_unavailable');assert.throws(()=>session.retainVersion(recovery.versions[0]),error=>error.code==='segmented_source_unavailable');captureRefusals+=2;}
      await session.flush();assert.equal(await readHead(options.database),before);assert.deepEqual(pairedCut(owned,paired),expected);assert.deepEqual(pairedCut(foreign,paired),foreignCut);exactPairChecks+=2;
      Object.defineProperty(session,'core',binding);assert.deepEqual(session.exportRecovery(),recovery);
     }
     // A failed final save retires the actual owner and retains both leases and exact bytes.
     Object.defineProperty(session,'core',{configurable:true,get(){accessorCalls++;return foreign;}});
     await assert.rejects(session.close(),error=>error.code==='segmented_source_unavailable');assert.throws(()=>insert(owned,'retired'),/retired/);assert.equal(alive(owned),true);assert.equal(alive(foreign),true);assert.equal(held.size,paired?2:1);assert.equal(await readHead(options.database),before);assert.deepEqual(pairedCut(owned,paired),expected);failedCloseChecks++;
     Object.defineProperty(session,'core',binding);assert.deepEqual(session.exportRecovery(),recovery);await session.close();assert.equal(alive(owned),false);assert.equal(alive(foreign),true);assert.equal(held.size,0);cleanupChecks++;
     session=await SharedSegmentedPersistentSession.open(options);assert.deepEqual(session.exportRecovery(),recovery);const reopened=session.core;
     // Explicit discard always releases its own native owner, even behind a replacement accessor.
     Object.defineProperty(session,'core',{configurable:true,get(){accessorCalls++;return foreign;}});await session.discardAndClose();assert.equal(alive(reopened),false);assert.equal(alive(foreign),true);assert.equal(held.size,0);assert.equal(await readHead(options.database),before);cleanupChecks++;
     if(language===3&&standard&&scope===2&&natural){
      session=await SharedSegmentedPersistentSession.open(options);const original=session.core,originalBinding=Object.getOwnPropertyDescriptor(session,'core');abort=true;insert(original,'Unsaved offline ');await assert.rejects(session.flush());const unsaved=session.exportRecovery(),head=await readHead(options.database);
      Object.defineProperty(session,'core',{configurable:true,get(){accessorCalls++;return foreign;}});await assert.rejects(session.retry(),error=>error.code==='segmented_source_unavailable');assert.equal(await readHead(options.database),head);assert.deepEqual(pairedCut(original,paired),[unsaved.checkpoint,unsaved.reviewCheckpoint]);
      Object.defineProperty(session,'core',originalBinding);abort=false;await session.retry();assert.deepEqual(session.exportRecovery(),unsaved);await session.close();session=await SharedSegmentedPersistentSession.open(options);assert.deepEqual(session.exportRecovery(),unsaved);failedSaveChecks++;
     }
     cases++;
    }finally{abort=false;await session.discardAndClose();foreign?.dispose();}
   }}finally{profile.free();}
  }
  assert.equal(cases,72);assert.equal(accessorCalls,0);assert.equal(held.size,0);assert.equal(failedSaveChecks,2);
  return{format:'breditor/managed-core-binding-probe',passed:true,cases,captureRefusals,accessorCalls,exactPairChecks,cleanupChecks,failedCloseChecks,failedSaveChecks,sharedWasmSha256:createHash('sha256').update(bytes).digest('hex'),scope:'Actual normal native owners and SDK; synthetic IDB/Web Locks. Public binding replacement, deletion and accessors cannot redirect capture or ownership cleanup. Not physical crash durability or whole-room activation.'};
 }finally{IDBDatabase.prototype.transaction=transaction;for(const[key,value]of globals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error('Expected generated shared runtime directory');console.log(JSON.stringify(await probeManagedCoreBinding(process.argv[2]),null,2));}
