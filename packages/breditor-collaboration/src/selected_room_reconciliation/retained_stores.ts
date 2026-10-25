/** Match immutable LIVE store declarations to the selected native room. The
 * enclosing COMPLETE source readers already replay/admit every original,
 * committed, attempted and pending state against those immutable identities.
 * Local version packets remain local; they are never relabeled server catalogs. */
import type {PhysicalRoomRecordCutParticipant} from '../physical_room_record_cut/contract.js';
import {recordLiveBasis} from '../complete_operation_cohort/record_live_basis.js';
import {independentDeliveryRecords} from '../independent_delivery_source/records.js';
import type {SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import type {SharedAssetCaptureRecord} from '../asset_references_capture.js';
import type {SharedRoomParticipantInventoryMetadata} from '../room_participant_inventory/types.js';
import {checkInventoryStores} from '../room_participant_inventory/stores.js';
import {SharedRoomParticipantInventoryError} from '../room_participant_inventory/policy.js';
const fail=()=>new SharedRoomParticipantInventoryError('inventory_source','The complete selected record cut has an invalid retained-store declaration');
export function checkSelectedRetainedStores(row:PhysicalRoomRecordCutParticipant,metadata:SharedRoomParticipantInventoryMetadata,principal:string,writer:string){
 const live=recordLiveBasis(row.family,row.payload.state);
 const records:readonly {kind:string;json:string}[]=row.family==='original'||row.family==='generation'?live as readonly {kind:string;json:string}[]:row.family==='independent-delivery'||row.family==='restored-graph'?independentDeliveryRecords(live as SharedIndependentDeliveryRecovery):[];
 const selected:SharedAssetCaptureRecord[]=[],kinds:('suggestions'|'suggestion-revisions'|'version-catalog')[]=[];
 for(const record of records){const kind=record.kind==='suggestions'?'suggestions':record.kind==='suggestion-revisions'||record.kind==='revisions'?'suggestion-revisions':record.kind==='version-catalog'||record.kind==='versions'?'version-catalog':null;if(!kind)continue;if(kinds.includes(kind)||typeof record.json!=='string')throw fail();selected.push({kind,json:record.json});kinds.push(kind);}
 checkInventoryStores(metadata,selected,principal,writer);return Object.freeze(kinds);
}
