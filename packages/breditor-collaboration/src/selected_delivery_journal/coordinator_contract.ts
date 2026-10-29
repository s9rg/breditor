/** Genuine configured hosts/readers, not callbacks or decoded claimed-ready records. */
import type {SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import type {SharedServerLogGenerationDeliveryRecoveryHost} from '../generation_delivery_control/host.js';
import type {SharedServerLogGenerationRoomArchive} from '../server_generation_archive/read.js';
import type {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
export interface DeliveryJournalOpeningInput{readonly database:string;readonly host:SharedServerLogGenerationRecoveryHost;readonly server:SharedServerLogGenerationRoomArchive;readonly inventory:SharedServerLogGenerationParticipantInventory;readonly checkAuthority:()=>void}
export interface DeliveryJournalRecordingInput{
 /** Genuine control retaining the immutable initial target B. */
 readonly baseline:SharedServerLogGenerationDeliveryRecoveryHost;
 /** Genuine control selecting the exact latest recorded complete predecessor. */
 readonly previous:SharedServerLogGenerationDeliveryRecoveryHost;
 readonly server:SharedServerLogGenerationRoomArchive;readonly inventory:SharedServerLogGenerationParticipantInventory;
}
