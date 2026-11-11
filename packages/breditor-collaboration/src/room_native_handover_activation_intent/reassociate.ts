/** Retain the exact original sealed activation bytes under fresh Native
 * controllers. This action cannot request activation or carry forward a receipt. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {archiveGuard} from '../archive_integrity/policy.js';
import type {SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection as Handover} from '../generation_delivery_path_control/handover.js';
import type {SharedDurableNativeActivationSelection} from '../native_activation_control/contract.js';
import {nativeActivationHostPort} from '../native_activation_control/host.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {roomActivationDatabase} from '../room_native_activation_intent/identity.js';
import {fail} from '../room_native_activation_intent/policy.js';
import {retainActivationChoice} from '../room_native_activation_intent/retain_choice.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {assertHandoverActivationCapture,assertHandoverPathContinuation} from './capture_binding.js';
import type {RoomHandoverActivationEncodedCapture,RoomHandoverActivationIntentChoice,RoomHandoverActivationRetainedIntent} from './contract.js';
import {roomHandoverActivationIntentChoice} from './identity.js';
import {heldHandoverActivationPath} from './path.js';
import type {RoomHandoverActivationPreparationPolicy} from './prepare.js';
import {RoomHandoverActivationIntentStore} from './store.js';

export interface PrepareHandoverActivationReassociationInput extends RoomHandoverActivationPreparationPolicy {
 readonly previous:RoomHandoverActivationIntentChoice;
}
export interface ResumeHandoverActivationReassociationInput {
 readonly previous:RoomHandoverActivationIntentChoice;
 readonly expected:RoomHandoverActivationIntentChoice;
}

const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function restartedChoice(previous:RoomHandoverActivationIntentChoice,database:string,activation:SharedDurableNativeActivationSelection,handover:Handover){
 if(database===previous.database)throw fail('activation_intent_policy');
 const old=previous.activation;
 if(activation.instance===old.instance||handover.current.instance===previous.handover.current.instance||
    !equal(activation.current,old.current)||!equal(activation.previous.identity,old.previous.identity))throw fail('activation_intent_stale');
 const sameCheckpoint=equal(activation.previous,old.previous)&&equal(activation.planned,old.planned)&&equal(activation.checkpointSha256,old.checkpointSha256);
 const childCheckpoint=equal(activation.previous,old.planned)&&!equal(activation.checkpointSha256,old.checkpointSha256);
 if(!sameCheckpoint&&!childCheckpoint)throw fail('activation_intent_stale');
 assertHandoverPathContinuation(previous.handover,handover);
 return roomHandoverActivationIntentChoice({...previous,database,activation,handover});
}

function bind(
 old:Readonly<{intent:RoomHandoverActivationRetainedIntent;encoding:RoomHandoverActivationEncodedCapture}>,
 choice:RoomHandoverActivationIntentChoice,
):RoomHandoverActivationEncodedCapture{
 assertHandoverActivationCapture(choice.activation,choice.handover,old.intent.capture);
 return Object.freeze({...old.encoding,choice});
}

async function withOriginalEncoding<T>(
 previous:RoomHandoverActivationIntentChoice,wasm:SharedArchiveIntegrityOptions['wasm'],
 guard:()=>void,signals:readonly (AbortSignal|undefined)[],
 visit:(old:Awaited<ReturnType<RoomHandoverActivationIntentStore['openRetainedEncoding']>>,held:SharedArchiveIntegrityOptions,signal:AbortSignal)=>Promise<T>,
 opened?:RoomHandoverActivationIntentStore,
):Promise<T>{
 const lifetime=new NativeReconstructionWaits(guard,signals);
 let store:RoomHandoverActivationIntentStore|undefined;
 try{
  if(!opened)store=new RoomHandoverActivationIntentStore(previous,{wasm,checkAuthority:lifetime.check,signal:lifetime.signal});
  const original=opened??store!;
  const old=opened?await RoomHandoverActivationIntentStore.readHeldEncoding(opened):await original.openRetainedEncoding();
  if(!equal(previous,old.intent.choice))throw fail('activation_intent_stale');
  const held=new NativeReconstructionWaits(()=>{lifetime.check();original.check();},[lifetime.signal,original.revoked]);
  try{
   const result=await visit(old,{wasm,checkAuthority:held.check,signal:held.signal},held.signal);
   held.check();
   return result;
  }finally{held.close();}
 }finally{try{await store?.close();}finally{lifetime.close();}}
}

async function save(encoding:RoomHandoverActivationEncodedCapture,options:SharedArchiveIntegrityOptions,resume:boolean){
 let existing=false;
 if(resume){
  options.checkAuthority();
  const db=await existingDatabase(encoding.choice.database);
  try{options.checkAuthority();existing=!!db;}finally{db?.close();}
 }
 const store=new RoomHandoverActivationIntentStore(encoding.choice,options);
 try{
  const selected=await store.open(existing?undefined:encoding);
  options.checkAuthority();
  if(!existing&&selected.state.phase!=='prepared')throw fail();
  return selected.choice;
 }finally{await store.close();}
}

/** Authenticate the new sealed path and retain an independent choice before
 * creating a separate destination. The previous state remains untouched. */
export function prepareHandoverActivationReassociation(
 provided:PrepareHandoverActivationReassociationInput,options:SharedArchiveIntegrityOptions,
):Promise<RoomHandoverActivationIntentChoice>{
 return prepare(provided,options);
}

/** Use the caller's existing source reservation and leave it held. */
export function prepareHeldHandoverActivationReassociation(
 original:RoomHandoverActivationIntentStore,
 provided:PrepareHandoverActivationReassociationInput,options:SharedArchiveIntegrityOptions,
):Promise<RoomHandoverActivationIntentChoice>{
 return prepare(provided,options,original);
}

async function prepare(
 provided:PrepareHandoverActivationReassociationInput,options:SharedArchiveIntegrityOptions,opened?:RoomHandoverActivationIntentStore,
):Promise<RoomHandoverActivationIntentChoice>{
 const input=fields(provided,['previous','database','activation','path','retainChoice']);
 const previous=roomHandoverActivationIntentChoice(input['previous']),database=roomActivationDatabase(input['database']);
 const retain=input['retainChoice'] as PrepareHandoverActivationReassociationInput['retainChoice'];
 if(typeof retain!=='function')throw fail('activation_intent_policy');
 const activation=nativeActivationHostPort(input['activation'] as PrepareHandoverActivationReassociationInput['activation']);
 const path=heldHandoverActivationPath(input['path'] as PrepareHandoverActivationReassociationInput['path']);
 const selected=restartedChoice(previous,database,activation.selection,path.selection);
 const {wasm,signal}=options,check=archiveGuard(options.checkAuthority,signal);
 const guard=()=>{check();activation.check();path.guard(signal);check();};
 return withOriginalEncoding(previous,wasm,guard,[signal,...activation.signals,...path.signals],async(old,held,heldSignal)=>{
  await path.check(heldSignal);
  held.checkAuthority();
  const encoding=bind(old,selected);
  await retainActivationChoice(selected,retain,held.checkAuthority,[heldSignal]);
  await path.check(heldSignal);
  held.checkAuthority();
  return save(encoding,held,false);
 },opened);
}

/** Complete a previously retained DATA write, including an uncertain committed
 * create. No old HTTP controller is required and no observation is reset. */
export function resumeHandoverActivationReassociation(
 provided:ResumeHandoverActivationReassociationInput,options:SharedArchiveIntegrityOptions,
):Promise<RoomHandoverActivationIntentChoice>{
 return resume(provided,options);
}

/** Resume the destination write under the caller's original source reservation. */
export function resumeHeldHandoverActivationReassociation(
 original:RoomHandoverActivationIntentStore,
 provided:ResumeHandoverActivationReassociationInput,options:SharedArchiveIntegrityOptions,
):Promise<RoomHandoverActivationIntentChoice>{
 return resume(provided,options,original);
}

async function resume(
 provided:ResumeHandoverActivationReassociationInput,options:SharedArchiveIntegrityOptions,opened?:RoomHandoverActivationIntentStore,
):Promise<RoomHandoverActivationIntentChoice>{
 const input=fields(provided,['previous','expected']);
 const previous=roomHandoverActivationIntentChoice(input['previous']),expected=roomHandoverActivationIntentChoice(input['expected']);
 const selected=restartedChoice(previous,expected.database,expected.activation,expected.handover);
 if(!equal(expected,selected))throw fail('activation_intent_stale');
 const {wasm,signal}=options,check=archiveGuard(options.checkAuthority,signal);
 return withOriginalEncoding(previous,wasm,check,[signal],(old,held)=>save(bind(old,selected),held,true),opened);
}
