/** Seven concrete families from seven ACTUAL registrations in one native room.
 * Current factories are supplied by independent test hosts, not selected by a
 * serialized readiness flag. Old two-author fixture contracts stay unchanged. */
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {dirname,join} from 'node:path';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {environment} from '../room-participant-inventory/environment.mjs';
import {makePhysicalCatalogV2Participant} from '../physical-catalog-v2/fixture.mjs';
import {roomLocalParticipant} from '../physical-catalog-v3/local-participant.mjs';
import {recoveryFactory} from '../independent-delivery-recovery/session.mjs';
import {localRecoveryOptions} from '../independent-recovery/session.mjs';
import {pixel,secondPixel} from '../review-assets/pixels.mjs';
import {PhysicalRoomCatalogV3Archive,physicalCatalogV3ArchiveState} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v3/archive.js';
const families=['original','generation','independent-local','independent-delivery','restored-graph','local-operation-snapshot','local-operation-flat'];
const sourceFactory=options=>Object.fromEntries(Object.entries(options).filter(([key])=>!['database','create'].includes(key)));
function current(row,prefix,checkAuthority){
 const{id,family,owner,expected}=row;
 if(family==='original'){const{backup,expected:old,checkAuthority:oldCheck,signal,destinations,...rest}=owner.recovery;return{id,family,operationDatabase:prefix+'-operation',recovery:{...rest,database:prefix+'-recovery',destinations:Object.fromEntries(Object.keys(destinations).map(key=>[key,prefix+'-'+key]))},currentPolicy:{documentReadOnly:false,reviewAccess:'comment'},checkAuthority};}
 if(family==='generation'){const{database,create,initialGenerations,initialReviewCheckpoint,binding,retained,...native}=owner.options,kind=owner.kind;return{id,family,operationDatabase:prefix+'-operation',recovery:{database:prefix+'-recovery',destinations:{source:prefix+'-recovery-source',uploads:prefix+'-uploads'},session:{kind,options:{...native,...(kind!=='local'?{binding}:{}),...(kind==='retained'?{retained}:{})}}},currentPolicy:{documentReadOnly:false,reviewAccess:'comment'},checkAuthority};}
 if(family==='independent-local')return{id,family,options:{database:prefix+'-parent',journalDatabase:prefix+'-journal',sourceDatabase:prefix+'-source',session:{...owner.options,database:prefix+'-source'},recovery:{...localRecoveryOptions(owner.options,owner.backup,prefix+'-recovery'),checkAuthority},writerRecovery:'host-reacquired'}};
 if(family==='independent-delivery')return{id,family,stagingSession:recoveryFactory(owner.options),options:{database:prefix+'-operation',sourceDatabase:prefix+'-source',writerRecovery:'host-reacquired',recovery:{database:prefix+'-recovery',expected,destinations:{source:prefix+'-recovery-source',uploads:prefix+'-uploads'},session:recoveryFactory(owner.options,{readOnly:false,access:'comment'}),checkAuthority}}};
 if(family==='restored-graph')return{id,family,options:{kind:'lineage-v2',expected,database:prefix+'-parent',journalDatabase:prefix+'-journal',sourceDatabase:prefix+'-source',uploadsDatabase:prefix+'-uploads',session:recoveryFactory(owner.options,{readOnly:false,access:'comment'}),writerRecovery:'host-reacquired',checkAuthority}};
 return{id,family,options:{kind:family==='local-operation-snapshot'?'snapshot-v1':'flat-local-v1',expected,database:prefix+'-journal',sourceDatabase:prefix+'-source',sourceFactory:sourceFactory(owner.options),writerRecovery:'host-reacquired',checkAuthority,cohort:{parentDatabase:prefix+'-parent',uploadsDatabase:prefix+'-uploads'}}};
}
export async function sevenFamilyRoomFixture({fixtures,item=fixtures.manifest.cases[1],documentSegmented=true,reviewSegmented=true,generationKind='retained',generationExtraVersion=false,tag='seven-room',policy=()=>{},prepareDelivery,prepareGraph}){
 const reset=environment(),data=fixtures.fixture(item),profile=fixtures.profile(data),folder=dirname(item.path),inventory=await api.readSharedServerLogGenerationParticipantInventory(new Blob([readFileSync(join(folder,'inventory.json'))]),data.selected),metadata=inventory.metadata().native,counts={networkCalls:0,restoredParticipants:0,restoredComponents:0},rows=[];let archive;
 assert.equal(metadata.writers.length,7);assert.equal(metadata.review.writers.length,7);assert.equal(data.clients.length,7);
 const closeWriters=async()=>{for(const row of rows.toReversed())await row.owner.close();};
 try{
  for(const[index,family]of families.entries()){
   const client=data.clients[index],input={api,rich,profile,fixture:data,metadata,client,documentSegmented,reviewSegmented,uploads:[pixel,secondPixel],tag:tag+'-'+family,...(family==='generation'&&generationExtraVersion?{extraVersions:true}:{}),...(family==='independent-delivery'&&prepareDelivery?{prepareDelivery}:{}),...(family==='restored-graph'&&prepareGraph?{prepareDelivery:prepareGraph}:{})},owner=family==='local-operation-snapshot'||family==='local-operation-flat'?await roomLocalParticipant(input):await makePhysicalCatalogV2Participant(family==='generation'?'generation-'+generationKind:family,input,counts);
   const backup=family==='local-operation-snapshot'?owner.snapshot:family==='local-operation-flat'?owner.flat:owner.backup;rows.push({id:family,family,owner,file:backup.file(),expected:backup.selection(),client});
  }
  const graphPolicies=rows.filter(row=>row.family==='restored-graph').map(row=>({id:row.id,original:row.expected.original,options:row.owner.readOptions})),localPolicies=rows.filter(row=>row.family==='local-operation-snapshot'||row.family==='local-operation-flat').map(row=>({id:row.id,family:row.family,original:row.expected.original,options:row.owner.readOptions})),options={wasm:fixtures.native,checkAuthority(){},graphPolicies,localPolicies};
  archive=await PhysicalRoomCatalogV3Archive.capture({...options,catalog:tag,origin:{file:new Blob([readFileSync(join(folder,'server.backup'))]),expected:data.afterRecoveryState.origin},current:{server:{file:new Blob([readFileSync(join(folder,'server-after.backup'))]),expected:data.afterRecoveryState.server},participants:{file:new Blob([readFileSync(join(folder,'inventory-after.json'))]),expected:data.afterRecoveryState.participants}},participants:rows.map(({id,family,file,expected})=>({id,family,file,expected}))});
  const source=physicalCatalogV3ArchiveState(archive),participants=rows.map((row,index)=>current(row,tag+'-active-'+row.id,()=>policy(index)));
  assert.equal(archive.files().size,10);assert.equal(new Set(rows.map(row=>row.client.writer)).size,7);assert.equal(new Set(rows.map(row=>row.client.actor)).size,7);assert.equal(new Set(rows.map(row=>row.family)).size,7);
  return{archive,source,participants,options,rows,counts,metadata,data,profile,closeWriters,async close(){await closeWriters();archive?.dispose();inventory.dispose();profile.free();assert.equal(counts.networkCalls,0);reset();}};
 }catch(error){await closeWriters();archive?.dispose();inventory.dispose();profile.free();reset();throw error;}
}
