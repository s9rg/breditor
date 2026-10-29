/** Separate whole ordered path/current selections. Data never recreates native ownership. */
import type {SharedServerLogGenerationRoomBackupIdentity} from '../server_generation_archive/contract.js';
import type {SharedServerLogGenerationRecoveryIdentity} from '../generation_recovery_control/contract.js';
import type {SharedServerLogGenerationDeliveryRecoveryControlSelection} from '../generation_delivery_control/contract.js';
import type {SharedServerLogGenerationDeliveryRecoveryHost} from '../generation_delivery_control/host.js';
export interface SharedServerLogGenerationDeliveryPathIdentity{readonly format:'breditor/server-log-generation-delivery-path';readonly formatVersion:1;readonly ancestors:readonly SharedServerLogGenerationRoomBackupIdentity[];readonly current:SharedServerLogGenerationRecoveryIdentity}
export interface SharedServerLogGenerationDeliveryPathRecoveryControlSelection{readonly format:'breditor/server-log-generation-delivery-path-recovery-control';readonly formatVersion:1;readonly instance:string;readonly path:SharedServerLogGenerationDeliveryPathIdentity;readonly current:SharedServerLogGenerationDeliveryRecoveryControlSelection}
export interface SharedServerLogGenerationDeliveryPathRecoveryHostOptions{
 readonly endpoint:string;readonly expected:SharedServerLogGenerationDeliveryPathRecoveryControlSelection;
 /** Genuine separately owned prior/current checker; public shadows/copies are ignored. */
 readonly current:SharedServerLogGenerationDeliveryRecoveryHost;
 readonly principal:string;readonly getToken:(signal:AbortSignal)=>string|Promise<string>;readonly checkAuthority:()=>void;
 readonly signal?:AbortSignal;readonly requestTimeoutMs?:number;
}
