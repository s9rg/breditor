/** React owns only the borrowed shared slash-command controller; it never reconciles editable document children. */
import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement} from "react";
import type {SharedSlashCommands} from "@breditor/collaboration";
import {mountSlashCommands,type SharedSlashCommandEditor,type SharedSlashCommandsOptions} from "./shared_slash_commands.js";
export interface BreditorSharedSlashCommandsProps {
 /** A ready shared session, e.g. from `BreditorSharedEditor`'s `onReady`. Null mounts nothing. */
 editor:SharedSlashCommandEditor<"original">|SharedSlashCommandEditor<"document-v1">|null;
 /** Read once per editor/sessionKey; callbacks below always use the latest props. Omitted `items` use the session toolbar. */
 initialOptions?:Omit<SharedSlashCommandsOptions,"onOpen"|"onCancel"|"onExecute"|"onError">;
 sessionKey?:string;
 onOpen?:SharedSlashCommandsOptions["onOpen"];onCancel?:SharedSlashCommandsOptions["onCancel"];
 onExecute?:SharedSlashCommandsOptions["onExecute"];onError?:(error:unknown)=>void;
}
export interface BreditorSharedSlashCommandsHandle {getController():SharedSlashCommands|null;cancel():void}
/** Renders no editable DOM. The menu is a borrowed popup outside the editing surface. */
export const BreditorSharedSlashCommands=forwardRef<BreditorSharedSlashCommandsHandle,BreditorSharedSlashCommandsProps>(function BreditorSharedSlashCommands(props,ref):ReactElement|null{
 const controller=useRef<SharedSlashCommands|null>(null),callbacks=useRef(props),configuration=useRef(props.initialOptions),[failure,setFailure]=useState<string|null>(null);
 useEffect(()=>{callbacks.current=props;configuration.current=props.initialOptions;});
 useImperativeHandle(ref,()=>({getController:()=>controller.current,cancel:()=>controller.current?.cancel()}),[]);
 useEffect(()=>{
  const editor=props.editor;if(!editor)return;setFailure(null);
  const report=(error:unknown)=>{try{callbacks.current.onError?.(error);}catch{/* Reporting cannot rewind a native publication. */}};
  try{
   // Either scope family; the adapter only reads the session generically.
   const mounted=mountSlashCommands(editor as SharedSlashCommandEditor<"original">,{...configuration.current,onOpen:state=>callbacks.current.onOpen?.(state),onCancel:reason=>callbacks.current.onCancel?.(reason),onExecute:execution=>callbacks.current.onExecute?.(execution),onError:report});
   controller.current=mounted;return()=>{if(controller.current===mounted)controller.current=null;mounted.dispose();};
  }catch(error){setFailure(error instanceof Error?error.message:String(error));report(error);return;}
 },[props.editor,props.sessionKey]);
 return failure===null?null:<p role="alert">Slash commands could not start: {failure}</p>;
});
