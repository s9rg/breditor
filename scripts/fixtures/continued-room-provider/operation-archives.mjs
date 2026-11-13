import assert from 'node:assert/strict';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {independentDeliverySource} from '../../../packages/breditor-collaboration/dist/independent_delivery_source/admission.js';
import {restoredParticipant} from '../independent-inventory/restored-participant.mjs';
import {roomLocalParticipant} from '../physical-catalog-v3/local-participant.mjs';
import {recoveryFaults} from '../independent-delivery-recovery/storage.mjs';
import {unavailableAsset,unavailableUpload} from '../physical-recovery-control/unavailable-upload.mjs';
import {pixel,pixelAsset} from '../review-assets/pixels.mjs';

export async function probeOperationArchives({profile,fixture,inventory,initial,openOptions,entries,input,requests,setTokenAction}){
 const common={api,rich,profile,fixture,metadata:inventory,documentSegmented:true,reviewSegmented:true};
 const ancestor={asset:'continued-provider-ancestor-only',generation:'graph-pending'};
 const localImage={asset:pixelAsset,generation:'local-operation-image'};
 const ingest=uploads=>uploads.ingest(new Blob([unavailableUpload],{type:'image/png'}));
 const image=(id,reference)=>api.imageNode(id,id+'-entity',reference.asset,reference.generation,'Offline raster',id+'-caption',{width:1,height:1});
 const insert=(core,node)=>assert.equal(core.dispatch({commands:[{kind:'insert_blocks',data:{parent:null,before:null,nodes:[node]}}]}),true);
 const counts={operationProviderReads:0,operationMissingPolicyReads:0,operationRevocations:0,operationGraphAncestorReads:0,operationDuplicateRefusals:0};
 const faults=recoveryFaults(),owners=[];
 let archive,store,duplicates,duplicateStore;
 try{
  const graph=await restoredParticipant({...common,client:fixture.clients[0],tag:'operation-provider-graph',prepareUploads:ingest,
   ...(fixture.atomic?{
    prepareDelivery(session){insert(session.core,image('graph-provider-image',{asset:pixelAsset,generation:'graph-base'}));},
    async prepareSnapshot({session,sourceDatabase}){
     const queue=await session.openSuggestionQueue();
     faults.select(sourceDatabase,'operation_history_heads',1);
     const proposal=queue.propose('Only the pending ancestor references this raster','30',{scope:'commands',edit:{kind:'commands',data:[
      {kind:'replace_image',data:{block:'graph-provider-image',...ancestor}},
     ]}});
     await assert.rejects(queue.flush());
     queue.stopRetryingPublication(proposal.id);queue.forget(proposal.id);
     assert.equal(JSON.stringify(independentDeliverySource(session).read()).includes(ancestor.asset),false);
    },
    resolveSnapshotAsset(reference){
     assert.deepEqual(reference,ancestor);
     return {...reference,identity:'host-verified',blob:new Blob([unavailableUpload],{type:'image/png'}),check(){}};
    },
   }:{})});
  owners.push(graph);
  const snapshot=await roomLocalParticipant({...common,client:fixture.clients[1],tag:'operation-provider-snapshot',
   prepareLocalInput(session){insert(session.core,image('local-provider-image',localImage));}});
  owners.push(snapshot);
  const flat=await roomLocalParticipant({...common,client:fixture.clients[2],tag:'operation-provider-flat'});
  owners.push(flat);
  const selected=[
   {id:graph.backup.selection().original.identity.participant,family:'restored-graph',owner:graph.backup,options:graph.readOptions},
   {id:snapshot.snapshot.selection().original.identity.participant,family:'local-operation-snapshot',owner:snapshot.snapshot,options:snapshot.readOptions},
   {id:flat.flat.selection().original.identity.participant,family:'local-operation-flat',owner:flat.flat,options:flat.readOptions},
  ];
  const row=({id,family,owner})=>({id,family,expected:owner.selection(),file:owner.file()});
  const policy=({id,owner,options})=>({id,original:owner.selection().original,options});
  const continued=entries.slice(3,7).map(({id,file,expected})=>({id,file,expected}));
  let allowed=true;
  const graphPolicy=policy(selected[0]);
  const options={...openOptions,policies:openOptions.policies.slice(3),
   graphPolicies:[{...graphPolicy,options:{...graphPolicy.options,checkAuthority(){assert.equal(allowed,true);}}}],
   localPolicies:selected.slice(1).map(item=>({...policy(item),family:item.family}))};
  const rows=[...selected.map(row),...continued];
  archive=await api.SharedContinuedRoomCatalog.capture({...initial,...options,participants:rows});
  const persisted={...options,database:'operation-provider-catalog',expected:archive.selection()};
  store=await api.SharedContinuedRoomCatalogStore.begin({...persisted,archive});
  await store.close();
  store=await api.SharedContinuedRoomCatalogStore.resume(persisted);
  const read={...input,catalog:store,expected:persisted.expected},active={...read,includeOperationArchives:true};
  const before=requests.length,pending=await api.readContinuedRoomReconciliation(read);
  assert.equal(pending.provider,null);
  assert.deepEqual(pending.unreconciledParticipants,selected.map(item=>item.id).sort());
  assert.deepEqual(requests.slice(before).map(entry=>entry.assets),[false]);
  counts.operationMissingPolicyReads++;
  const snapshots=await indexedDB.databases();
  const compared=await api.readContinuedRoomReconciliation(active);
  assert.deepEqual(await indexedDB.databases(),snapshots);
  assert.deepEqual(compared.unreconciledParticipants,[]);
  assert.equal(compared.participants.length,7);
  assert.equal(requests.slice(before).filter(entry=>entry.assets).length,1);
  assert.ok(compared.provider.missing.some(entry=>entry.kind==='uploadBytes'&&entry.contentAsset===unavailableAsset));
  assert.ok(compared.provider.resolutions.some(entry=>entry.contentAsset===pixelAsset&&
   entry.reference.asset===localImage.asset&&entry.reference.generation===localImage.generation));
  for(const item of selected){
   const prefix=compared.participants.find(entry=>entry.id===item.id).prefix;
   assert.equal(prefix.acceptedDocuments.length,inventory.writers.length+inventory.serverAuthors.length);
   assert.equal(prefix.acceptedReviews.length,inventory.review.writers.length);
   assert.equal(prefix.acceptedDocuments.find(entry=>entry.author===prefix.document.writer).relation,'local_ahead');
   assert.equal(compared.coverage.missing.some(entry=>entry.kind==='unbound_review'&&entry.actor===prefix.review.actor),item.family!=='restored-graph');
   const file=item.family==='local-operation-flat'?item.owner.uploads():item.owner.uploadBackup();
   assert.equal(compared.uploads.find(entry=>entry.id===item.id).bytes,file.size);
   counts.operationProviderReads++;
  }
  if(fixture.atomic){
   assert.equal(graph.backup.latestMetadata().bindings.some(entry=>entry.asset===ancestor.asset),false);
   assert.ok(graph.backup.blob(ancestor.asset,ancestor.generation));
   assert.ok(compared.provider.missing.some(entry=>entry.kind==='mapping'&&JSON.stringify(entry.reference)===JSON.stringify(ancestor)));
   counts.operationGraphAncestorReads++;
  }
  const beforeRevocation=requests.length;
  setTokenAction(()=>{allowed=false;});
  try{await assert.rejects(api.readContinuedRoomReconciliation(active));}
  finally{allowed=true;}
  assert.equal(requests.length,beforeRevocation);
  counts.operationRevocations++;
  const duplicate={...selected[1],id:'operation-provider-duplicate',family:'local-operation-flat',owner:snapshot.flat};
  const duplicateOptions={...options,localPolicies:[...options.localPolicies,{...policy(duplicate),family:duplicate.family}]};
  duplicates=await api.SharedContinuedRoomCatalog.capture({...initial,...duplicateOptions,participants:[...rows,row(duplicate)]});
  duplicateStore=await api.SharedContinuedRoomCatalogStore.begin({...duplicateOptions,database:'operation-provider-duplicate-catalog',
   expected:duplicates.selection(),archive:duplicates});
  const beforeDuplicate=requests.length;
  await assert.rejects(api.readContinuedRoomReconciliation({...active,catalog:duplicateStore,expected:duplicates.selection()}),
   error=>error.code==='inventory_duplicate');
  assert.equal(requests.length,beforeDuplicate);
  counts.operationDuplicateRefusals++;
  return counts;
 }finally{
  faults.restore();
  await duplicateStore?.close();duplicates?.dispose();
  await store?.close();archive?.dispose();
  for(const owner of owners.reverse())await owner.close();
 }
}
