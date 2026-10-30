/** Closed dependency DATA composition. Native admission belongs to the actual
 * work owner. A generated or parsed digest never supplies writer/provider rights. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {LocalMetadataDeliverySnapshot,LocalMetadataDeliveryState,LocalMetadataRoomBundle} from '../selected_local_metadata_delivery/contract.js';
import type {PhysicalOperationV3HistoryRead} from '../physical_room_operation_v3/history_read_contract.js';
import type {LocalMetadataReferenceCut,LocalMetadataReferencePoint,LocalMetadataReferencePending,LocalMetadataReferenceSlot} from './room_contract.js';
import type {LocalMetadataRecordAssetReferences} from './contract.js';
import {metadataSnapshot,metadataJson,equal} from '../selected_local_metadata_delivery/policy.js';
import {requireMetadataSnapshotForward} from '../selected_local_metadata_delivery/native_continuation.js';
import {metadataBundleSelection} from '../selected_local_metadata_delivery/resume_policy.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {compareAssetReference} from '../generation_recovery_control/asset_requirements.js';
import {fail} from './error.js';
export async function localMetadataReferencePoint(slot:LocalMetadataReferenceSlot,state:LocalMetadataDeliveryState,lanes:readonly LocalMetadataRecordAssetReferences[]):Promise<LocalMetadataReferencePoint>{
 const text=metadataJson(state),selected={revision:state.revision,bytes:new TextEncoder().encode(text).length,sha256:await segmentedDigest(text)};
 if(lanes.length!==state.lanes.length||lanes.some((row,i)=>row.lane!==state.lanes[i]!.id||!equal(row.state,selected)||row.document!==state.lanes[i]!.source.identity.native.room))throw fail('local_metadata_assets_state');
 return frozen({slot,state:selected,lanes:[...lanes]});
}
export async function composeLocalMetadataReferenceCut(bundle:LocalMetadataRoomBundle,snapshot:LocalMetadataDeliverySnapshot,providedStored:LocalMetadataDeliveryState,base:PhysicalOperationV3HistoryRead,providedPoints:readonly LocalMetadataReferencePoint[]):Promise<LocalMetadataReferenceCut>{
 const prior=await metadataSnapshot({before:snapshot.before,current:providedStored},snapshot.current.choice),stored=prior.current;requireMetadataSnapshotForward(prior,snapshot);
 const states=[snapshot.before,stored,snapshot.current],slots=['before','stored','current'] as const;
 if(providedPoints.length!==slots.length)throw fail('local_metadata_assets_state');
 const points=[];for(const [i,slot]of slots.entries()){const point=providedPoints[i]!;if(point.slot!==slot)throw fail('local_metadata_assets_state');const checked=await localMetadataReferencePoint(slot,states[i]!,point.lanes);if(!equal(checked,point))throw fail('local_metadata_assets_state');points.push(checked);}
 const text=metadataJson(snapshot);if(bundle.metadata.bytes!==new TextEncoder().encode(text).length||bundle.metadata.sha256!==await segmentedDigest(text))throw fail('local_metadata_assets_state');
 const references=new Map<string,RichRetainedAssetReference>(),pending:LocalMetadataReferencePending[]=[];
 const add=(rows:readonly RichRetainedAssetReference[])=>{for(const row of rows){references.set(JSON.stringify([row.asset,row.generation]),{asset:row.asset,generation:row.generation});if(references.size>100000)throw fail('local_metadata_assets_reference_budget');}};
 add(base.history.references);if(base.history.kind==='pending'||base.unreconciledParticipants.length)pending.push({kind:'base-room'});
 for(const point of points)for(const row of point.lanes){if(row.outcome.kind==='ready')add(row.outcome.references);else pending.push({kind:'metadata',slot:point.slot,lane:row.lane,pending:row.outcome.pending});}
 const parent=metadataBundleSelection({prepared:bundle.parent.prepared.choice,current:bundle.parent.current.selection,review:{bytes:bundle.parent.delivery.bytes,sha256:bundle.parent.delivery.sha256},metadata:{bytes:bundle.metadata.bytes,sha256:bundle.metadata.sha256}},snapshot.current.choice);
 return frozen({format:'breditor/selected-local-metadata-reference-cut',formatVersion:1,scope:'complete-base-history-and-before-stored-current-local-metadata',parent,stored,base,points,outcome:pending.length?{kind:'pending',pending}:{kind:'ready',references:[...references.values()].sort(compareAssetReference)}});
}
