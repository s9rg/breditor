/** React owns only the borrowed source panel. Source text stays in a plain textarea; the editor DOM is never reconciled. */
import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement} from "react";
import {mountRichSourceView,type RichCommandOutcome,type RichDocumentSourceHost,type RichDocumentSourcePreview,type RichSourceView,type RichSourceViewOptions} from "@breditor/experimental-rich-content";
export interface BreditorSourceViewProps {editor:RichDocumentSourceHost;initialOptions?:Omit<RichSourceViewOptions,"onError"|"onApply"|"onClose">;sessionKey?:string;className?:string;onError?:(error:unknown)=>void;onApply?:(outcome:RichCommandOutcome|"queued")=>void;onClose?:()=>void}
export interface BreditorSourceViewHandle {getView():RichSourceView|null;open():void;review():RichDocumentSourcePreview|null;apply():RichCommandOutcome|"queued"|null;cancel():void}
const ready=(view:RichSourceView|null):RichSourceView=>{if(!view)throw Error("The source view is not ready");return view;};
/** Session configuration is immutable; retirement releases UI, never the borrowed editor. */
export const BreditorSourceView=forwardRef<BreditorSourceViewHandle,BreditorSourceViewProps>(function BreditorSourceView(props,ref):ReactElement {
 const [host,setHost]=useState<HTMLDivElement|null>(null),[failure,setFailure]=useState<string|null>(null),view=useRef<RichSourceView|null>(null),callbacks=useRef(props),configuration=useRef(props.initialOptions);
 useEffect(()=>{callbacks.current=props;configuration.current=props.initialOptions;});
 useImperativeHandle(ref,()=>({getView:()=>view.current,open:()=>ready(view.current).open(),review:()=>ready(view.current).review(),apply:()=>ready(view.current).apply(),cancel:()=>view.current?.cancel()}),[]);
 useEffect(()=>{
  if(!host)return;setFailure(null);
  const report=(error:unknown)=>{try{callbacks.current.onError?.(error);}catch{/* Reporting cannot change editor ownership or history. */}};
  try{const mounted=mountRichSourceView(host,props.editor,{...configuration.current,onError:report,onApply:outcome=>callbacks.current.onApply?.(outcome),onClose:()=>callbacks.current.onClose?.()});view.current=mounted;return()=>{if(view.current===mounted)view.current=null;mounted.dispose();};}
  catch(error){setFailure(error instanceof Error?error.message:String(error));report(error);return;}
 },[host,props.editor,props.sessionKey]);
 return <section className={props.className}><div ref={setHost}/>{failure===null?null:<p role="alert">Source view could not start: {failure}</p>}</section>;
});
