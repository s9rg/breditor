import type {SharedProfileDescriptor} from "../profile.js";

/** Separate host-protected credential record. Never place this in a portable document/journal. */
export interface SharedRelayIdentity {
 readonly endpoint:string;readonly principal:string;readonly room:string;
 readonly writer:string;readonly credential:string;
}
export interface SharedRelayAuthentication {
 endpoint:string;principal:string;room:string;
 /** Account bearer token, not the room/writer resume credential. Refresh before opening a socket. */
 getToken:(signal:AbortSignal)=>string|Promise<string>;
 requestTimeoutMs?:number;
}
export interface SharedRelayRegistrationOptions extends SharedRelayAuthentication {
 /** Must complete durable host storage before the writer can be returned for authoring. */
 saveIdentity:(identity:SharedRelayIdentity)=>void|Promise<void>;
}
export interface SharedRelayRegistration {
 readonly identity:SharedRelayIdentity;readonly frame:string;readonly descriptor:SharedProfileDescriptor;
}
export type SharedRelayStatus="offline"|"connecting"|"syncing"|"ready"|"pending"|"local-save-failed"|"fenced"|"denied"|"failed"|"closed";
/** Exact author ends. Neither socket transmission nor local storage is a server acknowledgement. */
export interface SharedRelayState {
 readonly status:SharedRelayStatus;readonly writer:string;readonly localThrough:string;
 readonly locallyDurableThrough:string|null;readonly serverThrough:string|null;
 readonly serverPrefixDigest:string|null;readonly serverReceiptSequence:string|null;
 readonly waitingFor:readonly {readonly writer:string;readonly counter:string}[];
 readonly pending:boolean;readonly error:string|null;
}
export interface SharedRelayOptions {
 identity:SharedRelayIdentity;getToken:(signal:AbortSignal)=>string|Promise<string>;
 /** Resolve only after this core's complete current journal is durable, e.g. session.flush(). */
 persistLocal?:()=>Promise<void>;
 autoConnect?:boolean;requestTimeoutMs?:number;reconnectMinimumMs?:number;reconnectMaximumMs?:number;
 onState?:(state:SharedRelayState)=>void;onError?:(error:Error&{readonly code:string})=>void;
 /** Coalesced availability hint, not an edit or durable document acknowledgement. Refresh only
  * currently rendered asset bindings; reconnect invokes this too, so missed hints are harmless. */
 onAssetsChanged?:()=>void;
}
