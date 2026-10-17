import type {SharedRichEditor} from "../core.js";
import type {SharedReviewWriterClock,SharedReviewBatchReceipt} from "../review_types.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedProfileDescriptor} from "../profile.js";
import type {SharedRelayAuthentication,SharedRelayStatus} from "./types.js";
export type SharedReviewRelayRole="comment"|"moderator"|null;
/** Identity saved outside portable document/review records. Credential is a host-protected secret. */
export interface SharedReviewRelayIdentity {
 endpoint:string;principal:string;room:string;actor:string;binding:string;credential:string;
 documentWriter:string;writerTransport?:"atomic-v2";
 /** Present only when the helper reserved a non-authoring document identity. */
 observerCredential?:string;
 /** Permanently non-authoring metadata identity; account promotion requires a separate new actor. */
 reviewEditing?:"read_only";
}
/** Nonsecret immutable binding stored with both native journals, never a live grant. */
export type SharedReviewRelayStorageIdentity=Omit<SharedReviewRelayIdentity,"credential"|"observerCredential">;
export interface SharedReviewRelayCursor {binding:string;after:string}
export interface SharedReviewRelayProgress {
 cursor:SharedReviewRelayCursor|null;accepted:SharedReviewWriterClock|null;sequence:string|null;
}
/** Borrowed paired persistence. The transport never closes/disposes this session or its core. */
export interface SharedReviewRelayStorage<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly core:SharedRichEditor<P>;
 reviewRelayIdentity():SharedReviewRelayStorageIdentity|null;
 reviewRelayProgress():SharedReviewRelayProgress;
 persistReviewRelayProgress(progress:SharedReviewRelayProgress):Promise<void>;
 flush():Promise<void>;
}
export interface SharedReviewRelayRegistrationOptions extends SharedRelayAuthentication {
 actor:string;writerTransport?:"atomic-v2";
 /** Omit to reserve an observation-only document identity; otherwise use an already reserved editor writer. */
 documentWriter?:string;
 saveIdentity:(identity:SharedReviewRelayIdentity)=>void|Promise<void>;
}
export interface SharedReviewRelayRegistration {
 identity:SharedReviewRelayIdentity;frame:string;descriptor:SharedProfileDescriptor;role:SharedReviewRelayRole;
}
export interface SharedReviewObserverRegistration extends Omit<SharedReviewRelayRegistration,"identity"> {
 identity:SharedReviewRelayIdentity&{reviewEditing:"read_only"};
}
export interface SharedReviewRelayOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 identity:SharedReviewRelayIdentity;storage:SharedReviewRelayStorage<P>;
 getToken:(signal:AbortSignal)=>string|Promise<string>;
 /** Optional existing document sync. It owns document submission, never this metadata adapter. */
 flushDocument?:()=>Promise<void>;
 autoConnect?:boolean;requestTimeoutMs?:number;reconnectMinimumMs?:number;reconnectMaximumMs?:number;
 onState?:(state:SharedReviewRelayState)=>void;onError?:(error:Error&{readonly code:string})=>void;
}
export interface SharedReviewRelayState {
 status:SharedRelayStatus;actor:string;localThrough:string;serverThrough:string|null;cursor:SharedReviewRelayCursor|null;
 pending:boolean;error:string|null;lastReceipt:SharedReviewBatchReceipt|null;
}
