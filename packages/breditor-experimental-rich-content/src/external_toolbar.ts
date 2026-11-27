/**
 * Decoupled ("external") toolbar: the coordinator's own fixed toolbar element, with the widgets it admitted at
 * construction, moved into a host-provided container outside the editor root (docs/EDITOR_SHELL.md, "External
 * toolbar container"). Nothing is re-created or copied: the same widgets keep their Rust-derived state, command
 * path, focus return and Undo boundaries. This module only validates the container, moves the element and adds the
 * Alt+F10 / Escape keyboard bridge that the separated layout needs.
 */
import {registerRichPresentationShortcut} from "./shortcut_registry.js";
import type {RichUiLocale} from "./ui_locale.js";
import type {RichContextUiHost} from "./context_ui_types.js";

export interface RichExternalToolbarState {
 /** False after `dispose()`, a re-mount elsewhere or editor disposal. */
 readonly mounted:boolean;
}
export interface RichExternalToolbar {
 /** The host-provided container. */
 readonly container:HTMLElement;
 /** The wrapper inserted into `container`; it holds the editor's toolbar element while mounted. */
 readonly element:HTMLElement;
 state():RichExternalToolbarState;
 /** Move keyboard focus to the first enabled control (also Alt+F10 in the editor). False when none is enabled. */
 focus():boolean;
 /** Put the toolbar back in the editor root and remove the wrapper. Idempotent; editor disposal does it too. */
 dispose():void;
}
/** @internal Wrapper marker; a container holding one is owned by that wrapper's editor. */
export const richExternalToolbarMarker="breditorExternalToolbar";
const editorSelector="[data-breditor-rich],[data-breditor-shared],[data-breditor-external-toolbar],[data-breditor-multi-root]";
/**
 * Validate a host toolbar container for the editor mounted (or about to be mounted) in `root`: an element of the
 * same document, connected, outside the editor root, outside any editable content and any other editor, and not
 * already holding another editor's toolbar. Throws `TypeError` for a non-element and `Error` otherwise.
 */
export function checkRichToolbarContainer(container:unknown,root:HTMLElement):asserts container is HTMLElement{
 const node=container as Partial<HTMLElement>|null;
 if(typeof container!=="object"||node===null||node.nodeType!==1||typeof node.closest!=="function"||typeof node.querySelector!=="function")throw new TypeError("Expected an HTMLElement toolbar container");
 const element=container as HTMLElement;
 if(element.ownerDocument!==root.ownerDocument)throw Error("The toolbar container must be in the editor's document");
 if(!element.isConnected)throw Error("The toolbar container must be connected to the document");
 if(element===root||root.contains(element))throw Error("The toolbar container must be outside the editor root");
 if(element.closest('[contenteditable]:not([contenteditable="false"])'))throw Error("The toolbar container must not be inside editable content");
 if(element.closest(editorSelector))throw Error("The toolbar container must not be inside another editor");
 if(element.querySelector(":scope>[data-breditor-external-toolbar]"))throw Error("The toolbar container already holds another editor's toolbar");
}
/** @internal Used by the local and shared DOM coordinators' `mountToolbar`. */
export function attachRichExternalToolbar(params:{
 readonly root:HTMLElement;readonly surface:HTMLElement;readonly toolbar:HTMLElement;
 /** The coordinator's root attribute, so its scoped toolbar styles apply inside the wrapper. */
 readonly attribute:"breditorRich"|"breditorShared";
 readonly ui:RichUiLocale;readonly editor:AbortSignal;readonly container:unknown;
 /** The root child the toolbar is put back in front of (the surface or its placeholder wrapper). */
 anchor():Node;focusEditor():void;onDispose():void;
}):RichExternalToolbar{
 const {root,surface,toolbar,editor}=params;
 if(editor.aborted)throw Error("The editor is disposed");
 checkRichToolbarContainer(params.container,root);
 const container=params.container;
 if(toolbar.parentNode!==root)throw Error("The editor toolbar is not in its editor root");
 const d=root.ownerDocument,element=d.createElement("div"),abort=new AbortController(),signal=abort.signal;
 element.className="breditor-external-toolbar";element.dataset[richExternalToolbarMarker]="";element.dataset[params.attribute]="";
 const items=():HTMLElement[]=>[...toolbar.querySelectorAll<HTMLElement>("[data-rich-control],[data-shared-control]")].map(control=>control.tagName==="DETAILS"?control.querySelector<HTMLElement>(":scope>summary")??control:control.querySelector<HTMLElement>(":scope>button")??control);
 const usable=(item:HTMLElement):boolean=>item instanceof HTMLButtonElement?!item.disabled&&!item.hidden:item.getAttribute("aria-disabled")!=="true";
 const focusFirst=():boolean=>{if(disposed)return false;const item=items().find(candidate=>usable(candidate)&&!candidate.closest("[hidden]"));if(!item)return false;item.focus({preventScroll:true});return true;};
 let disposed=false;
 const shortcuts=[registerRichPresentationShortcut(surface,{id:"ui:editor-toolbar",group:"interface",label:params.ui.text("shortcutFocusEditorToolbar"),keys:[{key:"F10",alt:true}]}),registerRichPresentationShortcut(surface,{id:"ui:escape",group:"interface",label:params.ui.text("shortcutLeaveUi"),keys:[{key:"Escape"}]})];
 const dispose=():void=>{
  if(disposed)return;disposed=true;abort.abort();for(const release of shortcuts)release();
  const active=d.activeElement,focused=!!active&&element.contains(active);
  if(!editor.aborted&&toolbar.parentNode===element){const anchor=params.anchor();root.insertBefore(toolbar,anchor.parentNode===root?anchor:null);}
  element.remove();
  try{params.onDispose();}finally{if(focused&&!editor.aborted)params.focusEditor();}
 };
 element.append(toolbar);container.append(element);
 editor.addEventListener("abort",dispose,{signal});
 // Bubble phase on the root: the floating selection toolbar and the block menu handle Alt+F10 on the surface first
 // and prevent it while they are visible, so the chord reaches this toolbar only when neither is showing.
 root.addEventListener("keydown",event=>{
  if(event.defaultPrevented||event.isComposing||event.key!=="F10"||!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  if(focusFirst())event.preventDefault();
 },{signal});
 // Field forms handle (and prevent) their own Escape; anywhere else in the toolbar it returns to the text.
 element.addEventListener("keydown",event=>{if(event.defaultPrevented||event.isComposing||event.key!=="Escape")return;event.preventDefault();params.focusEditor();},{signal});
 return Object.freeze({container,element,state:()=>Object.freeze({mounted:!disposed}),focus:focusFirst,dispose});
}
/**
 * Mount the editor's standard toolbar into a host container (a "decoupled" layout). The host must implement
 * `mountToolbar` (every local, document, shared and shared-document DOM coordinator does). One external mount per
 * editor: dispose it before mounting into another container.
 */
export function mountRichExternalToolbar(host:RichContextUiHost,container:HTMLElement):RichExternalToolbar{
 if(typeof host?.mountToolbar!=="function")throw new TypeError("This editor cannot mount its toolbar into an external container");
 return host.mountToolbar(container);
}
/** Scoped to the wrapper: a separate toolbar is a complete box, not the top of the editor frame. */
export const richExternalToolbarStyles=`[data-breditor-external-toolbar]{max-width:none;margin:0}[data-breditor-external-toolbar]>[role=toolbar]{border-radius:10px}`;
