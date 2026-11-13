import {fields} from '../physical_room_record_cut/policy.js';
import {activationFailure} from '../native_activation_control/policy.js';
import {fail} from '../room_native_activation_intent/policy.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import type {RecoveredContinuedRoomReconciliationOptions} from '../continued_room_reconciliation/contract.js';
import {continuedRoomActivationChoice} from './intent.js';
import {openExactContinuedRoomActivation,withContinuedRoomActivationPlan} from './prepare.js';
import type {ContinuedRoomActivationCommitOptions,ContinuedRoomActivationCommitResult} from './contract.js';

/** Commit the selected inactive Native checkpoint. Normal serving is a later step. */
export async function commitContinuedRoomActivation(
 input:RecoveredContinuedRoomReconciliationOptions,options:ContinuedRoomActivationCommitOptions,
):Promise<ContinuedRoomActivationCommitResult>{
 const r=fields(options,['expected','activation','approve']),expected=continuedRoomActivationChoice(r['expected']);
 const approve=r['approve'] as ContinuedRoomActivationCommitOptions['approve'];
 if(typeof approve!=='function')throw fail('activation_intent_policy');
 let started=false;
 try{
  return await withContinuedRoomActivationPlan(input,expected.database,r['activation'] as ContinuedRoomActivationCommitOptions['activation'],async work=>{
   await openExactContinuedRoomActivation(work.store,work.encoding,expected);
   const {coverage,provider,uploads}=work.reconciliation;
   // The live plan already holds and verifies every whole upload store. A
   // local-only upload may stay queued. Every referenced image needs provider bytes.
   const localUploads=new Set(uploads.flatMap(row=>row.entries.map(entry=>entry.asset)));
   if(!coverage.registeredStreamsCovered||coverage.missing.length||!provider||
      provider.missing.some(row=>row.kind!=='uploadBytes'||!localUploads.has(row.contentAsset)))throw fail('activation_intent_incomplete');
   const lifetime=new NativeReconstructionWaits(()=>{work.check();work.store.check();},[work.signal,work.store.revoked]);
   try{
    if(await lifetime.call(()=>approve(work.plan))!==true)throw fail('activation_intent_policy');
    await work.verifyExact();
    lifetime.check();
    await work.store.markRequestStarted(lifetime);
    started=true;
    lifetime.check();
    const receipt=await work.port.commit(lifetime.check,lifetime.signal);
    await work.store.markReceiptObserved(receipt,lifetime);
    lifetime.check();
    return Object.freeze({choice:expected,receipt});
   }finally{lifetime.close();}
  });
 }catch(error){
  if(started)throw activationFailure('activation_outcome_unknown',error);
  throw error;
 }
}
