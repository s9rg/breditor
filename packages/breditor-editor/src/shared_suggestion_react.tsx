import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement} from "react";
import {mountSharedSuggestionPanel,type SharedSuggestionPanel,type SharedSuggestionPanelCore,type SharedSuggestionPanelOptions} from "@breditor/collaboration";
export interface BreditorSharedSuggestionPanelProps {
 /** Borrowed native core; this component never opens/closes the source, queue or networking. */
 core:SharedSuggestionPanelCore;initialOptions:SharedSuggestionPanelOptions;
 sessionKey?:string;className?:string;onError?:(error:unknown)=>void;
}
export interface BreditorSharedSuggestionPanelHandle {getPanel():SharedSuggestionPanel|null;refresh():void}
/** Stable drafts and native previews across ordinary parent renders. A new core/key explicitly
 * replaces only controls; pending requests and persistence remain host-owned after unmount. */
export const BreditorSharedSuggestionPanel=forwardRef<BreditorSharedSuggestionPanelHandle,BreditorSharedSuggestionPanelProps>(function BreditorSharedSuggestionPanel(props,ref):ReactElement {
 const [host,setHost]=useState<HTMLDivElement|null>(null),[failure,setFailure]=useState<string|null>(null),panel=useRef<SharedSuggestionPanel|null>(null),configuration=useRef(props.initialOptions),callbacks=useRef(props);
 useEffect(()=>{configuration.current=props.initialOptions;callbacks.current=props;});
 useImperativeHandle(ref,()=>({getPanel:()=>panel.current,refresh:()=>panel.current?.refresh()}),[]);
 useEffect(()=>{if(!host)return;const initial=configuration.current;setFailure(null);const report=(error:unknown)=>{try{(callbacks.current.onError??initial.onError)?.(error);}catch{/* Reporting cannot change durable intent or native state. */}};
  try{const mounted=mountSharedSuggestionPanel(host,props.core,{...initial,onError:report});panel.current=mounted;return()=>{if(panel.current===mounted)panel.current=null;mounted.dispose();};}
  catch(error){setFailure(error instanceof Error?error.message:String(error));report(error);return;}
 },[host,props.core,props.sessionKey]);
 return <section className={props.className}><div ref={setHost}/>{failure===null?null:<p role="alert">Suggestion controls could not start: {failure}</p>}</section>;
});
