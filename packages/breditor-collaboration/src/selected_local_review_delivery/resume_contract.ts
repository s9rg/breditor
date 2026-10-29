/** Separate fresh local-review resume decision; old prepared choices stay literal. */
import type {LocalReviewDeliveryChoice,LocalReviewRoomBundle} from './contract.js';
import type {SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
import type {SharedServerLogGenerationDeliveryRecoveryHost} from '../generation_delivery_control/host.js';
import type {SharedServerLogGenerationDeliveryPathRecoveryHost} from '../generation_delivery_path_control/host.js';
import type {SharedServerLogGenerationDeliveryPathRecoveryControlSelection} from '../generation_delivery_path_control/contract.js';
import type {SharedServerLogGenerationRoomArchive} from '../server_generation_archive/read.js';
import type {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
export interface LocalReviewStoredSelection {readonly revision:number;readonly bytes:number;readonly sha256:string}
export interface LocalReviewResumeChoice {
 readonly format:'breditor/selected-local-review-delivery-resume';readonly formatVersion:1;
 readonly delivery:LocalReviewDeliveryChoice;readonly bundle:Readonly<{current:SelectedRoomCurrentSelection;bytes:number;sha256:string}>;
 readonly stored:LocalReviewStoredSelection;readonly current:SelectedRoomCurrentSelection;readonly path:SharedServerLogGenerationDeliveryPathRecoveryControlSelection;
}
export interface LocalReviewResumeInspectionInput {
 readonly choice:LocalReviewDeliveryChoice;readonly bundle:LocalReviewRoomBundle;
 readonly baseline:SharedServerLogGenerationDeliveryRecoveryHost;readonly path:SharedServerLogGenerationDeliveryPathRecoveryHost;
 readonly server:SharedServerLogGenerationRoomArchive;readonly inventory:SharedServerLogGenerationParticipantInventory;
 readonly checkAuthority:()=>void;
}
export interface LocalReviewResumeInput extends LocalReviewResumeInspectionInput {readonly expected:LocalReviewResumeChoice;readonly approve:(choice:LocalReviewResumeChoice)=>boolean|Promise<boolean>}
