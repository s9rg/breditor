/** Closed literal selectors. Metadata consistency does not verify native ancestry. */
import {preparationChoice} from '../selected_delivery_preparation/identity.js';
import {generationControlSelection} from '../generation_recovery_control/identity.js';
import {deliveryControlSelection} from '../generation_delivery_control/identity.js';
import {handoverDeliveryPathSelection} from '../generation_delivery_path_control/handover.js';
import {serverGenerationRoomIdentity} from '../server_generation_archive/identity.js';
import {serverGenerationParticipantIdentity} from '../server_generation_inventory/identity.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fields,integer,hash,fail,MAX_DELIVERY_JOURNAL_BYTES,MAX_DELIVERY_JOURNAL_EVENTS} from './policy.js';
import type {DeliveryJournalIdentity,DeliveryJournalControl,DeliveryJournalEvent} from './contract.js';
export function journalIdentity(value:unknown):DeliveryJournalIdentity{const r=fields(value,['format','formatVersion','database','prepared']);if(r['format']!=='breditor/selected-native-delivery-journal'||r['formatVersion']!==1)throw fail('delivery_journal_policy');const name=database(r['database']),prepared=preparationChoice(r['prepared']);if(name===prepared.database)throw fail('delivery_journal_policy');return frozen({format:r['format'],formatVersion:1,database:name,prepared});}
export function journalControl(value:unknown):DeliveryJournalControl{
 const r=fields(value,['kind','selection']);
 if(r['kind']==='initial')return frozen({kind:'initial',selection:generationControlSelection(r['selection'])});
 if(r['kind']==='advanced')return frozen({kind:'advanced',selection:deliveryControlSelection(r['selection'])});
 if(r['kind']==='handover')return frozen({kind:'handover',selection:handoverDeliveryPathSelection(r['selection'])});
 throw fail('delivery_journal_policy');
}
export function currentPins(control:DeliveryJournalControl){
 if(control.kind==='initial')return control.selection.source;
 if(control.kind==='handover')return control.selection.path.successor.current;
 return control.selection.continuation.current;
}
export function journalEvent(value:unknown):DeliveryJournalEvent{const r=fields(value,['format','formatVersion','journal','sequence','previous','control','current','server','inventory']),server=fields(r['server'],['identity','bytes','sha256']),inventory=fields(r['inventory'],['identity','bytes','sha256']);if(r['format']!=='breditor/selected-native-delivery-journal-event'||r['formatVersion']!==1)throw fail('delivery_journal_policy');const control=journalControl(r['control']),pins=currentPins(control),selectedServer=serverGenerationRoomIdentity(server['identity']),selectedInventory=serverGenerationParticipantIdentity(inventory['identity']);if(JSON.stringify(pins.server)!==JSON.stringify(selectedServer)||JSON.stringify(pins.participants)!==JSON.stringify(selectedInventory))throw fail();return frozen({format:r['format'],formatVersion:1,journal:hash(r['journal']),sequence:integer(r['sequence'],MAX_DELIVERY_JOURNAL_EVENTS-1),previous:r['previous']===null?null:hash(r['previous']),control,current:selectedRoomCurrentSelection(r['current']),server:{identity:selectedServer,bytes:integer(server['bytes'],MAX_DELIVERY_JOURNAL_BYTES,1),sha256:hash(server['sha256'])},inventory:{identity:selectedInventory,bytes:integer(inventory['bytes'],MAX_DELIVERY_JOURNAL_BYTES,1),sha256:hash(inventory['sha256'])}});}
