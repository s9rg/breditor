/** Closed decision DATA and exact stored head pinning. Neither creates IO,
 * infers credentials nor supplies a storage compare-and-swap witness. */
import {fields,hash,integer} from '../physical_room_record_cut/policy.js';
import {preparationChoice} from '../selected_delivery_preparation/identity.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {metadataChoice,metadataJson,equal} from './policy.js';
import {metadataData,MAX_LOCAL_METADATA_BYTES} from './data.js';
import {fail} from './error.js';
import type {LocalMetadataDeliveryChoice,LocalMetadataDeliverySnapshot} from './contract.js';
import type {LocalMetadataStoredSelection,LocalMetadataResumeChoice} from './resume_contract.js';
function bytesHash(input:unknown){const r=fields(input,['bytes','sha256']);return{bytes:integer(r['bytes'],MAX_LOCAL_METADATA_BYTES,1),sha256:hash(r['sha256'])};}
export function metadataStoredSelection(input:unknown):LocalMetadataStoredSelection{const r=fields(input,['revision','bytes','sha256']);return frozen({revision:integer(r['revision'],Number.MAX_SAFE_INTEGER),bytes:integer(r['bytes'],MAX_LOCAL_METADATA_BYTES,1),sha256:hash(r['sha256'])});}
/** Shared closed multipart identity; validation creates no stored head or IO. */
export function metadataBundleSelection(input:unknown,delivery:LocalMetadataDeliveryChoice):LocalMetadataResumeChoice['bundle']{
 const b=fields(input,['prepared','current','review','metadata']),prepared=preparationChoice(metadataData(b['prepared']));if(!equal(prepared.before,delivery.parent.before))throw fail();
 return frozen({prepared,current:selectedRoomCurrentSelection(metadataData(b['current'])),review:bytesHash(b['review']),metadata:bytesHash(b['metadata'])});
}
export function metadataResumeChoice(input:unknown):LocalMetadataResumeChoice{
 const r=fields(input,['format','formatVersion','delivery','bundle','stored']);if(r['format']!=='breditor/selected-local-metadata-resume'||r['formatVersion']!==1)throw fail();const delivery=metadataChoice(metadataData(r['delivery']));
 return frozen({format:'breditor/selected-local-metadata-resume',formatVersion:1,delivery,bundle:metadataBundleSelection(r['bundle'],delivery),stored:metadataStoredSelection(r['stored'])});
}
export async function selectMetadataStored(snapshot:LocalMetadataDeliverySnapshot):Promise<LocalMetadataStoredSelection>{const text=metadataJson(snapshot);return metadataStoredSelection({revision:snapshot.current.revision,bytes:new TextEncoder().encode(text).length,sha256:await segmentedDigest(text)});}
