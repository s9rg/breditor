import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement} from "react";
import {openLocalEditor,type LocalEditor,type LocalEditorOptions} from "./local.js";
import type {RichCommand,RichView,RichCommandOutcome,RichClipboardTextProjection} from "@breditor/experimental-rich-content";
import type {RichClipboardInterchangeReport} from "@breditor/experimental-rich-content";
export {BreditorDocumentEditor,type BreditorDocumentEditorProps,type BreditorDocumentEditorHandle} from "./document_react.js";
export {BreditorSearchPanel,type BreditorSearchPanelProps,type BreditorSearchPanelHandle} from "./search_react.js";
export {BreditorWritingTools,type BreditorWritingToolsProps,type BreditorWritingToolsHandle} from "./writing_tools_react.js";
export {BreditorFullscreenControls,type BreditorFullscreenControlsProps,type BreditorFullscreenControlsHandle} from "./fullscreen_react.js";
export {BreditorSlashCommands,type BreditorSlashCommandsProps,type BreditorSlashCommandsHandle} from "./slash_commands_react.js";
export {BreditorSelectionToolbar,BreditorContextMenu,type BreditorSelectionToolbarProps,type BreditorSelectionToolbarHandle,type BreditorContextMenuProps,type BreditorContextMenuHandle} from "./context_ui_react.js";
export {BreditorSourceView,type BreditorSourceViewProps,type BreditorSourceViewHandle} from "./source_view_react.js";
/** Initial configuration is applied once per sessionKey, like an uncontrolled input's defaultValue. */
export interface BreditorEditorProps {
 initialOptions?:Omit<LocalEditorOptions,"host"|"signal"|"onChange"|"onError">;
 sessionKey?:string;className?:string;
 /** Live policy updates do not recreate the native owner or reset its history. */
 readOnly?:boolean;
 onReady?:(editor:LocalEditor)=>void;
 onChange?:(view:RichView,outcome:RichCommandOutcome)=>void;
 onError?:(error:unknown)=>void;
 onPasteLoss?:(report:RichClipboardTextProjection)=>void;
 onInterchange?:(report:RichClipboardInterchangeReport)=>void;
}
export interface BreditorEditorHandle {
 getEditor():LocalEditor|null;
 focus():void;
 checkpointJson():string|null;
 execute(command:RichCommand,focus?:boolean,revision?:string):RichCommandOutcome|"queued"|null;
 setReadOnly(value:boolean,revision?:string):boolean|null;
 closeTypingGroup(revision?:string):boolean|null;
 retry():void;
}
/** Owns the original Rust/DOM coordinator. React never reconciles editable document children. */
export const BreditorEditor=forwardRef<BreditorEditorHandle,BreditorEditorProps>(function BreditorEditor(props,ref):ReactElement{
 const [host,setHost]=useState<HTMLDivElement|null>(null),[attempt,setAttempt]=useState(0),[phase,setPhase]=useState<"starting"|"ready"|"failed">("starting");
 const current=useRef<LocalEditor|null>(null),callbacks=useRef(props),configuration=useRef(props.initialOptions),lane=useRef<Promise<void>>(Promise.resolve());
 // Only the latest callbacks are read by subscriptions; a parent render must not reset Rust history.
 useEffect(()=>{callbacks.current=props;configuration.current=props.initialOptions;});
 useImperativeHandle(ref,()=>({getEditor:()=>current.current,focus:()=>current.current?.focus(),checkpointJson:()=>current.current?.checkpointJson()??null,execute:(command,focus,revision)=>current.current?.execute(command,focus,revision)??null,setReadOnly:(value,revision)=>current.current?.setReadOnly(value,revision)??null,closeTypingGroup:revision=>current.current?.closeTypingGroup(revision)??null,retry:()=>{if(current.current===null)setAttempt(value=>value+1);}}),[]);
 useEffect(()=>{if(props.readOnly===undefined||!current.current)return;try{current.current.setReadOnly(props.readOnly);}catch(error){try{callbacks.current.onError?.(error);}catch{/* Reporting cannot rewind policy. */}}},[props.readOnly]);
 useEffect(()=>{
  if(!host)return;
  const abort=new AbortController(),initial=configuration.current;let owned:LocalEditor|undefined;setPhase("starting");
  const report=(error:unknown)=>{try{callbacks.current.onError?.(error);}catch{/* Reporting cannot rewind a native publication. */}};
  const opening=lane.current.then(async()=>{
   if(abort.signal.aborted)return;
   try{
    const policy=callbacks.current.readOnly;
    const editor=await openLocalEditor({...initial,...(policy!==undefined?{readOnly:policy}:{}),host,signal:abort.signal,onChange:(view,outcome)=>callbacks.current.onChange?.(view,outcome),onPasteLoss:loss=>(callbacks.current.onPasteLoss??initial?.onPasteLoss)?.(loss),onInterchange:value=>(callbacks.current.onInterchange??initial?.onInterchange)?.(value),onError:report});
    if(abort.signal.aborted){editor.dispose();return;}
    try{if(callbacks.current.readOnly!==undefined)editor.setReadOnly(callbacks.current.readOnly);}catch(error){editor.dispose();throw error;}
    owned=editor;current.current=editor;setPhase("ready");
    try{callbacks.current.onReady?.(editor);}catch(error){report(error);}
   }catch(error){if(!abort.signal.aborted){setPhase("failed");report(error);}}
  });
  lane.current=opening.catch(report);
  return ()=>{abort.abort();if(current.current===owned)current.current=null;owned?.dispose();owned=undefined;};
 },[host,props.sessionKey,attempt]);
 return <section className={props.className} data-breditor-phase={phase} aria-busy={phase==="starting"}>
  <div ref={setHost}/>
  {phase==="failed"?<p role="alert">The editor could not start. <button type="button" onClick={()=>setAttempt(value=>value+1)}>Retry</button></p>:null}
 </section>;
});
