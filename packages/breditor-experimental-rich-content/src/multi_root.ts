/**
 * Multiple editable roots in one editor (docs/MULTIPLE_ROOTS.md).
 *
 * Each root is an ordinary rich owner and DOM editor; one native root set owns the
 * root identities, order, attributes, the active root and the ONE global Undo order.
 * Every root dispatch is reconciled into that order synchronously; Undo/Redo from any
 * root's toolbar or keyboard runs in the root that owns the newest global unit, which
 * then takes focus. Adding, removing and moving roots and changing root attributes are
 * global Undo steps too: Undo of a removal re-mounts the same retained root owner at
 * the same position. One shared toolbar slot shows the active root's controls only.
 */
import {mountRichEditor,mountDocumentRichEditor,RichDomEditor,type RichEditorOptions} from "./controller.js";
import type {ToolbarControl} from "./actions.js";
import type {RichCommand} from "./commands.js";
import type {RichCommandOutcome,RichCoreEditor,RichCoreProfile,RichDocumentCoreEditor,RichEditorView} from "./core.js";

export interface RichRootMetaInput {readonly id:string;readonly label?:string;readonly attributes?:Readonly<Record<string,string>>}
/** Kind of the next global Undo/Redo step: a root's content unit or a set-structure step. */
export type RichRootSetStep="root"|"add"|"remove"|"move"|"attributes";
export interface RichRootSetState {
 readonly format:"breditor/rich-root-set-state";readonly formatVersion:1;readonly revision:string;readonly complete:boolean;
 readonly roots:readonly {readonly id:string;readonly label:string|null;readonly attributes:Readonly<Record<string,string>>}[];
 /** Roots detached by an undoable step that Undo/Redo can still restore; keep their owners. */
 readonly detached:readonly string[];
 readonly active:string|null;readonly undoDepth:number;readonly redoDepth:number;readonly undoTarget:string|null;readonly redoTarget:string|null;
 readonly undoStep:RichRootSetStep|null;readonly redoStep:RichRootSetStep|null;
}
export interface RichRootCheckpointPart {readonly id:string;readonly detached?:boolean;readonly history:"explicit"|"typing-v1";readonly selection:"original"|"document-v1";readonly checkpoint:string}
/** `undoable` makes the change one global Undo step; `revision` (from `state()`) refuses a stale request. */
export interface RichRootChangeOptions {readonly undoable?:boolean;readonly revision?:string}
/** Native coordinator created by `createRichRootSet(wasm)`. */
export interface RichRootSetPort {
 state():RichRootSetState;
 addRoot(meta:RichRootMetaInput,core:RichCoreEditor<"original">|RichDocumentCoreEditor,index?:number,options?:RichRootChangeOptions):RichRootSetState;
 removeRoot(id:string,options?:RichRootChangeOptions):RichRootSetState;
 /** Always one global Undo step. */
 moveRoot(id:string,index:number,revision?:string):RichRootSetState;
 /** Always one global Undo step (none when unchanged). */
 setAttributes(id:string,attributes:Readonly<Record<string,string>>,revision?:string):RichRootSetState;
 setAttribute(id:string,key:string,value:string,revision?:string):RichRootSetState;
 removeAttribute(id:string,key:string,revision?:string):RichRootSetState;
 /** Apply the next global step when `undoStep`/`redoStep` is a structure step. */
 undoStructure(revision?:string):RichRootSetState;
 redoStructure(revision?:string):RichRootSetState;
 focus(id:string):RichRootSetState;
 /** Record the root's history events since the last call; true when the set changed. */
 reconcile(id:string,core:RichCoreEditor<"original">|RichDocumentCoreEditor):boolean;
 checkpointJson(parts:readonly RichRootCheckpointPart[]):string;
 restore(envelope:string):readonly RichRootCheckpointPart[];
 attach(id:string,core:RichCoreEditor<"original">|RichDocumentCoreEditor):RichRootSetState;
 dispose():void;
}
type AnyCore=RichCoreEditor<"original">|RichDocumentCoreEditor;
export interface RichMultiRootDefinition extends RichRootMetaInput {
 readonly core:AnyCore;
 /** Restored only: a retained detached root, mounted again when Undo/Redo re-attaches it. */
 readonly detached?:boolean;
}
export interface RichMultiRootEditorOptions {
 readonly set:RichRootSetPort;
 readonly roots:readonly RichMultiRootDefinition[];
 /** Roots were restored and attached by `restoreRichRootSet`; otherwise they are added (empty history). */
 readonly restored?:boolean;
 /** Controls per root, built against the routed owner passed in (they are shown in one shared slot). */
 readonly toolbar?:(core:AnyCore)=>readonly ToolbarControl<any>[];
 /** Further per-root DOM editor options (input rules, inline presentation, ui, ...). */
 readonly editor?:(root:{readonly id:string})=>Omit<RichEditorOptions<any>,"core"|"toolbar"|"label"|"onChange">;
 readonly onChange?:(change:{readonly root:string;readonly outcome:RichCommandOutcome;readonly state:RichRootSetState})=>void;
 /** Root membership, order or attributes changed (directly or by Undo/Redo of a structure step). */
 readonly onRootsChange?:(state:RichRootSetState)=>void;
 readonly onError?:(error:unknown)=>void;
}
export interface RichMultiRootEditor {
 /** Shared toolbar slot; only the active root's toolbar is visible. */
 readonly toolbar:HTMLDivElement;
 state():RichRootSetState;
 activeRoot():string|null;
 rootIds():readonly string[];
 root(id:string):RichDomEditor<any>|undefined;
 /** Per-root Document V2 JSON (CKEditor `getData({rootName})`). */
 getData(id:string):string;
 undo():RichCommandOutcome|"queued";
 redo():RichCommandOutcome|"queued";
 /** Add a root (default: one global Undo step; `{undoable:false}` composes it outside history). */
 addRoot(definition:RichMultiRootDefinition,index?:number,options?:RichRootChangeOptions):RichDomEditor<any>;
 /**
  * Detach a root and return its final document and checkpoint. By default this is one
  * global Undo step: the surface unmounts, the owner is retained, and Undo re-mounts it
  * with the same id, position, document and history. `{undoable:false}` disposes it.
  */
 removeRoot(id:string,options?:RichRootChangeOptions):{readonly documentJson:string;readonly checkpointJson:string};
 /** Move a root to `index` in set order (one global Undo step). */
 moveRoot(id:string,index:number,options?:{readonly revision?:string}):RichRootSetState;
 /** Replace a root's attributes (one global Undo step). */
 setAttributes(id:string,attributes:Readonly<Record<string,string>>,options?:{readonly revision?:string}):RichRootSetState;
 setAttribute(id:string,key:string,value:string,options?:{readonly revision?:string}):RichRootSetState;
 removeAttribute(id:string,key:string,options?:{readonly revision?:string}):RichRootSetState;
 checkpointJson():string;
 dispose():void;
}

const styles=`[data-breditor-multi-root] .breditor-rich-toolbar[hidden]{display:none}[data-breditor-multi-root]>.breditor-rich-roots{display:grid;gap:12px}`;
const kindOf=(command:string|RichCommand):string|undefined=>{
 if(typeof command!=="string")return (command as {kind?:string}).kind;
 try{return (JSON.parse(command) as {kind?:string}).kind;}catch{return undefined;}
};
const historyPart=(core:AnyCore):Omit<RichRootCheckpointPart,"id">=>{
 const view=core.view() as RichEditorView<any>;
 return {history:view.historyGrouping==="typing-v1"?"typing-v1":"explicit",selection:core.selectionPolicy?.()==="document-v1"?"document-v1":"original",checkpoint:core.checkpointJson()};
};
const metaOf=(definition:RichRootMetaInput):RichRootMetaInput=>({id:definition.id,...(definition.label!==undefined?{label:definition.label}:{}),...(definition.attributes?{attributes:definition.attributes}:{})});

interface Mounted {readonly id:string;readonly core:AnyCore;readonly editor:RichDomEditor<any>;readonly element:HTMLElement;readonly lifetime:{keepCore:boolean}}

/** Mount several root surfaces sharing one toolbar slot and one native history order. */
export function mountRichMultiRootEditor(container:HTMLElement,options:RichMultiRootEditorOptions):RichMultiRootEditor {
 const {set}=options,document=container.ownerDocument,mounted=new Map<string,Mounted>();
 // Owners of detached roots that Undo/Redo can still re-attach; unmounted but alive.
 const retained=new Map<string,AnyCore>();
 let disposed=false;
 const style=document.createElement("style");style.textContent=styles;
 const toolbar=document.createElement("div");toolbar.className="breditor-rich-multi-root-toolbar";toolbar.dataset["breditorRich"]="";
 const area=document.createElement("div");area.className="breditor-rich-roots";
 container.dataset["breditorMultiRoot"]="";container.replaceChildren(style,toolbar,area);
 const report=(error:unknown):void=>{try{options.onError?.(error);}catch{/* host callbacks cannot rewind content */}};
 const live=():void=>{if(disposed)throw Error("The multi-root editor is disposed");};
 const showActive=():void=>{const active=set.state().active;for(const entry of mounted.values())entry.editor.toolbar.hidden=entry.id!==active;};
 // Released detached roots (their steps left history) are disposed here.
 const release=():void=>{const detached=new Set(set.state().detached);for(const [id,core] of retained)if(!detached.has(id)){retained.delete(id);core.dispose();}};
 const refresh=():void=>{release();for(const entry of mounted.values())entry.editor.refreshControls();showActive();};
 const reconcile=(id:string,core:AnyCore):void=>{if(set.reconcile(id,core))queueMicrotask(()=>{if(!disposed)refresh();});};
 const step=(kind:"undo"|"redo")=>{const state=set.state();return kind==="undo"?{step:state.undoStep,owner:state.undoTarget}:{step:state.redoStep,owner:state.redoTarget};};
 let history:(kind:"undo"|"redo")=>RichCommandOutcome|"queued";
 const routed=(id:string,core:AnyCore,lifetime:{keepCore:boolean}):AnyCore=>new Proxy(core,{get(target,property){
  const value=Reflect.get(target,property,target) as unknown;
  if(typeof value!=="function")return value;
  const method=value as (...args:unknown[])=>unknown;
  if(property==="execute")return (command:string|RichCommand,revision?:string):RichCommandOutcome=>{
   const kind=kindOf(command);
   if(kind==="undo"||kind==="redo"){
    const next=step(kind);
    if(next.step===null)return "unchanged";
    // A structure step or another root's unit runs after the current dispatch drains.
    if(next.step!=="root"||next.owner!==id){queueMicrotask(()=>{if(!disposed)try{history(kind);}catch(error){report(error);}});return "unchanged";}
   }
   try{return target.execute(command as never,revision);}finally{reconcile(id,target);}
  };
  if(property==="view")return ()=>{const view=target.view() as RichEditorView<any>,state=set.state();return {...view,undoDepth:state.undoDepth,redoDepth:state.redoDepth};};
  // Unmounting a detached root disposes its DOM editor but keeps the owner for Undo.
  if(property==="dispose")return ()=>{if(!lifetime.keepCore)target.dispose();};
  if(typeof property!=="string"||property.startsWith("supports")||property==="selectionPolicy"||property==="richLanguageVersion")return method.bind(target);
  return (...args:unknown[])=>{try{return method.apply(target,args);}finally{reconcile(id,target);}};
 }});
 const mount=(definition:RichMultiRootDefinition,index?:number):Mounted=>{
  if(mounted.has(definition.id))throw Error("Duplicate root id");
  const element=document.createElement("section");element.dataset["breditorRoot"]=definition.id;
  const host=document.createElement("div");element.append(host);
  const lifetime={keepCore:false},core=routed(definition.id,definition.core,lifetime);
  const extra=options.editor?.({id:definition.id})??{};
  const common={...extra,core,label:definition.label,toolbar:options.toolbar?.(core),onChange:(_view:unknown,outcome:RichCommandOutcome)=>{try{options.onChange?.({root:definition.id,outcome,state:set.state()});}catch(error){report(error);}}};
  const editor=(definition.core.selectionPolicy?.()==="document-v1"?mountDocumentRichEditor(host,{...common,selectionEditing:"document-v1"} as never):mountRichEditor(host,common as never)) as RichDomEditor<any>;
  editor.toolbar.remove();toolbar.append(editor.toolbar);
  editor.surface.addEventListener("focusin",()=>{try{if(set.state().active!==definition.id){set.focus(definition.id);refresh();}}catch(error){report(error);}});
  const before=index===undefined?null:area.children[index]??null;area.insertBefore(element,before);
  const entry={id:definition.id,core:definition.core,editor,element,lifetime};mounted.set(definition.id,entry);return entry;
 };
 const unmount=(entry:Mounted,keepCore:boolean):void=>{
  entry.lifetime.keepCore=keepCore;mounted.delete(entry.id);
  entry.editor.toolbar.remove();entry.editor.dispose();entry.element.remove();
  if(keepCore)retained.set(entry.id,entry.core);
 };
 const focusActive=():void=>{const active=set.state().active;if(active!==null)mounted.get(active)?.editor.surface.focus();};
 // Mount/unmount/reorder surfaces to match the native set (after any structure change).
 const sync=(focus:boolean):void=>{
  const state=set.state(),attached=new Set(state.roots.map(root=>root.id));
  const hadFocus=container.contains(document.activeElement);
  for(const entry of [...mounted.values()])if(!attached.has(entry.id))unmount(entry,true);
  for(const root of state.roots){
   const core=retained.get(root.id);
   if(!mounted.has(root.id)&&core){retained.delete(root.id);mount({id:root.id,core,...(root.label!==null?{label:root.label}:{})});}
  }
  const order=state.roots.map(root=>mounted.get(root.id)?.element).filter((element):element is HTMLElement=>element!==undefined);
  if(order.some((element,index)=>area.children[index]!==element))for(const element of order)area.append(element);
  refresh();
  if(focus||hadFocus)focusActive();
  try{options.onRootsChange?.(state);}catch(error){report(error);}
 };
 for(const definition of options.roots){
  if(definition.detached){
   if(!options.restored)throw Error("Only restored roots can be detached");
   retained.set(definition.id,definition.core);continue;
  }
  if(!options.restored)set.addRoot(metaOf(definition),definition.core);
  mount(definition);
 }
 if(!set.state().complete)throw Error("Attach every restored root before mounting");
 refresh();
 const require=(id:string):Mounted=>{const entry=mounted.get(id);if(!entry)throw Error("Unknown root");return entry;};
 history=(kind:"undo"|"redo"):RichCommandOutcome|"queued"=>{
  live();const next=step(kind);
  if(next.step===null||next.owner===null)return "unchanged";
  if(next.step!=="root"){if(kind==="undo")set.undoStructure();else set.redoStructure();sync(true);return kind;}
  return require(next.owner).editor.execute({kind} as RichCommand,true);
 };
 const changed=(state:RichRootSetState):RichRootSetState=>{refresh();try{options.onRootsChange?.(state);}catch(error){report(error);}return state;};
 return {
  toolbar,
  state:()=>set.state(),
  activeRoot:()=>set.state().active,
  rootIds:()=>set.state().roots.map(root=>root.id),
  root:id=>mounted.get(id)?.editor,
  getData:id=>{live();return require(id).core.documentJson();},
  undo:()=>history("undo"),
  redo:()=>history("redo"),
  addRoot(definition,index,change){
   live();const undoable=change?.undoable??true;
   set.addRoot(metaOf(definition),definition.core,index,{undoable,...(change?.revision!==undefined?{revision:change.revision}:{})});
   const entry=mount(definition,index);sync(false);return entry.editor;
  },
  removeRoot(id,change){
   live();const entry=require(id),undoable=change?.undoable??true;
   const data={documentJson:entry.core.documentJson(),checkpointJson:entry.core.checkpointJson()};
   set.removeRoot(id,{undoable,...(change?.revision!==undefined?{revision:change.revision}:{})});
   if(!undoable)unmount(entry,false);
   sync(false);return data;
  },
  moveRoot(id,index,change){live();set.moveRoot(id,index,change?.revision);sync(false);return set.state();},
  setAttributes(id,attributes,change){live();return changed(set.setAttributes(id,attributes,change?.revision));},
  setAttribute(id,key,value,change){live();return changed(set.setAttribute(id,key,value,change?.revision));},
  removeAttribute(id,key,change){live();return changed(set.removeAttribute(id,key,change?.revision));},
  checkpointJson(){
   live();const state=set.state();
   const detached=(id:string):AnyCore=>{const core=retained.get(id);if(!core)throw Error("Unknown detached root");return core;};
   return set.checkpointJson([...state.roots.map(root=>({...historyPart(require(root.id).core),id:root.id})),...state.detached.map(id=>({...historyPart(detached(id)),id,detached:true}))]);
  },
  dispose(){if(disposed)return;disposed=true;for(const entry of mounted.values())entry.editor.dispose();mounted.clear();for(const core of retained.values())core.dispose();retained.clear();set.dispose();container.replaceChildren();delete container.dataset["breditorMultiRoot"];},
 };
}

/** Restore every root (detached ones too) with its own codec family, then attach and verify it. */
export function restoreRichRootSet(set:RichRootSetPort,profile:RichCoreProfile,envelope:string):RichMultiRootDefinition[] {
 const parts=set.restore(envelope),roots:RichMultiRootDefinition[]=[];
 try{
  for(const part of parts){
   let core:AnyCore;
   if(part.selection==="document-v1"){
    const restore=part.history==="typing-v1"?profile.restoreDocumentTypingEditor:profile.restoreDocumentEditor;
    if(!restore)throw Error("Use a profile with document-selection recovery");core=restore.call(profile,part.checkpoint);
   }else if(part.history==="typing-v1"){
    if(!profile.restoreTypingEditor)throw Error("Use a profile with typing-history recovery");core=profile.restoreTypingEditor(part.checkpoint) as AnyCore;
   }else core=profile.restoreEditor(part.checkpoint) as AnyCore;
   roots.push({id:part.id,core,...(part.detached?{detached:true}:{})});
   set.attach(part.id,core);
  }
 }catch(error){for(const root of roots)root.core.dispose();throw error;}
 const state=set.state();
 return roots.map(root=>{if(root.detached)return root;const meta=state.roots.find(entry=>entry.id===root.id)!;return {...root,...(meta.label!==null?{label:meta.label}:{}),attributes:meta.attributes};});
}
