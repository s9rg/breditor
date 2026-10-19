/** React owns the borrowed panel only; it never reconciles editable children. */
import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement} from "react";
import {mountRichWritingTools,type RichWritingToolsHost,type RichWritingToolsPanel,type RichWritingToolsPanelOptions} from "@breditor/experimental-rich-content";
export interface BreditorWritingToolsProps {editor:RichWritingToolsHost;initialOptions?:RichWritingToolsPanelOptions;sessionKey?:string;className?:string;onError?:(error:unknown)=>void}
export interface BreditorWritingToolsHandle {getPanel():RichWritingToolsPanel|null;refresh():void;selectHeading(index:number,revision?:string):Promise<void>;setPage(page:number):void}
/** Session configuration is immutable; retirement releases UI, never the borrowed editor. */
export const BreditorWritingTools=forwardRef<BreditorWritingToolsHandle,BreditorWritingToolsProps>(function BreditorWritingTools(props,ref):ReactElement {
 const [host,setHost]=useState<HTMLDivElement|null>(null),[failure,setFailure]=useState<string|null>(null),panel=useRef<RichWritingToolsPanel|null>(null),callbacks=useRef(props),configuration=useRef(props.initialOptions);
 useEffect(()=>{callbacks.current=props;configuration.current=props.initialOptions;});
 useImperativeHandle(ref,()=>({getPanel:()=>panel.current,refresh:()=>panel.current?.refresh(),selectHeading:(index,revision)=>panel.current?.selectHeading(index,revision)??Promise.reject(Error("Writing controls are not ready")),setPage:page=>{if(!panel.current)throw Error("Writing controls are not ready");panel.current.setPage(page);}}),[]);
 useEffect(()=>{
  if(!host)return;const initial=configuration.current;setFailure(null);
  const report=(error:unknown)=>{try{(callbacks.current.onError??initial?.onError)?.(error);}catch{/* Reporting cannot change editor ownership or history. */}};
  try{const mounted=mountRichWritingTools(host,props.editor,{...initial,onError:report});panel.current=mounted;return()=>{if(panel.current===mounted)panel.current=null;mounted.dispose();};}
  catch(error){setFailure(error instanceof Error?error.message:String(error));report(error);return;}
 },[host,props.editor,props.sessionKey]);
 return <section className={props.className}><div ref={setHost}/>{failure===null?null:<p role="alert">Writing controls could not start: {failure}</p>}</section>;
});
