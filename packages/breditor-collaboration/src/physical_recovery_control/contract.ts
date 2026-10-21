/** Separate operator transport. No editor account, stored URL or DTO provides recovery authority. */
import type {SharedServerLogGenerationRoomBackupIdentity} from '../server_generation_archive/contract.js';
import type {SharedServerLogGenerationParticipantIdentity} from '../server_generation_inventory/contract.js';
export interface SharedPhysicalServerRecoveryIdentity {
 readonly format:'breditor/physical-server-room-recovery-state';readonly formatVersion:1;
 readonly ancestor:SharedServerLogGenerationRoomBackupIdentity;
 readonly localOrigin:SharedServerLogGenerationRoomBackupIdentity;
 readonly server:SharedServerLogGenerationRoomBackupIdentity;
 readonly participants:SharedServerLogGenerationParticipantIdentity;
}
/** Detached complete selection, not a native proof, operator token or activation grant. */
export interface SharedPhysicalRecoveryControlSelection {
 readonly format:'breditor/physical-room-recovery-control';readonly formatVersion:1;
 readonly instance:string;readonly source:SharedPhysicalServerRecoveryIdentity;
}
export interface SharedPhysicalRecoveryHostOptions {
 /** Explicit trusted operator endpoint. HTTPS, or HTTP on loopback only; never chosen by an archive. */
 readonly endpoint:string;
 readonly expected:SharedPhysicalRecoveryControlSelection;
 /** Separate host operator principal. Native editor tokens are refused by the server. */
 readonly principal:string;
 /** Ephemeral operator account token; not serialized into a document, record or archive. */
 readonly getToken:(signal:AbortSignal)=>string|Promise<string>;
 readonly checkAuthority:()=>void;
 readonly signal?:AbortSignal;
 readonly requestTimeoutMs?:number;
}
