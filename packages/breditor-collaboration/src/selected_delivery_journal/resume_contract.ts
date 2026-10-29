
/** A separate fresh-attempt choice. Journal v1 events/preparation meanings do
 * not change; stored facts and this detached choice are never writer grants. */
import type {DeliveryJournalIdentity,DeliveryJournalSnapshot} from './contract.js';
import type {SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
import type {SharedServerLogGenerationDeliveryPathRecoveryControlSelection} from '../generation_delivery_path_control/contract.js';
import type {SharedServerLogGenerationDeliveryPathRecoveryHost} from '../generation_delivery_path_control/host.js';
import type {SharedServerLogGenerationDeliveryRecoveryHost} from '../generation_delivery_control/host.js';
import type {SharedServerLogGenerationRoomArchive} from '../server_generation_archive/read.js';
import type {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
export interface DeliveryJournalResumeChoice{
 readonly format:'breditor/selected-native-delivery-journal-resume';readonly formatVersion:1;
 readonly journal:DeliveryJournalIdentity;readonly head:DeliveryJournalSnapshot['head'];
 readonly current:SelectedRoomCurrentSelection;readonly path:SharedServerLogGenerationDeliveryPathRecoveryControlSelection;
}
export interface DeliveryJournalResumeInspectionInput{
 readonly identity:DeliveryJournalIdentity;readonly baseline:SharedServerLogGenerationDeliveryRecoveryHost;
 readonly previous:SharedServerLogGenerationDeliveryRecoveryHost;readonly path:SharedServerLogGenerationDeliveryPathRecoveryHost;
 readonly server:SharedServerLogGenerationRoomArchive;readonly inventory:SharedServerLogGenerationParticipantInventory;readonly checkAuthority:()=>void;
}
export interface DeliveryJournalResumeInput extends DeliveryJournalResumeInspectionInput{
 readonly expected:DeliveryJournalResumeChoice;readonly approve:(choice:DeliveryJournalResumeChoice)=>boolean|Promise<boolean>;
}
