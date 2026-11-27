/** Stable editor objects over a crash supervisor: every call reaches the current native owner. */
import type {RichAssetStore,AssetInfo,FlowPosition,RichView,RichDocumentView,RichSearchHost,RichRestrictedPolicy} from "@breditor/experimental-rich-content";
import type {LocalEditor} from "./local.js";
import type {LocalDocumentEditor} from "./local_document.js";
import type {CrashRecoveryHost,CrashRecoveryState,CrashSupervisor} from "./crash_recovery.js";
/** Live host policy reapplied to a restarted owner (restored owners start editable). */
export interface RecoveryPolicy {readOnly:boolean|undefined;restricted:{readonly policy:RichRestrictedPolicy}|undefined}
export interface RecoverableLocalEditor extends LocalEditor,CrashRecoveryHost {}
export interface RecoverableLocalDocumentEditor extends LocalDocumentEditor,CrashRecoveryHost {}
abstract class RecoverableOwner<O extends LocalEditor|LocalDocumentEditor> implements CrashRecoveryHost {
 protected readonly supervisor:CrashSupervisor<O>;protected readonly policy:RecoveryPolicy;
 constructor(supervisor:CrashSupervisor<O>,policy:RecoveryPolicy){this.supervisor=supervisor;this.policy=policy;}
 /** The current owner's nodes; after a restart these are new elements in the same host. */
 get surface():HTMLDivElement{return this.supervisor.last.surface;}
 get toolbar():HTMLDivElement{return this.supervisor.last.toolbar;}
 get status():HTMLParagraphElement{return this.supervisor.last.status;}
 recovery():CrashRecoveryState{return this.supervisor.state();}
 verifiedCheckpointJson():string{return this.supervisor.verifiedCheckpointJson();}
 checkpointJson():string{return this.supervisor.checkpointJson();}
 execute(...args:Parameters<LocalEditor["execute"]>):ReturnType<LocalEditor["execute"]>{return this.supervisor.call(owner=>owner.execute(...args));}
 supportsRetainedAssetReferences():boolean{return this.supervisor.call(owner=>owner.supportsRetainedAssetReferences());}
 retainedAssetReferences(...args:Parameters<LocalEditor["retainedAssetReferences"]>):ReturnType<LocalEditor["retainedAssetReferences"]>{return this.supervisor.call(owner=>owner.retainedAssetReferences(...args));}
 checkRetainedAssetReferences(...args:Parameters<LocalEditor["checkRetainedAssetReferences"]>):void{this.supervisor.call(owner=>owner.checkRetainedAssetReferences(...args));}
 writing():ReturnType<LocalEditor["writing"]>{return this.supervisor.call(owner=>owner.writing());}
 fullscreen():ReturnType<LocalEditor["fullscreen"]>{return this.supervisor.call(owner=>owner.fullscreen());}
 contextUi():ReturnType<LocalEditor["contextUi"]>{return this.supervisor.call(owner=>owner.contextUi());}
 search():RichSearchHost{return this.supervisor.call(owner=>owner.search());}
 setPlaceholderLabel(label:string|null):void{this.supervisor.setPlaceholderLabel(label);}
 uiLocale():ReturnType<LocalEditor["uiLocale"]>{return this.supervisor.call(owner=>owner.uiLocale());}
 supportsTriggerComposite():boolean{return this.supervisor.call(owner=>owner.supportsTriggerComposite());}
 supportsCommandGroup():boolean{return this.supervisor.call(owner=>owner.supportsCommandGroup());}
 focus():void{this.supervisor.call(owner=>owner.focus());}
 refreshAssets():void{this.supervisor.call(owner=>owner.refreshAssets());}
 setReadOnly(value:boolean,revision?:string):boolean{const changed=this.supervisor.call(owner=>owner.setReadOnly(value,revision));this.policy.readOnly=value;return changed;}
 setRestrictedEditing(policy:RichRestrictedPolicy|null,revision?:string):boolean{
  const changed=this.supervisor.call(owner=>owner.setRestrictedEditing(policy,revision));
  this.policy.restricted=policy===null?undefined:{policy:{editable:[...policy.editable]}};return changed;
 }
 navigateRestrictedRegion(...args:Parameters<LocalEditor["navigateRestrictedRegion"]>):ReturnType<LocalEditor["navigateRestrictedRegion"]>{return this.supervisor.call(owner=>owner.navigateRestrictedRegion(...args));}
 closeTypingGroup(revision?:string):boolean{return this.supervisor.call(owner=>owner.closeTypingGroup(revision));}
 /** Idempotent. Cancels a pending restart; a crashed owner's native free failure is not rethrown. */
 dispose():void{this.supervisor.dispose();}
}
export class RecoverableLocalOwner extends RecoverableOwner<LocalEditor> implements RecoverableLocalEditor {
 view():RichView{return this.supervisor.view(owner=>owner.view());}
 insertImageFiles(store:RichAssetStore,files:readonly File[],position:FlowPosition):Promise<readonly AssetInfo[]>{return this.supervisor.callAsync(owner=>owner.insertImageFiles(store,files,position));}
}
export class RecoverableDocumentOwner extends RecoverableOwner<LocalDocumentEditor> implements RecoverableLocalDocumentEditor {
 selectionPolicy():"document-v1"{return "document-v1";}
 view():RichDocumentView{return this.supervisor.view(owner=>owner.view());}
 selectDocument(...args:Parameters<LocalDocumentEditor["selectDocument"]>):ReturnType<LocalDocumentEditor["selectDocument"]>{return this.supervisor.call(owner=>owner.selectDocument(...args));}
 replaceDocumentPlainText(...args:Parameters<LocalDocumentEditor["replaceDocumentPlainText"]>):ReturnType<LocalDocumentEditor["replaceDocumentPlainText"]>{return this.supervisor.call(owner=>owner.replaceDocumentPlainText(...args));}
 pasteDocumentClipboard(...args:Parameters<LocalDocumentEditor["pasteDocumentClipboard"]>):ReturnType<LocalDocumentEditor["pasteDocumentClipboard"]>{return this.supervisor.call(owner=>owner.pasteDocumentClipboard(...args));}
 collapseDocumentSelection(...args:Parameters<LocalDocumentEditor["collapseDocumentSelection"]>):ReturnType<LocalDocumentEditor["collapseDocumentSelection"]>{return this.supervisor.call(owner=>owner.collapseDocumentSelection(...args));}
 source():ReturnType<LocalDocumentEditor["source"]>{return this.supervisor.call(owner=>owner.source());}
}
