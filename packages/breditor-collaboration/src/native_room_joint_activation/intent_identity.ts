/** Preserve the literal independent protocols while admitting their new joint
 * association. Matching DATA never supplies an actual owner or target witness. */
import {fields,integer,hash,rows} from '../physical_room_record_cut/policy.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {roomActivationIntentChoice} from '../room_native_activation_intent/identity.js';
import {roomHandoverActivationIntentChoice} from '../room_native_handover_activation_intent/identity.js';
import {roomRunIdentity} from '../native_room_execution_run/identity.js';
import {executionNames} from '../native_room_execution/plan.js';
import {preparationChoice} from '../selected_delivery_preparation/identity.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {nativePublicationSelection} from '../native_publication_control/identity.js';
import type {JointRoomActivationPlan,JointRoomActivationIntentChoice} from './intent_contract.js';
import type {JointHandoverActivationPlan,JointHandoverActivationIntentChoice} from './handover_contract.js';
import {jointIntentFailure as fail,jointEqual as equal,snapshotJointActivationData,MAX_JOINT_ACTIVATION_PLAN_BYTES} from './intent_policy.js';
const pin=(value:unknown)=>{const p=fields(value,['bytes','sha256']);return{bytes:integer(p['bytes'],1024*1024*1024,1),sha256:hash(p['sha256'])};};
type JointPlan=JointRoomActivationPlan|JointHandoverActivationPlan;
type JointIntent=JointRoomActivationIntentChoice|JointHandoverActivationIntentChoice;

function plan<Format extends JointPlan['format'],Origin extends JointPlan['origin']['selection']['format'],Activation extends JointPlan['activation']>(
 value:unknown,format:Format,originFormat:Origin,parseActivation:(value:unknown)=>Activation,
){
 try{
  const r=fields(snapshotJointActivationData(value),['format','formatVersion','database','sourceNamespaces','activation','execution','origin','destinations','publication']);
  if(r['format']!==format||r['formatVersion']!==1)throw fail();
  const name=database(r['database']),activation=parseActivation(r['activation']),execution=roomRunIdentity(r['execution']),publication=nativePublicationSelection(r['publication']);
  const o=fields(r['origin'],['selection','reviewDatabase','metadataDatabase']),s=fields(o['selection'],['format','formatVersion','activation','prepared','current','review','metadata']);
  if(s['format']!==originFormat||s['formatVersion']!==1)throw fail();
  const origin={selection:{format:originFormat,formatVersion:1 as const,activation:parseActivation(s['activation']),prepared:preparationChoice(s['prepared']),current:selectedRoomCurrentSelection(s['current']),review:pin(s['review']),metadata:pin(s['metadata'])},reviewDatabase:database(o['reviewDatabase']),metadataDatabase:database(o['metadataDatabase'])};
  const d=fields(r['destinations'],['database','preparationDatabase','reviewDatabase','metadataDatabase']),destinations={database:database(d['database']),preparationDatabase:database(d['preparationDatabase']),reviewDatabase:database(d['reviewDatabase']),metadataDatabase:database(d['metadataDatabase'])};
  if(!equal(activation,origin.selection.activation)||!equal(publication.activation,activation.activation)||!equal(execution.execution.plan.preparation.plan.before,origin.selection.current))throw fail();
  const sourceNamespaces=rows(r['sourceNamespaces'],32768).map(database);if(!sourceNamespaces.length||new Set(sourceNamespaces).size!==sourceNamespaces.length||sourceNamespaces.some((n,i)=>i>0&&n<=sourceNamespaces[i-1]!))throw fail();
  const old=[activation.database,origin.selection.prepared.database,origin.reviewDatabase,origin.metadataDatabase,...sourceNamespaces];
  const target=[execution.database,...executionNames(execution.execution.plan.layout),execution.execution.plan.preparation.plan.database,...execution.execution.plan.preparation.plan.participants.flatMap(row=>row.namespaces.map(ns=>ns.database))];
  const fresh=[name,...Object.values(destinations)];if(new Set(fresh).size!==fresh.length||fresh.some(n=>old.includes(n)||target.includes(n)))throw fail();
  const result=frozen({format,formatVersion:1 as const,database:name,sourceNamespaces,activation,execution,origin,destinations,publication});
  if(new TextEncoder().encode(JSON.stringify(result)).length>MAX_JOINT_ACTIVATION_PLAN_BYTES)throw fail();return result;
 }catch{throw fail();}
}
export function jointRoomActivationPlan(value:unknown):JointRoomActivationPlan{
 return plan(value,'breditor/joint-native-room-activation-plan','breditor/joint-activation-metadata-origin',roomActivationIntentChoice);
}
export function jointHandoverActivationPlan(value:unknown):JointHandoverActivationPlan{
 return plan(value,'breditor/joint-native-handover-activation-plan','breditor/joint-handover-activation-metadata-origin',roomHandoverActivationIntentChoice);
}
function intent<Format extends JointIntent['format'],Plan extends JointPlan>(
 value:unknown,format:Format,parsePlan:(value:unknown)=>Plan,
){
 try{
  const r=fields(snapshotJointActivationData(value),['format','formatVersion','plan','bytes','sha256']);
  if(r['format']!==format||r['formatVersion']!==1)throw fail();
  return frozen({format,formatVersion:1 as const,plan:parsePlan(r['plan']),bytes:integer(r['bytes'],MAX_JOINT_ACTIVATION_PLAN_BYTES,1),sha256:hash(r['sha256'])});
 }catch{throw fail();}
}
export function jointRoomActivationIntentChoice(value:unknown):JointRoomActivationIntentChoice{
 return intent(value,'breditor/joint-native-room-activation-intent',jointRoomActivationPlan);
}
export function jointHandoverActivationIntentChoice(value:unknown):JointHandoverActivationIntentChoice{
 return intent(value,'breditor/joint-native-handover-activation-intent',jointHandoverActivationPlan);
}
