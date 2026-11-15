import type {ClipboardContent,RichSelection} from "./types.js";
/** Authenticated host policy supplied separately from event content. Writer leasing remains host-owned. */
export interface SharedReviewPolicy {actor:string;principal:string;access:SharedReviewAccess}
export type SharedReviewAccess="read_only"|"comment"|"moderate";
/** Native exact counters remain decimal strings, including beyond Number.MAX_SAFE_INTEGER. */
export interface SharedReviewId {actor:string;counter:string}
export type SharedReviewTarget={kind:"document"}|{kind:"selection";selection:RichSelection};
export type SharedReviewResolution=
 |{kind:"resolved";target:SharedReviewTarget}
 |{kind:"pending"}
 |{kind:"orphaned";reason:"target_deleted"|"hidden_table"|"range_collapsed"|"target_kind_changed"};
/** Original native text at capture, not today's text at old numeric coordinates. */
export type SharedReviewQuote={kind:"document"}|{kind:"pending"}|{kind:"quoted";plainText:string}|{kind:"unavailable";reason:"too_large"};
/** Complete semantic content captured at the original review anchor. */
export type SharedReviewClipboard=
 |{kind:"document"|"pending"|"empty"}
 |{kind:"copied";clipboard:ClipboardContent};
export type SharedReviewAction=
 |{kind:"create_thread";data:{anchorJson:string;body:string}}
 |{kind:"reply";data:{thread:SharedReviewId;body:string}}
 |{kind:"edit_message";data:{message:SharedReviewId;body:string}}
 |{kind:"retract_message";data:{message:SharedReviewId}}
 |{kind:"set_thread_state";data:{thread:SharedReviewId;resolved:boolean}}
 |{kind:"reanchor_thread";data:{thread:SharedReviewId;anchorJson:string}};
/** Original events within the exact supplied native thread observation. */
export interface SharedReviewThreadHistoryEntry {
 readonly index:number;readonly id:SharedReviewId;readonly principal:string;readonly digest:string;
 readonly payload:
  |{readonly kind:"action";readonly data:SharedReviewAction}
  |{readonly kind:"visibility";readonly data:{readonly target:SharedReviewId;readonly visible:boolean}};
}
export interface SharedReviewThreadHistoryPage {
 readonly thread:SharedReviewId;readonly events:readonly SharedReviewThreadHistoryEntry[];
 readonly nextOffset:number|null;
}
export type SharedReviewOutcome={kind:"unchanged"}|{kind:"committed";event:SharedReviewId};
export type SharedReviewImportOutcome={kind:"unchanged"|"applied"}|{kind:"pending";missing:readonly SharedReviewId[]};
export interface SharedReviewMessage {id:SharedReviewId;author:string;versions:readonly {event:SharedReviewId;principal:string;text:string|null}[]}
export interface SharedReviewThread {
 id:SharedReviewId;author:string;anchors:readonly string[];state:"open"|"resolved"|"conflicted";
 messages:readonly SharedReviewMessage[];hidden:boolean;
}
/** Read-only Rust projection. Concurrent bodies/anchors are all shown; JS never chooses a winning one. */
export interface SharedReviewView {
 threads:readonly {thread:SharedReviewThread;targets:readonly {packet:string;resolution:SharedReviewResolution}[]}[];
 undoDepth:number;redoDepth:number;
}
/** Both lanes must still match when executing a queued UI request. These are live tokens, not recovery. */
export interface SharedReviewGuard {
 /** Exact facade-lifetime witness. This object identity cannot be serialized or moved to another owner. */
 readonly owner:object;
 documentRevision:string;reviewRevision:string;
}
export interface SharedReviewSnapshot extends SharedReviewGuard {view:SharedReviewView}
/** Native lineage proof, not a source permission or durable server acknowledgement. */
export interface SharedReviewWriterClock {actor:string;through:string;prefixDigest:string}
/** Inclusive positive review event range; distinct from document operation windows. */
export interface SharedReviewBatchReceipt extends SharedReviewWriterClock {from:string;batchDigest:string}
/** Additive complete native capability; old owners remain usable but cannot emulate comments in JS. */
export interface SharedReviewRustCapability {
 review_version?():string;
 review_enabled?():boolean;
 enable_review?(observation:unknown,hostPolicy:string,checkpoint?:string|null):void;
 capture_review_anchor?(observation:unknown,target:string):string;
 resolve_review_anchor?(packet:string):string;
 review_quote_version?():string;
 read_review_quote?(packet:string):string;
 /** Independent native clipboard capability. Original review quote support stays available. */
 review_clipboard_version?():string;
 read_review_clipboard?(packet:string):string;
 review_thread_history_version?():string;
 read_review_thread_history?(observation:unknown,input:string):string;
 review_view_json?(observation:unknown):string;
 dispatch_review?(observation:unknown,input:string):string;
 undo_review?(observation:unknown):string;
 redo_review?(observation:unknown):string;
 set_review_access?(observation:unknown,access:string):boolean;
 receive_review?(observation:unknown,verifiedPolicy:string,frame:string):string;
 export_review?(observation:unknown,after:string):string;
 review_checkpoint?(observation:unknown):string;
 review_transport_version?():string;
 local_review_clock?(observation:unknown):string;
 review_writer_clock?(observation:unknown,input:string):string;
 retained_review_receipt?(observation:unknown,hostPolicy:string,frame:string):string;
 export_review_through?(observation:unknown,after:string,through:string):string;
}
