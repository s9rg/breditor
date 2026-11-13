import {withIndependentBootstrapPolicy} from '../independent_history/bootstrap_policy.js';
import {makeIndependentHistoryCut} from '../independent_history/cut.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {SharedIndependentHistoryPersistentSession as Session} from '../independent_history/session.js';
import type {SharedIndependentParticipantBackup} from '../independent_participant/backup.js';
import {independentRecoveryArchive as archive} from '../independent_recovery/archive.js';
import {checkRecoveredIndependentSource} from '../independent_recovery/components.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import {inspectIndependentHistoryDestination} from '../independent_recovery/destination.js';
import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {recoveryFailure,type ContinuedDestinationHold} from './destination.js';

const {open,restoreRecovery,prototype:{discardAndClose}}=Session;

/** Restore the original independent pair under the room journal's custody. */
export async function recoverIndependentRoomSource(
 database:string,factory:SharedIndependentRecoveryFactory,backup:SharedIndependentParticipantBackup,
 completed:boolean,guard:()=>void,signal?:AbortSignal,
):Promise<ContinuedDestinationHold>{
 const recovery=archive.recovery.call(backup);
 const cut=await makeIndependentHistoryCut(recovery.documentCheckpoint,recovery.reviewCheckpoint,recovery.identity,recovery.versions);
 const inspect=()=>inspectIndependentHistoryDestination(database,recovery.identity.native,cut,guard);
 const before=await inspect();
 if(completed&&before!=='exact')throw recoveryFailure('diverged');
 const waits=new NativeReconstructionWaits(guard,[signal]);
 let session:Session;
 try{
  const history=factory.documentHistory;
  const documentHistory=history.kind==='original'?
   {...history,restoreOriginal:waits.restore(history.restoreOriginal,history)}:
   {...history,restoreSegmented:waits.restore(history.restoreSegmented,history)};
  const options=inheritActorLeaseInput(factory,{...factory,database,documentHistory,
   create(){throw recoveryFailure('diverged');},
  });
  const selected=withIndependentBootstrapPolicy(options,waits.check,waits.signal);
  session=before==='exact'?await open.call(Session,selected):
   await restoreRecovery.call(Session,selected,recovery,'host-reacquired');
 }finally{waits.close();}
 let complete=false;
 try{
  const port=independentHistoryNative(session),stamp=port.stamp();
  const check=()=>{
   port.checkManaged();
   if(port.stamp()!==stamp)throw recoveryFailure('diverged');
  };
  const verify=async()=>{
   guard();check();
   checkRecoveredIndependentSource(session,backup,guard);
   if(await inspect()!=='exact')throw recoveryFailure('diverged');
   guard();check();
  };
  await verify();
  complete=true;
  return {check,verify,close:()=>discardAndClose.call(session)};
 }finally{if(!complete)await discardAndClose.call(session);}
}
