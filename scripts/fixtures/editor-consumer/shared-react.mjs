import {StrictMode,createElement,useState,createRef} from "react";
import {createRoot} from "react-dom/client";
import {BreditorSharedEditor} from "@breditor/editor/collaboration/react";
const errors=[],closeErrors=[],recoveries=[],ref=createRef();
const natural=new URLSearchParams(location.search).get("history")==="typing",history=natural?{history:"typing-v1"}:{};
window.sharedReactSdk={ref,errors,closeErrors,recoveries,ready:0,changes:0};
function App(){const [count,setCount]=useState(0),[session,setSession]=useState(0),[visible,setVisible]=useState(true),[readOnly,setReadOnly]=useState(false);return createElement(StrictMode,null,
 createElement("button",{id:"rerender",onClick:()=>setCount(v=>v+1)},"Rerender"),createElement("button",{id:"switch",onClick:()=>setSession(v=>v+1)},"Reopen writer"),createElement("button",{id:"toggle",onClick:()=>setVisible(v=>!v)},"Toggle"),createElement("output",{id:"render-count"},count),
 createElement("button",{id:"read-only-toggle",onClick:()=>setReadOnly(v=>!v)},readOnly?"Enable editing":"Read only"),
 visible?createElement(BreditorSharedEditor,{ref,readOnly,sessionKey:String(session),initialOptions:{...history,database:`sdk-shared-react${natural?"-typing":""}`,room:"react-room",writer:"303",initial:{kind:"empty",blockId:"react-p"},label:"Installed durable shared React editor"},
 onReady:()=>{window.sharedReactSdk.ready++;document.querySelector("#ready").textContent="Ready";},onChange:()=>{window.sharedReactSdk.changes++;window.sharedReactSdk.lastCallback=count;},onError:error=>errors.push(String(error)),onCloseError:(error,editor)=>{closeErrors.push(String(error));recoveries.push(editor);}}):null);
}
const root=createRoot(document.querySelector("#app"));root.render(createElement(App));window.sharedReactSdk.unmount=()=>root.unmount();
