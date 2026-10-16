import {openLocalEditor,createLayoutLocalProfileV3} from "@breditor/editor";
import {coverageSeed,range} from "./coverage-seed.mjs";
const query=new URLSearchParams(location.search),shared=query.get("mode")==="shared",natural=query.get("history")==="typing",react=query.get("react")==="1",history=natural?"typing-v1":"explicit",key=`general-installed-${shared}-${natural}-${react}`;
const profile=await createLayoutLocalProfileV3(),documentJson=coverageSeed(profile.descriptor());profile.dispose();
const saved=sessionStorage.getItem(key),errors=[],closeErrors=[],options={richLanguage:3,rangeEditing:"general-v1",history,toolbar:()=>[],initial:!shared&&saved?{kind:natural?"typingCheckpoint":"checkpoint",checkpointJson:saved}:{kind:"document",documentJson},...(shared?{database:key,room:"room",writer:"303"}:{})};
const t=window.generalRange={a:undefined,errors,closeErrors,options,shared,natural,react,range,ready:0,
 select:selection=>{if(shared)t.a.select(selection);else t.a.execute({kind:"setSelection",selection});t.a.focus();},
 history:redo=>shared?t.a.core[redo?"redo":"undo"]():t.a.execute({kind:redo?"redo":"undo"}),
 save:async()=>{if(natural)t.a.closeTypingGroup();if(shared)await t.a.flush();else sessionStorage.setItem(key,t.a.checkpointJson());return t.a.checkpointJson();},
 rejectOriginal:async()=>{if(!shared)throw Error("Shared only");await t.a.close();const {openSharedEditor}=await import("@breditor/editor/collaboration"),host=document.createElement("div"),{rangeEditing:_ranges,...original}=options;let refused=false;try{const accidental=await openSharedEditor({...original,host,initial:{kind:"resume"}});await accidental.close();}catch(error){if(error.code!=="session_range")throw error;refused=true;}if(!refused)throw Error("Original session accepted a general record");return true;}
};
const ready=editor=>{t.a=editor;t.ready++;document.querySelector("#ready").textContent="Ready";};
if(react){
 const {StrictMode,createElement,createRef,useState}=await import("react"),{createRoot}=await import("react-dom/client"),Component=shared?(await import("@breditor/editor/collaboration/react")).BreditorSharedEditor:(await import("@breditor/editor/react")).BreditorEditor,ref=createRef();t.ref=ref;
 function App(){const [count,setCount]=useState(0);return createElement(StrictMode,null,createElement("button",{id:"rerender",onClick:()=>setCount(value=>value+1)},"Rerender"),createElement("output",{id:"count"},count),createElement(Component,{ref,sessionKey:key,initialOptions:options,onReady:ready,onError:error=>errors.push(String(error)),...(shared?{onCloseError:error=>closeErrors.push(String(error))}:{})}));}
 createRoot(document.querySelector("#a")).render(createElement(App));
}else if(shared){const {openSharedEditor}=await import("@breditor/editor/collaboration");ready(await openSharedEditor({...options,host:document.querySelector("#a"),onError:error=>errors.push(String(error))}));}
else ready(await openLocalEditor({...options,host:document.querySelector("#a"),onError:error=>errors.push(String(error))}));
