import {StrictMode,createElement,useState,createRef} from "react";
import {createRoot} from "react-dom/client";
import {BreditorEditor} from "@breditor/editor/react";
import {createLocalProfile} from "@breditor/editor";
import {seed,range} from "./seed.mjs";
const profile=await createLocalProfile(),documentJson=seed(profile.descriptor());profile.dispose();const errors=[],ref=createRef();
const natural=new URL(location.href).searchParams.get("history")==="typing",saved=natural?sessionStorage.getItem("installed-react-typing"):null;
window.reactSdk={ref,errors,range,ready:0,changes:0,save:()=>sessionStorage.setItem("installed-react-typing",ref.current.checkpointJson())};
function App(){const [count,setCount]=useState(0),[session,setSession]=useState(0),[visible,setVisible]=useState(true),[readOnly,setReadOnly]=useState(false);return createElement(StrictMode,null,
 createElement("button",{id:"rerender",onClick:()=>setCount(v=>v+1)},"Rerender"),createElement("button",{id:"switch",onClick:()=>setSession(v=>v+1)},"New session"),createElement("button",{id:"toggle",onClick:()=>setVisible(v=>!v)},"Toggle"),createElement("output",{id:"render-count"},count),
 createElement("button",{id:"read-only-toggle",onClick:()=>setReadOnly(v=>!v)},readOnly?"Enable editing":"Read only"),
 visible?createElement(BreditorEditor,{ref,readOnly,sessionKey:String(session),initialOptions:{...(natural?{history:"typing-v1"}:{}),initial:session===0&&saved?{kind:"typingCheckpoint",checkpointJson:saved}:{kind:"document",documentJson},label:"Installed React editor"},onReady:()=>{window.reactSdk.ready++;document.querySelector("#ready").textContent="Ready";},onChange:()=>{window.reactSdk.changes++;window.reactSdk.lastCallback=count;},onError:error=>errors.push(String(error))}):null);
}
const root=createRoot(document.querySelector("#app"));root.render(createElement(App));window.reactSdk.unmount=()=>root.unmount();
