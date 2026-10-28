/** Durable observed execution DATA. A journal stage/cursor never supplies
 * native custody, an executable grant, a server ACK or serving activation. */
import type {SelectedGenerationNativeImportChoice} from '../selected_generation_import/contract.js';
import type {SelectedRoomCurrentSelection,SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
import type {SelectedGenerationReconciliationRead} from '../selected_room_reconciliation/generation_contract.js';
export interface GenerationNativeExecutionIdentity{readonly format:'breditor/selected-generation-native-execution';readonly formatVersion:1;readonly database:string;readonly input:SelectedGenerationNativeImportChoice;readonly before:SelectedRoomCurrentSelection}
export interface GenerationNativeExecutionClient{readonly id:string;readonly family:RecordPayloadFamily}
export interface GenerationNativeExecutionHead{readonly sequence:string;readonly sha256:string}
export interface GenerationNativeExecutionEvent{readonly format:'breditor/selected-generation-native-execution-event';readonly formatVersion:1;readonly execution:string;readonly sequence:string;readonly previous:string|null;readonly stage:'prepared'|'resume'|'client'|'read';readonly participant:string|null;readonly cut:SelectedRoomCurrentSelection;readonly evidence:Readonly<{bytes:number;sha256:string}>|null}
export interface GenerationNativeExecutionStoredEvent{readonly event:GenerationNativeExecutionEvent;readonly sha256:string}
export interface GenerationNativeExecutionIntent{readonly format:'breditor/selected-generation-native-execution-intent';readonly formatVersion:1;readonly identity:GenerationNativeExecutionIdentity;readonly clients:readonly GenerationNativeExecutionClient[];readonly input:Blob}
export interface GenerationNativeExecutionSnapshot{readonly intent:GenerationNativeExecutionIntent;readonly execution:string;readonly head:GenerationNativeExecutionHead;readonly events:readonly GenerationNativeExecutionStoredEvent[];readonly cuts:ReadonlyMap<string,Blob>;readonly evidence:ReadonlyMap<string,Blob>}
export interface GenerationNativeExecutionInitial{readonly identity:GenerationNativeExecutionIdentity;readonly clients:readonly GenerationNativeExecutionClient[];readonly input:Blob;readonly before:SelectedRoomCurrentFile}
export interface GenerationNativeExecutionStartChoice{readonly format:'breditor/selected-generation-native-execution-start';readonly formatVersion:1;readonly identity:GenerationNativeExecutionIdentity}
export interface GenerationNativeExecutionResumeChoice{readonly format:'breditor/selected-generation-native-execution-resume';readonly formatVersion:1;readonly identity:GenerationNativeExecutionIdentity;readonly expectedHead:GenerationNativeExecutionHead;readonly current:SelectedRoomCurrentSelection}
export interface GenerationNativeExecutionResult{readonly format:'breditor/selected-generation-native-execution-result';readonly formatVersion:1;readonly identity:GenerationNativeExecutionIdentity;readonly head:GenerationNativeExecutionHead;readonly read:SelectedGenerationReconciliationRead}
