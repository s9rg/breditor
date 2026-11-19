/** React owns only the borrowed slash-command controller; it never reconciles editable document children. */
import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement} from "react";
import type {RichSlashCommandOptions,RichSlashCommands} from "@breditor/experimental-rich-content";
import {mountSlashCommands,type SlashCommandEditor} from "./slash_commands.js";
export interface BreditorSlashCommandsProps {
 /** A ready editor, e.g. from `BreditorEditor`'s `onReady`. Null mounts nothing. */
 editor:SlashCommandEditor|null;
 /** Read once per editor/sessionKey; callbacks below always use the latest props. */
 initialOptions:Omit<RichSlashCommandOptions,"onOpen"|"onCancel"|"onExecute"|"onError">;
 sessionKey?:string;
 onOpen?:RichSlashCommandOptions["onOpen"];onCancel?:RichSlashCommandOptions["onCancel"];
 onExecute?:RichSlashCommandOptions["onExecute"];onError?:(error:unknown)=>void;
}
export interface BreditorSlashCommandsHandle {getController():RichSlashCommands|null;cancel():void}
/** Renders no editable DOM. The menu is a borrowed popup outside the editing surface. */
export const BreditorSlashCommands=forwardRef<BreditorSlashCommandsHandle,BreditorSlashCommandsProps>(function BreditorSlashCommands(props,ref):ReactElement|null{
 const controller=useRef<RichSlashCommands|null>(null),callbacks=useRef(props),configuration=useRef(props.initialOptions),[failure,setFailure]=useState<string|null>(null);
 useEffect(()=>{callbacks.current=props;configuration.current=props.initialOptions;});
 useImperativeHandle(ref,()=>({getController:()=>controller.current,cancel:()=>controller.current?.cancel()}),[]);
 useEffect(()=>{
  const editor=props.editor;if(!editor)return;setFailure(null);
  const report=(error:unknown)=>{try{callbacks.current.onError?.(error);}catch{/* Reporting cannot rewind a native publication. */}};
  try{
   const mounted=mountSlashCommands(editor,{...configuration.current,onOpen:state=>callbacks.current.onOpen?.(state),onCancel:reason=>callbacks.current.onCancel?.(reason),onExecute:execution=>callbacks.current.onExecute?.(execution),onError:report});
   controller.current=mounted;return()=>{if(controller.current===mounted)controller.current=null;mounted.dispose();};
  }catch(error){setFailure(error instanceof Error?error.message:String(error));report(error);return;}
 },[props.editor,props.sessionKey]);
 return failure===null?null:<p role="alert">Slash commands could not start: {failure}</p>;
});
