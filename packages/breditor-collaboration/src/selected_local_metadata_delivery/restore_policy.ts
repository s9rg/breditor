/** Exact restored bytes and destination presence are data, never writer rights. */
import {fields} from '../physical_room_record_cut/policy.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {metadataBundleSelection} from './resume_policy.js';
import {metadataChoice} from './policy.js';
import {metadataData} from './data.js';import {fail} from './error.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {LocalMetadataRestoreChoice,LocalMetadataRestorePresence} from './restore_contract.js';
export function metadataRestorePresence(value:unknown):LocalMetadataRestorePresence{if(value!=='absent'&&value!=='identical')throw fail('local_metadata_restore_policy');return value;}
export function metadataRestoreChoice(input:unknown):LocalMetadataRestoreChoice{
 const r=fields(input,['format','formatVersion','delivery','bundle','current','destination']);if(r['format']!=='breditor/selected-local-metadata-data-restore'||r['formatVersion']!==1)throw fail('local_metadata_restore_policy');const delivery=metadataChoice(metadataData(r['delivery']));
 const bundle=metadataBundleSelection(r['bundle'],delivery);
 return frozen({format:'breditor/selected-local-metadata-data-restore',formatVersion:1,delivery,bundle,current:selectedRoomCurrentSelection(metadataData(r['current'])),destination:metadataRestorePresence(r['destination'])});
}
