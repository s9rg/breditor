/** React owns only the borrowed AI/language panels; it never reconciles editable document children. */
import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement} from "react";
import type {RichAiReview,RichAiTools,RichAiToolsOptions,RichCommandOutcome,RichLanguageCheck,RichLanguageCheckOptions,RichLanguageCheckRequest,RichLanguageIssueView,RichRewriteRequest} from "@breditor/experimental-rich-content";
import {mountAiTools,mountLanguageCheck} from "./ai_tools.js";
import type {SlashCommandEditor} from "./slash_commands.js";

/** Generic over the borrowed editor kind: local editors here, shared sessions in `BreditorSharedAiTools`. */
export interface BreditorAiToolsPropsOf<E> {
 /** A ready editor (for example from `BreditorEditor`'s `onReady`). Null mounts nothing. */
 editor:E|null;
 /** Read once per editor/sessionKey, including the provider; callbacks below always use the latest props. */
 initialOptions?:Omit<RichAiToolsOptions,"onApply"|"onStale"|"onError">;
 sessionKey?:string;className?:string;
 onApply?:RichAiToolsOptions["onApply"];onStale?:()=>void;onError?:(error:unknown)=>void;
}
export interface BreditorAiToolsHandle {
 getTools():RichAiTools|null;
 requestRewrite(request:RichRewriteRequest):Promise<RichAiReview|null>;
 accept():RichCommandOutcome|"queued";reject():void;cancel():void;
}
export type BreditorAiToolsProps=BreditorAiToolsPropsOf<SlashCommandEditor>;
/** Session configuration is immutable; retirement releases the panel and aborts its provider call, never the editor. */
export function aiToolsComponent<E>(mount:(host:HTMLElement,editor:E,options:RichAiToolsOptions)=>RichAiTools,name:string){
 const component=forwardRef<BreditorAiToolsHandle,BreditorAiToolsPropsOf<E>>(function BreditorAiTools(props,ref):ReactElement {
 const [host,setHost]=useState<HTMLDivElement|null>(null),[failure,setFailure]=useState<string|null>(null),tools=useRef<RichAiTools|null>(null),callbacks=useRef(props),configuration=useRef(props.initialOptions);
 useEffect(()=>{callbacks.current=props;configuration.current=props.initialOptions;});
 const ready=():RichAiTools=>{if(!tools.current)throw Error("AI tools are not ready");return tools.current;};
 useImperativeHandle(ref,()=>({getTools:()=>tools.current,requestRewrite:request=>tools.current?.requestRewrite(request)??Promise.reject(Error("AI tools are not ready")),accept:()=>ready().accept(),reject:()=>tools.current?.reject(),cancel:()=>tools.current?.cancel()}),[]);
 useEffect(()=>{
  const editor=props.editor;if(!host||!editor)return;setFailure(null);
  const report=(error:unknown)=>{try{callbacks.current.onError?.(error);}catch{/* Reporting cannot rewind a native publication. */}};
  try{
   const mounted=mount(host,editor,{...configuration.current,onApply:outcome=>callbacks.current.onApply?.(outcome),onStale:()=>callbacks.current.onStale?.(),onError:report});
   tools.current=mounted;return()=>{if(tools.current===mounted)tools.current=null;mounted.dispose();};
  }catch(error){setFailure(error instanceof Error?error.message:String(error));report(error);return;}
 },[host,props.editor,props.sessionKey]);
 return <section className={props.className}><div ref={setHost}/>{failure===null?null:<p role="alert">AI tools could not start: {failure}</p>}</section>;
 });
 component.displayName=name;return component;
}
export const BreditorAiTools=aiToolsComponent<SlashCommandEditor>(mountAiTools,"BreditorAiTools");

export interface BreditorLanguageCheckPropsOf<E> {
 editor:E|null;
 initialOptions?:Omit<RichLanguageCheckOptions,"onApply"|"onError">;
 sessionKey?:string;className?:string;
 onApply?:RichLanguageCheckOptions["onApply"];onError?:(error:unknown)=>void;
}
export interface BreditorLanguageCheckHandle {
 getCheck():RichLanguageCheck|null;
 check(request?:RichLanguageCheckRequest):Promise<readonly RichLanguageIssueView[]|null>;
 applySuggestion(key:string,index:number):RichCommandOutcome|"queued";cancel():void;
}
export type BreditorLanguageCheckProps=BreditorLanguageCheckPropsOf<SlashCommandEditor>;
export function languageCheckComponent<E>(mount:(host:HTMLElement,editor:E,options:RichLanguageCheckOptions)=>RichLanguageCheck,name:string){
 const component=forwardRef<BreditorLanguageCheckHandle,BreditorLanguageCheckPropsOf<E>>(function BreditorLanguageCheck(props,ref):ReactElement {
 const [host,setHost]=useState<HTMLDivElement|null>(null),[failure,setFailure]=useState<string|null>(null),panel=useRef<RichLanguageCheck|null>(null),callbacks=useRef(props),configuration=useRef(props.initialOptions);
 useEffect(()=>{callbacks.current=props;configuration.current=props.initialOptions;});
 const ready=():RichLanguageCheck=>{if(!panel.current)throw Error("Language check is not ready");return panel.current;};
 useImperativeHandle(ref,()=>({getCheck:()=>panel.current,check:request=>panel.current?.check(request)??Promise.reject(Error("Language check is not ready")),applySuggestion:(key,index)=>ready().applySuggestion(key,index),cancel:()=>panel.current?.cancel()}),[]);
 useEffect(()=>{
  const editor=props.editor;if(!host||!editor)return;setFailure(null);
  const report=(error:unknown)=>{try{callbacks.current.onError?.(error);}catch{/* Reporting cannot rewind a native publication. */}};
  try{
   const mounted=mount(host,editor,{...configuration.current,onApply:(outcome,issue)=>callbacks.current.onApply?.(outcome,issue),onError:report});
   panel.current=mounted;return()=>{if(panel.current===mounted)panel.current=null;mounted.dispose();};
  }catch(error){setFailure(error instanceof Error?error.message:String(error));report(error);return;}
 },[host,props.editor,props.sessionKey]);
 return <section className={props.className}><div ref={setHost}/>{failure===null?null:<p role="alert">Language check could not start: {failure}</p>}</section>;
 });
 component.displayName=name;return component;
}
export const BreditorLanguageCheck=languageCheckComponent<SlashCommandEditor>(mountLanguageCheck,"BreditorLanguageCheck");
