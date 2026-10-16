import type {SharedPersistentSession} from "@breditor/collaboration";
import type {SharedEditorRecovery} from "./shared_open_error.js";
/** Failed retirement retains its explicit selection and history family, never an inferred AST seed. */
export interface SharedDocumentEditorRecovery extends SharedEditorRecovery {
 selectionPolicy():"document-v1";
 historyPolicy():"explicit"|"typing-v1";
 rangePolicy():"general-v1";
}
/** Cleanup cannot discard an exact document writer merely because startup failed. */
export class SharedDocumentEditorOpenError extends Error {
 readonly recovery:SharedDocumentEditorRecovery;
 constructor(cause:unknown,session:SharedPersistentSession<"document-v1">){
  super("Document editor opening failed and its durable writer could not close; retry recovery.close() or explicitly discard it",{cause});
  this.name="SharedDocumentEditorOpenError";
  this.recovery={selectionPolicy:()=>"document-v1",historyPolicy:()=>session.core.view().historyGrouping==="typing-v1"?"typing-v1":"explicit",rangePolicy:()=>"general-v1",checkpointJson:()=>session.core.checkpointJson(),close:()=>session.close(),discardAndClose:()=>session.discardAndClose()};
 }
}
