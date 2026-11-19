// Opt-in block drag handle for SharedDomEditor. The handle, pointer/keyboard UI and planner are shared
// with the local rich editor through a small host port; this adapter only lowers each accepted move
// to one guarded `move_block` dispatch through the editor queue, so the retained block ID moves (never
// copy/delete), Rust validates the complete group, and one dispatch is one native Undo step. Rejected
// or stale targets publish nothing.
import {mountRichBlockDragPort,richBlockDragStyles,type RichPresentationModel} from "@breditor/experimental-rich-content/rendering";
import type {SharedDomEditor} from "./controller.js";
import type {SharedSelectionPolicy} from "./types.js";
import {sharedPresentationModel} from "./document_presentation.js";
import type {SharedBlockDropTarget,SharedBlockMovePolicy,SharedBlockMoveRejection} from "./block_move.js";

export interface SharedBlockDragOptions {
 /** Default `sibling-v1`; `flow-v1` additionally offers grammar-legal cross-container drops. */
 policy?:SharedBlockMovePolicy;
 /** Accessible handle label; overrides the editor catalog's blockDragLabel. Announcements use `editor.uiLocale()`. */
 label?:string;
 /** Reserve Alt+Shift+ArrowUp/ArrowDown inside the editor to move the caret's block (default true). On macOS
  * this replaces the native Option+Shift+Up/Down "extend selection to paragraph" shortcut; pass false to keep
  * it. The same keys on the focused handle always work. */
 editorShortcut?:boolean;
 /** Called after Rust accepted one move publication. */
 onMove?:(event:{block:string;parent:string|null;before:string|null;source:"pointer"|"keyboard"})=>void;
 /** Called when a pointer drop or keyboard request is refused before or by native admission. */
 onReject?:(event:{block:string;reason:SharedBlockMoveRejection|"native"})=>void;
}
export interface SharedBlockDrag {
 readonly layer:HTMLDivElement;readonly handle:HTMLButtonElement;readonly indicator:HTMLDivElement;
 /** Block currently owning the handle, or null when hidden. */
 activeBlock():string|null;
 /** Programmatic equivalent of a drop. Returns true when Rust accepted one move. */
 move(block:string,target:SharedBlockDropTarget):boolean;
 /** Programmatic equivalent of Alt+Shift+ArrowUp/ArrowDown. */
 step(block:string,direction:-1|1):boolean;
 dispose():void;
}

export const sharedBlockDragStyles=richBlockDragStyles;

export function mountSharedBlockDrag<P extends SharedSelectionPolicy>(editor:SharedDomEditor<P>,options:SharedBlockDragOptions={}):SharedBlockDrag{
 let cached:{revision:string;model:RichPresentationModel}|undefined;
 return mountRichBlockDragPort({
  surface:editor.surface,anchor:editor.status,
  model(){const view=editor.view();if(cached?.revision!==view.revision){const family=(view.format==="breditor/shared-document-view"?"document-v1":"original") as P;cached={revision:view.revision,model:sharedPresentationModel<P>(view,family)};}return cached.model;},
  revision:()=>editor.view().revision,
  state:()=>editor.contextUiState(),
  closeTypingGroup(){if(editor.view().historyGrouping==="typing-v1")editor.closeTypingGroup();},
  dispatch(move,focus,revision){editor.execute({commands:[{kind:"move_block",data:{block:move.block,parent:move.parent,before:move.before}}]},focus,revision);},
  focus:()=>editor.focus(),
  uiLocale:()=>editor.uiLocale(),
 },options);
}
