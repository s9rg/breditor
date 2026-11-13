import {fields} from '../physical_room_record_cut/policy.js';
import {roomActivationDatabase} from '../room_native_activation_intent/identity.js';
import {fail} from '../room_native_activation_intent/policy.js';
import {retainActivationChoice} from '../room_native_activation_intent/retain_choice.js';
import {nativePublicationHostPort} from '../native_publication_control/host.js';
import {publicationFailure} from '../native_publication_control/policy.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {RecoveredContinuedRoomReconciliationOptions} from '../continued_room_reconciliation/contract.js';
import {withContinuedRoomActivationPlan,openExactContinuedRoomActivation} from './prepare.js';
import {checkContinuedRoomDeliveryCoverage} from './commit.js';
import {continuedRoomActivationChoice} from './intent.js';
import {ContinuedRoomPublicationIntentStore,continuedRoomPublicationBinding,continuedRoomPublicationChoice,encodeContinuedRoomPublication} from './publication_intent.js';
import type {ContinuedRoomPublicationChoice,ContinuedRoomPublicationOptions,ContinuedRoomPublicationPlan,ContinuedRoomPublicationPrepareOptions,ContinuedRoomPublicationResult} from './contract.js';

type PublicationWork={
 readonly plan:ContinuedRoomPublicationPlan;
 readonly encoding:Awaited<ReturnType<typeof encodeContinuedRoomPublication>>;
 readonly store:ContinuedRoomPublicationIntentStore;
 readonly port:ReturnType<typeof nativePublicationHostPort>;
 readonly signal:AbortSignal;
 check():void;
 verifyExact():Promise<void>;
};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

function withPublication<T>(
 input:RecoveredContinuedRoomReconciliationOptions,database:string,expected:ContinuedRoomPublicationChoice['activationIntent'],
 {activation,publication}:Pick<ContinuedRoomPublicationOptions,'activation'|'publication'>,visit:(work:PublicationWork)=>Promise<T>,
):Promise<T>{
 const port=nativePublicationHostPort(publication);
 if(database===expected.database||!same(expected.activation,port.selection.activation))throw fail('activation_intent_stale');
 return withContinuedRoomActivationPlan(input,expected.database,activation,async work=>{
  if(work.namespaces.includes(database))throw fail('activation_intent_stale');
  const stored=await openExactContinuedRoomActivation(work.store,work.encoding,expected);
  checkContinuedRoomDeliveryCoverage(work.reconciliation);
  if(stored.state.phase!=='receipt-observed')throw fail('activation_intent_incomplete');
  const plan:ContinuedRoomPublicationPlan=frozen({format:'breditor/continued-room-publication-plan',formatVersion:1,
   database,activationIntent:expected,publication:port.selection});
  const lifetime=new NativeReconstructionWaits(()=>{work.check();work.store.check();port.check();},
   [work.signal,work.store.revoked,...port.signals]);
  try{
   const options={wasm:work.integrity.wasm,checkAuthority:lifetime.check,signal:lifetime.signal};
   const encoding=await encodeContinuedRoomPublication(plan,options);
   const store=new ContinuedRoomPublicationIntentStore(encoding.choice,options);
   try{
    return await visit({plan,encoding,store,port,signal:lifetime.signal,check:lifetime.check,async verifyExact(){
     await work.verifyExact();
     const current=await work.store.read();
     if(current.capture!==stored.capture||!same(current.state,stored.state))throw fail('activation_intent_stale');
     lifetime.check();
    }});
   }finally{await store.close();}
  }finally{lifetime.close();}
 });
}

/** Save a complete association for the real committed checkpoint and bound listener. */
export async function prepareContinuedRoomPublication(
 input:RecoveredContinuedRoomReconciliationOptions,options:ContinuedRoomPublicationPrepareOptions,
):Promise<ContinuedRoomPublicationChoice>{
 const r=fields(options,['database','expected','activation','publication','retainChoice']),database=roomActivationDatabase(r['database']);
 const {expected,retainChoice,activation,publication}=r as unknown as ContinuedRoomPublicationPrepareOptions;
 if(typeof retainChoice!=='function')throw fail('activation_intent_policy');
 return withPublication(input,database,continuedRoomActivationChoice(expected),{activation,publication},async work=>{
  await retainActivationChoice(work.encoding.choice,retainChoice,work.check,[work.signal]);
  await work.verifyExact();
  await work.store.open(work.encoding);
  return work.encoding.choice;
 });
}

/** Reopen the exact publication journal, then publish or confirm the same actual service. */
export async function publishContinuedRoom(
 input:RecoveredContinuedRoomReconciliationOptions,options:ContinuedRoomPublicationOptions,
):Promise<ContinuedRoomPublicationResult>{
 const r=fields(options,['expected','activation','publication','approve']) as unknown as ContinuedRoomPublicationOptions;
 const expected=continuedRoomPublicationChoice(r.expected);
 if(typeof r.approve!=='function')throw fail('activation_intent_policy');
 let started=false;
 try{
  return await withPublication(input,expected.database,expected.activationIntent,r,async work=>{
   if(!same(expected,work.encoding.choice))throw fail('activation_intent_stale');
   if((await work.store.open()).capture!==work.encoding.graph)throw fail('activation_intent_stale');
   const lifetime=new NativeReconstructionWaits(()=>{work.check();work.store.check();},[work.signal,work.store.revoked]);
   try{
    const approve=r.approve;
    if(await lifetime.call(()=>approve(work.plan))!==true)throw fail('activation_intent_policy');
    await work.verifyExact();
    await work.store.markRequestStarted(lifetime);
    started=true;
    lifetime.check();
    const receipt=await work.port.publish(continuedRoomPublicationBinding(expected),lifetime.check,lifetime.signal);
    await work.store.markReceiptObserved(receipt,lifetime);
    lifetime.check();
    return Object.freeze({choice:expected,receipt});
   }finally{lifetime.close();}
  });
 }catch(error){
  if(started)throw publicationFailure('publication_outcome_unknown',error);
  throw error;
 }
}
