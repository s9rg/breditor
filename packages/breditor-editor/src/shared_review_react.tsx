import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement} from "react";
import {mountSharedReviewPanel,type SharedReviewPanel,type SharedReviewPanelCore,type SharedReviewPanelOptions} from "@breditor/collaboration";
export interface BreditorSharedReviewPanelProps {
 /** Borrow an enabled native facade; this component never creates or closes either writer. */
 core:SharedReviewPanelCore;
 /** Immutable control configuration for one core/sessionKey. Policy callbacks may read live host state. */
 initialOptions:SharedReviewPanelOptions;
 sessionKey?:string;className?:string;onError?:(error:unknown)=>void;
}
export interface BreditorSharedReviewPanelHandle {getPanel():SharedReviewPanel|null;refresh():void}
/** React owns only the panel host. Ordinary parent renders do not reset drafts or native history. */
export const BreditorSharedReviewPanel=forwardRef<BreditorSharedReviewPanelHandle,BreditorSharedReviewPanelProps>(function BreditorSharedReviewPanel(props,ref):ReactElement {
 const [host,setHost]=useState<HTMLDivElement|null>(null),[failure,setFailure]=useState<string|null>(null);
 const panel=useRef<SharedReviewPanel|null>(null),configuration=useRef(props.initialOptions),callbacks=useRef(props);
 useEffect(()=>{configuration.current=props.initialOptions;callbacks.current=props;});
 useImperativeHandle(ref,()=>({getPanel:()=>panel.current,refresh:()=>panel.current?.refresh()}),[]);
 useEffect(()=>{
  if(!host)return;const initial=configuration.current;setFailure(null);
  const report=(error:unknown)=>{try{(callbacks.current.onError??initial.onError)?.(error);}catch{/* Reporting cannot alter native state or durable ownership. */}};
  try{const mounted=mountSharedReviewPanel(host,props.core,{...initial,onError:report});panel.current=mounted;return()=>{if(panel.current===mounted)panel.current=null;mounted.dispose();};}
  catch(error){setFailure(error instanceof Error?error.message:String(error));report(error);return;}
 },[host,props.core,props.sessionKey]);
 return <section className={props.className}><div ref={setHost}/>{failure===null?null:<p role="alert">Review controls could not start: {failure}</p>}</section>;
});
