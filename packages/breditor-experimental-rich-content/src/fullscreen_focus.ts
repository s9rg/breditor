import type {RichFullscreenHost} from "./fullscreen_types.js";
/** @internal DOM focus is a presentation bookmark, never a native selection snapshot. */
export interface FullscreenFocus {readonly node:HTMLElement;readonly revision:string;readonly field?:{readonly value:string;readonly start:number|null;readonly end:number|null;readonly direction:"forward"|"backward"|"none"|null};moved:boolean}
export function captureFullscreenFocus(host:RichFullscreenHost,target:HTMLElement):FullscreenFocus|null {
 const d=target.ownerDocument,realm=d.defaultView,node=d.activeElement,state=host.fullscreenState();
 if(!realm||!(node instanceof realm.HTMLElement)||!target.contains(node)||!node.isConnected||state.closed||state.busy||state.composing)return null;
 const field=node instanceof realm.HTMLInputElement||node instanceof realm.HTMLTextAreaElement?{value:node.value,start:node.selectionStart,end:node.selectionEnd,direction:node.selectionDirection}:undefined;
 return {node,revision:state.revision,moved:false,...(field?{field}:{})};
}
export function restoreFullscreenFocus(host:RichFullscreenHost,target:HTMLElement,focus:FullscreenFocus|null):void {
 if(!focus||focus.moved||!focus.node.isConnected||!target.contains(focus.node))return;
 const state=host.fullscreenState(),d=target.ownerDocument,active=d.activeElement;
 if(state.closed||state.busy||state.composing||state.revision!==focus.revision||active!==focus.node&&active!==d.body&&active!==d.documentElement&&active!==target&&active!==null)return;
 if(focus.node===host.surface){host.focusFullscreen(focus.revision);return;}
 const realm=d.defaultView,field=focus.field;
 if(field&&realm&&(focus.node instanceof realm.HTMLInputElement||focus.node instanceof realm.HTMLTextAreaElement)){
  const node=focus.node;
  // A host field can change without publishing the document. Never rewind its edit/caret.
  if(node.value!==field.value||node.selectionStart!==field.start||node.selectionEnd!==field.end||node.selectionDirection!==field.direction)return;
  node.focus({preventScroll:true});return;
 }
 focus.node.focus({preventScroll:true});
}
