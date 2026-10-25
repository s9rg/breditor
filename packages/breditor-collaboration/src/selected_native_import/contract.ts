/** A complete immutable import INPUT, not native custody, saved permission,
 * server acknowledgement, an activation record or a completed import. */
import type {SelectedRoomCurrentSelection,SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import type {SharedPhysicalRecoveryControlSelection} from '../physical_recovery_control/contract.js';
import type {SharedPhysicalRecoveryAcceptedRequest} from '../physical_recovery_control/accepted_contract.js';
export interface SelectedNativeImportSelection{readonly format:'breditor/selected-native-import-selection';readonly formatVersion:1;readonly bytes:number;readonly sha256:string}
export interface SelectedNativeImportFile{readonly selection:SelectedNativeImportSelection;readonly file:Blob}
export interface SelectedNativeImportPage{readonly request:SharedPhysicalRecoveryAcceptedRequest;readonly file:Blob}
export interface SelectedNativeImportManifest{readonly format:'breditor/selected-native-import-input';readonly formatVersion:1;readonly server:SharedPhysicalRecoveryControlSelection;readonly before:SelectedRoomCurrentSelection;readonly pages:readonly Readonly<{request:SharedPhysicalRecoveryAcceptedRequest;bytes:number;sha256:string}>[]}
export interface SelectedNativeImportInput{readonly server:SharedPhysicalRecoveryControlSelection;readonly before:SelectedRoomCurrentFile;readonly pages:readonly SelectedNativeImportPage[]}
export interface SelectedNativeImportChoice{readonly format:'breditor/selected-native-import-choice';readonly formatVersion:1;readonly database:string;readonly input:SelectedNativeImportSelection}
export interface SelectedNativeImportPreview{readonly choice:SelectedNativeImportChoice;readonly input:SelectedNativeImportFile}
