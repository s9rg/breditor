/** A consistent, non-consuming native read across all seven real families.
 * Read borrows are deliberately not handoff reservations: no parent namespace,
 * input, author, source or asset owner is released by preparing this read.
 * Native prefixes are not provider closure, retained-copy decisions or grants. */
import type {SharedSelectionPolicy} from '../types.js';
import type {CompleteOperationParticipant} from './cohort.js';
import type {CapturedNativeHistoryRead} from '../native_history_read/contract.js';
import {registerCapturedNativeHistory,capturedNativeHistoryRead,capturedNativeHistoryFinalCheck,releaseCapturedNativeHistory} from '../native_history_read/registry.js';
import {reserveOperationalParticipantGroup} from '../participant_operation/operation.js';
import {reserveOperationalGenerationGroup} from '../generation_operation/operation.js';
import {ownerSources,checkManagedRecoveryOwners} from '../participant_recovery/components.js';
import {generationOwnerSource} from '../generation_participant/recovery_components.js';
import {generationSource} from '../generation_source/admission.js';
import {SharedAssetReferenceCapture} from '../asset_references_capture.js';
import {SharedGenerationSourceCapture} from '../generation_source/capture.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {reserveDeliveryOperationRead} from '../delivery_operation_cohort/read.js';
import type {DeliveryOperationParticipant} from '../delivery_operation_cohort/cohort.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {holdOperationalAssets,type OperationalAssetCustody} from '../operation_cohort/assets.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {snapshotInventoryInputs} from '../room_participant_inventory/input_snapshot.js';
import {archiveFields} from '../archive_integrity/policy.js';
import {physicalCatalogName} from '../physical_room_catalog/policy.js';
import {SharedEditorError} from '../core.js';
const freeze=Object.freeze,fail=()=>new SharedEditorError('complete_native_read_policy','Borrow genuine distinct operational parents for a held native-only read');
const disposeOriginal=SharedAssetReferenceCapture.prototype.dispose,disposeGeneration=SharedGenerationSourceCapture.prototype.dispose,closeCancellation=OperationalReadCancellation.prototype.close;
export interface CompleteNativeReadMember {
 readonly id:string;
 readonly family:CompleteOperationParticipant['family'];
 readonly native:CapturedNativeHistoryRead;
}
export interface CompleteNativeRead {
 readonly participants:readonly CompleteNativeReadMember[];
 prepare():Promise<void>;
 verify():Promise<void>;
 /** Callback-free final native, lease, binding and cancellation comparison. */
 checkCurrent():void;
 /** Release temporary readers and await actual whole-upload lock cleanup. */
 close():Promise<void>;
}

/** Reserve every concrete owner synchronously before the first authority hook.
 * No caller DTO or saved phase manufactures a native read capability. Original
 * and generation reservations' verify() methods are pure; their transfer-only
 * methods are never called. The five newer families use separate read scopes. */
export function borrowCompleteNativeRead<P extends SharedSelectionPolicy>(provided:readonly CompleteOperationParticipant<P>[]):CompleteNativeRead {
 const rows=snapshotInventoryInputs(provided,fail,value=>{const row=archiveFields(value,'id,family,operation'),id=physicalCatalogName(row['id']);if(!['original','generation','independent-local','independent-delivery','restored-graph','local-operation-snapshot','local-operation-flat'].includes(row['family'] as string))throw fail();return{id,family:row['family'],operation:row['operation']} as CompleteOperationParticipant<P>;});
 if(!rows.length||new Set(rows.map(row=>row.id)).size!==rows.length)throw fail();
 const originals=rows.filter((row):row is Extract<CompleteOperationParticipant<P>,{family:'original'}>=>row.family==='original');
 const generations=rows.filter((row):row is Extract<CompleteOperationParticipant<P>,{family:'generation'}>=>row.family==='generation');
 const remaining=rows.filter((row):row is DeliveryOperationParticipant<P>=>row.family!=='original'&&row.family!=='generation');
 // The old private group interface erases invariant P. It invokes only each
 // owner's stored policy, never substitutes a factory or passes a different P.
 let original:ReturnType<typeof reserveOperationalParticipantGroup>|undefined;
 let generation:ReturnType<typeof reserveOperationalGenerationGroup>|undefined;
 let delivery:ReturnType<typeof reserveDeliveryOperationRead<P>>|undefined;
 let assets:OperationalAssetCustody|undefined;
 const checks:(()=>void)[]=[],cleanups:(()=>void)[]=[],cancellations:OperationalReadCancellation[]=[];
 let prepared=false,working=false,closing=false,closed=false,values:readonly CompleteNativeReadMember[]=[],cleanup:Promise<void>|undefined;
 const current=()=>{
  if(!prepared||closing||closed)throw fail();
  assets?.check();
  original?.checkBindings();
  for(const s of original?.states??[]){if(s.life.changed)throw fail();checkRecoveryLeasesHeld(s.leases);checkManagedRecoveryOwners(s.owners);}
  for(const s of generation?.states??[]){if(s.life.changed)throw fail();checkRecoveryLeasesHeld(s.leases);generationSource(generationOwnerSource(s.p,s.owners).session).checkManaged();}
  for(const observation of cancellations)observation.check(fail);
  delivery?.checkCurrent();
  for(const check of checks)check();
 };
 const releaseReaders=()=>{
  if(working)throw fail();closing=true;let error:unknown;
  for(const cleanup of [...cleanups].reverse())try{cleanup();}catch(cause){error??=cause;}
  try{delivery?.close();}catch(cause){error??=cause;}
  if(error)throw error;
 };
 const finishClose=()=>{
  for(const observation of cancellations)closeCancellation.call(observation);
  generation?.abandon();original?.abandon();closed=true;
 };
 const close=():Promise<void>=>{
  if(closed)return Promise.resolve();if(cleanup)return cleanup;
  try{releaseReaders();if(!assets){finishClose();return Promise.resolve();}
   cleanup=assets.close().then(finishClose).finally(()=>{cleanup=undefined;});return cleanup;
  }catch(error){return Promise.reject(error);}
 };
 const work=async(run:()=>Promise<void>)=>{if(working||closing||closed)throw fail();working=true;try{await run();}finally{working=false;}};
 try{
  original=reserveOperationalParticipantGroup(originals.map(row=>row.operation) as unknown as Parameters<typeof reserveOperationalParticipantGroup>[0]);
  generation=reserveOperationalGenerationGroup(generations.map(row=>row.operation) as unknown as Parameters<typeof reserveOperationalGenerationGroup>[0]);
  if(remaining.length)delivery=reserveDeliveryOperationRead(remaining);
  for(const s of original.states)cancellations.push(new OperationalReadCancellation(s.p.signal));
  for(const s of generation.states)cancellations.push(new OperationalReadCancellation(s.p.options.signal));
  return freeze({get participants(){current();return values;},
   prepare:()=>work(async()=>{
    if(prepared||cleanups.length||assets)throw fail();
    // These two legacy parents reserve native owners, but unlike the five
    // newer families they do not keep permanent whole-upload custody. Acquire
    // their actual stores before verification can invoke application hooks.
    // Reacquiring the five families' already held stores would be incorrect.
    assets=await holdOperationalAssets([...original!.assetStores,...generation!.assetStores]);
    await original!.verify();await generation!.verify();await delivery?.prepare();
    const byId=new Map<string,CompleteNativeReadMember>();
    for(const[index,s]of original!.states.entries()){
     const capture=SharedAssetReferenceCapture.capture(ownerSources(s.p,s.owners));
     cleanups.push(()=>disposeOriginal.call(capture));
     const native=capturedNativeHistoryRead(capture);checks.push(capturedNativeHistoryFinalCheck(native));
     byId.set(originals[index]!.id,freeze({id:originals[index]!.id,family:'original',native}));
    }
    for(const[index,s]of generation!.states.entries()){
     const capture=SharedGenerationSourceCapture.capture(generationOwnerSource(s.p,s.owners));
     cleanups.push(()=>disposeGeneration.call(capture));
     const native=capturedNativeHistoryRead(capture);checks.push(capturedNativeHistoryFinalCheck(native));
     byId.set(generations[index]!.id,freeze({id:generations[index]!.id,family:'generation',native}));
    }
    for(const row of delivery?.states??[]){
     const token=freeze({}),session=row.parts.source.session;
     if(row.family==='independent-delivery'||row.family==='restored-graph'){
      const port=independentDeliverySource(session),live=port.read(),identity=live.source.identity;
      registerCapturedNativeHistory(token,port.core,{document:{kind:identity.documentHistory,checkpoint:live.source.documentCheckpoint},review:{kind:identity.reviewHistory,checkpoint:live.source.reviewCheckpoint}},()=>delivery!.checkCurrent());
     }else{
      const port=independentHistoryNative(session),live=port.read(),identity=live.identity;
      registerCapturedNativeHistory(token,port.core,{document:{kind:identity.documentHistory,checkpoint:live.documentCheckpoint},review:{kind:identity.reviewHistory,checkpoint:live.reviewCheckpoint}},()=>delivery!.checkCurrent());
     }
     cleanups.push(()=>releaseCapturedNativeHistory(token));
     const native=capturedNativeHistoryRead(token);checks.push(capturedNativeHistoryFinalCheck(native));
     byId.set(row.id,freeze({id:row.id,family:row.family,native}));
    }
    values=freeze(rows.map(row=>{const value=byId.get(row.id);if(!value||value.family!==row.family)throw fail();return value;}));prepared=true;current();
   }),
   verify:()=>work(async()=>{current();await original!.verify();await generation!.verify();await delivery?.verify();current();}),
   checkCurrent:current,close,
  });
 }catch(error){
  // Construction has not acquired uploads or opened any reader. Restore the
  // synchronous parent reservations before returning this admission refusal.
  releaseReaders();finishClose();throw error;
 }
}
