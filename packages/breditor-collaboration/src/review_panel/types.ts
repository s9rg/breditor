import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedReviewPolicy,SharedReviewSnapshot,SharedReviewTarget} from "../review_types.js";
import type {SharedDocumentVersionInfo} from "../version_types.js";
import type {SharedDocumentVersionsState,SharedDocumentVersionStatus} from "../versions/types.js";
import type {SharedSuggestionPanelOptions} from "../suggestion_panel/types.js";
/** A borrowed native facade, not another editor owner. */
export type SharedReviewPanelCore=Pick<SharedRichEditor<SharedSelectionPolicy>,"view"|"reviewSnapshot"|"subscribeReview"|"captureReviewAnchor"|"dispatchReview"|"undoReview"|"redoReview"|"compareVersion"|"prepareVersionRestore"|"applyVersionRestore">&Partial<Pick<SharedRichEditor<SharedSelectionPolicy>,"supportsReviewQuotes"|"readReviewQuote">>;
/** Borrowed local or shared catalog. Optional remote methods do not change local synchronous use. */
export interface SharedReviewVersionCatalog {
 versions():readonly SharedDocumentVersionInfo[];versionPacket(id:string):string;
 saveVersion(name:string,createdAtMs:string):SharedDocumentVersionInfo;flush():Promise<void>;retry():Promise<void>;
 /** Fetch, natively validate and locally cache an immutable remote packet before using it. */
 loadVersion?(id:string):Promise<string>;
 subscribeVersions?(listener:()=>void):()=>void;
 versionsState?():SharedDocumentVersionsState;
 versionStatus?(id:string):SharedDocumentVersionStatus;
 syncVersions?():Promise<void>;
}
export interface SharedReviewPanelOptions {
 /** Display affordances only. Rust's separately supplied policy still authorizes every action. */
 policy:()=>Pick<SharedReviewPolicy,"principal"|"access">;
 /** Explicit target override; null means no selected target. No selection never means the document. */
 target?:()=>SharedReviewTarget|null;
 versions?:SharedReviewVersionCatalog;
 /** Optional borrowed suggestion controls. They must reference this exact native core. */
 suggestions?:SharedSuggestionPanelOptions;
 /** Permanently consume a fresh namespace on every restore preview, including refusal/discard. */
 allocatePrefix?:()=>string;
 nowMs?:()=>string;onError?:(error:unknown)=>void;
}
export interface SharedReviewPanel {
 readonly element:HTMLElement;refresh():void;
 /** Detach controls only. Neither the native owner nor either durable writer lease is closed. */
 dispose():void;
}
export interface PanelContext {
 core:SharedReviewPanelCore;options:SharedReviewPanelOptions;snapshot:SharedReviewSnapshot;
 document:Document;run(work:()=>void):void;report(error:unknown):void;refresh():void;
 target():SharedReviewTarget|null;commentAllowed():boolean;moderates(author:string):boolean;
}
