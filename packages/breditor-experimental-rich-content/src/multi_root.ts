/**
 * Multiple editable roots in one editor (docs/MULTIPLE_ROOTS.md).
 *
 * Each root is an ordinary rich owner and DOM editor; one native root set owns the
 * root identities, order, attributes, the active root and the ONE global Undo order.
 * Every root dispatch is reconciled into that order synchronously; Undo/Redo from any
 * root's toolbar or keyboard runs in the root that owns the newest global unit, which
 * then takes focus. One shared toolbar slot shows the active root's controls only.
 */
import {mountRichEditor,mountDocumentRichEditor,RichDomEditor,type RichEditorOptions} from "./controller.js";
import type {ToolbarControl} from "./actions.js";
import type {RichCommand} from "./commands.js";
import type {RichCommandOutcome,RichCoreEditor,RichCoreProfile,RichDocumentCoreEditor,RichEditorView} from "./core.js";

export interface RichRootMetaInput {readonly id:string;readonly label?:string;readonly attributes?:Readonly<Record<string,string>>}
export interface RichRootSetState {
 readonly format:"breditor/rich-root-set-state";readonly formatVersion:1;readonly revision:string;readonly complete:boolean;
 readonly roots:readonly {readonly id:string;readonly label:string|null;readonly attributes:Readonly<Record<string,string>>}[];
 readonly active:string|null;readonly undoDepth:number;readonly redoDepth:number;readonly undoTarget:string|null;readonly redoTarget:string|null;
}
export interface RichRootCheckpointPart {readonly id:string;readonly history:"explicit"|"typing-v1";readonly selection:"original"|"document-v1";readonly checkpoint:string}
/** Native coordinator created by `createRichRootSet(wasm)`. */
export interface RichRootSetPort {
 state():RichRootSetState;
 addRoot(meta:RichRootMetaInput,core:RichCoreEditor<"original">|RichDocumentCoreEditor,index?:number):RichRootSetState;
 removeRoot(id:string):RichRootSetState;
 setAttributes(id:string,attributes:Readonly<Record<string,string>>):RichRootSetState;
 focus(id:string):RichRootSetState;
 /** Record the root's history events since the last call; true when the set changed. */
 reconcile(id:string,core:RichCoreEditor<"original">|RichDocumentCoreEditor):boolean;
 checkpointJson(parts:readonly RichRootCheckpointPart[]):string;
 restore(envelope:string):readonly RichRootCheckpointPart[];
 attach(id:string,core:RichCoreEditor<"original">|RichDocumentCoreEditor):RichRootSetState;
 dispose():void;
}
type AnyCore=RichCoreEditor<"original">|RichDocumentCoreEditor;
export interface RichMultiRootDefinition extends RichRootMetaInput {readonly core:AnyCore}
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
 addRoot(definition:RichMultiRootDefinition,index?:number):RichDomEditor<any>;
 /** Detach a root (not an Undo unit); returns its final document and checkpoint, then disposes it. */
 removeRoot(id:string):{readonly documentJson:string;readonly checkpointJson:string};
 setAttributes(id:string,attributes:Readonly<Record<string,string>>):RichRootSetState;
 checkpointJson():string;
 dispose():void;
}

const styles=`[data-breditor-multi-root] .breditor-rich-toolbar[hidden]{display:none}[data-breditor-multi-root]>.breditor-rich-roots{display:grid;gap:12px}`;
const kindOf=(command:string|RichCommand):string|undefined=>{
 if(typeof command!=="string")return (command as {kind?:string}).kind;
 try{return (JSON.parse(command) as {kind?:string}).kind;}catch{return undefined;}
};
const historyPart=(core:AnyCore):RichRootCheckpointPart=>{
 const view=core.view() as RichEditorView<any>;
 return {id:"",history:view.historyGrouping==="typing-v1"?"typing-v1":"explicit",selection:core.selectionPolicy?.()==="document-v1"?"document-v1":"original",checkpoint:core.checkpointJson()};
};

interface Mounted {readonly id:string;readonly core:AnyCore;readonly editor:RichDomEditor<any>;readonly element:HTMLElement}

/** Mount several root surfaces sharing one toolbar slot and one native history order. */
export function mountRichMultiRootEditor(container:HTMLElement,options:RichMultiRootEditorOptions):RichMultiRootEditor {
 const {set}=options,document=container.ownerDocument,mounted=new Map<string,Mounted>();
 let disposed=false;
 const style=document.createElement("style");style.textContent=styles;
 const toolbar=document.createElement("div");toolbar.className="breditor-rich-multi-root-toolbar";toolbar.dataset["breditorRich"]="";
 const area=document.createElement("div");area.className="breditor-rich-roots";
 container.dataset["breditorMultiRoot"]="";container.replaceChildren(style,toolbar,area);
 const report=(error:unknown):void=>{try{options.onError?.(error);}catch{/* host callbacks cannot rewind content */}};
 const live=():void=>{if(disposed)throw Error("The multi-root editor is disposed");};
 const showActive=():void=>{const active=set.state().active;for(const entry of mounted.values())entry.editor.toolbar.hidden=entry.id!==active;};
 const refresh=():void=>{for(const entry of mounted.values())entry.editor.refreshControls();showActive();};
 const reconcile=(id:string,core:AnyCore):void=>{if(set.reconcile(id,core))queueMicrotask(()=>{if(!disposed)refresh();});};
 // Undo/Redo owned by another root runs there after the current dispatch drains, then focuses it.
 const route=(kind:"undo"|"redo"):string|null=>{const state=set.state();return kind==="undo"?state.undoTarget:state.redoTarget;};
 const routed=(id:string,core:AnyCore):AnyCore=>new Proxy(core,{get(target,property){
  const value=Reflect.get(target,property,target) as unknown;
  if(typeof value!=="function")return value;
  const method=value as (...args:unknown[])=>unknown;
  if(property==="execute")return (command:string|RichCommand,revision?:string):RichCommandOutcome=>{
   const kind=kindOf(command);
   if(kind==="undo"||kind==="redo"){
    const owner=route(kind);
    if(owner===null)return "unchanged";
    if(owner!==id){queueMicrotask(()=>{const other=mounted.get(owner);if(!disposed&&other)try{other.editor.execute({kind} as RichCommand,true);}catch(error){report(error);}});return "unchanged";}
   }
   try{return target.execute(command as never,revision);}finally{reconcile(id,target);}
  };
  if(property==="view")return ()=>{const view=target.view() as RichEditorView<any>,state=set.state();return {...view,undoDepth:state.undoDepth,redoDepth:state.redoDepth};};
  if(property==="dispose"||typeof property!=="string"||property.startsWith("supports")||property==="selectionPolicy"||property==="richLanguageVersion")return method.bind(target);
  return (...args:unknown[])=>{try{return method.apply(target,args);}finally{reconcile(id,target);}};
 }});
 const mount=(definition:RichMultiRootDefinition,index?:number):Mounted=>{
  if(mounted.has(definition.id))throw Error("Duplicate root id");
  const element=document.createElement("section");element.dataset["breditorRoot"]=definition.id;
  const host=document.createElement("div");element.append(host);
  const core=routed(definition.id,definition.core);
  const extra=options.editor?.({id:definition.id})??{};
  const common={...extra,core,label:definition.label,toolbar:options.toolbar?.(core),onChange:(_view:unknown,outcome:RichCommandOutcome)=>{try{options.onChange?.({root:definition.id,outcome,state:set.state()});}catch(error){report(error);}}};
  const editor=(definition.core.selectionPolicy?.()==="document-v1"?mountDocumentRichEditor(host,{...common,selectionEditing:"document-v1"} as never):mountRichEditor(host,common as never)) as RichDomEditor<any>;
  editor.toolbar.remove();toolbar.append(editor.toolbar);
  editor.surface.addEventListener("focusin",()=>{try{if(set.state().active!==definition.id){set.focus(definition.id);refresh();}}catch(error){report(error);}});
  const before=index===undefined?null:area.children[index]??null;area.insertBefore(element,before);
  const entry={id:definition.id,core:definition.core,editor,element};mounted.set(definition.id,entry);return entry;
 };
 for(const definition of options.roots){
  if(!options.restored)set.addRoot({id:definition.id,...(definition.label!==undefined?{label:definition.label}:{}),...(definition.attributes?{attributes:definition.attributes}:{})},definition.core);
  mount(definition);
 }
 if(!set.state().complete)throw Error("Attach every restored root before mounting");
 refresh();
 const require=(id:string):Mounted=>{const entry=mounted.get(id);if(!entry)throw Error("Unknown root");return entry;};
 const history=(kind:"undo"|"redo"):RichCommandOutcome|"queued"=>{live();const owner=route(kind);if(owner===null)return "unchanged";return require(owner).editor.execute({kind} as RichCommand,true);};
 return {
  toolbar,
  state:()=>set.state(),
  activeRoot:()=>set.state().active,
  rootIds:()=>set.state().roots.map(root=>root.id),
  root:id=>mounted.get(id)?.editor,
  getData:id=>{live();return require(id).core.documentJson();},
  undo:()=>history("undo"),
  redo:()=>history("redo"),
  addRoot(definition,index){live();set.addRoot({id:definition.id,...(definition.label!==undefined?{label:definition.label}:{}),...(definition.attributes?{attributes:definition.attributes}:{})},definition.core,index);const entry=mount(definition,index);refresh();return entry.editor;},
  removeRoot(id){live();const entry=require(id);const data={documentJson:entry.core.documentJson(),checkpointJson:entry.core.checkpointJson()};set.removeRoot(id);mounted.delete(id);entry.editor.dispose();entry.element.remove();refresh();return data;},
  setAttributes(id,attributes){live();return set.setAttributes(id,attributes);},
  checkpointJson(){live();return set.checkpointJson(set.state().roots.map(root=>({...historyPart(require(root.id).core),id:root.id})));},
  dispose(){if(disposed)return;disposed=true;for(const entry of mounted.values())entry.editor.dispose();mounted.clear();set.dispose();container.replaceChildren();delete container.dataset["breditorMultiRoot"];},
 };
}

/** Restore every root of a set checkpoint with its own codec family, then attach and verify it. */
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
   roots.push({id:part.id,core});
   set.attach(part.id,core);
  }
 }catch(error){for(const root of roots)root.core.dispose();throw error;}
 const state=set.state();
 return roots.map(root=>{const meta=state.roots.find(entry=>entry.id===root.id)!;return {...root,...(meta.label!==null?{label:meta.label}:{}),attributes:meta.attributes};});
}
