/** Separate immutable before-delivery DATA. Never a receipt or resumed owner. */
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import type {SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
export interface DeliveryPreparationChoice{readonly format:'breditor/selected-native-delivery-preparation';readonly formatVersion:1;readonly database:string;readonly server:SharedServerLogGenerationRecoveryControlSelection;readonly before:SelectedRoomCurrentSelection}
export interface DeliveryPreparationFile{readonly choice:DeliveryPreparationChoice;readonly file:Blob}
