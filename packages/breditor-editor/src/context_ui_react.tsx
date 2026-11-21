/** React owns only the lease. Widgets attach beside the borrowed editor's toolbar and never reconcile document children. */
import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactElement,type RefObject} from "react";
import {mountRichMenuBar,mountRichShortcutHelp,mountRichFloatingMenu,type RichMenuBar,type RichMenuBarOptions,type RichShortcutHelp,type RichShortcutHelpOptions,type RichFloatingMenu,type RichFloatingMenuOptions} from "@breditor/experimental-rich-content";
import {mountRichSelectionToolbar,mountRichContextMenu,type RichContextUiHost,type RichSelectionToolbar,type RichSelectionToolbarOptions,type RichContextMenu,type RichContextMenuOptions} from "@breditor/experimental-rich-content";
export interface BreditorSelectionToolbarProps {editor:RichContextUiHost;initialOptions?:RichSelectionToolbarOptions;sessionKey?:string;onError?:(error:unknown)=>void}
export interface BreditorSelectionToolbarHandle {getToolbar():RichSelectionToolbar|null;focus():boolean;dismiss():void}
export interface BreditorContextMenuProps {editor:RichContextUiHost;initialOptions?:RichContextMenuOptions;sessionKey?:string;onError?:(error:unknown)=>void}
export interface BreditorContextMenuHandle {getMenu():RichContextMenu|null;open(point?:{x:number;y:number}):boolean;close():void}
function useLease<T extends {dispose():void},O extends {onError?:(error:unknown)=>void}>(props:{editor:RichContextUiHost;initialOptions?:O;sessionKey?:string;onError?:(error:unknown)=>void},mount:(editor:RichContextUiHost,options:O)=>T,label:string):[RefObject<T|null>,string|null]{
 const lease=useRef<T|null>(null),callbacks=useRef(props),configuration=useRef(props.initialOptions),[failure,setFailure]=useState<string|null>(null);
 useEffect(()=>{callbacks.current=props;configuration.current=props.initialOptions;});
 useEffect(()=>{
  const initial=configuration.current;setFailure(null);
  const report=(error:unknown)=>{try{(callbacks.current.onError??initial?.onError)?.(error);}catch{/* Reporting cannot alter editor ownership. */}};
  try{const mounted=mount(props.editor,{...initial,onError:report} as O);lease.current=mounted;return()=>{if(lease.current===mounted)lease.current=null;mounted.dispose();};}
  catch(error){setFailure(`${label} could not start: ${error instanceof Error?error.message:String(error)}`);report(error);return;}
 },[props.editor,props.sessionKey]);
 return [lease,failure];
}
/** Dispose (unmount) before retiring the borrowed editor. */
export const BreditorSelectionToolbar=forwardRef<BreditorSelectionToolbarHandle,BreditorSelectionToolbarProps>(function BreditorSelectionToolbar(props,ref):ReactElement|null{
 const [lease,failure]=useLease<RichSelectionToolbar,RichSelectionToolbarOptions>(props,mountRichSelectionToolbar,"Selection toolbar");
 useImperativeHandle(ref,()=>({getToolbar:()=>lease.current,focus:()=>lease.current?.focus()??false,dismiss:()=>lease.current?.dismiss()}),[lease]);
 return failure===null?null:<p role="alert">{failure}</p>;
});
export const BreditorContextMenu=forwardRef<BreditorContextMenuHandle,BreditorContextMenuProps>(function BreditorContextMenu(props,ref):ReactElement|null{
 const [lease,failure]=useLease<RichContextMenu,RichContextMenuOptions>(props,mountRichContextMenu,"Context menu");
 useImperativeHandle(ref,()=>({getMenu:()=>lease.current,open:point=>lease.current?.open(point)??false,close:()=>lease.current?.close()}),[lease]);
 return failure===null?null:<p role="alert">{failure}</p>;
});
export interface BreditorMenuBarProps {editor:RichContextUiHost;initialOptions?:RichMenuBarOptions;sessionKey?:string;onError?:(error:unknown)=>void}
export interface BreditorMenuBarHandle {getMenuBar():RichMenuBar|null;focus():boolean;open(id:string):boolean;close():void}
export interface BreditorShortcutHelpProps {editor:RichContextUiHost;initialOptions?:RichShortcutHelpOptions;sessionKey?:string;onError?:(error:unknown)=>void}
export interface BreditorShortcutHelpHandle {getHelp():RichShortcutHelp|null;open():boolean;close():void}
export interface BreditorFloatingMenuProps {editor:RichContextUiHost;initialOptions?:RichFloatingMenuOptions;sessionKey?:string;onError?:(error:unknown)=>void}
export interface BreditorFloatingMenuHandle {getMenu():RichFloatingMenu|null;focus():boolean;dismiss():void}
/** Editor shell menu bar (docs/EDITOR_SHELL.md). Inserted before the editor toolbar; renders no React DOM of its own. */
export const BreditorMenuBar=forwardRef<BreditorMenuBarHandle,BreditorMenuBarProps>(function BreditorMenuBar(props,ref):ReactElement|null{
 const [lease,failure]=useLease<RichMenuBar,RichMenuBarOptions>(props,mountRichMenuBar,"Menu bar");
 useImperativeHandle(ref,()=>({getMenuBar:()=>lease.current,focus:()=>lease.current?.focus()??false,open:id=>lease.current?.open(id)??false,close:()=>lease.current?.close()}),[lease]);
 return failure===null?null:<p role="alert">{failure}</p>;
});
export const BreditorShortcutHelp=forwardRef<BreditorShortcutHelpHandle,BreditorShortcutHelpProps>(function BreditorShortcutHelp(props,ref):ReactElement|null{
 const [lease,failure]=useLease<RichShortcutHelp,RichShortcutHelpOptions>(props,mountRichShortcutHelp,"Shortcut help");
 useImperativeHandle(ref,()=>({getHelp:()=>lease.current,open:()=>lease.current?.open()??false,close:()=>lease.current?.close()}),[lease]);
 return failure===null?null:<p role="alert">{failure}</p>;
});
export const BreditorFloatingMenu=forwardRef<BreditorFloatingMenuHandle,BreditorFloatingMenuProps>(function BreditorFloatingMenu(props,ref):ReactElement|null{
 const [lease,failure]=useLease<RichFloatingMenu,RichFloatingMenuOptions>(props,mountRichFloatingMenu,"Block menu");
 useImperativeHandle(ref,()=>({getMenu:()=>lease.current,focus:()=>lease.current?.focus()??false,dismiss:()=>lease.current?.dismiss()}),[lease]);
 return failure===null?null:<p role="alert">{failure}</p>;
});
