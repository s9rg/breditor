/** DATA continuation, not a storage/actor grant. A later committed record may
 * outlive a refused export. Native order, complete histories, immutable versions
 * and receipt progress must all continue the last complete portable snapshot. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import {selectedNativeDeliverySources} from '../relay/native_delivery.js';
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation} from '../independent_local_operation/portable_replay.js';
import {forwardProgress} from '../segmented_relay/validation.js';
import {verifyLocalReviewProgress} from './native_review.js';
import {equal,fail} from './policy.js';
import {localReviewReadFactories} from './read_factories.js';
import type {LocalReviewDeliverySnapshot} from './contract.js';
const room={read:SelectedRoomCurrentArchive.read,current:SelectedRoomCurrentArchive.prototype.current,dispose:SelectedRoomCurrentArchive.prototype.dispose},cut={read:PhysicalRoomRecordCutArchive.read,root:PhysicalRoomRecordCutArchive.prototype.root,dispose:PhysicalRoomRecordCutArchive.prototype.dispose};
/** Necessary metadata law only; it NEVER substitutes for native order below. */
export function requireLocalReviewSnapshotForward(before:LocalReviewDeliverySnapshot,after:LocalReviewDeliverySnapshot):void{
 if(!equal(before.before,after.before)||!equal(before.current.choice,after.current.choice)||after.current.revision<before.current.revision||after.current.revision===before.current.revision&&!equal(before.current,after.current)||before.current.lanes.length!==after.current.lanes.length)throw fail();
 for(let i=0;i<before.current.lanes.length;i++){const a=before.current.lanes[i]!,b=after.current.lanes[i]!;if(a.id!==b.id||!equal(a.source.identity,b.source.identity))throw fail();forwardProgress(a.relay,b.relay);}
}
export async function verifyLocalReviewSnapshotContinuation(scope:SelectedNativeRecoveryScope,file:SelectedRoomCurrentFile,before:LocalReviewDeliverySnapshot,after:LocalReviewDeliverySnapshot,guard:()=>void):Promise<void>{
 requireLocalReviewSnapshotForward(before,after);guard();const sources=selectedNativeDeliverySources(scope).filter(row=>row.source.parent.kind==='independent-local'),actual=await scope.retainCurrent(),options={wasm:actual.integrity.wasm,checkAuthority:guard,signal:scope.signal};const factories=localReviewReadFactories(scope);let archive:SelectedRoomCurrentArchive|undefined,records:PhysicalRoomRecordCutArchive|undefined;
 try{archive=await room.read.call(SelectedRoomCurrentArchive,file.file,file.selection,options);const source=room.current.call(archive);records=await cut.read.call(PhysicalRoomRecordCutArchive,source.file,source.selection,options);const catalog=parsePhysicalCatalogV3Manifest(cut.root.call(records).source.manifest);if(sources.length!==after.current.lanes.length)throw fail();
  for(let i=0;i<before.current.lanes.length;i++){guard();const a=before.current.lanes[i]!,b=after.current.lanes[i]!,row=sources.find(value=>value.id===a.id),entry=catalog.participants.find(value=>value.id===a.id),factory=factories.reads.find(value=>value.id===a.id)?.read as {session:SharedIndependentRecoveryFactory<SharedSelectionPolicy>};if(!row||!entry||entry.family!==row.family||!factory||!['independent-local','local-operation-snapshot','local-operation-flat'].includes(entry.family))throw fail();
   const selected=(entry.family==='independent-local'?entry.selection:(entry as {selection:{original:SharedIndependentParticipantSelection}}).selection.original) as SharedIndependentParticipantSelection,older=await replayLocalOperationRecovery(selected,factory.session,a.source,guard);let newer:Awaited<ReturnType<typeof replayLocalOperationRecovery>>|undefined;
   try{verifyLocalReviewProgress(older.core,a.relay);if(equal(a.source,b.source)){verifyLocalReviewProgress(older.core,b.relay);}else{newer=await replayLocalOperationRecovery(selected,factory.session,b.source,guard);verifyLocalReviewProgress(newer.core,b.relay);verifyLocalOperationContinuation(newer,older);}guard();}finally{newer?.dispose();older.dispose();}
  }
 }finally{if(records)cut.dispose.call(records);if(archive)room.dispose.call(archive);factories.close();}
 guard();
}
