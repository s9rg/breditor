import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedDocumentVersionInfo} from "../version_types.js";
/** Pinned nonsecret catalog identity. Neither account credentials nor live roles belong here. */
export interface SharedDocumentVersionsIdentity {
 endpoint:string;principal:string;room:string;binding:string;documentWriter:string;writerTransport?:"atomic-v2";
}
export interface SharedDocumentVersionsDescriptor {format:"breditor/relay-document-versions";formatVersion:1;document:string;binding:string}
export interface SharedDocumentVersionEntry {sequence:string;version:SharedDocumentVersionInfo}
export interface SharedDocumentVersionsCursor {binding:string;after:string;through:string}
export interface SharedDocumentVersionsPage {descriptor:SharedDocumentVersionsDescriptor;entries:readonly SharedDocumentVersionEntry[];cursor:SharedDocumentVersionsCursor;more:boolean}
/** The existing document/review persistence remains the sole native owner and recovery authority. */
export interface SharedVersionDocumentStorage<P extends SharedSelectionPolicy=SharedSelectionPolicy> {readonly core:SharedRichEditor<P>;save():void;flush():Promise<void>}
export interface SharedDocumentVersionsDiscoveryOptions {
 endpoint:string;principal:string;room:string;documentWriter:string;writerTransport?:"atomic-v2";
 getToken:(signal:AbortSignal)=>string|Promise<string>;requestTimeoutMs?:number;
 /** Pin the nonsecret new catalog binding before first capture; no existing cache is migrated. */
 saveIdentity:(identity:SharedDocumentVersionsIdentity)=>void|Promise<void>;
}
export interface SharedDocumentVersionsOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 identity:SharedDocumentVersionsIdentity;database:string;storage:SharedVersionDocumentStorage<P>;
 getToken:(signal:AbortSignal)=>string|Promise<string>;
 /** Optional existing document relay. This adapter receives catchup, never submits document edits. */
 flushDocument?:()=>Promise<void>;
 autoConnect?:boolean;requestTimeoutMs?:number;reconnectMinimumMs?:number;reconnectMaximumMs?:number;
 onState?:(state:SharedDocumentVersionsState)=>void;onError?:(error:Error&{readonly code:string})=>void;
}
export interface SharedDocumentVersionsState {
 status:"offline"|"connecting"|"syncing"|"ready"|"pending"|"denied"|"failed"|"local-save-failed"|"closed";
 canPublish:boolean|null;queued:number;catalogEntries:number;cachedPackets:number;localPending:boolean;waitingForDocument:boolean;error:string|null;
}
export interface SharedDocumentVersionStatus {
 cached:boolean;localSaved:boolean;queued:boolean;accepted:SharedDocumentVersionEntry|null;
}
/** Exact immutable packet and intent. A failed save never recaptures a new source/name/timestamp. */
export interface RetainedVersionPacket {packet:string;origin:"local"|"remote";publish:boolean;accepted:SharedDocumentVersionEntry|null}
export interface VersionCatalogSnapshot {through:string;entries:readonly SharedDocumentVersionEntry[]}
/** Separate closed cache family; old document/review record readers remain unchanged. */
export interface SharedVersionCatalogRecord {
 format:"breditor/shared-version-catalog-cache";formatVersion:1;identity:SharedDocumentVersionsIdentity;
 catalog:VersionCatalogSnapshot|null;packets:readonly RetainedVersionPacket[];
}
