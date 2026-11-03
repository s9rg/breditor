/** Separate normal-service publication DATA; no receipt certifies a local editor. */
import type {SharedDurableNativeActivationSelection} from '../native_activation_control/contract.js';
export interface SharedNativeRoomPublicationSelection {
 readonly format:'breditor/native-room-publication-control';readonly formatVersion:1;
 readonly instance:string;readonly activation:SharedDurableNativeActivationSelection;
 /** Actual Rust SocketAddr display, retained literally. Never used as an endpoint. */
 readonly listener:string;
}
export interface SharedNativeRoomPublicationBinding {
 /** Pin of the complete independently retained joint descriptor, not a readiness grant. */
 readonly bytes:number;readonly sha256:readonly number[];
}
export interface SharedNativeRoomPublicationRequest {
 readonly format:'breditor/native-room-publication-request';readonly formatVersion:1;
 readonly selection:SharedNativeRoomPublicationSelection;readonly joint:SharedNativeRoomPublicationBinding;
}
export interface SharedNativeRoomPublicationReceipt {
 readonly format:'breditor/native-room-publication-receipt';readonly formatVersion:1;
 readonly selection:SharedNativeRoomPublicationSelection;readonly joint:SharedNativeRoomPublicationBinding;
 readonly scope:'actual-held-native-service-and-bound-listener; joint-association-only';
}
export interface SharedNativeRoomPublicationHostOptions {
 /** Independently configured HTTPS/loopback endpoint; never archive selected. */
 readonly endpoint:string;readonly expected:SharedNativeRoomPublicationSelection;
 readonly principal:string;readonly getToken:(signal:AbortSignal)=>string|Promise<string>;
 readonly checkAuthority:()=>void;readonly signal?:AbortSignal;readonly requestTimeoutMs?:number;
}
