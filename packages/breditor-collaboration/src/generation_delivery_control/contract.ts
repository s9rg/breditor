/** Separate previous/current pins; declarations never recreate native proof or ownership. */
import type {SharedServerLogGenerationRoomBackupIdentity} from '../server_generation_archive/contract.js';
import type {SharedServerLogGenerationRecoveryIdentity,SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import type {SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
export interface SharedServerLogGenerationDeliveryContinuationIdentity{readonly format:'breditor/server-log-generation-delivery-continuation';readonly formatVersion:1;readonly previous:SharedServerLogGenerationRoomBackupIdentity;readonly current:SharedServerLogGenerationRecoveryIdentity}
export interface SharedServerLogGenerationDeliveryRecoveryControlSelection{readonly format:'breditor/server-log-generation-delivery-recovery-control';readonly formatVersion:1;readonly instance:string;readonly continuation:SharedServerLogGenerationDeliveryContinuationIdentity;readonly current:SharedServerLogGenerationRecoveryControlSelection}
export interface SharedServerLogGenerationDeliveryRecoveryHostOptions{
 readonly endpoint:string;readonly expected:SharedServerLogGenerationDeliveryRecoveryControlSelection;
 /** Genuine separately configured current checker. Public method shadows are ignored. */
 readonly current:SharedServerLogGenerationRecoveryHost;
 readonly principal:string;readonly getToken:(signal:AbortSignal)=>string|Promise<string>;readonly checkAuthority:()=>void;
 readonly signal?:AbortSignal;readonly requestTimeoutMs?:number;
}
