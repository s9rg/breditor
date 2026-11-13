/** Private storage machinery shared by explicit intent families. A codec only
 * admits inert retained data; it cannot supply Native ownership or approval. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SharedDurableNativeActivationSelection,SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import type {RoomActivationBlobPin} from './contract.js';

export interface ActivationStoredChoice {
 readonly database:string;
 readonly activation:SharedDurableNativeActivationSelection;
 readonly graph:RoomActivationBlobPin;
 readonly objects:readonly RoomActivationBlobPin[];
 readonly totalBytes:number;
}
export interface ActivationStoredState<Receipt=SharedDurableNativeActivationReceipt> {
 readonly format:string;readonly formatVersion:1;readonly revision:number;
 readonly phase:'prepared'|'request-started'|'receipt-observed';
 readonly receipt:Receipt|null;
}
export interface ActivationStoredEncoding<Choice extends ActivationStoredChoice> {
 readonly choice:Choice;readonly graph:string;readonly objects:readonly Blob[];
}
export interface ActivationStoredIntent<Choice extends ActivationStoredChoice,Capture,State extends ActivationStoredState<unknown>> {
 readonly choice:Choice;readonly capture:Capture;readonly state:State;
}
export interface ActivationIntentStoreCodec<Choice extends ActivationStoredChoice,Capture,State extends ActivationStoredState<unknown>> {
 readonly choice:(value:unknown)=>Choice;
 readonly snapshot:(value:ActivationStoredEncoding<Choice>)=>ActivationStoredEncoding<Choice>;
 readonly decode:(value:ActivationStoredEncoding<Choice>,options:SharedArchiveIntegrityOptions)=>Promise<Capture>;
 readonly state:(value:unknown,choice:Choice)=>State;
 readonly receipt:(value:NonNullable<State['receipt']>,choice:Choice)=>NonNullable<State['receipt']>;
 readonly initial:State;
}
