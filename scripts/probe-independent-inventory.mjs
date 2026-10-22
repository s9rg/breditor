/** Complete fixed native compiler/transport domain for independent prefix admission.
 * Real package owners and native histories; no provider, permission or activation claim. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {IDBDatabase} from 'fake-indexeddb';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {recoverParticipant} from './fixtures/room-participant-inventory/participant.mjs';
import {generationParticipant} from './fixtures/room-participant-inventory/generation-participant.mjs';
import {independentParticipant} from './fixtures/independent-inventory/independent-participant.mjs';
import {localParticipant} from './fixtures/independent-inventory/local-participant.mjs';
import {restoredParticipant} from './fixtures/independent-inventory/restored-participant.mjs';

export async function probeIndependentInventory({api,rich,internals,runtime,manifestPath}){
 const native=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')));await native.default({module_or_path:readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))});
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));assert.equal(manifest.format,'breditor/native-server-generation-inventory-fixtures');assert.equal(manifest.cases.length,10);
 const {restoredGraphNativeSource:graphSource,checkOperationalPhysicalInventoryCohort:checkOperational}=internals,counts={nativeRooms:0,independentCohorts:0,independentLocalParticipants:0,independentDeliveryParticipants:0,localUnboundReviews:0,localVersionPackets:0,logicalReaderChecks:0,pureNoIOChecks:0,coldNativeComparisons:0,referenceNativeRestores:0,futureNativePairs:0,independentDuplicateRefusals:0,oldMixedRefusals:0,privateGraphPublicRefusals:0,restoredCohorts:0,restoredNativeSources:0,expiredWriterReads:0,restoredOldOperationRefusals:0,restoredReadGrantRefusals:0,restoredFacadeRefusals:0,restoredOfflineRecaptures:0,mixedCohorts:0,mixedOriginal:0,mixedGeneration:0,mixedIndependentLocal:0,mixedIndependentDelivery:0,mixedLocalPending:0,mixedDuplicateRefusals:0,mixedWriterRefusals:0,mixedReadGrantRefusals:0,retainedComparisons:0,restoredParticipants:0,restoredComponents:0,networkCalls:0};
 let serial=0;const reset=environment(),pair=h=>[h.session.core.checkpointJson(),h.options.reviewHistory?.kind==='segmented-v1'?h.session.core.reviewSegmentedCheckpoint():h.session.core.reviewCheckpoint()];
 try{for(const item of manifest.cases){
  const fixture=JSON.parse(readFileSync(item.path,'utf8')),method=fixture.language===1?'from_configuration_json':fixture.standard?`from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`,profile=native.SharedRichProfile[method](fixture.configuration),inventory=await api.readSharedServerLogGenerationParticipantInventory(new Blob([readFileSync(resolve(dirname(item.path),'inventory.json'))]),fixture.selected),metadata=inventory.metadata().native;
  let logical;
  try{
   const declaration=fixture.inventoryJson,digest=[...createHash('sha256').update(declaration).digest()];
   if(fixture.longNativeCut)await assert.rejects(api.readSharedRoomParticipantInventory(new Blob([declaration]),{room:metadata.room,sha256:digest}),e=>e.code==='inventory_format');
   else logical=await api.readSharedRoomParticipantInventory(new Blob([declaration]),{room:metadata.room,sha256:digest});
   for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true]){
    for(const family of ['independent-local','independent-delivery']){
     const held=[];
     try{
      const create=family==='independent-local'?localParticipant:independentParticipant;
      for(const client of fixture.clients){held.push(await create({api,rich,profile,fixture,metadata,client,documentSegmented,reviewSegmented,tag:'independent-inventory-'+serial++}));counts[family==='independent-local'?'independentLocalParticipants':'independentDeliveryParticipants']++;}
      const rows=held.map(h=>({family,backup:h.backup,source:h.source})),before=held.map(h=>({recovery:h.session.exportRecovery(),records:h.source.records()})),check=()=>inventory.checkIndependentSources(rows),result=check();assert.deepEqual(result.source,fixture.selected.source);assert.equal(result.coverage.kind,family==='independent-local'?'pending':'covered');assert.equal(result.coverage.registeredStreamsCovered,family!=='independent-local');
      if(family==='independent-local'){assert.equal(result.coverage.missing.filter(r=>r.kind==='unbound_review').length,2);counts.localUnboundReviews+=2;for(const h of held){assert.equal(h.session.exportRecovery().versions.length,1);counts.localVersionPackets++;}}
      if(logical){assert.deepEqual(logical.checkIndependentSources(rows),result.coverage);counts.logicalReaderChecks++;}
      assert.deepEqual(inventory.checkSourceCohort(rows),result);assert.throws(()=>inventory.checkMixedSources(rows),e=>e.code==='inventory_source');counts.oldMixedRefusals++;
      assert.throws(()=>inventory.checkIndependentSources([rows[0],rows[0]]),e=>e.code==='inventory_duplicate');counts.independentDuplicateRefusals++;
      const transaction=IDBDatabase.prototype.transaction;try{IDBDatabase.prototype.transaction=function(){throw Error('Native prefix reads must perform no storage I/O');};assert.deepEqual(check(),result);counts.pureNoIOChecks++;}finally{IDBDatabase.prototype.transaction=transaction;}
      for(const [i,h] of held.entries()){
       assert.deepEqual(h.session.exportRecovery(),before[i].recovery);assert.deepEqual(h.source.records(),before[i].records);counts.retainedComparisons+=2;
       h.source.dispose();await h.session.close();h.session=await(family==='independent-local'?api.SharedIndependentHistoryPersistentSession:api.SharedIndependentDeliverySession).open(h.options);assert.deepEqual(h.session.exportRecovery(),before[i].recovery);h.source=family==='independent-local'?api.captureSharedIndependentSource({session:h.session}):api.captureSharedIndependentDeliverySource({session:h.session});rows[i]={family,backup:h.backup,source:h.source};assert.deepEqual(check(),result);counts.coldNativeComparisons++;
      }
      for(const [i,h] of held.entries())if(!h.options.readOnly){
       const recovery=h.session.exportRecovery(),future=[];h.source.dispose();await h.session.close();let reference;
       try{const options={...h.options,database:'inventory-native-reference-'+serial++};reference=family==='independent-local'?await api.SharedIndependentHistoryPersistentSession.restoreRecovery(options,recovery,'host-reacquired'):await api.SharedIndependentDeliverySession.restoreRecovery({...options,recovery,writerRecovery:'host-reacquired'});counts.referenceNativeRestores++;
        for(const method of ['redo','undo']){assert.equal(reference.core[method](),true);assert.equal(reference.core[method+'Review']().kind,'committed');future.push(pair({session:reference,options:h.options}));}
       }finally{await reference?.discardAndClose();}
       h.session=await(family==='independent-local'?api.SharedIndependentHistoryPersistentSession:api.SharedIndependentDeliverySession).open(h.options);h.source=family==='independent-local'?api.captureSharedIndependentSource({session:h.session}):api.captureSharedIndependentDeliverySource({session:h.session});rows[i]={family,backup:h.backup,source:h.source};assert.deepEqual(check(),result);
       for(const [step,method] of ['redo','undo'].entries()){assert.equal(h.session.core[method](),true);assert.equal(h.session.core[method+'Review']().kind,'committed');assert.deepEqual(pair(h),future[step]);counts.futureNativePairs++;}assert.throws(check,e=>e.code==='inventory_source');
      }
      counts.independentCohorts++;
     }finally{for(const h of held.reverse())await h.close();}
    }
    const restored=[],captures=[];
    try{
     for(const client of fixture.clients){const h=await restoredParticipant({api,rich,profile,fixture,metadata,client,documentSegmented,reviewSegmented,tag:'restored-inventory-'+serial++});restored.push(h);counts.restoredNativeSources++;assert.throws(()=>graphSource.capture({source:h.source,backup:h.prior,checkAuthority:h.readOptions.checkAuthority}),e=>e.code==='inventory_source');counts.restoredOldOperationRefusals++;captures.push(graphSource.capture({source:h.source,backup:h.backup,checkAuthority:h.readOptions.checkAuthority}));}
     let rows=restored.map((h,i)=>({family:'restored-graph',backup:h.backup,source:captures[i]})),result=checkOperational(inventory,rows);assert.deepEqual(result.source,fixture.selected.source);assert.equal(result.coverage.kind,'covered');assert.equal(result.coverage.checkedParticipants.length,2);counts.expiredWriterReads+=2;
     for(const call of [()=>inventory.checkIndependentSources(rows),()=>inventory.checkSourceCohort(rows)]){assert.throws(call,e=>e.code==='inventory_source');counts.privateGraphPublicRefusals++;}
     restored[0].setRead(false);assert.throws(()=>checkOperational(inventory,rows),e=>e.code==='inventory_source');counts.restoredReadGrantRefusals++;restored[0].setRead(true);assert.deepEqual(checkOperational(inventory,rows),result);
     assert.throws(()=>checkOperational(inventory,[{family:'restored-graph',backup:restored[0].backup,source:{checked:true}}]),e=>e.code==='inventory_source');counts.restoredFacadeRefusals++;
     for(const [i,h] of restored.entries())if(!h.options.readOnly){h.source.core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Offline after native prefix capture '}}]});assert.throws(()=>checkOperational(inventory,rows),e=>e.code==='inventory_source');graphSource.dispose(captures[i]);h.backup=await h.capture();captures[i]=graphSource.capture({source:h.source,backup:h.backup,checkAuthority:h.readOptions.checkAuthority});rows=restored.map((owner,j)=>({family:'restored-graph',backup:owner.backup,source:captures[j]}));assert.equal(checkOperational(inventory,rows).coverage.kind,'covered');assert.match(h.source.core.documentJson(),/Offline after native prefix capture/);counts.restoredOfflineRecaptures++;}
     counts.restoredCohorts++;
    }finally{for(const capture of captures)graphSource.dispose(capture);for(const h of restored.reverse())await h.close();}
    for(const family of ['original','generation-local','generation-relay','generation-retained','independent-local','independent-delivery'])for(const [olderIndex,restoredIndex] of [[0,1],[1,0]]){
     const tag='mixed-inventory-'+serial++,client=fixture.clients[olderIndex];let older,restored,capture;
     try{
      if(family==='original')older=await recoverParticipant({api,rich,profile,fixture,client,tag:tag+'-old',counts});
      else if(family==='independent-local'||family==='independent-delivery')older=await(family==='independent-local'?localParticipant:independentParticipant)({api,rich,profile,fixture,metadata,client,documentSegmented,reviewSegmented,tag:tag+'-old'});
      else older=await generationParticipant({api,rich,profile,fixture,client,kind:family.slice(11),tag:tag+'-old',counts});
      await assert.rejects(restoredParticipant({api,rich,profile,fixture,metadata,client,documentSegmented,reviewSegmented,tag:tag+'-duplicate'}),e=>e.code==='writer_in_use');counts.mixedWriterRefusals++;
      restored=await restoredParticipant({api,rich,profile,fixture,metadata,client:fixture.clients[restoredIndex],documentSegmented,reviewSegmented,tag:tag+'-restored'});capture=graphSource.capture({source:restored.source,backup:restored.backup,checkAuthority:restored.readOptions.checkAuthority});
      const rows=[{family:family==='original'?'original':family.startsWith('generation-')?'generation':family,backup:older.backup,source:older.source},{family:'restored-graph',backup:restored.backup,source:capture}],records=rows.map(r=>r.family==='restored-graph'?graphSource.read(r).capture.records:r.source.records()),result=checkOperational(inventory,rows),pending=family==='generation-local'||family==='independent-local';assert.equal(result.coverage.kind,pending?'pending':'covered');assert.equal(result.coverage.registeredStreamsCovered,!pending);if(pending)counts.mixedLocalPending++;
      for(const row of rows){assert.throws(()=>checkOperational(inventory,[row,row]),e=>e.code==='inventory_duplicate');counts.mixedDuplicateRefusals++;}
      restored.setRead(false);assert.throws(()=>checkOperational(inventory,rows),e=>e.code==='inventory_source');counts.mixedReadGrantRefusals++;restored.setRead(true);assert.deepEqual(checkOperational(inventory,rows),result);
      for(const [i,row] of rows.entries()){assert.deepEqual(row.family==='restored-graph'?graphSource.read(row).capture.records:row.source.records(),records[i]);counts.retainedComparisons++;}
      counts[family==='original'?'mixedOriginal':family==='independent-local'?'mixedIndependentLocal':family==='independent-delivery'?'mixedIndependentDelivery':'mixedGeneration']++;counts.mixedCohorts++;
     }catch(error){throw new Error('Independent inventory mixed '+family+' language='+fixture.language+' atomic='+fixture.atomic+' document='+documentSegmented+' review='+reviewSegmented+' older='+olderIndex+' case='+counts.mixedCohorts,{cause:error});}
     finally{if(capture)graphSource.dispose(capture);await restored?.close();await older?.close();}
    }
   }
  }finally{logical?.dispose();inventory.dispose();profile.free();}counts.nativeRooms++;
 }}finally{reset();}
 for(const [key,value] of Object.entries({nativeRooms:10,independentCohorts:80,independentLocalParticipants:80,independentDeliveryParticipants:80,localUnboundReviews:80,localVersionPackets:80,logicalReaderChecks:72,pureNoIOChecks:80,coldNativeComparisons:160,referenceNativeRestores:72,futureNativePairs:144,independentDuplicateRefusals:80,oldMixedRefusals:80,privateGraphPublicRefusals:80,restoredCohorts:40,restoredNativeSources:80,expiredWriterReads:80,restoredOldOperationRefusals:80,restoredReadGrantRefusals:40,restoredFacadeRefusals:40,restoredOfflineRecaptures:36,mixedCohorts:480,mixedOriginal:80,mixedGeneration:240,mixedIndependentLocal:80,mixedIndependentDelivery:80,mixedLocalPending:160,mixedDuplicateRefusals:960,mixedWriterRefusals:480,mixedReadGrantRefusals:480,retainedComparisons:1280,restoredParticipants:80,networkCalls:0}))assert.equal(counts[key],value,key);
 return{format:'breditor/independent-inventory-probe',formatVersion:1,passed:true,...counts,sharedWasmSha256:createHash('sha256').update(readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))).digest('hex'),scope:'All ten native compiler/transport fixture rooms and four matched independent document/comment family pairs. Public independent/logical/cohort readers plus private genuine graph-source admission; cold Native work, unbound local comments, actual source leases and grant refusals. No room-wide durable custody/provider closure, authenticated activation, physical durability or V1 approval.'};
}
