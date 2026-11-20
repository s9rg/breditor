/** React owns replaceable controls only. The application retains the asynchronous native controller. */
import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement} from "react";
import {chromeAttributes,panelLocale} from "./panel_locale.js";
import {mountRichFullscreenControls,type RichFullscreenController,type RichFullscreenControls,type RichFullscreenControlsOptions} from "@breditor/experimental-rich-content";
export interface BreditorFullscreenControlsProps {controller:RichFullscreenController;initialOptions?:RichFullscreenControlsOptions;sessionKey?:string;className?:string;onError?:(error:unknown)=>void}
export interface BreditorFullscreenControlsHandle {getControls():RichFullscreenControls|null;refresh():void}
/** Await controller.dispose() separately before replacing its target/editor; no hidden exit on UI rekey. */
export const BreditorFullscreenControls=forwardRef<BreditorFullscreenControlsHandle,BreditorFullscreenControlsProps>(function BreditorFullscreenControls(props,ref):ReactElement {
 const read=()=>props.controller.uiLocale?.();
 const [host,setHost]=useState<HTMLDivElement|null>(null),[failure,setFailure]=useState<string|null>(null),panel=useRef<RichFullscreenControls|null>(null),callbacks=useRef(props),configuration=useRef(props.initialOptions);
 useEffect(()=>{callbacks.current=props;configuration.current=props.initialOptions;});
 useImperativeHandle(ref,()=>({getControls:()=>panel.current,refresh:()=>panel.current?.refresh()}),[]);
 useEffect(()=>{
  if(!host)return;const initial=configuration.current;setFailure(null);
  const report=(error:unknown)=>{try{(callbacks.current.onError??initial?.onError)?.(error);}catch{/* Reporting cannot change native/editor ownership. */}};
  try{const mounted=mountRichFullscreenControls(host,props.controller,{...initial,onError:report});panel.current=mounted;return()=>{if(panel.current===mounted)panel.current=null;mounted.dispose();};}
  catch(error){setFailure(panelLocale(read).describe(error,String(error)));report(error);return;}
 },[host,props.controller,props.sessionKey]);
 return <section className={props.className}><div ref={setHost}/>{failure===null?null:<p role="alert" {...chromeAttributes(panelLocale(read))}>{panelLocale(read).text("fullscreenStartFailed",{error:failure})}</p>}</section>;
});
