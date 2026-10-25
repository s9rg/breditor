/** Durable observed execution DATA. A journal stage/cursor never supplies
 * native custody, an executable grant, a server ACK or serving activation. */
import type {SelectedNativeImportChoice} from '../selected_native_import/contract.js';
import type {SelectedRoomCurrentSelection,SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
import type {SelectedRoomReconciliationRead} from '../selected_room_reconciliation/contract.js';
export interface NativeExecutionIdentity{readonly format:'breditor/selected-native-execution';readonly formatVersion:1;readonly database:string;readonly input:SelectedNativeImportChoice;readonly before:SelectedRoomCurrentSelection}
export interface NativeExecutionClient{readonly id:string;readonly family:RecordPayloadFamily}
export interface NativeExecutionHead{readonly sequence:string;readonly sha256:string}
export interface NativeExecutionEvent{readonly format:'breditor/selected-native-execution-event';readonly formatVersion:1;readonly execution:string;readonly sequence:string;readonly previous:string|null;readonly stage:'prepared'|'resume'|'client'|'read';readonly participant:string|null;readonly cut:SelectedRoomCurrentSelection;readonly evidence:Readonly<{bytes:number;sha256:string}>|null}
export interface NativeExecutionStoredEvent{readonly event:NativeExecutionEvent;readonly sha256:string}
export interface NativeExecutionIntent{readonly format:'breditor/selected-native-execution-intent';readonly formatVersion:1;readonly identity:NativeExecutionIdentity;readonly clients:readonly NativeExecutionClient[];readonly input:Blob}
export interface NativeExecutionSnapshot{readonly intent:NativeExecutionIntent;readonly execution:string;readonly head:NativeExecutionHead;readonly events:readonly NativeExecutionStoredEvent[];readonly cuts:ReadonlyMap<string,Blob>;readonly evidence:ReadonlyMap<string,Blob>}
export interface NativeExecutionInitial{readonly identity:NativeExecutionIdentity;readonly clients:readonly NativeExecutionClient[];readonly input:Blob;readonly before:SelectedRoomCurrentFile}
export interface NativeExecutionStartChoice{readonly format:'breditor/selected-native-execution-start';readonly formatVersion:1;readonly identity:NativeExecutionIdentity}
export interface NativeExecutionResumeChoice{readonly format:'breditor/selected-native-execution-resume';readonly formatVersion:1;readonly identity:NativeExecutionIdentity;readonly expectedHead:NativeExecutionHead;readonly current:SelectedRoomCurrentSelection}
export interface NativeExecutionResult{readonly format:'breditor/selected-native-execution-result';readonly formatVersion:1;readonly identity:NativeExecutionIdentity;readonly head:NativeExecutionHead;readonly read:SelectedRoomReconciliationRead}
