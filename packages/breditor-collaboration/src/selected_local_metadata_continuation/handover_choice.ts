import {handoverDeliveryPathSelection} from '../generation_delivery_path_control/handover.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {continuationChoice,equal,fail} from './policy.js';
import type {HandoverMetadataContinuationChoice} from './handover_contract.js';

export function handoverMetadataContinuationChoice(input:unknown):HandoverMetadataContinuationChoice {
 const row=fields(input,['format','formatVersion','continuation','handover']);
 if(row['format']!=='breditor/selected-local-metadata-continuation-across-handover'||row['formatVersion']!==1)throw fail();
 const continuation=continuationChoice(row['continuation']);
 const handover=handoverDeliveryPathSelection(row['handover']);
 if(!equal(continuation.delivery,handover.current.current))throw fail('metadata_continuation_stale');
 return Object.freeze({format:'breditor/selected-local-metadata-continuation-across-handover',formatVersion:1,continuation,handover});
}
