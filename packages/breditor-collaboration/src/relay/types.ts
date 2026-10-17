import type {SharedProfileDescriptor} from "../profile.js";
import type {SharedPresence} from "../presence.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSuggestionRelayBinding} from "./suggestion_types.js";
import type {SharedSuggestionRevisionsBinding} from "../suggestion_revisions/types.js";

/** Separate host-protected credential record. Never place this in a portable document/journal. */
export interface SharedRelayIdentity {
 readonly endpoint:string;readonly principal:string;readonly room:string;
 readonly writer:string;readonly credential:string;
 /** Explicit atom-lineage room contract. Omitted retains the original writer transport. */
 readonly writerTransport?:"atomic-v2";
}
export interface SharedRelayAuthentication {
 endpoint:string;principal:string;room:string;
 /** Account bearer token, not the room/writer resume credential. Refresh before opening a socket. */
 getToken:(signal:AbortSignal)=>string|Promise<string>;
 requestTimeoutMs?:number;
}
export interface SharedRelayRegistrationOptions extends SharedRelayAuthentication {
 /** Must match a separately created transport-V2 room; never silently negotiates an upgrade. */
 writerTransport?:"atomic-v2";
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
export interface SharedRelayOptions<P extends SharedSelectionPolicy="original"> {
 selectionEditing?:P;
 identity:SharedRelayIdentity;getToken:(signal:AbortSignal)=>string|Promise<string>;
 /** Resolve only after this core's complete current journal is durable, e.g. session.flush(). */
 persistLocal?:()=>Promise<void>;
 autoConnect?:boolean;requestTimeoutMs?:number;reconnectMinimumMs?:number;reconnectMaximumMs?:number;
 onState?:(state:SharedRelayState)=>void;onError?:(error:Error&{readonly code:string})=>void;
 /** Coalesced availability hint, not an edit or durable document acknowledgement. Refresh only
  * currently rendered asset bindings; reconnect invokes this too, so missed hints are harmless. */
 onAssetsChanged?:()=>void;
 /** Opt-in ephemeral registry for this same core. The sync adapter does not dispose it. */
 presence?:SharedPresence<P>;
 /** Explicit optional lane on this SAME author socket. Requires atomic-v2, native proposal
  * proofs and persistLocal. Default document channels still reject suggestion hints. */
 suggestions?:SharedSuggestionRelayBinding;
 /** Additional explicit immutable-revision capability on the same socket. Requires suggestions. */
 suggestionRevisions?:SharedSuggestionRevisionsBinding;
}
/** Document replay requires atom-lineage transport V2; old room seeds/digests never upgrade. */
export type SharedDocumentRelayOptions=SharedRelayOptions<"document-v1">&{selectionEditing:"document-v1";identity:SharedRelayIdentity&{writerTransport:"atomic-v2"}};
