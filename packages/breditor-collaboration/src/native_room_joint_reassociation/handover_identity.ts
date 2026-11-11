/** Closed DATA for the sealed restart association. It binds original and prior
 * observations to a fresh checkpoint and publication without granting service. */
import {fields,integer,hash,rows} from '../physical_room_record_cut/policy.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {jointHandoverActivationIntentChoice} from '../native_room_joint_activation/intent_identity.js';
import type {JointHandoverActivationPlan} from '../native_room_joint_activation/handover_contract.js';
import {snapshotJointActivationData,MAX_JOINT_ACTIVATION_PLAN_BYTES,jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {roomHandoverActivationIntentChoice} from '../room_native_handover_activation_intent/identity.js';
import {handoverActivationReassociationChoice} from '../room_native_handover_activation_intent/reassociate_choice.js';
import {assertHandoverPathContinuation} from '../room_native_handover_activation_intent/capture_binding.js';
import {nativePublicationSelection} from '../native_publication_control/identity.js';
import {handoverMetadataContinuationChoice} from '../selected_local_metadata_continuation/handover_choice.js';
import type {MetadataContinuationDestinations} from '../selected_local_metadata_continuation/contract.js';
import {reassociationDestinations,reassociationOriginalNamespaces} from './identity.js';
import type {JointHandoverReassociationChoice,JointHandoverReassociationPlan,JointHandoverReassociationRecord,JointHandoverReassociationPrior} from './handover_contract.js';

const keys=['database','activation','publication','destinations','prior'];
const pin=(r:Record<string,unknown>)=>({bytes:integer(r['bytes'],MAX_JOINT_ACTIVATION_PLAN_BYTES,1),sha256:hash(r['sha256'])});
function prior(input:unknown):JointHandoverReassociationPrior{
 const value=input as {format?:unknown};
 if(value?.format==='breditor/metadata-continuation-absence'){
  const r=fields(input,['format','formatVersion','destinations']);
  if(r['formatVersion']!==1)throw fail();
  return{format:value.format,formatVersion:1,destinations:reassociationDestinations(r['destinations'])};
 }
 const r=fields(input,['format','formatVersion','choice','phase','review','metadata']);
 if(r['format']!=='breditor/handover-metadata-continuation-evidence'||r['formatVersion']!==1)throw fail();
 const phase=r['phase'],review=r['review'],metadata=r['metadata'];
 if(phase!=='intent'&&phase!=='prepared'&&phase!=='review'&&phase!=='metadata')throw fail();
 for(const text of [review,metadata])if(text!==null&&(typeof text!=='string'||!text||new TextEncoder().encode(text).length>MAX_JOINT_ACTIVATION_PLAN_BYTES))throw fail();
 if((review!==null)!==(phase==='review'||phase==='metadata')||(metadata!==null)!==(phase==='metadata'))throw fail();
 return{format:r['format'],formatVersion:1,choice:handoverMetadataContinuationChoice(r['choice']),phase,review:review as string|null,metadata:metadata as string|null};
}
function record(r:Record<string,unknown>):JointHandoverReassociationRecord{
 return{database:database(r['database']),activation:roomHandoverActivationIntentChoice(r['activation']),
  publication:nativePublicationSelection(r['publication']),destinations:reassociationDestinations(r['destinations']),prior:prior(r['prior'])};
}
function assertPrior(
 evidence:JointHandoverReassociationPrior,destination:MetadataContinuationDestinations,
 old:JointHandoverActivationPlan,previous:JointHandoverReassociationRecord['activation'],
):void{
 if(evidence.format==='breditor/metadata-continuation-absence'){
  if(!equal(evidence.destinations,destination))throw fail();
  return;
 }
 const saved=evidence.choice.continuation,origin=saved.origin,selected=old.origin.selection;
 const actual={database:saved.database,preparationDatabase:saved.prepared.database,reviewDatabase:saved.review.database,metadataDatabase:saved.metadata.database};
 if(!equal(actual,destination)||!equal(saved.execution,old.execution)||!equal(origin.current,selected.current)||
    !equal(origin.prepared,selected.prepared)||!equal(origin.review,selected.review)||!equal(origin.metadata,selected.metadata)||
    origin.choice.database!==old.origin.metadataDatabase||origin.choice.parent.database!==old.origin.reviewDatabase||
    !equal(evidence.choice.handover.current.path.current,previous.activation.current))throw fail();
 assertHandoverPathContinuation(previous.handover,evidence.choice.handover);
}
/** Reconstruct the exact earlier descriptor from its linear prefix. */
export function handoverReassociationPredecessorChoice(plan:JointHandoverReassociationPlan,index:number):JointHandoverReassociationChoice{
 const entry=plan.predecessors[index];
 if(!entry||!Number.isInteger(index)||index<0)throw fail();
 const {bytes,sha256,...earlier}=entry;
 return frozen({format:'breditor/joint-native-handover-reassociation-intent',formatVersion:1,
  plan:{format:plan.format,formatVersion:1,database:earlier.database,original:plan.original,
   predecessors:plan.predecessors.slice(0,index),activation:earlier.activation,publication:earlier.publication,destinations:earlier.destinations,prior:earlier.prior},
  bytes,sha256});
}
export function jointHandoverReassociationPlan(input:unknown):JointHandoverReassociationPlan{
 try{
  const r=fields(snapshotJointActivationData(input),['format','formatVersion','original','predecessors',...keys]);
  if(r['format']!=='breditor/joint-native-handover-reassociation-plan'||r['formatVersion']!==1)throw fail();
  const original=jointHandoverActivationIntentChoice(r['original']),old=original.plan,occupied=reassociationOriginalNamespaces(old);
  const predecessors=rows(r['predecessors'],4096).map(value=>{
   const row=fields(value,[...keys,'bytes','sha256']);
   return {...record(row),...pin(row)};
  });
  const current=record(r);
  let previous=old.activation,publication=old.publication,destination=old.destinations;
  const activations=new Set([previous.activation.instance]),paths=new Set([previous.handover.current.instance]),publications=new Set([publication.instance]);
  for(const row of [...predecessors,current]){
   const next=row.activation,selected=row.publication;
   const expected=handoverActivationReassociationChoice(previous,next.database,next.activation,next.handover);
   if(!equal(expected,next)||!equal(selected.activation,next.activation)||selected.listener!==publication.listener||
      activations.has(next.activation.instance)||paths.has(next.handover.current.instance)||publications.has(selected.instance))throw fail();
   assertPrior(row.prior,destination,old,previous);
   const names=[row.database,next.database,...Object.values(row.destinations)];
   if(new Set(names).size!==names.length||names.some(name=>occupied.has(name)))throw fail();
   for(const name of names)occupied.add(name);
   activations.add(next.activation.instance);
   paths.add(next.handover.current.instance);
   publications.add(selected.instance);
   previous=next;
   publication=selected;
   destination=row.destinations;
  }
  const result=frozen({format:r['format'],formatVersion:1,database:current.database,original,predecessors,
   activation:current.activation,publication:current.publication,destinations:current.destinations,prior:current.prior} as const);
  if(new TextEncoder().encode(JSON.stringify(result)).length>MAX_JOINT_ACTIVATION_PLAN_BYTES)throw fail();
  return result;
 }catch{throw fail();}
}
export function jointHandoverReassociationChoice(input:unknown):JointHandoverReassociationChoice{
 try{
  const r=fields(snapshotJointActivationData(input),['format','formatVersion','plan','bytes','sha256']);
  if(r['format']!=='breditor/joint-native-handover-reassociation-intent'||r['formatVersion']!==1)throw fail();
  return frozen({format:r['format'],formatVersion:1,plan:jointHandoverReassociationPlan(r['plan']),...pin(r)} as const);
 }catch{throw fail();}
}
