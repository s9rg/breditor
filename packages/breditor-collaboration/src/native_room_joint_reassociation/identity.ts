/** Closed original contracts plus a separately named restart association. This
 * parser supplies no control, source, actor, stored fact, or current permission. */
import {fields,integer,hash,rows} from '../physical_room_record_cut/policy.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {roomActivationIntentChoice} from '../room_native_activation_intent/identity.js';
import {nativePublicationSelection} from '../native_publication_control/identity.js';
import {jointRoomActivationIntentChoice} from '../native_room_joint_activation/intent_identity.js';
import {snapshotJointActivationData,MAX_JOINT_ACTIVATION_PLAN_BYTES,jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {continuationChoice} from '../selected_local_metadata_continuation/policy.js';
import {executionNames} from '../native_room_execution/plan.js';
import type {MetadataContinuationDestinations} from '../selected_local_metadata_continuation/contract.js';
import type {JointReassociationChoice,JointReassociationPlan,JointReassociationRecord,JointReassociationPredecessor,JointReassociationPriorMetadata} from './contract.js';
const pin=(r:Record<string,unknown>)=>({bytes:integer(r['bytes'],MAX_JOINT_ACTIVATION_PLAN_BYTES,1),sha256:hash(r['sha256'])});
function destinations(input:unknown):MetadataContinuationDestinations{
 const r=fields(input,['database','preparationDatabase','reviewDatabase','metadataDatabase']);return{database:database(r['database']),preparationDatabase:database(r['preparationDatabase']),reviewDatabase:database(r['reviewDatabase']),metadataDatabase:database(r['metadataDatabase'])};
}
export function reassociationPriorDestinations(input:JointReassociationPriorMetadata):MetadataContinuationDestinations{
 if(input.format==='breditor/metadata-continuation-absence')return input.destinations;
 const c=input.choice;return{database:c.database,preparationDatabase:c.prepared.database,reviewDatabase:c.review.database,metadataDatabase:c.metadata.database};
}
function prior(input:unknown):JointReassociationPriorMetadata{
 const value=input as {format?:unknown};
 if(value?.format==='breditor/metadata-continuation-absence'){
  const r=fields(input,['format','formatVersion','destinations']);if(r['formatVersion']!==1)throw fail();return{format:'breditor/metadata-continuation-absence',formatVersion:1,destinations:destinations(r['destinations'])};
 }
 const r=fields(input,['format','formatVersion','choice','phase','review','metadata']);if(r['format']!=='breditor/metadata-continuation-evidence'||r['formatVersion']!==1)throw fail();
 const phase=r['phase'];if(!['absent','intent','prepared','review','metadata'].includes(phase as string))throw fail();
 for(const name of ['review','metadata']){const text=r[name];if(text!==null&&(typeof text!=='string'||!text||new TextEncoder().encode(text).length>MAX_JOINT_ACTIVATION_PLAN_BYTES))throw fail();}
 if((r['review']!==null)!==['review','metadata'].includes(phase as string)||(r['metadata']!==null)!==(phase==='metadata'))throw fail();
 return{format:'breditor/metadata-continuation-evidence',formatVersion:1,choice:continuationChoice(r['choice']),phase:phase as 'absent'|'intent'|'prepared'|'review'|'metadata',review:r['review'] as string|null,metadata:r['metadata'] as string|null};
}
/** Detached exact observations for a finite visitor; sparse/mutable caller
 * arrays cannot change which earlier journals remain held across a request. */
export function jointReassociationPriorMetadataList(input:unknown):readonly JointReassociationPriorMetadata[]{
 try{return frozen(rows(snapshotJointActivationData(input),4097).map(prior));}catch{throw fail();}
}
function record(input:unknown,predecessor=false):JointReassociationRecord|JointReassociationPredecessor{
 const r=fields(input,['database','activation','publication','destinations','prior',...(predecessor?['bytes','sha256']:[])]);
 return{database:database(r['database']),activation:roomActivationIntentChoice(r['activation']),publication:nativePublicationSelection(r['publication']),destinations:destinations(r['destinations']),prior:prior(r['prior']),...(predecessor?pin(r):{})};
}
/** Reconstruct exactly the plan pinned by an earlier linear entry. */
export function reassociationPredecessorChoice(plan:JointReassociationPlan,index:number):JointReassociationChoice{
 const entry=plan.predecessors[index];if(!entry||!Number.isInteger(index)||index<0)throw fail();
 const {bytes,sha256,...row}=entry;return frozen({format:'breditor/joint-native-room-reassociation-intent' as const,formatVersion:1 as const,plan:{format:plan.format,formatVersion:1 as const,database:row.database,original:plan.original,predecessors:plan.predecessors.slice(0,index),activation:row.activation,publication:row.publication,destinations:row.destinations,prior:row.prior},bytes,sha256});
}
export function jointReassociationPlan(input:unknown):JointReassociationPlan{
 try{
  const r=fields(snapshotJointActivationData(input),['format','formatVersion','database','original','predecessors','activation','publication','destinations','prior']);if(r['format']!=='breditor/joint-native-room-reassociation-plan'||r['formatVersion']!==1)throw fail();
  const original=jointRoomActivationIntentChoice(r['original']),predecessors=rows(r['predecessors'],4096).map(row=>record(row,true) as JointReassociationPredecessor),current=record(Object.fromEntries(['database','activation','publication','destinations','prior'].map(key=>[key,r[key]]))),old=original.plan;
  const occupied=new Set([old.database,old.activation.database,old.origin.selection.prepared.database,old.origin.reviewDatabase,old.origin.metadataDatabase,...old.sourceNamespaces,...Object.values(old.destinations),old.execution.database,...executionNames(old.execution.execution.plan.layout),old.execution.execution.plan.preparation.plan.database,...old.execution.execution.plan.preparation.plan.participants.flatMap(row=>row.namespaces.map(ns=>ns.database))]);
  let previous=old.activation.activation,publication=old.publication,destination=old.destinations;
  for(const row of [...predecessors,current]){
   const next=row.activation.activation,selected=row.publication;
   if(equal(next.instance,previous.instance)||!equal(next.current,previous.current)||!equal(next.previous.identity,previous.previous.identity)||!equal(selected.activation,next)||equal(selected.instance,publication.instance)||!equal(selected.listener,publication.listener))throw fail();
   const pending=equal(next.previous,previous.previous)&&equal(next.planned,previous.planned)&&equal(next.checkpointSha256,previous.checkpointSha256),committed=equal(next.previous,previous.planned)&&!equal(next.checkpointSha256,previous.checkpointSha256);
   if(!pending&&!committed||!equal(row.activation.graph,old.activation.graph)||!equal(row.activation.objects,old.activation.objects)||row.activation.totalBytes!==old.activation.totalBytes||!equal(reassociationPriorDestinations(row.prior),destination))throw fail();
   if(row.prior.format==='breditor/metadata-continuation-evidence'){
    const saved=row.prior.choice,origin=saved.origin;
    if(!equal(saved.execution,old.execution)||!equal(origin.current,old.origin.selection.current)||!equal(origin.prepared,old.origin.selection.prepared)||!equal(origin.review,old.origin.selection.review)||!equal(origin.metadata,old.origin.selection.metadata)||origin.choice.database!==old.origin.metadataDatabase||origin.choice.parent.database!==old.origin.reviewDatabase)throw fail();
   }
   const names=[row.database,row.activation.database,...Object.values(row.destinations)];if(new Set(names).size!==names.length||names.some(name=>occupied.has(name)))throw fail();for(const name of names)occupied.add(name);
   previous=next;publication=selected;destination=row.destinations;
  }
  const result=frozen({format:'breditor/joint-native-room-reassociation-plan' as const,formatVersion:1 as const,database:current.database,original,predecessors,activation:current.activation,publication:current.publication,destinations:current.destinations,prior:current.prior});
  if(new TextEncoder().encode(JSON.stringify(result)).length>MAX_JOINT_ACTIVATION_PLAN_BYTES)throw fail();return result;
 }catch{throw fail();}
}
export function jointReassociationChoice(input:unknown):JointReassociationChoice{
 try{const r=fields(snapshotJointActivationData(input),['format','formatVersion','plan','bytes','sha256']);if(r['format']!=='breditor/joint-native-room-reassociation-intent'||r['formatVersion']!==1)throw fail();return frozen({format:'breditor/joint-native-room-reassociation-intent' as const,formatVersion:1 as const,plan:jointReassociationPlan(r['plan']),...pin(r)});}catch{throw fail();}
}
