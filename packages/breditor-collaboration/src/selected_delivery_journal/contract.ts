/** Complete observed DATA, never an ACK, ready marker, native custody or serving grant. */
import type {DeliveryPreparationChoice} from '../selected_delivery_preparation/contract.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import type {SharedServerLogGenerationDeliveryRecoveryControlSelection} from '../generation_delivery_control/contract.js';
import type {SelectedRoomCurrentFile,SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
import type {SharedServerLogGenerationRoomBackupIdentity} from '../server_generation_archive/contract.js';
import type {SharedServerLogGenerationParticipantIdentity} from '../server_generation_inventory/contract.js';
export interface DeliveryJournalIdentity{readonly format:'breditor/selected-native-delivery-journal';readonly formatVersion:1;readonly database:string;readonly prepared:DeliveryPreparationChoice}
export type DeliveryJournalControl=Readonly<{kind:'initial';selection:SharedServerLogGenerationRecoveryControlSelection}>|Readonly<{kind:'advanced';selection:SharedServerLogGenerationDeliveryRecoveryControlSelection}>;
export interface DeliveryJournalInput{readonly control:DeliveryJournalControl;readonly current:SelectedRoomCurrentFile;readonly server:Blob;readonly inventory:Blob}
export interface DeliveryJournalEvent{
 readonly format:'breditor/selected-native-delivery-journal-event';readonly formatVersion:1;readonly journal:string;readonly sequence:number;readonly previous:string|null;
 readonly control:DeliveryJournalControl;readonly current:SelectedRoomCurrentSelection;
 readonly server:Readonly<{identity:SharedServerLogGenerationRoomBackupIdentity;bytes:number;sha256:string}>;
 readonly inventory:Readonly<{identity:SharedServerLogGenerationParticipantIdentity;bytes:number;sha256:string}>;
}
export interface DeliveryJournalEntry{readonly event:DeliveryJournalEvent;readonly sha256:string;readonly current:SelectedRoomCurrentFile;readonly server:Blob;readonly inventory:Blob}
export interface DeliveryJournalSnapshot{readonly identity:DeliveryJournalIdentity;readonly head:Readonly<{sequence:number;sha256:string}>;readonly entries:readonly DeliveryJournalEntry[]}
