import {SharedRichEditor} from '../core.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
/** Full original envelopes, all seven live sources and pairwise local history
 * order. Matching text/counters or caller-supplied execution DATA are insufficient. */
import {roomMetadataTargetIdentity,roomMetadataTargetApprovedCut,type RoomMetadataTargetWitness} from '../native_room_execution_run/attempt.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {selectedNativeDeliverySources} from '../relay/native_delivery.js';
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import {recordLiveBasis} from '../complete_operation_cohort/record_live_basis.js';
import {detachLocalMetadataBundle} from '../selected_local_metadata_delivery/bundle.js';
import {metadataChoice,metadataSnapshot,metadataJson,equal} from '../selected_local_metadata_delivery/policy.js';
import {localSnapshot,localJson} from '../selected_local_review_delivery/policy.js';
import {localReviewReadFactories} from '../selected_local_review_delivery/read_factories.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation} from '../independent_local_operation/portable_replay.js';
import {verifyLocalReviewProgress} from '../selected_local_review_delivery/native_review.js';
import {admitDeliveryRetainedRecords} from '../delivery_state/retained.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {LocalMetadataRoomBundle} from '../selected_local_metadata_delivery/contract.js';
import {fail} from './policy.js';
const verifyOriginalNative=SharedRichEditor.prototype.verifyRecoveryOrigin,verifySegmentedNative=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
export async function inspectOriginalMetadata(scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness,input:LocalMetadataRoomBundle,check:()=>void){
 const execution=roomMetadataTargetIdentity(witness,scope),bundle=detachLocalMetadataBundle(input),actual=await scope.retainCurrent(),options={wasm:actual.integrity.wasm,checkAuthority:check,signal:scope.signal},integrity=prepareArchiveIntegrity(options),factories=localReviewReadFactories(scope),sources=selectedNativeDeliverySources(scope);
 const rooms:SelectedRoomCurrentArchive[]=[],cuts:PhysicalRoomRecordCutArchive[]=[];
 const open=async(file:Blob,selection:typeof actual.current.selection)=>{const room=await SelectedRoomCurrentArchive.read(file,selection,options);rooms.push(room);const current=room.current(),cut=await PhysicalRoomRecordCutArchive.read(current.file,current.selection,options);cuts.push(cut);return cut;};
 try{
  if(bundle.metadata.file.size!==bundle.metadata.bytes||await integrity.digest(bundle.metadata.file)!==bundle.metadata.sha256)throw fail();const text=await bundle.metadata.file.text(),raw=JSON.parse(text),choice=metadataChoice(raw?.current?.choice),snapshot=await metadataSnapshot(raw,choice);if(metadataJson(snapshot)!==text)throw fail();
  const reviewFile=bundle.parent.delivery;if(reviewFile.file.size!==reviewFile.bytes||await integrity.digest(reviewFile.file)!==reviewFile.sha256)throw fail();const rtext=await reviewFile.file.text(),review=await localSnapshot(JSON.parse(rtext),choice.parent);if(localJson(review)!==rtext||!equal(review.current.lanes,snapshot.current.lanes.map(({records,...row})=>row))||!equal(bundle.parent.prepared.choice.before,choice.parent.before)||!equal(execution.execution.plan.preparation.plan.before,bundle.parent.current.selection))throw fail();
  const initial=await open(bundle.parent.prepared.file,choice.parent.before),old=await open(bundle.parent.current.file,bundle.parent.current.selection),target=await open(actual.current.file,actual.current.selection),oldCatalog=parsePhysicalCatalogV3Manifest(old.root().source.manifest),initialCatalog=parsePhysicalCatalogV3Manifest(initial.root().source.manifest),plan=execution.execution.plan.preparation.plan;
  if(old.root().participants.length!==sources.length||target.root().participants.length!==sources.length||plan.participants.length!==sources.length)throw fail();
  if(!equal(target.selection(),roomMetadataTargetApprovedCut(witness,scope)))throw fail('metadata_continuation_target_changed');
  for(const row of sources){const prior=old.root().participants.find(p=>p.id===row.id),next=target.root().participants.find(p=>p.id===row.id),prepared=plan.participants.find(p=>p.id===row.id);if(!prior||!next||!prepared||prior.family!==prepared.sourceFamily||row.family!==prepared.family||next.family!==row.family)throw fail('metadata_continuation_target_changed');check();}
  const locals=sources.filter(row=>row.source.parent.kind==='independent-local');if(locals.length!==snapshot.current.lanes.length)throw fail();
  for(const lane of snapshot.current.lanes){const source=sources.find(r=>r.id===lane.id),entry=oldCatalog.participants.find(r=>r.id===lane.id),first=initialCatalog.participants.find(r=>r.id===lane.id),read=factories.reads.find(r=>r.id===lane.id)?.read as {session:SharedIndependentRecoveryFactory<SharedSelectionPolicy>},before=snapshot.before.lanes.find(r=>r.id===lane.id)!,reviewBefore=review.before.lanes.find(r=>r.id===lane.id)!,binding=choice.lanes.find(r=>r.id===lane.id)!.binding;
   if(!source||source.source.parent.kind!=='independent-local'||!entry||!first||choice.parent.lanes.find(row=>row.id===lane.id)?.family!==entry.family||first.family!==entry.family||!read||!equal(recordLiveBasis(entry.family,await old.records(lane.id)),lane.source)||!equal(recordLiveBasis(first.family,await initial.records(lane.id)),reviewBefore.source))throw fail();
   const selected=(entry.family==='independent-local'?entry.selection:(entry.selection as {original:SharedIndependentParticipantSelection}).original) as SharedIndependentParticipantSelection,restored=[];
   try{for(const row of[reviewBefore,before,lane])restored.push(await replayLocalOperationRecovery(selected,read.session,row.source,check));const[a,b,c]=restored;verifyLocalOperationContinuation(b!,a!);verifyLocalOperationContinuation(c!,b!);for(const[row,replay]of[[reviewBefore,a!],[before,b!],[lane,c!]] as const)verifyLocalReviewProgress(replay.core,row.relay);admitDeliveryRetainedRecords(b!.core,binding,before.records);admitDeliveryRetainedRecords(c!.core,binding,lane.records);const live=independentHistoryNative(source.source.parent.session).persisted();(live.identity.documentHistory==='original'?verifyOriginalNative:verifySegmentedNative).call(source.source.core,c!.core);if(live.versions.length<lane.source.versions.length||lane.source.versions.some((packet,index)=>live.versions[index]!==packet))throw fail();admitDeliveryRetainedRecords(source.source.core,binding,lane.records);check();}finally{for(const replay of restored.reverse())replay.dispose();}
  }
  const occupied=Object.freeze([...new Set(cuts.flatMap(cut=>{const root=cut.root();return[root.database,root.source.catalogDatabase,...root.participants.flatMap(row=>row.namespaces.map(namespace=>namespace.database))];}))]);
  if(!equal((await scope.retainCurrent()).current.selection,actual.current.selection))throw fail('metadata_continuation_target_changed');check();const result=Object.freeze({execution,bundle,choice,snapshot,review,target:actual.current.selection,occupied});verifiedInspections.set(result,{scope,witness,check});return result;
 }finally{factories.close();for(const cut of cuts.reverse())cut.dispose();for(const room of rooms.reverse())room.dispose();}
}

/** Proof tokens are actual same-visit resources. The issuing function performs
 * full replay; matching caller DATA cannot mint one or move it to another owner. */
import type {LocalReviewDeliveryChoice} from '../selected_local_review_delivery/contract.js';
import type {LocalMetadataDeliveryChoice} from '../selected_local_metadata_delivery/contract.js';
import {localChoice} from '../selected_local_review_delivery/policy.js';
import {metadataChoice as canonicalMetadataChoice} from '../selected_local_metadata_delivery/policy.js';
declare const factsBrand:unique symbol;
export interface VerifiedMetadataContinuationFacts{readonly [factsBrand]:true}
type Inspection=Awaited<ReturnType<typeof inspectOriginalMetadata>>;
const verifiedInspections=new WeakMap<object,{scope:SelectedNativeRecoveryScope;witness:RoomMetadataTargetWitness;check():void}>();
const facts=new WeakMap<VerifiedMetadataContinuationFacts,{origin:Inspection;scope:SelectedNativeRecoveryScope;review:LocalReviewDeliveryChoice;metadata:LocalMetadataDeliveryChoice;check():void;reviewUsed:boolean;metadataUsed:boolean}>();
export function issueVerifiedMetadataContinuationFacts(origin:Inspection,reviewInput:LocalReviewDeliveryChoice,metadataInput:LocalMetadataDeliveryChoice):VerifiedMetadataContinuationFacts{
 const held=verifiedInspections.get(origin);if(!held)throw fail();held.check();roomMetadataTargetIdentity(held.witness,held.scope);const review=localChoice(reviewInput),metadata=canonicalMetadataChoice(metadataInput);
 if(!equal(review.before,origin.target)||!equal(metadata.parent,review)||review.lanes.length!==origin.choice.parent.lanes.length||metadata.lanes.length!==origin.choice.lanes.length)throw fail();
 for(const row of review.lanes){const old=origin.choice.parent.lanes.find(p=>p.id===row.id);if(!old||!equal(row.source,old.source)||!equal(row.binding,old.binding))throw fail();}
 for(const row of metadata.lanes){const old=origin.choice.lanes.find(p=>p.id===row.id);if(!old||!equal(row.binding,old.binding)||!equal(row.initial,old.initial))throw fail();}
 const token=Object.freeze({}) as VerifiedMetadataContinuationFacts;facts.set(token,{origin,scope:held.scope,review,metadata,check:()=>{held.check();roomMetadataTargetIdentity(held.witness,held.scope);},reviewUsed:false,metadataUsed:false});return token;
}
export function consumeVerifiedReviewFacts(token:VerifiedMetadataContinuationFacts,scope:SelectedNativeRecoveryScope,choice:LocalReviewDeliveryChoice){const held=facts.get(token);if(!held||held.scope!==scope||held.reviewUsed||!equal(choice,held.review))throw fail();held.reviewUsed=true;held.check();return held.origin.snapshot.current.lanes.map(row=>({id:row.id,relay:row.relay}));}
export function consumeVerifiedMetadataFacts(token:VerifiedMetadataContinuationFacts,scope:SelectedNativeRecoveryScope,choice:LocalMetadataDeliveryChoice){const held=facts.get(token);if(!held||held.scope!==scope||!held.reviewUsed||held.metadataUsed||!equal(choice,held.metadata))throw fail();held.metadataUsed=true;held.check();return held.origin.snapshot.current.lanes.map(row=>({id:row.id,records:row.records,relay:row.relay}));}


/** Same-visit original/target family facts from the full Native inspection.
 * A descriptor copy cannot authorize a reader to reinterpret an older family.
 * The original journal guard and actual target witness stay live together. */
export function verifiedMetadataTargetFamilies(origin:Inspection,scope:SelectedNativeRecoveryScope){
 const held=verifiedInspections.get(origin);if(!held||held.scope!==scope)throw fail();
 const check=()=>{held.check();roomMetadataTargetIdentity(held.witness,scope);};check();
 const participants=Object.freeze(origin.execution.execution.plan.preparation.plan.participants.map(({id,sourceFamily,family})=>Object.freeze({id,sourceFamily,family})));check();
 return Object.freeze({participants,check});
}
