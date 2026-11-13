/** Native archives through the public V2 store. IndexedDB and Web Locks are simulated. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {IDBFactory,IDBDatabase} from 'fake-indexeddb';
import {SharedContinuedPairSession,SharedIndependentHistoryPersistentSession,SharedRichEditor,createSharedDocumentEditor} from '../packages/breditor-collaboration/dist/index.js';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const root=canonical(JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')));
const author={actor:'comments',principal:'alice',access:'comment'};
const peerPolicy={actor:'peer-comments',principal:'bob',access:'comment'};
const kinds=['original','segmented-v1','continued-v2'];
const heads='continued_pair_heads',files='continued_pair_files',key=['room','101'];
const insert=(core,text)=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});
const optionsFor=kind=>kind==='original'?{}:{segmentedHistory:kind};
const readReview=(core,kind)=>kind==='original'?core.reviewCheckpoint():kind==='segmented-v1'?core.reviewSegmentedCheckpoint():core.reviewContinuedCheckpoint();
const readPair=(core,kind)=>[core.checkpointJson(),readReview(core,kind)];
function locks(){
 const held=new Set();
 return {held,async request(name,options,callback){
  await Promise.resolve();
  assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});
  if(held.has(name))return callback(null);
  held.add(name);
  try{return await callback({name});}finally{held.delete(name);}
 }};
}
async function visit(name,mode,read){
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction([heads,files],mode);
   const result=read(tx.objectStore(heads),tx.objectStore(files));
   tx.oncomplete=()=>resolve(result.map(request=>request.result));
   tx.onabort=()=>reject(tx.error);
  });
 }finally{db.close();}
}
const stored=name=>visit(name,'readonly',(h,f)=>[h.get(key),f.getAll()]);

export async function probeContinuedPair(directory){
 const globals=new Map(['indexedDB','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const host=locks(),transaction=IDBDatabase.prototype.transaction;
 let fault;
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:new IDBFactory()});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:host}});
 IDBDatabase.prototype.transaction=function(...args){
  const tx=transaction.apply(this,args);
  if(fault?.database===this.name&&args[1]==='readwrite'){
   const kind=fault.kind;
   fault=undefined;
   if(kind==='abort')queueMicrotask(()=>{try{tx.abort();}catch{}});
   else Object.defineProperty(tx,'oncomplete',{configurable:true,set(){tx.addEventListener('complete',event=>tx.onabort?.(event));}});
  }
  return tx;
 };
 const counts={cases:0,coldPairs:0,historyComparisons:0,abortedSaves:0,lostAcknowledgements:0,exactFileSets:0,insertOnlyRefusals:0,missingFileRefusals:0,recordReads:0,failedSaveReads:0,changedReadRefusals:0,failedSaveAssetReads:0,cancelledRecordReads:0};
 try{
  const bytes=readFileSync(resolve(directory,'breditor_shared_bg.wasm'));
  const native=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href);
  await native.default({module_or_path:bytes});
  for(const language of [1,2,3]){
   const construct=language===1?'from_standard_configuration_json_v1':`from_standard_configuration_json_v${language}`;
   const profile=native.SharedRichProfile[construct](JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:language,schema:{name:'example/continued-pair',version:1},extensions:[]}));
   const descriptor=JSON.parse(profile.descriptor_json());
   const input=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root});
   try{
    for(const documentHistory of kinds)for(const reviewHistory of kinds){
     if(documentHistory!=='continued-v2'&&reviewHistory!=='continued-v2')continue;
     const database=`continued-pair-${counts.cases}`, both=documentHistory===reviewHistory;
     const documentSelection=language===3,rangeEditing=language===1?'original':'general-v1';
     const selectionEditing=documentSelection?'document-v1':'original',history=language===2?'typing-v1':'explicit';
     const nativeIdentity={room:'room',writer:'101',richLanguage:language,history,rangeEditing,selectionEditing,searchHistory:null,reviewedHistory:null};
     const restoreDocument=checkpoint=>documentHistory==='continued-v2'?profile.restore_continued_history('room',checkpoint):
      documentHistory==='segmented-v1'?profile.restore_segmented('room',checkpoint):
      documentSelection?profile.restore_document('room',checkpoint):
      language===2?profile.restore_general_typing('room',checkpoint):profile.restore('room',checkpoint);
     const options={database,native:nativeIdentity,documentHistory,reviewHistory,readOnly:false,review:author,restoreDocument};
     let session,core,peer,oracle;
     try{
      let raw=profile.create(input,'101');
      const boundary=action=>{const observed=documentSelection&&raw.document_selection_enabled()?raw.observe_document():raw.observe();try{action(observed);}finally{observed.free();}};
      if(documentSelection)boundary(o=>raw.enable_document_selection(o));
      else if(rangeEditing==='general-v1')boundary(o=>raw.enable_general_ranges(o));
      if(history==='typing-v1')boundary(o=>raw.enable_typing_history(o));
      if(documentHistory!=='original')boundary(o=>raw.enable_segmented_history(o,'root','first'));
      const wrap=(owner,kind)=>documentSelection?createSharedDocumentEditor(owner,optionsFor(kind)):new SharedRichEditor(owner,optionsFor(kind));
      core=wrap(raw,documentHistory==='continued-v2'?'segmented-v1':documentHistory);
      core.enableReview(author);
      insert(core,'Retained document ');
      insert(core,'Saved document Redo ');
      core.undo();
      const anchor=core.captureReviewAnchor({kind:'selection',selection:{kind:'node',block:'image-block'}});
      const birth=core.dispatchReview({kind:'create_thread',data:{anchorJson:anchor,body:'Retained comment'}});
      assert.equal(birth.kind,'committed');
      if(reviewHistory!=='original')core.enableReviewHistoryGenerations('root','first');
      core.dispatchReview({kind:'reply',data:{thread:birth.event,body:'Saved review Redo'}});
      core.undoReview();
      if(reviewHistory==='continued-v2')core.continueReviewHistory('continued');
      else if(reviewHistory==='segmented-v1')core.sealReviewHistoryGeneration('next');
      const reviewCheckpoint=readReview(core,reviewHistory);
      let documentCheckpoint=core.checkpointJson();
      if(documentHistory==='continued-v2'){
       core.dispose();core=undefined;
       raw=profile.restore_segmented('room',documentCheckpoint);
       try{boundary(o=>raw.continue_history(o,'continued'));documentCheckpoint=raw.continued_history_checkpoint();}
       finally{raw.free();}
       core=wrap(restoreDocument(documentCheckpoint),documentHistory);
       if(reviewHistory==='continued-v2')core.enableContinuedReview(author,reviewCheckpoint);
       else if(reviewHistory==='segmented-v1')core.enableSegmentedReview(author,reviewCheckpoint);
       else core.enableReview(author,reviewCheckpoint);
      }
      const packet=core.captureVersion('Retained pair version','alice','1');
      const recovery={format:'breditor/shared-independent-history-recovery',formatVersion:2,
       identity:{native:nativeIdentity,documentHistory,reviewHistory,review:{actor:author.actor,principal:author.principal}},
       documentCheckpoint,reviewCheckpoint,versions:[packet]};
      const missing={...options,restoreDocument:()=>assert.fail('An absent store must not call restore')};
      await assert.rejects(SharedContinuedPairSession.open(missing),error=>error.code==='continued_pair_missing');
      session=await SharedContinuedPairSession.restoreRecovery(options,recovery,'host-reacquired');
      assert.deepEqual(readPair(session.core,reviewHistory),[documentCheckpoint,reviewCheckpoint]);
      const [head,initialFiles]=await stored(database);
      const selected=JSON.parse(head);
      assert.equal(selected.formatVersion,2);
      if(both){
       for(const generation of ['root','first']){
        const matching=initialFiles.map(JSON.parse).filter(file=>file.generation===generation);
        assert.deepEqual(new Set(matching.map(file=>file.lane)),new Set(['document','review']));
       }
      }
      assert.deepEqual(session.versions().map(info=>session.versionPacket(info.id)),[packet]);
      let reading=await session.readRecords(()=>{});
      try{
       const records=reading.metadata();
       assert.equal(records.committed.head,head);
       assert.deepEqual(records.committed.recovery,records.live);
       assert.deepEqual(records.live,session.exportRecovery());
       assert.equal(records.attempt,null);
       assert.equal(records.pending,null);
       assert.ok(Object.isFrozen(records.live.versions));
       await reading.verify();
       counts.recordReads++;
      }finally{reading.dispose();}
      if(both){
       const abort=new AbortController();
       reading=await session.readRecords(()=>{},abort.signal);
       try{
        abort.abort();
        assert.throws(()=>reading.check(),error=>error.code==='continued_pair_read_aborted');
        await assert.rejects(reading.verify(),error=>error.code==='continued_pair_read_aborted');
        counts.cancelledRecordReads++;
       }finally{reading.dispose();}
       assert.deepEqual(await stored(database),[head,initialFiles]);
      }
      await session.close();session=undefined;
      await assert.rejects(SharedContinuedPairSession.restoreRecovery(missing,recovery,'host-reacquired'),error=>error.code==='continued_pair_destination_exists');
      counts.insertOnlyRefusals++;
      const old={...nativeIdentity,database,readOnly:false,review:author,documentHistory:{kind:'original',restoreOriginal:()=>assert.fail()},reviewHistory:{kind:'original'},create:()=>assert.fail()};
      await assert.rejects(SharedIndependentHistoryPersistentSession.open(old),error=>error.code==='independent_history_storage');
      session=await SharedContinuedPairSession.open({...options,readOnly:true,review:{...author,access:'read_only'}});
      assert.equal(session.core.view().readOnly,true);
      assert.throws(()=>insert(session.core,'Forbidden'));
      assert.throws(()=>session.core.redoReview());
      assert.deepEqual(readPair(session.core,reviewHistory),[documentCheckpoint,reviewCheckpoint]);
      counts.coldPairs++;
      peer=new SharedRichEditor(profile.join_frame('room','202',session.core.updateFrame()));
      peer.enableReview(peerPolicy);
      peer.receiveReview(session.core.exportReview(),author);
      insert(peer,'Offline document ');
      await session.core.receiveFrame(peer.updateFrame());
      peer.dispatchReview({kind:'reply',data:{thread:birth.event,body:'Offline peer comment'}});
      const offline=peer.exportReview();
      session.core.receiveReview(offline,peerPolicy);
      const receipt=session.core.retainedReviewReceipt(offline,peerPolicy),writerClock=session.core.writerClock('202');
      if(documentHistory!=='original')session.core.sealReadOnlyHistoryGeneration('offline');
      if(reviewHistory!=='original')session.core.sealReadOnlyReviewHistoryGeneration('offline');
      await session.flush();
      const before=readPair(session.core,reviewHistory);
      for(const file of initialFiles)assert.ok((await stored(database))[1].includes(file));
      counts.exactFileSets++;
      await session.close();session=await SharedContinuedPairSession.open(options);
      assert.deepEqual(readPair(session.core,reviewHistory),before);
      assert.deepEqual(session.core.retainedReviewReceipt(offline,peerPolicy),receipt);
      assert.deepEqual(session.core.writerClock('202'),writerClock);
      counts.coldPairs++;
      oracle=wrap(restoreDocument(before[0]),documentHistory);
      if(reviewHistory==='continued-v2')oracle.enableContinuedReview(author,before[1]);
      else if(reviewHistory==='segmented-v1')oracle.enableSegmentedReview(author,before[1]);
      else oracle.enableReview(author,before[1]);
      for(const name of ['redo','undo','redo']){
       assert.equal(session.core[name](),oracle[name]());
       const method=name==='redo'?'redoReview':'undoReview';
       assert.deepEqual(session.core[method](),oracle[method]());
       assert.deepEqual(readPair(session.core,reviewHistory),readPair(oracle,reviewHistory));
       counts.historyComparisons++;
      }
      assert.match(session.core.documentJson(),/Offline document/);
      assert.match(JSON.stringify(session.core.reviewSnapshot().view),/Offline peer comment/);
      await session.flush();
      if(both){
       for(const kind of ['abort','lost-ack']){
        const beforeWrite=await stored(database);
        fault={database,kind};
        assert.equal(session.core.dispatch({commands:[{kind:'replace_image',data:{block:'image-block',
         asset:`attempt-${kind}`,generation:`attempt-${kind}`}}]}),true);
        assert.equal(session.core.dispatch({commands:[{kind:'replace_image',data:{block:'image-block',
         asset:`pending-${kind}`,generation:`pending-${kind}`}}]}),true);
        session.core.dispatchReview({kind:'reply',data:{thread:birth.event,body:`Comment ${kind}`}});
        await assert.rejects(session.flush());
        const failed=await stored(database);
        reading=await session.readRecords(()=>{});
        try{
         const records=reading.metadata();
         assert.equal(records.committed.head,failed[0]);
         assert.ok(records.attempt?.cut);
         assert.equal(records.attempt.cut.head===failed[0],kind==='lost-ack');
         assert.ok(records.pending);
         assert.deepEqual(records.pending,records.live);
         assert.deepEqual(records.live,session.exportRecovery());
         assert.notEqual(records.attempt.capture.reviewCheckpoint,records.live.reviewCheckpoint);
         await reading.verify();
         await assert.rejects(session.retry(),error=>error.code==='continued_pair_read_busy');
         await assert.rejects(session.close(),error=>error.code==='continued_pair_read_busy');
         counts.failedSaveReads++;
        }finally{reading.dispose();}
        const references=await session.readAssetReferences(()=>{});
        assert.equal(references.committedHead,failed[0]);
        assert.deepEqual(references.states.map(row=>row.slot),['committed','attempt','pending','live']);
        const has=(slot,asset)=>references.states.find(row=>row.slot===slot).references.some(row=>row.asset===asset);
        assert.equal(has('committed',`attempt-${kind}`),kind==='lost-ack');
        assert.equal(has('committed',`pending-${kind}`),false);
        assert.equal(has('attempt',`attempt-${kind}`),true);
        assert.equal(has('attempt',`pending-${kind}`),false);
        assert.equal(has('pending',`pending-${kind}`),true);
        assert.equal(has('live',`pending-${kind}`),true);
        for(const asset of [`attempt-${kind}`,`pending-${kind}`])assert.ok(references.references.some(row=>row.asset===asset));
        counts.failedSaveAssetReads++;
        if(kind==='abort'){
         assert.deepEqual(failed,beforeWrite);
         counts.abortedSaves++;
        }else{
         assert.notEqual(failed[0],beforeWrite[0]);
         counts.lostAcknowledgements++;
        }
        await session.retry();
        assert.notEqual((await stored(database))[0],beforeWrite[0]);
       }
      }
      if(both){
       const beforeChange=await stored(database);
       reading=await session.readRecords(()=>{});
       try{
        insert(session.core,'Live edit while reading');
        assert.throws(()=>reading.check(),error=>error.code==='continued_pair_read_changed');
        await assert.rejects(reading.verify(),error=>error.code==='continued_pair_read_changed');
        await assert.rejects(session.flush(),error=>error.code==='continued_pair_read_busy');
        assert.deepEqual(await stored(database),beforeChange);
        counts.changedReadRefusals++;
       }finally{reading.dispose();}
       await session.flush();
      }
      const final=readPair(session.core,reviewHistory);
      await session.close();session=await SharedContinuedPairSession.open(options);
      assert.deepEqual(readPair(session.core,reviewHistory),final);
      counts.coldPairs++;
      if(both){
       await session.close();session=undefined;
       const [validHead]=await stored(database);
       await visit(database,'readwrite',(_h,f)=>[f.delete([...key,'review','root'])]);
       await assert.rejects(SharedContinuedPairSession.open(missing),error=>error.code==='independent_history_storage');
       const [headAfter,filesAfter]=await stored(database);
       assert.equal(headAfter,validHead);
       assert.ok(!filesAfter.some(raw=>{const file=JSON.parse(raw);return file.lane==='review'&&file.generation==='root';}));
       counts.missingFileRefusals++;
      }
      counts.cases++;
     }catch(error){throw new Error(`Continued pair ${language}/${documentHistory}/${reviewHistory}`,{cause:error});}
     finally{fault=undefined;await session?.discardAndClose();oracle?.dispose();peer?.dispose();core?.dispose();}
    }
   }finally{profile.free();}
  }
  assert.equal(host.held.size,0);
  assert.deepEqual(counts,{cases:15,coldPairs:45,historyComparisons:45,abortedSaves:3,lostAcknowledgements:3,exactFileSets:15,insertOnlyRefusals:15,missingFileRefusals:3,recordReads:15,failedSaveReads:6,changedReadRefusals:3,failedSaveAssetReads:6,cancelledRecordReads:3});
  return {passed:true,...counts,sharedWasmSha256:createHash('sha256').update(bytes).digest('hex')};
 }finally{
  IDBDatabase.prototype.transaction=transaction;
  for(const [name,descriptor]of globals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
 }
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Require the built shared application runtime');
 console.log(JSON.stringify(await probeContinuedPair(process.argv[2]),null,2));
}
