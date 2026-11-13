import assert from 'node:assert/strict';
import {verifyActivationCommit} from './activation.mjs';
import {continuedDeliveryParticipant} from '../continued-room-recovery/continued-delivery.mjs';

/** Build the fully delivery-bound cohort for the authenticated commit case. */
export async function verifyCoveredActivation(api,{initial,entries,fixture,inventory,wasm,caseInfo,host,getToken,requests}){
 const {SharedContinuedRoomCatalog:Catalog,SharedContinuedRoomCatalogStore:Store}=api;
 const cohort=[];
 let archive,store,replacement;
 try{
  for(const entry of entries){
   cohort.push(await continuedDeliveryParticipant(api,{entry,fixture,metadata:inventory,wasm,
    endpoint:caseInfo.endpoint.replace(/^http/,'ws'),tag:'activation-'+entry.id}));
  }
  const options={wasm,policies:cohort.map(row=>row.policy),checkAuthority(){}};
  archive=await Catalog.capture({...initial,...options,catalog:'activation-source-room',participants:cohort.map(row=>row.row)});
  store=await Store.begin({...options,database:'activation-source-catalog',archive,expected:archive.selection()});
  const recovery={catalog:store,expected:archive.selection(),database:'activation-source-journal',
   destinations:cohort.map(({id})=>({id,source:id+'-source-history',uploads:id+'-source-uploads'})),
   writerRecovery:'host-reacquired',checkAuthority(){}};
  const reconciliation={host,checkAuthority(){}};
  await api.beginContinuedRoomRecovery(recovery);
  let retained;
  await api.retainRecoveredContinuedRoomCatchUp({recovery,reconciliation},{
   database:'activation-target-catalog',catalog:'activation-target-room',retainChoice(choice){retained=structuredClone(choice);},
  });
  const expected=new Map(retained.advanced.map(row=>[row.id,row.expected]));
  replacement=await Store.resume({...options,database:retained.database,expected:retained.replacement,
   policies:options.policies.map(row=>({...row,expected:expected.get(row.id)}))});
  const target={...recovery,catalog:replacement,expected:retained.replacement,database:'activation-target-journal',
   destinations:recovery.destinations.map(row=>({...row,source:row.source+'-replacement',uploads:row.uploads+'-replacement'}))};
  await api.beginContinuedRoomRecovery(target);
  const input={recovery:target,reconciliation},read=await api.readRecoveredContinuedRoomReconciliation(input);
  assert.equal(read.reconciliation.coverage.registeredStreamsCovered,true);
  assert.deepEqual(read.reconciliation.coverage.missing,[]);
  for(const {id,backup} of cohort){
   const original=backup.records().live,advanced=replacement.participantDeliveryRecords(id).live;
   assert.deepEqual(advanced.relay,original.relay);
   assert.deepEqual(advanced.retained,original.retained);
   assert.deepEqual(await replacement.participantUploads(id).arrayBuffer(),await backup.uploadBackup().arrayBuffer());
  }
  return await verifyActivationCommit(api,{input,offer:caseInfo.activation,publicationOffer:caseInfo.publication,requests,getToken});
 }finally{
  await replacement?.close();
  await store?.close();
  archive?.dispose();
  for(const entry of cohort)entry.backup.dispose();
 }
}
