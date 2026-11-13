import {independentDeliverySessionPort} from '../independent_delivery/admission.js';
import {SharedIndependentDeliverySession as Session} from '../independent_delivery/session.js';
import type {SharedIndependentDeliveryParticipantBackup} from '../independent_delivery_participant/backup.js';
import {deliveryRecoveryArchive as archive} from '../independent_delivery_recovery/archive.js';
import {checkRecoveredIndependentDeliverySource} from '../independent_delivery_recovery/components.js';
import type {SharedIndependentDeliveryRecoveryFactory} from '../independent_delivery_recovery/contract.js';
import {inspectDeliveryHistoryDestination} from '../independent_delivery_recovery/destination.js';
import {makeDeliveryRecoveryCut} from '../independent_delivery_recovery/prepare.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {withIndependentBootstrapPolicy} from '../independent_history/bootstrap_policy.js';
import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {recoveryFailure,type ContinuedDestinationHold} from './destination.js';

const {open,restoreRecovery,prototype:{discardAndClose}}=Session;

/** Restore both native histories and the delivery companion into one exact cut. */
export async function recoverDeliveryRoomSource(
 database:string,factory:SharedIndependentDeliveryRecoveryFactory,backup:SharedIndependentDeliveryParticipantBackup,
 completed:boolean,guard:()=>void,signal?:AbortSignal,
):Promise<ContinuedDestinationHold>{
 const recovery=archive.recovery.call(backup);
 const options=inheritActorLeaseInput(factory,{...factory,database,create(){throw recoveryFailure('diverged');}});
 const {cut}=await makeDeliveryRecoveryCut(options,recovery,guard);
 const inspect=()=>inspectDeliveryHistoryDestination(database,recovery.source.identity.native,cut,guard);
 const before=await inspect();
 if(completed&&before!=='exact')throw recoveryFailure('diverged');
 const destination={cut,fail:()=>recoveryFailure('diverged')};
 const waits=new NativeReconstructionWaits(guard,[signal]);
 let session:Session;
 try{
  const history=factory.documentHistory;
  const documentHistory=history.kind==='original'?
   {...history,restoreOriginal:waits.restore(history.restoreOriginal,history)}:
   {...history,restoreSegmented:waits.restore(history.restoreSegmented,history)};
  const nativeOptions=inheritActorLeaseInput(options,{...options,documentHistory});
  session=before==='exact'?
   await open.call(Session,withIndependentBootstrapPolicy(nativeOptions,waits.check,waits.signal,destination)):
   await restoreRecovery.call(Session,withIndependentBootstrapPolicy(inheritActorLeaseInput(nativeOptions,{
    ...nativeOptions,recovery,writerRecovery:'host-reacquired' as const,
   }),waits.check,waits.signal,destination));
 }finally{waits.close();}
 let complete=false;
 try{
  const port=independentDeliverySessionPort(session),source=independentDeliverySource(session),stamp=source.stamp();
  const check=()=>{
   port.check();
   const current=source.stamp();
   if(stamp.length!==current.length||stamp.some((value,index)=>value!==current[index]))throw recoveryFailure('diverged');
  };
  const verify=async()=>{
   guard();check();
   checkRecoveredIndependentDeliverySource(session,backup,guard);
   if(await inspect()!=='exact')throw recoveryFailure('diverged');
   guard();check();
  };
  await verify();
  complete=true;
  return {check,verify,close:()=>discardAndClose.call(session)};
 }finally{if(!complete)await discardAndClose.call(session);}
}
