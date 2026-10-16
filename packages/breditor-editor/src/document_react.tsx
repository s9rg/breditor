import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement} from "react";
import {openLocalDocumentEditor,type LocalDocumentEditor,type LocalDocumentEditorOptions} from "./local_document.js";
import type {RichCommand,RichDocumentView,RichCommandOutcome,RichClipboardTextProjection} from "@breditor/experimental-rich-content";
import type {RichClipboardInterchangeReport} from "@breditor/experimental-rich-content";
/** Immutable document-family configuration per sessionKey; callbacks and readOnly remain live. */
export interface BreditorDocumentEditorProps {
 initialOptions:Omit<LocalDocumentEditorOptions,"host"|"signal"|"onChange"|"onError">;
 sessionKey?:string;className?:string;readOnly?:boolean;
 onReady?:(editor:LocalDocumentEditor)=>void;
 onChange?:(view:RichDocumentView,outcome:RichCommandOutcome)=>void;
 onPasteLoss?:(report:RichClipboardTextProjection)=>void;onError?:(error:unknown)=>void;
 onInterchange?:(report:RichClipboardInterchangeReport)=>void;
}
export interface BreditorDocumentEditorHandle {
 getEditor():LocalDocumentEditor|null;focus():void;checkpointJson():string|null;
 execute(command:RichCommand,focus?:boolean,revision?:string):RichCommandOutcome|"queued"|null;
 selectDocument(revision?:string):RichCommandOutcome|"queued"|null;
 replaceDocumentPlainText(text:string,revision?:string):RichCommandOutcome|"queued"|null;
 pasteDocumentClipboard(clipboardJson:string,revision?:string):RichCommandOutcome|"queued"|null;
 collapseDocumentSelection(side:"before"|"after",revision?:string):RichCommandOutcome|"queued"|null;
 setReadOnly(value:boolean,revision?:string):boolean|null;closeTypingGroup(revision?:string):boolean|null;retry():void;
}
/** React never reconciles native editable children or converts document scope into text endpoints. */
export const BreditorDocumentEditor=forwardRef<BreditorDocumentEditorHandle,BreditorDocumentEditorProps>(function BreditorDocumentEditor(props,ref):ReactElement{
 const [host,setHost]=useState<HTMLDivElement|null>(null),[attempt,setAttempt]=useState(0),[phase,setPhase]=useState<"starting"|"ready"|"failed">("starting");
 const current=useRef<LocalDocumentEditor|null>(null),callbacks=useRef(props),configuration=useRef(props.initialOptions),lane=useRef<Promise<void>>(Promise.resolve());
 useEffect(()=>{callbacks.current=props;configuration.current=props.initialOptions;});
 useImperativeHandle(ref,()=>({getEditor:()=>current.current,focus:()=>current.current?.focus(),checkpointJson:()=>current.current?.checkpointJson()??null,
  execute:(...args)=>current.current?.execute(...args)??null,selectDocument:(...args)=>current.current?.selectDocument(...args)??null,replaceDocumentPlainText:(...args)=>current.current?.replaceDocumentPlainText(...args)??null,pasteDocumentClipboard:(...args)=>current.current?.pasteDocumentClipboard(...args)??null,collapseDocumentSelection:(...args)=>current.current?.collapseDocumentSelection(...args)??null,
  setReadOnly:(...args)=>current.current?.setReadOnly(...args)??null,closeTypingGroup:(...args)=>current.current?.closeTypingGroup(...args)??null,retry:()=>{if(current.current===null)setAttempt(value=>value+1);}}),[]);
 useEffect(()=>{if(props.readOnly===undefined||!current.current)return;try{current.current.setReadOnly(props.readOnly);}catch(error){try{callbacks.current.onError?.(error);}catch{/* Reporting cannot rewind policy. */}}},[props.readOnly]);
 useEffect(()=>{
  if(!host)return;const abort=new AbortController(),initial=configuration.current;let owned:LocalDocumentEditor|undefined;setPhase("starting");
  const report=(error:unknown)=>{try{callbacks.current.onError?.(error);}catch{/* Reporting cannot rewind a publication. */}};
  const opening=lane.current.then(async()=>{if(abort.signal.aborted)return;try{
   const policy=callbacks.current.readOnly,editor=await openLocalDocumentEditor({...initial,...(policy!==undefined?{readOnly:policy}:{}),host,signal:abort.signal,onChange:(view,outcome)=>callbacks.current.onChange?.(view,outcome),onPasteLoss:loss=>(callbacks.current.onPasteLoss??initial.onPasteLoss)?.(loss),onInterchange:value=>(callbacks.current.onInterchange??initial.onInterchange)?.(value),onError:report});
   if(abort.signal.aborted){editor.dispose();return;}try{if(callbacks.current.readOnly!==undefined)editor.setReadOnly(callbacks.current.readOnly);}catch(error){editor.dispose();throw error;}
   owned=editor;current.current=editor;setPhase("ready");try{callbacks.current.onReady?.(editor);}catch(error){report(error);}
  }catch(error){if(!abort.signal.aborted){setPhase("failed");report(error);}}});
  lane.current=opening.catch(report);return()=>{abort.abort();if(current.current===owned)current.current=null;owned?.dispose();owned=undefined;};
 },[host,props.sessionKey,attempt]);
 return <section className={props.className} data-breditor-phase={phase} aria-busy={phase==="starting"}><div ref={setHost}/>{phase==="failed"?<p role="alert">The document editor could not start. <button type="button" onClick={()=>setAttempt(value=>value+1)}>Retry</button></p>:null}</section>;
});
