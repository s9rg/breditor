import type {SharedPersistentSession} from "@breditor/collaboration";

/** Readable exact state retained after a failed close, without admitting further UI editing. */
export interface SharedEditorRecovery {
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
  this.recovery={checkpointJson:()=>session.core.checkpointJson(),close:()=>session.close(),discardAndClose:()=>session.discardAndClose()};
 }
}
