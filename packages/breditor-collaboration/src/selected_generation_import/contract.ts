/** A complete immutable import INPUT, not native custody, saved permission,
 * server acknowledgement, an activation record or a completed import. */
import type {SelectedRoomCurrentSelection,SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import type {SharedServerLogGenerationRecoveryAcceptedRequest} from '../generation_recovery_control/accepted_contract.js';
export interface SelectedGenerationNativeImportSelection{readonly format:'breditor/selected-generation-native-import-selection';readonly formatVersion:1;readonly bytes:number;readonly sha256:string}
export interface SelectedGenerationNativeImportFile{readonly selection:SelectedGenerationNativeImportSelection;readonly file:Blob}
export interface SelectedGenerationNativeImportPage{readonly request:SharedServerLogGenerationRecoveryAcceptedRequest;readonly file:Blob}
export interface SelectedGenerationNativeImportManifest{readonly format:'breditor/selected-generation-native-import-input';readonly formatVersion:1;readonly server:SharedServerLogGenerationRecoveryControlSelection;readonly before:SelectedRoomCurrentSelection;readonly pages:readonly Readonly<{request:SharedServerLogGenerationRecoveryAcceptedRequest;bytes:number;sha256:string}>[]}
export interface SelectedGenerationNativeImportInput{readonly server:SharedServerLogGenerationRecoveryControlSelection;readonly before:SelectedRoomCurrentFile;readonly pages:readonly SelectedGenerationNativeImportPage[]}
export interface SelectedGenerationNativeImportChoice{readonly format:'breditor/selected-generation-native-import-choice';readonly formatVersion:1;readonly database:string;readonly input:SelectedGenerationNativeImportSelection}
export interface SelectedGenerationNativeImportPreview{readonly choice:SelectedGenerationNativeImportChoice;readonly input:SelectedGenerationNativeImportFile}
