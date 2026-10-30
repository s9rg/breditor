import {admitDeliveryRetainedRecords} from '../delivery_state/retained.js';
import type {SharedSegmentedRetainedBinding,SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
/** Re-admit every new paired record against a COMPLETE room file and genuine
 * current sources. Both native lanes and immutable versions must continue. */
import {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import {selectedNativeDeliverySources} from '../relay/native_delivery.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import {recordLiveBasis} from '../complete_operation_cohort/record_live_basis.js';
import {replayLocalOperationRecovery} from '../independent_local_operation/portable_replay.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {LocalReviewDeliveryChoice,LocalReviewDeliveryState} from './contract.js';
import {verifyLocalReviewProgress} from './native_review.js';
import {equal,fail} from './policy.js';
import {localReviewReadFactories} from './read_factories.js';
const verifyOriginal=SharedRichEditor.prototype.verifyRecoveryOrigin,verifySegmented=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
const room={read:SelectedRoomCurrentArchive.read,current:SelectedRoomCurrentArchive.prototype.current,dispose:SelectedRoomCurrentArchive.prototype.dispose},cut={read:PhysicalRoomRecordCutArchive.read,root:PhysicalRoomRecordCutArchive.prototype.root,records:PhysicalRoomRecordCutArchive.prototype.records,dispose:PhysicalRoomRecordCutArchive.prototype.dispose};
export async function admitLocalReviewRoomSource(scope:SelectedNativeRecoveryScope,file:Blob,selection:LocalReviewDeliveryChoice['before'],state:LocalReviewDeliveryState,guard:()=>void,exact=true,metadata?:ReadonlyMap<string,Readonly<{binding:SharedSegmentedRetainedBinding;records:SegmentedRetainedRecords}>>){
 guard();if(metadata&&metadata.size!==state.lanes.length)throw fail();const actual=await scope.retainCurrent(),options={wasm:actual.integrity.wasm,checkAuthority:guard,signal:scope.signal},sources=selectedNativeDeliverySources(scope).filter(row=>row.source.parent.kind==='independent-local');const factories=localReviewReadFactories(scope);let archive:SelectedRoomCurrentArchive|undefined,records:PhysicalRoomRecordCutArchive|undefined;
 try{archive=await room.read.call(SelectedRoomCurrentArchive,file,selection,options);const source=room.current.call(archive);records=await cut.read.call(PhysicalRoomRecordCutArchive,source.file,source.selection,options);const catalog=parsePhysicalCatalogV3Manifest(cut.root.call(records).source.manifest);if(sources.length!==state.lanes.length)throw fail();
  for(const lane of state.lanes){guard();const row=sources.find(value=>value.id===lane.id),entry=catalog.participants.find(value=>value.id===lane.id),factory=factories.reads.find(value=>value.id===lane.id)?.read as {session:SharedIndependentRecoveryFactory<SharedSelectionPolicy>};if(!row||row.source.parent.kind!=='independent-local'||!entry||entry.family!==row.family||!factory||!['independent-local','local-operation-snapshot','local-operation-flat'].includes(entry.family))throw fail();
   const retained=recordLiveBasis(row.family,await cut.records.call(records,lane.id));if(exact&&!equal(retained,lane.source))throw fail();const chosen=(entry.family==='independent-local'?entry.selection:(entry as {selection:{original:SharedIndependentParticipantSelection}}).selection.original) as SharedIndependentParticipantSelection;
   const replay=await replayLocalOperationRecovery(chosen,factory.session,lane.source,guard);try{verifyLocalReviewProgress(replay.core,lane.relay);if(metadata){const retained=metadata.get(lane.id);if(!retained)throw fail();admitDeliveryRetainedRecords(replay.core,retained.binding,retained.records);}row.source.save();await row.source.flush();guard();const port=independentHistoryNative(row.source.parent.session),live=port.persisted();if(port.companion||port.core!==row.source.core)throw fail();(live.identity.documentHistory==='original'?verifyOriginal:verifySegmented).call(row.source.core,replay.core);if(live.versions.length<lane.source.versions.length||lane.source.versions.some((packet,i)=>live.versions[i]!==packet))throw fail();guard();}finally{replay.dispose();}
  }
 }finally{if(records)cut.dispose.call(records);if(archive)room.dispose.call(archive);factories.close();}
}
