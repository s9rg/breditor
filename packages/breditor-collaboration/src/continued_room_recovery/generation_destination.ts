import {SharedGenerationParticipantBackup as Backup} from '../generation_participant/backup.js';
import {prepareGenerationRecoveryCuts} from '../generation_participant/prepare_recovery.js';
import type {SharedGenerationParticipantSelection} from '../generation_participant/contract.js';
import type {SharedGenerationRecoveryFactory,SharedGenerationRecoverySession} from '../generation_participant/recovery_contract.js';
import {generationSource} from '../generation_source/admission.js';
import {captureSharedGenerationSource,SharedGenerationSourceCapture} from '../generation_source/capture.js';
import {inspectExactHistoryRows} from '../independent_history/exact_destination.js';
import {guardContinuedRecovery,type SharedContinuedHistoryBackup} from '../persistence/continue_document_history.js';
import {withGenerationRecoveryBootstrap} from '../persistence/generation_recovery_bootstrap.js';
import {generationStoreNames} from '../persistence/segmented_database.js';
import {SharedSegmentedPersistentSession as Local,type SharedSegmentedRecovery} from '../persistence/segmented_session.js';
import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
import {SharedSegmentedRelaySession as Relay} from '../segmented_relay/session.js';
import type {SharedSegmentedRelayRecovery} from '../segmented_relay/contract.js';
import type {SharedSegmentedRetainedRecovery} from '../segmented_relay/retained_contract.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {recoveryFailure,type ContinuedDestinationHold} from './destination.js';

const {sourceRecovery,uploadBackup,verifySource}=Backup.prototype;
const {dispose:disposeCapture,check:checkCapture}=SharedGenerationSourceCapture.prototype;
const {open,restoreRecovery,openContinued,restoreContinuedRecovery}=Local;
const {open:openRelay,restoreRecovery:restoreRelay,openRetained,restoreRetainedRecovery}=Relay;
const {discardAndClose:closeLocal}=Local.prototype,{discardAndClose:closeRelay}=Relay.prototype;
export const generationRoomUploads=(backup:Backup)=>uploadBackup.call(backup);

/** Preserve the original storage family, including the separate V1 predecessor head. */
export async function recoverGenerationRoomSource(
 database:string,expected:SharedGenerationParticipantSelection,factory:SharedGenerationRecoveryFactory,backup:Backup,
 completed:boolean,guard:()=>void,signal?:AbortSignal,
):Promise<ContinuedDestinationHold>{
 const {cut,predecessor}=await prepareGenerationRecoveryCuts(expected,backup,guard);
 const {room,writer}=expected.identity.source.native,key=[room,writer] as const;
 const fail=()=>recoveryFailure('diverged');
 const rows={
  files:cut.files.map(file=>({key:[...key,file.generation],value:JSON.stringify(file)})),
  heads:[{key:[...key],value:cut.head},...(predecessor?[{key:[...key,'continued-from'],value:predecessor.head}]:[])],
  fail,
 };
 const inspect=()=>inspectExactHistoryRows(database,generationStoreNames,rows,guard);
 const before=await inspect();
 if(completed&&before!=='exact')throw fail();
 const recovery=sourceRecovery.call(backup),readExisting=before==='exact',writerRecovery='host-reacquired' as const;
 let session:SharedGenerationRecoverySession;
 if(factory.kind==='continued-local'){
  // This family's insert-only restore commits all rows in its schema upgrade.
  if(before==='empty')throw fail();
  const wrap=<T extends object>(input:T)=>guardContinuedRecovery(withGenerationRecoveryBootstrap(
   inheritActorLeaseInput(factory.options,input),{rows,check:guard,...(signal?{signal}:{})},
  ),guard);
  const options={...factory.options,database};
  session=readExisting?await openContinued.call(Local,wrap(options)):
   await restoreContinuedRecovery.call(Local,wrap({...options,writerRecovery,backup:recovery as SharedContinuedHistoryBackup}));
 }else{
  const waits=new NativeReconstructionWaits(guard,[signal]);
  try{
   const wrap=<T extends object>(input:T)=>withGenerationRecoveryBootstrap(inheritActorLeaseInput(factory.options,input),{
    rows,check:waits.check,signal:waits.signal,
   });
   const restoreSegmented=waits.restore(factory.options.restoreSegmented,factory.options);
   const initial={initialGenerations:{root:'unused',active:'unused-next'},create(){throw fail();}};
   switch(factory.kind){
    case 'local':{
     const options={...factory.options,database,restoreSegmented};
     session=readExisting?await open.call(Local,wrap({...options,...initial})):
      await restoreRecovery.call(Local,wrap({...options,writerRecovery,recovery:recovery as SharedSegmentedRecovery}));
     break;
    }
    case 'relay':{
     const options={...factory.options,database,restoreSegmented};
     session=readExisting?await openRelay.call(Relay,wrap({...options,...initial})):
      await restoreRelay.call(Relay,wrap({...options,writerRecovery,recovery:recovery as SharedSegmentedRelayRecovery}));
     break;
    }
    case 'retained':{
     const options={...factory.options,database,restoreSegmented};
     session=readExisting?await openRetained.call(Relay,wrap({...options,...initial})):
      await restoreRetainedRecovery.call(Relay,wrap({...options,writerRecovery,recovery:recovery as SharedSegmentedRetainedRecovery}));
     break;
    }
   }
  }finally{waits.close();}
 }
 const close=()=>factory.kind==='local'||factory.kind==='continued-local'?closeLocal.call(session as Local):closeRelay.call(session as Relay);
 let complete=false;
 try{
  const port=generationSource(session),stamp=port.stamp();
  const check=()=>{
   port.checkManaged();
   const current=port.stamp();
   if(current.length!==stamp.length||current.some((value,index)=>value!==stamp[index]))throw fail();
  };
  const verify=async()=>{
   guard();check();
   if(!native.view.call(port.core).readOnly)throw fail();
   const source=captureSharedGenerationSource({kind:factory.kind,session} as Parameters<typeof captureSharedGenerationSource>[0]);
   try{
    verifySource.call(backup,source);
    if(await inspect()!=='exact')throw fail();
    guard();checkCapture.call(source);check();
   }finally{disposeCapture.call(source);}
  };
  await verify();
  complete=true;
  return {check,verify,close};
 }finally{if(!complete)await close();}
}
