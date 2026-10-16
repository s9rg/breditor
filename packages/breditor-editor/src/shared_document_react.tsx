import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement} from "react";
import {openSharedDocumentEditor,type SharedDocumentEditorSession,type SharedDocumentEditorSessionOptions} from "./shared_document_session.js";
import {SharedDocumentEditorOpenError,type SharedDocumentEditorRecovery} from "./shared_document_open_error.js";
import type {SharedDispatch,SharedPublication,SharedSaveState,RichClipboardTextProjection} from "@breditor/collaboration";
import type {RichClipboardInterchangeReport} from "@breditor/experimental-rich-content";
export interface BreditorSharedDocumentEditorProps {
 initialOptions:Omit<SharedDocumentEditorSessionOptions,"host"|"signal"|"onChange"|"onError"|"onSaveState"|"onClosing">;
 sessionKey?:string;className?:string;readOnly?:boolean;
 onReady?:(editor:SharedDocumentEditorSession)=>void;onChange?:(event:SharedPublication<"document-v1">)=>void|Promise<void>;
 onSaveState?:(state:SharedSaveState)=>void;onClosing?:(editor:SharedDocumentEditorSession)=>void;
 onPasteLoss?:(report:RichClipboardTextProjection)=>void;onError?:(error:unknown)=>void;
 onInterchange?:(report:RichClipboardInterchangeReport)=>void;
 /** Required even after unmount: retain/export exact document recovery or explicitly discard it. */
 onCloseError:(error:unknown,editor:SharedDocumentEditorRecovery)=>void;
}
export interface BreditorSharedDocumentEditorHandle {
 getEditor():SharedDocumentEditorSession|null;getRecovery():SharedDocumentEditorRecovery|null;focus():void;checkpointJson():string|null;
 execute(request:SharedDispatch,focus?:boolean,revision?:string):void;
 selectDocument(revision?:string):void;replaceDocumentPlainText(text:string,revision?:string):void;pasteDocumentClipboard(clipboardJson:string,revision?:string):void;collapseDocumentSelection(side:"before"|"after",revision?:string):void;
 setReadOnly(value:boolean,revision?:string):boolean|null;closeTypingGroup(revision?:string):boolean|null;flush():Promise<void>|null;retry():void;
}
/** Exact durable document ownership; replacement waits until the previous writer has safely retired. */
export const BreditorSharedDocumentEditor=forwardRef<BreditorSharedDocumentEditorHandle,BreditorSharedDocumentEditorProps>(function BreditorSharedDocumentEditor(props,ref):ReactElement{
 const [host,setHost]=useState<HTMLDivElement|null>(null),[attempt,setAttempt]=useState(0),[phase,setPhase]=useState<"starting"|"ready"|"failed">("starting");
 const current=useRef<SharedDocumentEditorSession|null>(null),recovery=useRef<SharedDocumentEditorRecovery|null>(null),callbacks=useRef(props),configuration=useRef(props.initialOptions),lane=useRef<Promise<void>>(Promise.resolve());
 useEffect(()=>{callbacks.current=props;configuration.current=props.initialOptions;});
 useImperativeHandle(ref,()=>({getEditor:()=>current.current,getRecovery:()=>recovery.current,focus:()=>current.current?.focus(),checkpointJson:()=>current.current?.checkpointJson()??recovery.current?.checkpointJson()??null,
  execute:(...args)=>current.current?.execute(...args),selectDocument:(...args)=>current.current?.selectDocument(...args),replaceDocumentPlainText:(...args)=>current.current?.replaceDocumentPlainText(...args),pasteDocumentClipboard:(...args)=>current.current?.pasteDocumentClipboard(...args),collapseDocumentSelection:(...args)=>current.current?.collapseDocumentSelection(...args),
  setReadOnly:(...args)=>current.current?.setReadOnly(...args)??null,closeTypingGroup:(...args)=>current.current?.closeTypingGroup(...args)??null,flush:()=>current.current?.flush()??null,retry:()=>{if(current.current===null)setAttempt(value=>value+1);}}),[]);
 useEffect(()=>{if(props.readOnly===undefined||!current.current)return;try{current.current.setReadOnly(props.readOnly);}catch(error){try{callbacks.current.onError?.(error);}catch{/* Reporting cannot rewind policy. */}}},[props.readOnly]);
 useEffect(()=>{
  if(!host)return;const abort=new AbortController(),initial=configuration.current;let owned:SharedDocumentEditorSession|undefined;setPhase("starting");
  const report=(error:unknown)=>{try{callbacks.current.onError?.(error);}catch{/* Reporting cannot rewind durable writes. */}};
  const handoff=(error:unknown,editor:SharedDocumentEditorRecovery)=>{recovery.current=editor;try{callbacks.current.onCloseError(error,editor);}catch(callbackError){report(callbackError);}};
  const retire=async(editor:SharedDocumentEditorRecovery)=>{try{await editor.close();if(recovery.current===editor)recovery.current=null;}catch(error){handoff(error,editor);throw error;}};
  const opening=lane.current.then(async()=>{if(abort.signal.aborted)return;try{
   if(recovery.current)await retire(recovery.current);if(abort.signal.aborted)return;
   const policy=callbacks.current.readOnly,editor=await openSharedDocumentEditor({...initial,...(policy!==undefined?{readOnly:policy}:{}),host,signal:abort.signal,
    onChange:event=>callbacks.current.onChange?.(event),onPasteLoss:loss=>(callbacks.current.onPasteLoss??initial.onPasteLoss)?.(loss),onInterchange:value=>(callbacks.current.onInterchange??initial.onInterchange)?.(value),onSaveState:state=>callbacks.current.onSaveState?.(state),onClosing:editor=>callbacks.current.onClosing?.(editor),onError:report});
   if(abort.signal.aborted){await retire(editor);return;}try{if(callbacks.current.readOnly!==undefined)editor.setReadOnly(callbacks.current.readOnly);}catch(error){await retire(editor);throw error;}
   owned=editor;current.current=editor;setPhase("ready");try{callbacks.current.onReady?.(editor);}catch(error){report(error);}
  }catch(error){if(error instanceof SharedDocumentEditorOpenError)handoff(error,error.recovery);if(!abort.signal.aborted){setPhase("failed");report(error);}}});
  lane.current=opening.catch(report);return()=>{abort.abort();if(current.current===owned)current.current=null;lane.current=lane.current.then(async()=>{const editor=owned;owned=undefined;if(editor)await retire(editor);}).catch(report);};
 },[host,props.sessionKey,attempt]);
 return <section className={props.className} data-breditor-phase={phase} aria-busy={phase==="starting"}><div ref={setHost}/>{phase==="failed"?<p role="alert">The shared document editor could not start. <button type="button" onClick={()=>setAttempt(value=>value+1)}>Retry</button></p>:null}</section>;
});
