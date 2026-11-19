/** Contextual presentations borrow admitted toolbar controls. They hold no document, selection or command state. */
export type RichContextSelectionKind="none"|"caret"|"text"|"node"|"grid"|"document";
export interface RichContextUiHostState {
 readonly revision:string;readonly closed:boolean;readonly busy:boolean;readonly composing:boolean;readonly readOnly:boolean;
 /** Derived from the current Rust view; "text" is a non-collapsed text range, "caret" a collapsed one. */
 readonly selection:RichContextSelectionKind;
}
/** One mounted borrowed widget. Refresh stays with the owning DOM coordinator. */
export interface RichContextControlView {readonly id:string;readonly element:HTMLElement;readonly button:HTMLButtonElement;activate():void}
/** Implemented by local, document, shared and shared-document DOM coordinators. */
export interface RichContextUiHost {
 readonly surface:HTMLElement;
 contextUiState():RichContextUiHostState;
 /** Presentation notifications after publication, selection, composition, policy or disposal changes. Listeners must not publish. */
 subscribeContextUi(listener:()=>void):()=>void;
 /** Ids of the controls admitted by this coordinator's toolbar, in toolbar order. */
 contextControlIds():readonly string[];
 /**
  * Mount the admitted control `id` into `container` with the standard toolbar's exact widget, read/enabled/read-only
  * gating, stale-draft stamp, command path and editor focus return. Removed when `signal` aborts or the editor closes.
  */
 mountContextControl(container:HTMLElement,id:string,signal:AbortSignal):RichContextControlView;
 focus():void;
}
export interface RichContextUiOptions {
 /** Explicit admitted control ids, in order. Unknown ids reject. Omitted uses the defaults present in the toolbar. */
 controls?:readonly string[];
 /** Element outside editable content that receives the fixed-position UI. Defaults to the editor root. */
 container?:HTMLElement;
 label?:string;
 onError?:(error:unknown)=>void;
}
export interface RichSelectionToolbarOptions extends RichContextUiOptions {}
export interface RichContextMenuOptions extends RichContextUiOptions {
 /** Hide controls whose Rust-derived state is disabled (default true). Disabled items are never focusable. */
 hideDisabled?:boolean;
}
export interface RichSelectionToolbarState {readonly visible:boolean;readonly disposed:boolean;readonly controls:readonly string[]}
export interface RichSelectionToolbar {
 readonly element:HTMLElement;
 state():RichSelectionToolbarState;
 /** Move keyboard focus to the first enabled control (also Alt+F10 in the editor). False when hidden. */
 focus():boolean;
 /** Dismiss until the editor publishes another revision. Returns focus to the editor when it held it. */
 dismiss():void;
 refresh():void;
 dispose():void;
}
export interface RichContextMenuState {readonly open:boolean;readonly disposed:boolean;readonly controls:readonly string[]}
export interface RichContextMenu {
 readonly element:HTMLElement;
 state():RichContextMenuState;
 /** Open at a viewport point, or at the current selection. False when nothing is enabled or the editor cannot edit. */
 open(point?:{readonly x:number;readonly y:number}):boolean;
 /** Close; `returnFocus` (default true) restores the editor selection when focus was inside the menu. */
 close(returnFocus?:boolean):void;
 dispose():void;
}
