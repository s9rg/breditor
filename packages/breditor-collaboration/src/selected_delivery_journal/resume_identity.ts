
/** Closed detached pins; only real inspection/native proofs verify their meaning. */
import {journalIdentity} from './identity.js';
import {fields,integer,hash,fail,MAX_DELIVERY_JOURNAL_EVENTS} from './policy.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {deliveryPathControlSelection} from '../generation_delivery_path_control/identity.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {DeliveryJournalResumeChoice} from './resume_contract.js';
export function deliveryJournalResumeChoice(value:unknown):DeliveryJournalResumeChoice{const r=fields(value,['format','formatVersion','journal','head','current','path']),head=fields(r['head'],['sequence','sha256']);if(r['format']!=='breditor/selected-native-delivery-journal-resume'||r['formatVersion']!==1)throw fail('delivery_journal_policy');return frozen({format:r['format'],formatVersion:1,journal:journalIdentity(r['journal']),head:{sequence:integer(head['sequence'],MAX_DELIVERY_JOURNAL_EVENTS-1),sha256:hash(head['sha256'])},current:selectedRoomCurrentSelection(r['current']),path:deliveryPathControlSelection(r['path'])});}
