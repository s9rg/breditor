import type {SharedRichEditor} from "../core.js";
import type {SharedEditorView,SharedSelectionPolicy} from "../types.js";
import type {SharedDocumentSuggestionDraft,SharedDocumentSuggestionInfo} from "../suggestion_types.js";
import type {SharedDocumentSuggestionPreview} from "../suggestion_preview.js";
import type {SharedSuggestionQueueStatus,SharedSuggestionPublication,SharedSuggestionDecision} from "../suggestions/types.js";
import type {SharedSuggestionSyncState} from "../suggestions/sync.js";
import type {SharedSuggestionFormatRebaseQueued} from "../suggestion_revisions/types.js";
import type {RichPresentationModel} from "@breditor/experimental-rich-content/rendering";
export type SharedSuggestionPanelCore=Pick<SharedRichEditor<SharedSelectionPolicy>,"view"|"subscribe"|"supportsDocumentSuggestions"|"prepareSuggestion"|"checkSuggestionPreview">&Partial<Pick<SharedRichEditor<SharedSelectionPolicy>,"supportsSuggestionGeneralText"|"planSuggestionGeneralText">>;
export interface SharedSuggestionPanelEntry {suggestion:SharedDocumentSuggestionInfo;publication:SharedSuggestionPublication|null;decision:SharedSuggestionDecision|null;local:SharedSuggestionQueueStatus|null;
 supersededBy?:string;
 /** Separate immutable relation. A draft child is previewable but cannot independently publish. */
 revision?:{id:string;previousSuggestionId:string;rootSuggestionId:string|null;state:"queued"|"stopped"|"published"|"conflict";canDecide:boolean;winningSuccessor:string|null};
}
/** One exact borrowed source/queue/network pairing. Custom hosts must retain equivalent native,
 * identity and persistence guards; display policy is never server authority. */
export interface SharedSuggestionPanelSource {
 readonly core:SharedSuggestionPanelCore;check():void;
 entries():readonly SharedSuggestionPanelEntry[];packet(id:string):string;
 propose(title:string,time:string,draft:SharedDocumentSuggestionDraft):SharedDocumentSuggestionInfo;
 queueDecision(id:string,choice:"accept"|"reject",time:string,preview?:SharedDocumentSuggestionPreview):boolean;
 stopDecision(id:string):void;stopPublication(id:string):void;resumePublication(id:string):void;
 flush():Promise<void>;retry():Promise<void>;subscribe(listener:()=>void):()=>void;
 state():{failed:boolean;closed:boolean;retiring:boolean};
 syncState?():SharedSuggestionSyncState;sync?():Promise<void>;load?(id:string):Promise<string>;
 /** Optional complete revision outbox; absent keeps old controls and storage unchanged. */
 canRevise?(id:string):boolean;
 revise?(previousId:string,title:string,time:string,draft:SharedDocumentSuggestionDraft,revision:string):SharedDocumentSuggestionInfo;
 /** Optional native original-character formatting revision, using the same durable outbox. */
 rebaseFormat?(previousId:string,title:string,time:string,revision:string):SharedSuggestionFormatRebaseQueued;
 revisionState?():{status:string;pending:number;error:string|null};
}
export interface SharedSuggestionComposerField {id:string;label:string;initial?:string;choices?:readonly {value:string;label:string}[]}
export interface SharedSuggestionComposerContext {
 readonly view:SharedEditorView<SharedSelectionPolicy>;readonly model:RichPresentationModel;
 readonly values:Readonly<Record<string,string>>;allocate(kind:string):string;
 /** Optional pure native planner bound to the captured selection and revision. No mutation API. */
 planText?(runs:readonly {text:string;formatsJson:string}[],prefix:string):SharedDocumentSuggestionDraft;
}
/** Pure proposal intent builder, not an ordinary toolbar dispatch or mutable document owner. */
export interface SharedSuggestionComposerAction {
 id:string;label:string;fields?:readonly SharedSuggestionComposerField[];
 enabled?(context:SharedSuggestionComposerContext):boolean;
 draft(context:SharedSuggestionComposerContext):SharedDocumentSuggestionDraft;
}
export interface SharedSuggestionPanelOptions {
 source:SharedSuggestionPanelSource;
 /** Optional host display fallback while offline. Current authenticated server grants still gate
  * transmission. Without this callback, controls remember only in-memory last observed rights. */
 policy?:()=>{canPropose:boolean;canAccept:boolean;canReject:boolean};
 /** Immutable action set; omitted selects the standard supported proposal builders. */
 actions?:readonly SharedSuggestionComposerAction[];
 /** Permanently consume fresh IDs, including for refused/discarded drafts. Required only for
  * structural builders; a missing allocator refuses rather than guessing an identity. */
 allocate?:(kind:string)=>string;nowMs?:()=>string;onError?:(error:unknown)=>void;
}
export interface SharedSuggestionPanel {readonly element:HTMLElement;refresh():void;dispose():void}
