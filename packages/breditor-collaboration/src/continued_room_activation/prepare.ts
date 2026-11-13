import {fields} from '../physical_room_record_cut/policy.js';
import {roomActivationDatabase} from '../room_native_activation_intent/identity.js';
import {fail} from '../room_native_activation_intent/policy.js';
import {retainActivationChoice} from '../room_native_activation_intent/retain_choice.js';
import {nativeActivationHostPort,type SharedDurableNativeActivationHost} from '../native_activation_control/host.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {withRecoveredContinuedRoomReconciliation} from '../continued_room_reconciliation/recovered.js';
import type {RecoveredContinuedRoomReconciliationOptions} from '../continued_room_reconciliation/contract.js';
import {ContinuedRoomActivationIntentStore,continuedRoomActivationChoice,encodeContinuedRoomActivation} from './intent.js';
import type {ContinuedRoomActivationChoice,ContinuedRoomActivationPlan} from './contract.js';

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
type ChoiceInput=Readonly<{
 database:string;activation:SharedDurableNativeActivationHost;
 retainChoice:(choice:ContinuedRoomActivationChoice)=>void|Promise<void>;
}>;
type VerifyInput=Readonly<{expected:ContinuedRoomActivationChoice;activation:SharedDurableNativeActivationHost}>;

/** Reopen actual recovered destinations and pin all observations to one Native checkpoint. */
async function withPlan<T>(
 input:RecoveredContinuedRoomReconciliationOptions,database:string,activation:SharedDurableNativeActivationHost,
 visit:(work:{
  plan:ContinuedRoomActivationPlan;encoding:Awaited<ReturnType<typeof encodeContinuedRoomActivation>>;
  store:ContinuedRoomActivationIntentStore;check:()=>void;verifyExact:()=>Promise<void>;signal:AbortSignal;
 })=>Promise<T>,
):Promise<T>{
 const port=nativeActivationHostPort(activation);
 return withRecoveredContinuedRoomReconciliation(input,async (read,held,host,guard,signal)=>{
  if(held.namespaces.includes(database)||!same(port.selection.current,host.selection.source))throw fail('activation_intent_stale');
  const {participants,documentOnlyParticipants=[]}=read.reconciliation;
  for(const {prefix} of [...participants,...documentOnlyParticipants]){
   if([...prefix.acceptedDocuments,...prefix.acceptedReviews].some(row=>row.relation==='server_ahead'))
    throw fail('activation_intent_incomplete');
  }
  const lifetime=new NativeReconstructionWaits(()=>{guard();port.check();guard();},[signal,...port.signals]);
  try{
   const check=lifetime.check,options={wasm:held.catalogOptions.wasm,checkAuthority:check,signal:lifetime.signal};
   const context=prepareArchiveIntegrity(options),report=new Blob([JSON.stringify(read.reconciliation)]);
   const plan:ContinuedRoomActivationPlan=frozen({format:'breditor/continued-room-activation-plan',formatVersion:1,
    catalogDatabase:held.catalogDatabase,recoveryDatabase:held.recoveryDatabase,recovery:read.recovery,
    server:host.selection,activation:port.selection,reconciliation:{bytes:report.size,sha256:await context.digest(report)}});
   const encoding=await encodeContinuedRoomActivation(database,plan,options);
   const store=new ContinuedRoomActivationIntentStore(encoding.choice,options);
   try{
    return await visit({plan,encoding,store,check,signal:lifetime.signal,verifyExact:async()=>{
     await host.check(lifetime.signal);
     await held.verifyExact();
     check();
    }});
   }finally{await store.close();}
  }finally{lifetime.close();}
 });
}

/** Persist an independently retained intent. The Native checkpoint remains prepared. */
export function prepareContinuedRoomActivation(
 input:RecoveredContinuedRoomReconciliationOptions,options:ChoiceInput,
):Promise<ContinuedRoomActivationChoice>{
 return (async()=>{
  const r=fields(options,['database','activation','retainChoice']),database=roomActivationDatabase(r['database']);
  const retain=r['retainChoice'] as ChoiceInput['retainChoice'];
  if(typeof retain!=='function')throw fail('activation_intent_policy');
  return withPlan(input,database,r['activation'] as SharedDurableNativeActivationHost,async work=>{
   await retainActivationChoice(work.encoding.choice,retain,work.check,[work.signal]);
   await work.verifyExact();
   await work.store.open(work.encoding);
   work.check();
   return work.encoding.choice;
  });
 })();
}

/** Cold revalidation requires the same catalog, journal and actual host selections. */
export async function verifyContinuedRoomActivation(
 input:RecoveredContinuedRoomReconciliationOptions,options:VerifyInput,
):Promise<ContinuedRoomActivationPlan>{
 const r=fields(options,['expected','activation']),expected=continuedRoomActivationChoice(r['expected']);
 return withPlan(input,expected.database,r['activation'] as SharedDurableNativeActivationHost,async work=>{
  if(!same(expected,work.encoding.choice))throw fail('activation_intent_stale');
  const stored=await work.store.open();
  if(stored.capture!==work.encoding.graph)throw fail('activation_intent_stale');
  await work.verifyExact();
  return work.plan;
 });
}
