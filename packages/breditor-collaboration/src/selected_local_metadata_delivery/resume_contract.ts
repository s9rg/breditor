/** Fresh existing-data decision. Historical bundle bytes never revive runtime
 * permission, overwrite a later stored head or select a different parent. */
import type {LocalMetadataDeliveryChoice,LocalMetadataRoomBundle} from './contract.js';
import type {SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
import type {DeliveryPreparationChoice} from '../selected_delivery_preparation/contract.js';
export interface LocalMetadataStoredSelection {readonly revision:number;readonly bytes:number;readonly sha256:string}
export interface LocalMetadataResumeChoice {
 readonly format:'breditor/selected-local-metadata-resume';readonly formatVersion:1;
 readonly delivery:LocalMetadataDeliveryChoice;
 readonly bundle:Readonly<{prepared:DeliveryPreparationChoice;current:SelectedRoomCurrentSelection;review:Readonly<{bytes:number;sha256:string}>;metadata:Readonly<{bytes:number;sha256:string}>}>;
 readonly stored:LocalMetadataStoredSelection;
}
export interface LocalMetadataResumeInspectionInput {readonly choice:LocalMetadataDeliveryChoice;readonly bundle:LocalMetadataRoomBundle;readonly checkAuthority:()=>void}
export interface LocalMetadataResumeInput extends LocalMetadataResumeInspectionInput {readonly expected:LocalMetadataResumeChoice;readonly approve:(choice:LocalMetadataResumeChoice)=>boolean|Promise<boolean>}
