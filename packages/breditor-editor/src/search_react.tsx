/** React owns only the borrowed search host. It never reconciles editable document children. */
import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement} from "react";
import {mountRichSearchPanel,type RichSearchHost,type RichSearchPanel,type RichSearchPanelOptions} from "@breditor/experimental-rich-content";
export interface BreditorSearchPanelProps {
 editor:RichSearchHost;initialOptions?:RichSearchPanelOptions;sessionKey?:string;className?:string;onError?:(error:unknown)=>void;onClose?:()=>void;
}
export interface BreditorSearchPanelHandle {getPanel():RichSearchPanel|null;focus():void;close():void;refresh():void}
/** Parent rerenders retain search/replacement drafts. Cleanup releases the panel, never its borrowed owner. */
export const BreditorSearchPanel=forwardRef<BreditorSearchPanelHandle,BreditorSearchPanelProps>(function BreditorSearchPanel(props,ref):ReactElement{
 const [host,setHost]=useState<HTMLDivElement|null>(null),[failure,setFailure]=useState<string|null>(null),panel=useRef<RichSearchPanel|null>(null),callbacks=useRef(props),configuration=useRef(props.initialOptions);
 useEffect(()=>{callbacks.current=props;configuration.current=props.initialOptions;});
 useImperativeHandle(ref,()=>({getPanel:()=>panel.current,focus:()=>panel.current?.focus(),close:()=>panel.current?.close(),refresh:()=>panel.current?.refresh()}),[]);
 useEffect(()=>{
  if(!host)return;const initial=configuration.current;setFailure(null);
  const report=(error:unknown)=>{try{(callbacks.current.onError??initial?.onError)?.(error);}catch{/* Reporting cannot alter native history or ownership. */}};
  try{const mounted=mountRichSearchPanel(host,props.editor,{...initial,onError:report,onClose:()=>{try{(callbacks.current.onClose??initial?.onClose)?.();}catch(error){report(error);}}});panel.current=mounted;return()=>{if(panel.current===mounted)panel.current=null;mounted.dispose();};}
  catch(error){setFailure(error instanceof Error?error.message:String(error));report(error);return;}
 },[host,props.editor,props.sessionKey]);
 return <section className={props.className}><div ref={setHost}/>{failure===null?null:<p role="alert">Search controls could not start: {failure}</p>}</section>;
});
