/** Separately selected native checkpoint DATA. No value here is a serving lease. */
import type {SharedServerLogGenerationRecoveryIdentity} from '../generation_recovery_control/contract.js';
export interface SharedDeploymentSelection {
 readonly identity:Readonly<{format:'breditor/room-deployment-authority';formatVersion:1;authority:string;binding:string}>;
 readonly generation:string;
 readonly owner:string|null;
}
export interface SharedDurableNativeActivationSelection {
 readonly format:'breditor/durable-native-activation-control';readonly formatVersion:1;
 readonly instance:string;
 /** Exact Rust checkpoint digest; device/inode u64 values stay inside Rust. */
 readonly checkpointSha256:readonly number[];
 readonly current:SharedServerLogGenerationRecoveryIdentity;
 readonly previous:SharedDeploymentSelection;
 readonly planned:SharedDeploymentSelection;
}
export interface SharedDurableNativeActivationReceipt {
 readonly format:'breditor/durable-native-activation-control-receipt';readonly formatVersion:1;
 readonly selection:SharedDurableNativeActivationSelection;
 readonly scope:'actual-held-native-service-only';
}
export interface SharedDurableNativeActivationHostOptions {
 /** Independently configured HTTPS or loopback endpoint; never archive selected. */
 readonly endpoint:string;
 readonly expected:SharedDurableNativeActivationSelection;
 readonly principal:string;
 readonly getToken:(signal:AbortSignal)=>string|Promise<string>;
 readonly checkAuthority:()=>void;
 readonly signal?:AbortSignal;
 readonly requestTimeoutMs?:number;
}
