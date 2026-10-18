import type {SharedPersistentSession} from "@breditor/collaboration";

/** Readable exact state retained after a failed close, without admitting further UI editing. */
export interface SharedEditorRecovery {
 /** Added by new producers so exported recovery can retain its declared history family. */
 historyPolicy?():"explicit"|"typing-v1";
 /** Independent replay family retained even when ordinary history is selected. */
 rangePolicy?():"original"|"general-v1";
 /** Explicit search replay choice retained without guessing from checkpoint JSON. */
 searchHistoryPolicy?():"search-v1"|null;
 checkpointJson():string;
 close():Promise<void>;
 discardAndClose():Promise<void>;
}
/** Failed startup cleanup transfers recovery responsibility without exposing an unmounted DOM owner. */
export class SharedEditorOpenError extends Error {
 readonly recovery:SharedEditorRecovery;
 constructor(cause:unknown,session:SharedPersistentSession){
  super("Editor opening failed and its durable writer could not close; retry recovery.close() or explicitly discard it",{cause});
  this.name="SharedEditorOpenError";
  this.recovery={historyPolicy:()=>session.core.view().historyGrouping==="typing-v1"?"typing-v1":"explicit",rangePolicy:()=>session.core.view().rangeEditing??"original",searchHistoryPolicy:()=>session.core.searchHistoryPolicy?.()??null,checkpointJson:()=>session.core.checkpointJson(),close:()=>session.close(),discardAndClose:()=>session.discardAndClose()};
 }
}
