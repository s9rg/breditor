/** Actual native SDK/storage cuts with synthetic IndexedDB/Web Locks; no browser durability claim. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {IDBFactory,IDBDatabase} from 'fake-indexeddb';
import {SharedRichEditor,SharedSegmentedPersistentSession,restoreSharedSegmentedEditor} from '../packages/breditor-collaboration/dist/index.js';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const root=canonical(JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')));
const insert=(core,text)=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});
const pair=(core,paired)=>[core.checkpointJson(),paired?core.reviewCheckpoint():null];
function locks(){const held=new Set();return {held,request(name,options,callback){assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}});}};}
async function stored(name){
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(name,1);q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result);});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction(['generation_heads','generation_files'],'readonly'),r=tx.objectStore('generation_heads').get(['room','101']);let head,files=[];r.onsuccess=()=>{head=JSON.parse(r.result);for(const ref of [head.root,...head.sealed]){const q=tx.objectStore('generation_files').get(['room','101',ref.generation]);q.onsuccess=()=>files.push(JSON.parse(q.result));}};tx.oncomplete=()=>resolve({head,files});tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}

export async function probeReadOnlyHistorySdk(directory){
 const globals=new Map(['indexedDB','navigator'].map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)])),host=locks(),transaction=IDBDatabase.prototype.transaction;let faultDatabase,fault;
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:new IDBFactory()});Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:host}});
 IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(this.name===faultDatabase&&args[1]==='readwrite'){
  const selected=fault;faultDatabase=undefined;fault=undefined;
  if(selected==='abort')queueMicrotask(()=>{try{tx.abort();}catch{}});
  else if(selected==='lost-ack')Object.defineProperty(tx,'oncomplete',{configurable:true,set(){tx.addEventListener('complete',event=>{tx.onabort?.(event);});}});
 }return tx;};
 const counts={cases:0,pairedCases:0,coldPairs:0,passiveSeals:0,oldObserverRefusals:0,rootFileComparisons:0,firstSealedFileComparisons:0,saveAborts:0,lostAcknowledgements:0,futureHistoryPairs:0};
 const reviewed={binding:'a'.repeat(64),principal:'alice',effectWriter:'900'},review={actor:'passive-review',principal:'alice',access:'comment'};
 try{
 const native=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href);await native.default({module_or_path:readFileSync(resolve(directory,'breditor_shared_bg.wasm'))});
 for(const language of [1,2,3])for(const standard of [false,true]){
  const constructor=language===1?(standard?'from_standard_configuration_json_v1':'from_configuration_json'):(standard?'from_standard_configuration_json_v'+language:'from_configuration_json_v'+language),profile=native.SharedRichProfile[constructor](JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:language,schema:{name:'example/passive-history-sdk',version:1},extensions:[]}));
  try{const descriptor=JSON.parse(profile.descriptor_json()),input=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root});
   for(const scope of [0,1,2])for(let mask=0;mask<8;mask++)for(const paired of mask&2?[true]:[false,true]){
    const options={database:'passive-sdk-'+counts.cases,room:'room',writer:'101',richLanguage:language,history:mask&1?'typing-v1':'explicit',rangeEditing:scope?'general-v1':'original',selectionEditing:scope===2?'document-v1':'original',searchHistory:mask&4?'search-v1':null,reviewedHistory:mask&2?reviewed:null,readOnly:false,initialGenerations:{root:'root',active:'one'},...(paired?{review}:{}),create:()=>profile.create(input,'101'),restoreSegmented:checkpoint=>restoreSharedSegmentedEditor(profile,'room',checkpoint),onError:()=>{}};
    let session,peer,oracle;
    try{
     session=await SharedSegmentedPersistentSession.open(options);
     insert(session.core,'First ');insert(session.core,'Saved Redo ');assert.equal(session.core.undo(),true);
     if(paired){const anchor=session.core.captureReviewAnchor({kind:'selection',selection:{kind:'node',block:'image-block'}}),born=session.core.dispatchReview({kind:'create_thread',data:{anchorJson:anchor,body:'Original comment'}});session.core.dispatchReview({kind:'reply',data:{thread:born.event,body:'Saved review Redo'}});session.core.undoReview();}
     const saved=pair(session.core,paired);await session.close();
     const readonly={...options,readOnly:true,...(paired?{review:{...review,access:'read_only'}}:{})};
     session=await SharedSegmentedPersistentSession.open(readonly);assert.deepEqual(pair(session.core,paired),saved);counts.coldPairs++;
     assert.equal(session.core.supportsReadOnlyHistoryLifecycle(),true);assert.equal(session.core.view().readOnly,true);
     const clock=session.core.writerClockV2('101');assert.notEqual(clock.through,'0');
     peer=new SharedRichEditor(profile.join_frame('room','202',session.core.updateFrame()));
     insert(peer,'Peer remains ');await session.core.receiveFrame(peer.updateFrame());await session.flush();
     const before=pair(session.core,paired),filesBefore=await stored(options.database);
     assert.throws(()=>session.core.sealObserverHistoryGeneration('two'));counts.oldObserverRefusals++;
     assert.deepEqual(pair(session.core,paired),before);
     const inject=counts.cases<2;
     if(inject){faultDatabase=options.database;fault='abort';await assert.rejects(session.sealReadOnlyGeneration('two'));counts.saveAborts++;assert.deepEqual((await stored(options.database)).head,filesBefore.head);assert.equal(session.state().status,'failed');assert.equal(session.core.view().readOnly,true);await session.retry();}
     else await session.sealReadOnlyGeneration('two');
     counts.passiveSeals++;assert.deepEqual(session.core.writerClockV2('101'),clock);assert.equal(session.core.view().readOnly,true);
     const first=await stored(options.database);assert.equal(first.files[0].json,filesBefore.files[0].json);counts.rootFileComparisons++;
     assert.equal(first.files.at(-1).json,JSON.parse(before[0]).active);if(paired)assert.equal(first.head.review.checkpoint,before[1]);
     const checkpoint=pair(session.core,paired);await session.close();session=await SharedSegmentedPersistentSession.open(readonly);assert.deepEqual(pair(session.core,paired),checkpoint);counts.coldPairs++;
     insert(peer,'Later peer ');await session.core.receiveFrame(peer.updateFrame());await session.flush();
     if(inject){faultDatabase=options.database;fault='lost-ack';await assert.rejects(session.sealReadOnlyGeneration('three'));counts.lostAcknowledgements++;assert.equal(session.core.view().readOnly,true);const uncertain=await stored(options.database);assert.equal(uncertain.head.sealed.length,2);await session.retry();assert.deepEqual(await stored(options.database),uncertain);}
     else await session.sealReadOnlyGeneration('three');
     counts.passiveSeals++;assert.deepEqual(session.core.writerClockV2('101'),clock);assert.throws(()=>insert(session.core,'Forbidden'));assert.throws(()=>session.core.redo());if(paired)assert.throws(()=>session.core.redoReview());
     const second=await stored(options.database);assert.equal(second.files[0].json,first.files[0].json);counts.rootFileComparisons++;assert.equal(second.files[1].json,first.files[1].json);counts.firstSealedFileComparisons++;
     const exact=pair(session.core,paired);await session.close();session=await SharedSegmentedPersistentSession.open(readonly);assert.deepEqual(pair(session.core,paired),exact);counts.coldPairs++;
     await session.close();session=await SharedSegmentedPersistentSession.open(options);
     const raw=restoreSharedSegmentedEditor(profile,'room',session.core.checkpointJson());
     // Public configured recovery returns the matching native family; a real independent oracle.
     const {createSharedDocumentEditor}=await import('../packages/breditor-collaboration/dist/index.js');
     const configured={segmentedHistory:'segmented-v1',...(options.searchHistory?{searchHistory:options.searchHistory}:{}),...(options.reviewedHistory?{reviewedHistory:options.reviewedHistory}:{})};
     oracle=scope===2?createSharedDocumentEditor(raw,configured):new SharedRichEditor(raw,configured);if(paired)oracle.enableReview(review,session.core.reviewCheckpoint());
     for(const method of ['redo','undo','redo']){assert.equal(session.core[method](),oracle[method]());if(paired){const m=method==='redo'?'redoReview':'undoReview';assert.deepEqual(session.core[m](),oracle[m]());}assert.deepEqual(pair(session.core,paired),pair(oracle,paired));assert.match(session.core.documentJson(),/Peer remains/);assert.match(session.core.documentJson(),/Later peer/);counts.futureHistoryPairs++;}
     counts.cases++;if(paired)counts.pairedCases++;
    }catch(error){throw new Error('Passive SDK case='+counts.cases+' language='+language+' standard='+standard+' scope='+scope+' mask='+mask+' paired='+paired,{cause:error});}
    finally{faultDatabase=undefined;fault=undefined;oracle?.dispose();peer?.dispose();await session?.discardAndClose();}
   }
  }finally{profile.free();}
 }}finally{IDBDatabase.prototype.transaction=transaction;for(const [name,value]of globals){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}}
 assert.equal(host.held.size,0);for(const [key,value]of Object.entries({cases:216,pairedCases:144,coldPairs:648,passiveSeals:432,oldObserverRefusals:216,rootFileComparisons:432,firstSealedFileComparisons:216,saveAborts:2,lostAcknowledgements:2,futureHistoryPairs:648}))assert.equal(counts[key],value,key);
 return{format:'breditor/read-only-history-sdk-probe',formatVersion:1,passed:true,...counts,scope:'Actual native document histories and original paired comments through managed SDK storage, synthetic IndexedDB/Web Locks, exact cold current-policy recovery, failed save/lost ack retries and later separately granted future history. No independent review-generation storage, physical durability, relay generation or activation qualification.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error('Expected normal application runtime directory');console.log(JSON.stringify(await probeReadOnlyHistorySdk(process.argv[2]),null,2));}
