import assert from 'node:assert/strict';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalFlatLocalParticipant as Flat} from '../../../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
import {independentDeliverySource} from '../../../packages/breditor-collaboration/dist/independent_delivery_source/admission.js';
import {OperationalRestoredLocalParticipant as Snapshot} from '../../../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
import {RestoredOperationParticipant as Graph} from '../../../packages/breditor-collaboration/dist/restored_participant/participant.js';
import {recoveryFactory} from '../independent-delivery-recovery/session.mjs';
import {recoveryFaults} from '../independent-delivery-recovery/storage.mjs';
import {restoredParticipant} from '../independent-inventory/restored-participant.mjs';
import {roomLocalParticipant} from '../physical-catalog-v3/local-participant.mjs';
import {pixel,pixelAsset,secondAsset} from '../review-assets/pixels.mjs';
import {attachDelivery,pendingDelivery} from '../independent-delivery/session.mjs';
import {IDBDatabase} from 'fake-indexeddb';

export async function probeOperationRecovery({profile,fixture,metadata,initialCatalog,continued,client}){
 const counts={exactOperationRestores:0,operationInterruptedResumes:0,operationNestedResumes:0,operationChangedRefusals:0,operationMissingRefusals:0};
 // The historical server may have revoked the author after issuing these native
 // checkpoints. Exercise its private offline edits with an explicit local policy.
 const common={api,rich,profile,fixture,metadata,client,localAccess:'moderate',documentSegmented:true,reviewSegmented:true};
 const withRedo=session=>{
  const core=session.core;
  assert.equal(core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Retained room history '}}]}),true);
  assert.equal(core.undo(),true);
 };
 const withImage=async(session,options,uploads)=>{
  if(fixture.language!==1){
   const image=api.imageNode('operation-image','operation-image-id',pixelAsset,'operation-image-generation','Local raster','operation-caption',{width:1,height:1});
   assert.equal(session.core.dispatch({commands:[{kind:'insert_blocks',data:{parent:null,before:null,nodes:[image]}}]}),true);
   assert.equal(session.core.undo(),true);
  }else withRedo(session);
  await uploads.cancel(secondAsset);
 };
 for(const family of ['restored-graph','local-operation-snapshot','local-operation-flat']){
  const tag='operation-'+family;
  const input=family==='restored-graph'?await restoredParticipant({...common,tag,
   async prepareDelivery(session,options){
    withRedo(session);
    const parts=await attachDelivery(api,session,options);
    if(fixture.atomic)await pendingDelivery(session,parts);
    else{parts.versions.saveVersion('Offline retained server version','21');await parts.versions.flush();}
   },
   prepareUploads:uploads=>uploads.cancel(secondAsset),
  }):await roomLocalParticipant({...common,tag,prepareLocalInput:withImage});
  const faults=recoveryFaults();
  let archive,store;
  try{
   const owner=family==='restored-graph'?input.backup:family==='local-operation-snapshot'?input.snapshot:input.flat;
   const expected=owner.selection(),id=expected.original.identity.participant;
   const dest={id,source:tag+'-recovered-source',uploads:tag+'-recovered-uploads',operation:{parent:tag+'-recovered-parent',journal:tag+'-recovered-journal'}};
   const factory=family==='restored-graph'?recoveryFactory(input.options,{readOnly:false,access:input.options.review.access}):
    {...input.readOptions.session,readOnly:false,review:input.options.review};
   const policy={id,original:expected.original,options:input.readOptions};
   const options={wasm:initialCatalog.wasm,checkAuthority(){},policies:[{id:continued.id,expected:continued.expected,restoreDocument:continued.restoreDocument}],
    ...(family==='restored-graph'?{graphPolicies:[policy]}:{localPolicies:[{...policy,family}]})};
   archive=await api.SharedContinuedRoomCatalog.capture({...initialCatalog,...options,participants:[
    {id,family,expected,file:owner.file()},{id:continued.id,file:continued.file,expected:continued.expected},
   ]});
   const persisted={...options,expected:archive.selection(),database:tag+'-recovery-catalog'};
   store=await api.SharedContinuedRoomCatalogStore.begin({...persisted,archive});
   await (family==='restored-graph'?input.session:input.source).discardAndClose();
   const continuedDestination={id:continued.id,source:tag+'-last-source',uploads:tag+'-last-uploads'};
   const destinations=[dest,continuedDestination];
   const plan={catalog:store,expected:archive.selection(),database:tag+'-recovery-root',writerRecovery:'host-reacquired',checkAuthority(){},destinations};
   await assert.rejects(api.beginContinuedRoomRecovery({...plan,destinations:[{id,source:dest.source,uploads:dest.uploads},continuedDestination]}),
    error=>error.code==='continued_room_recovery_policy');
   assert.ok(!(await indexedDB.databases()).some(row=>row.name===plan.database));
   // Interrupt both variants: a durable step with a lost acknowledgement, and
   // a finished leaf whose outer journal still says it is in progress.
   if(family==='restored-graph'){
    faults.select(dest.source,'restored_operation_history_heads',1,'lost-ack');
    await assert.rejects(api.beginContinuedRoomRecovery(plan));
    assert.equal(faults.observed.at(-1).database,dest.source);
    assert.ok(!(await indexedDB.databases()).some(row=>row.name===continuedDestination.source));
    await store.close();store=await api.SharedContinuedRoomCatalogStore.resume(persisted);
    faults.select(plan.database,'continued_room_recovery',1,'lost-ack');
    await assert.rejects(api.resumeContinuedRoomRecovery({...plan,catalog:store}),error=>error.code==='continued_room_recovery_storage');
    assert.equal(faults.observed.at(-1).number,1);
    counts.operationNestedResumes++;
   }else{
    faults.select(plan.database,'continued_room_recovery',2,'abort');
    await assert.rejects(api.beginContinuedRoomRecovery(plan),error=>error.code==='continued_room_recovery_storage');
    assert.equal(faults.observed.at(-1).number,2);
   }
   assert.ok((await indexedDB.databases()).some(row=>row.name===dest.operation.parent));
   assert.ok(!(await indexedDB.databases()).some(row=>row.name===continuedDestination.source));
   faults.clear();
   await store.close();store=await api.SharedContinuedRoomCatalogStore.resume(persisted);
   const resumed={...plan,catalog:store};
   // An acknowledged operation is read-only even at the persistence layer.
   const operationNames=new Set([dest.source,dest.uploads,dest.operation.parent,dest.operation.journal]);
   const transaction=IDBDatabase.prototype.transaction;
   IDBDatabase.prototype.transaction=function(...args){
    assert.ok(!operationNames.has(this.name)||args[1]!=='readwrite',`Completed operation wrote ${this.name}`);
    return transaction.apply(this,args);
   };
   try{
    assert.deepEqual((await api.resumeContinuedRoomRecovery(resumed)).participants,destinations);
    assert.deepEqual((await api.resumeContinuedRoomRecovery(resumed)).participants,destinations);
   }
   finally{IDBDatabase.prototype.transaction=transaction;}
   counts.operationInterruptedResumes++;
   const base={expected,sourceDatabase:dest.source,writerRecovery:'host-reacquired',checkAuthority(){}};
   const open=family==='restored-graph'?await Graph.resume({...base,kind:'lineage-v2',database:dest.operation.parent,journalDatabase:dest.operation.journal,uploadsDatabase:dest.uploads,session:factory}):
    await(family==='local-operation-snapshot'?Snapshot:Flat).resume({...base,kind:family==='local-operation-snapshot'?'snapshot-v1':'flat-local-v1',
     database:dest.operation.journal,sourceFactory:factory,cohort:{parentDatabase:dest.operation.parent,uploadsDatabase:dest.uploads}});
   let parts;
   try{
    if(family==='restored-graph')await open.finish();
    assert.deepEqual(Buffer.from(await open.file().arrayBuffer()),Buffer.from(await owner.file().arrayBuffer()));
    parts=await open.intoParts();
    const session=parts.source.session,actual=family==='restored-graph'?independentDeliverySource(session).read():session.exportRecovery();
    assert.deepEqual(actual,family==='local-operation-flat'?owner.live():owner.liveSource());
    const uploads=family==='local-operation-flat'?owner.uploads():owner.uploadBackup();
    assert.deepEqual(Buffer.from(await (await parts.uploads.exportBackup()).arrayBuffer()),Buffer.from(await uploads.arrayBuffer()));
    if(family!=='restored-graph'&&fixture.language!==1){
     const raster=parts.input.blob(pixelAsset,'operation-image-generation');
     assert.ok(raster);
     assert.deepEqual(new Uint8Array(await raster.arrayBuffer()),new Uint8Array(pixel));
    }
    assert.equal((await parts.uploads.get(secondAsset)).status,'cancelled');
    assert.equal(session.core.redo(),true,family+' document Redo');
    assert.equal(session.core.undo(),true);
    assert.equal(session.core.redoReview().kind,'committed',family+' review Redo');
    assert.equal(session.core.undoReview().kind,'committed');
    await session.flush();
    counts.exactOperationRestores++;
   }finally{await parts?.source.session.discardAndClose();parts?.uploads.close();await open.discardAndClose();}
   // A later legitimate writer may advance the restored head. Cold recovery
   // refuses it and makes no writes to the leaf while checking the saved plan.
   IDBDatabase.prototype.transaction=function(...args){
    assert.ok(!operationNames.has(this.name)||args[1]!=='readwrite',`Diverged operation wrote ${this.name}`);
    return transaction.apply(this,args);
   };
   try{
    await assert.rejects(api.resumeContinuedRoomRecovery(resumed),error=>
     ['restored_operation_source_diverged','restored_local_participant_initial_diverged','flat_local_input_participant_initial_diverged'].includes(error.code));
   }finally{IDBDatabase.prototype.transaction=transaction;}
   counts.operationChangedRefusals++;
   // Missing data cannot be silently recreated after the root acknowledged it.
   await new Promise((resolve,reject)=>{
    const request=indexedDB.deleteDatabase(dest.source);
    request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Live writer leaked'));
   });
   await assert.rejects(api.resumeContinuedRoomRecovery(resumed),error=>error.code==='continued_room_recovery_diverged');
   assert.ok(!(await indexedDB.databases()).some(row=>row.name===dest.source));
   counts.operationMissingRefusals++;
  }finally{
   faults.restore();
   await store?.close();archive?.dispose();await input.close();
  }
 }
 return counts;
}
