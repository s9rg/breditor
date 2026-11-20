import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement} from "react";
export {BreditorFullscreenControls,type BreditorFullscreenControlsProps,type BreditorFullscreenControlsHandle} from "./fullscreen_react.js";
export {BreditorSelectionToolbar,BreditorContextMenu,type BreditorSelectionToolbarProps,type BreditorSelectionToolbarHandle,type BreditorContextMenuProps,type BreditorContextMenuHandle} from "./context_ui_react.js";
import {openSharedEditor,openSharedSearchEditor,type SharedEditorSession,type SharedEditorSessionOptions,type SharedSearchEditorSessionOptions} from "./shared_session.js";
import {SharedEditorOpenError,type SharedEditorRecovery} from "./shared_open_error.js";
import type {SharedDispatch,SharedPublication,SharedSaveState,RichClipboardTextProjection} from "@breditor/collaboration";
import type {RichClipboardInterchangeReport} from "@breditor/experimental-rich-content";
export {BreditorSharedDocumentEditor,BreditorSharedDocumentSearchEditor,type BreditorSharedDocumentEditorProps,type BreditorSharedDocumentSearchEditorProps,type BreditorSharedDocumentEditorHandle} from "./shared_document_react.js";
export {BreditorSharedReviewPanel,type BreditorSharedReviewPanelProps,type BreditorSharedReviewPanelHandle} from "./shared_review_react.js";
export {BreditorSharedSuggestionPanel,type BreditorSharedSuggestionPanelProps,type BreditorSharedSuggestionPanelHandle} from "./shared_suggestion_react.js";
export {BreditorSearchPanel,type BreditorSearchPanelProps,type BreditorSearchPanelHandle} from "./search_react.js";
export {BreditorWritingTools,type BreditorWritingToolsProps,type BreditorWritingToolsHandle} from "./writing_tools_react.js";
export {BreditorSharedSlashCommands,type BreditorSharedSlashCommandsProps,type BreditorSharedSlashCommandsHandle} from "./shared_slash_commands_react.js";

export interface BreditorSharedEditorProps {
 initialOptions:Omit<SharedEditorSessionOptions,"host"|"signal"|"onChange"|"onError"|"onSaveState"|"onClosing">;
 sessionKey?:string;className?:string;
 readOnly?:boolean;
 onReady?:(editor:SharedEditorSession)=>void;
 onChange?:(event:SharedPublication)=>void|Promise<void>;
 onSaveState?:(state:SharedSaveState)=>void;
 onClosing?:(editor:SharedEditorSession)=>void;
 onError?:(error:unknown)=>void;
 onPasteLoss?:(report:RichClipboardTextProjection)=>void;
 onInterchange?:(report:RichClipboardInterchangeReport)=>void;
 /** Required recovery handoff, including after unmount. Keep/export this writer or explicitly discard it. */
 onCloseError:(error:unknown,editor:SharedEditorRecovery)=>void;
}
export interface BreditorSharedSearchEditorProps extends Omit<BreditorSharedEditorProps,"initialOptions"> {
 initialOptions:Omit<SharedSearchEditorSessionOptions,"host"|"signal"|"onChange"|"onError"|"onSaveState"|"onClosing">;
}
type SharedReactProps<O extends SharedEditorSessionOptions|SharedSearchEditorSessionOptions>=Omit<BreditorSharedEditorProps,"initialOptions">&{initialOptions:Omit<O,"host"|"signal"|"onChange"|"onError"|"onSaveState"|"onClosing">};
type ManagedSharedKeys="host"|"signal"|"readOnly"|"onChange"|"onError"|"onSaveState"|"onClosing"|"onPasteLoss"|"onInterchange";
type SharedReactOpening<O extends SharedEditorSessionOptions|SharedSearchEditorSessionOptions>=Omit<O,ManagedSharedKeys>&Pick<SharedEditorSessionOptions,ManagedSharedKeys>;
export interface BreditorSharedEditorHandle {
 getEditor():SharedEditorSession|null;
 getRecovery():SharedEditorRecovery|null;
 focus():void;
 checkpointJson():string|null;
 execute(request:SharedDispatch,focus?:boolean,revision?:string):void;
 setReadOnly(value:boolean,revision?:string):boolean|null;
 closeTypingGroup(revision?:string):boolean|null;
 flush():Promise<void>|null;
 retry():void;
}

/** React owns the host, not its editable children. Writer retirement is serialized with subsequent openings. */
function sharedReactEditor<O extends SharedEditorSessionOptions|SharedSearchEditorSessionOptions>(open:(options:SharedReactOpening<O>)=>Promise<SharedEditorSession>){return forwardRef<BreditorSharedEditorHandle,SharedReactProps<O>>(function BreditorSharedEditor(props,ref):ReactElement{
 const [host,setHost]=useState<HTMLDivElement|null>(null),[attempt,setAttempt]=useState(0),[phase,setPhase]=useState<"starting"|"ready"|"failed">("starting");
 const current=useRef<SharedEditorSession|null>(null),recovery=useRef<SharedEditorRecovery|null>(null);
 const callbacks=useRef(props),configuration=useRef(props.initialOptions),lane=useRef<Promise<void>>(Promise.resolve());
 useEffect(()=>{callbacks.current=props;configuration.current=props.initialOptions;});
 useImperativeHandle(ref,()=>({
  getEditor:()=>current.current,getRecovery:()=>recovery.current,
  focus:()=>current.current?.focus(),checkpointJson:()=>current.current?.checkpointJson()??recovery.current?.checkpointJson()??null,
  execute:(request,focus,revision)=>current.current?.execute(request,focus,revision),
  setReadOnly:(value,revision)=>current.current?.setReadOnly(value,revision)??null,
  closeTypingGroup:revision=>current.current?.closeTypingGroup(revision)??null,
  flush:()=>current.current?.flush()??null,retry:()=>{if(current.current===null)setAttempt(value=>value+1);}
 }),[]);
 useEffect(()=>{if(props.readOnly===undefined||!current.current)return;try{current.current.setReadOnly(props.readOnly);}catch(error){try{callbacks.current.onError?.(error);}catch{/* Reporting cannot rewind policy. */}}},[props.readOnly]);
 useEffect(()=>{
  if(!host)return;
  const abort=new AbortController(),initial=configuration.current;let owned:SharedEditorSession|undefined;setPhase("starting");
  const report=(error:unknown)=>{try{callbacks.current.onError?.(error);}catch{/* Reporting cannot rewind native or durable writes. */}};
  const handoff=(error:unknown,editor:SharedEditorRecovery)=>{
   recovery.current=editor;
   try{callbacks.current.onCloseError(error,editor);}catch(callbackError){report(callbackError);}
  };
  const retire=async(editor:SharedEditorRecovery)=>{
   try{await editor.close();if(recovery.current===editor)recovery.current=null;}
   catch(error){
    handoff(error,editor);
    throw error;
   }
  };
  const opening=lane.current.then(async()=>{
   if(abort.signal.aborted)return;
   try{
    // A failed old writer must close successfully before a replacement can lease that identity.
    if(recovery.current)await retire(recovery.current);
    if(abort.signal.aborted)return;
    const policy=callbacks.current.readOnly;
    // Project away React-managed fields for typing only; the initial snapshot still supplies every native policy.
    const initialFields=initial as Omit<O,ManagedSharedKeys>;
    const editor=await open({...initialFields,...(policy!==undefined?{readOnly:policy}:{}),host,signal:abort.signal,
     onChange:event=>callbacks.current.onChange?.(event),onPasteLoss:loss=>(callbacks.current.onPasteLoss??initial.onPasteLoss)?.(loss),onInterchange:value=>(callbacks.current.onInterchange??initial.onInterchange)?.(value),
     onSaveState:state=>callbacks.current.onSaveState?.(state),onClosing:editor=>callbacks.current.onClosing?.(editor),onError:report});
    if(abort.signal.aborted){await retire(editor);return;}
    try{if(callbacks.current.readOnly!==undefined)editor.setReadOnly(callbacks.current.readOnly);}catch(error){await retire(editor);throw error;}
    owned=editor;current.current=editor;setPhase("ready");
    try{callbacks.current.onReady?.(editor);}catch(error){report(error);}
   }catch(error){
    if(error instanceof SharedEditorOpenError)handoff(error,error.recovery);
    if(!abort.signal.aborted){setPhase("failed");report(error);}
   }
  });
  lane.current=opening.catch(report);
  return ()=>{
   abort.abort();if(current.current===owned)current.current=null;
   // Waiting also covers a factory that settles after cleanup; it cannot become an announced owner.
   lane.current=lane.current.then(async()=>{const editor=owned;owned=undefined;if(editor)await retire(editor);}).catch(report);
  };
 },[host,props.sessionKey,attempt]);
 return <section className={props.className} data-breditor-phase={phase} aria-busy={phase==="starting"}>
  <div ref={setHost}/>
  {phase==="failed"?<p role="alert">The shared editor could not start. <button type="button" onClick={()=>setAttempt(value=>value+1)}>Retry</button></p>:null}
 </section>;
});}
export const BreditorSharedEditor=sharedReactEditor<SharedEditorSessionOptions>(openSharedEditor);
/** Explicit search-family startup; ordinary React renders cannot change a live writer's replay family. */
export const BreditorSharedSearchEditor=sharedReactEditor<SharedSearchEditorSessionOptions>(openSharedSearchEditor);
BreditorSharedSearchEditor.displayName="BreditorSharedSearchEditor";
