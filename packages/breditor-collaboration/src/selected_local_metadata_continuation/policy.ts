import {deliveryControlSelection} from '../generation_delivery_control/identity.js';
import {metadataChoice,metadataJson,equal} from '../selected_local_metadata_delivery/policy.js';
import {localChoice} from '../selected_local_review_delivery/policy.js';
import {roomRunIdentity} from '../native_room_execution_run/identity.js';
import {preparationChoice} from '../selected_delivery_preparation/identity.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {fields,integer,hash} from '../physical_room_record_cut/policy.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {MetadataContinuationChoice} from './contract.js';
export {equal,metadataJson};
export const fail=(code='metadata_continuation_policy')=>Object.assign(new Error('Continue complete original metadata through an actual privately owned replacement and fresh approval'),{code});
export function continuationChoice(input:unknown):MetadataContinuationChoice{
 const r=fields(input,['format','formatVersion','database','execution','delivery','origin','prepared','target','review','metadata']);if(r['format']!=='breditor/selected-local-metadata-continuation'||r['formatVersion']!==1)throw fail();
 const o=fields(r['origin'],['choice','prepared','current','review','metadata']),pin=(value:unknown)=>{const p=fields(value,['bytes','sha256']);return{bytes:integer(p['bytes'],1024*1024*1024,1),sha256:hash(p['sha256'])};};
 const execution=roomRunIdentity(r['execution']),delivery=deliveryControlSelection(r['delivery']),origin={choice:metadataChoice(o['choice']),prepared:preparationChoice(o['prepared']),current:selectedRoomCurrentSelection(o['current']),review:pin(o['review']),metadata:pin(o['metadata'])},prepared=preparationChoice(r['prepared']),target=selectedRoomCurrentSelection(r['target']),review=localChoice(r['review']),metadata=metadataChoice(r['metadata']),name=database(r['database']);
 if(!equal(delivery.current,prepared.server)||!equal(origin.current,execution.execution.plan.preparation.plan.before)||!equal(prepared.before,target)||!equal(review.before,target)||!equal(metadata.parent,review))throw fail();
 const names=[name,prepared.database,review.database,metadata.database];if(new Set(names).size!==4||names.some(n=>[origin.choice.database,origin.choice.parent.database,origin.prepared.database].includes(n)))throw fail();
 return frozen({format:'breditor/selected-local-metadata-continuation',formatVersion:1,database:name,execution,delivery,origin,prepared,target,review,metadata});
}
