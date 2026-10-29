/** Canonical closed DATA choice. No saved token, role or ready marker accepted. */
import {generationControlSelection} from '../generation_recovery_control/identity.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fields,database,fail} from './policy.js';
import type {DeliveryPreparationChoice} from './contract.js';
export function preparationChoice(value:unknown):DeliveryPreparationChoice{const r=fields(value,['format','formatVersion','database','server','before']);if(r['format']!=='breditor/selected-native-delivery-preparation'||r['formatVersion']!==1)throw fail('delivery_preparation_policy');return frozen({format:'breditor/selected-native-delivery-preparation',formatVersion:1,database:database(r['database']),server:generationControlSelection(r['server']),before:selectedRoomCurrentSelection(r['before'])});}
