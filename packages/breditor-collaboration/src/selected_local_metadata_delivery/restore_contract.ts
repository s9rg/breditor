/** DATA-only, non-overwriting metadata copy into an absent or byte-identical
 * namespace. Runtime reopening needs its own fresh current decision afterward. */
import type {LocalMetadataDeliveryChoice} from './contract.js';
import type {LocalMetadataResumeChoice,LocalMetadataResumeInspectionInput} from './resume_contract.js';
import type {SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
export type LocalMetadataRestorePresence='absent'|'identical';
export interface LocalMetadataRestoreChoice {
 readonly format:'breditor/selected-local-metadata-data-restore';readonly formatVersion:1;
 readonly delivery:LocalMetadataDeliveryChoice;readonly bundle:LocalMetadataResumeChoice['bundle'];
 readonly current:SelectedRoomCurrentSelection;readonly destination:LocalMetadataRestorePresence;
}
export type LocalMetadataRestoreInspectionInput=LocalMetadataResumeInspectionInput;
export interface LocalMetadataRestoreInput extends LocalMetadataRestoreInspectionInput {readonly expected:LocalMetadataRestoreChoice;readonly approve:(choice:LocalMetadataRestoreChoice)=>boolean|Promise<boolean>}
export interface LocalMetadataRestoreResult {readonly format:'breditor/selected-local-metadata-data-restored';readonly formatVersion:1;readonly choice:LocalMetadataRestoreChoice}
