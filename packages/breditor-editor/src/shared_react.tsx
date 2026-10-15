import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement} from "react";
import {openSharedEditor,type SharedEditorSession,type SharedEditorSessionOptions} from "./shared_session.js";
import {SharedEditorOpenError,type SharedEditorRecovery} from "./shared_open_error.js";
import type {SharedDispatch,SharedPublication,SharedSaveState} from "@breditor/collaboration";

export interface BreditorSharedEditorProps {
 initialOptions:Omit<SharedEditorSessionOptions,"host"|"signal"|"onChange"|"onError"|"onSaveState"|"onClosing">;
 sessionKey?:string;className?:string;
 onReady?:(editor:SharedEditorSession)=>void;
 onChange?:(event:SharedPublication)=>void|Promise<void>;
 onSaveState?:(state:SharedSaveState)=>void;
 onClosing?:(editor:SharedEditorSession)=>void;
 onError?:(error:unknown)=>void;
 /** Required recovery handoff, including after unmount. Keep/export this writer or explicitly discard it. */
 onCloseError:(error:unknown,editor:SharedEditorRecovery)=>void;
}
export interface BreditorSharedEditorHandle {
 getEditor():SharedEditorSession|null;
 getRecovery():SharedEditorRecovery|null;
 focus():void;
 checkpointJson():string|null;
 execute(request:SharedDispatch,focus?:boolean,revision?:string):void;
 flush():Promise<void>|null;
 retry():void;
}

/** React owns the host, not its editable children. Writer retirement is serialized with subsequent openings. */
export const BreditorSharedEditor=forwardRef<BreditorSharedEditorHandle,BreditorSharedEditorProps>(function BreditorSharedEditor(props,ref):ReactElement{
 const [host,setHost]=useState<HTMLDivElement|null>(null),[attempt,setAttempt]=useState(0),[phase,setPhase]=useState<"starting"|"ready"|"failed">("starting");
 const current=useRef<SharedEditorSession|null>(null),recovery=useRef<SharedEditorRecovery|null>(null);
 const callbacks=useRef(props),configuration=useRef(props.initialOptions),lane=useRef<Promise<void>>(Promise.resolve());
 useEffect(()=>{callbacks.current=props;configuration.current=props.initialOptions;});
 useImperativeHandle(ref,()=>({
  getEditor:()=>current.current,getRecovery:()=>recovery.current,
  focus:()=>current.current?.focus(),checkpointJson:()=>current.current?.checkpointJson()??recovery.current?.checkpointJson()??null,
  execute:(request,focus,revision)=>current.current?.execute(request,focus,revision),
  flush:()=>current.current?.flush()??null,retry:()=>{if(current.current===null)setAttempt(value=>value+1);}
 }),[]);
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
    const editor=await openSharedEditor({...initial,host,signal:abort.signal,
     onChange:event=>callbacks.current.onChange?.(event),
     onSaveState:state=>callbacks.current.onSaveState?.(state),onClosing:editor=>callbacks.current.onClosing?.(editor),onError:report});
    if(abort.signal.aborted){await retire(editor);return;}
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
});
